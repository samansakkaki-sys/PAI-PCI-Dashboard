from datetime import datetime, timedelta
import os
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="PAI Dashboard API",
    version="0.6.0",
    description="FastAPI backend for live PAI/PCI dashboard.",
)

CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
HISTORY_API_URL = os.getenv("HISTORY_API_URL")
CACHE_TTL_SECONDS = 300  # 5 minutes

if not HISTORY_API_URL:
    raise RuntimeError("HISTORY_API_URL environment variable is required.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

history_cache: dict = {
    "data": [],
    "fetched_at": None,
}


@app.get("/")
async def read_root() -> dict[str, str]:
   return {"message": "PAI Dashboard API is running"}


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


def normalize_row_keys(row: dict) -> dict:
    normalized = {}
    for key, value in row.items():
        clean_key = str(key).strip()
        normalized[clean_key] = value
    return normalized


def find_key(row: dict, target: str) -> Optional[str]:
    target_clean = target.strip().lower()
    for key in row.keys():
        if str(key).strip().lower() == target_clean:
            return key
    return None


def fetch_history_from_source() -> list[dict]:
    try:
        response = requests.get(HISTORY_API_URL, timeout=30)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch history data: {exc}",
        ) from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"History endpoint did not return valid JSON. Response preview: {response.text[:200]}",
        ) from exc

    if not isinstance(data, list):
        raise HTTPException(
            status_code=502,
            detail="History endpoint returned unexpected data format.",
        )

    return [normalize_row_keys(row) for row in data if isinstance(row, dict)]


def load_history_data() -> list[dict]:
    now = datetime.utcnow()
    fetched_at = history_cache["fetched_at"]
    cached_data = history_cache["data"]

    if fetched_at and cached_data:
        if now - fetched_at < timedelta(seconds=CACHE_TTL_SECONDS):
            return cached_data

    fresh_data = fetch_history_from_source()
    history_cache["data"] = fresh_data
    history_cache["fetched_at"] = now
    return fresh_data


def safe_number(value) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def get_first_number(row: dict, keys: list[str]) -> Optional[float]:
    for key in keys:
        value = safe_number(row.get(key))
        if value is not None:
            return value
    return None


def get_mode_fields(metric_mode: str) -> dict[str, str]:
    mode = (metric_mode or "weighted").strip().lower()
    if mode not in {"weighted", "unweighted"}:
        raise HTTPException(status_code=400, detail="metric_mode must be 'weighted' or 'unweighted'.")

    if mode == "unweighted":
        return {
            "mode": "unweighted",
            "pai_retail": "pai_retail_unweighted",
            "pai_bot": "pai_bot_unweighted",
            "pai_seller": "pai_seller_unweighted",
            "pci_retail": "pci_retail_unweighted_avg",
            "pci_bot": "pci_bot_unweighted_avg",
            "pci_seller": "pci_seller_unweighted_avg",
        }

    return {
        "mode": "weighted",
        "pai_retail": "pai_retail_weighted",
        "pai_bot": "pai_bot_weighted",
        "pai_seller": "pai_seller_weighted",
        "pci_retail": "pci_retail_weighted_avg",
        "pci_bot": "pci_bot_weighted_avg",
        "pci_seller": "pci_seller_weighted_avg",
    }


def get_category_key(data: list[dict]) -> Optional[str]:
    if not data:
        return None
    return find_key(data[0], "category")


def filter_history_by_category(data: list[dict], category: Optional[str] = None) -> list[dict]:
    if not data:
        return []

    category_key = get_category_key(data)
    if category_key is None or not category:
        return data

    category_clean = category.strip().lower()
    return [
        row
        for row in data
        if str(row.get(category_key, "")).strip().lower() == category_clean
    ]


def build_timestamp_label(row: dict) -> str:
    raw_date = str(row.get("date") or "").strip()
    raw_time = str(row.get("time") or "").strip()

    label = raw_date
    if raw_date and "T" in raw_date:
        label = raw_date.replace("T", " ")

    if raw_time and not raw_time.startswith("1899"):
        label = f"{label} {raw_time}".strip()

    return label


def compute_average_total(values: list[Optional[float]]) -> Optional[float]:
    numbers = [value for value in values if value is not None]
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


def compute_pai_total(values: list[Optional[float]]) -> Optional[float]:
    numbers = [value for value in values if value is not None]
    if not numbers:
        return None
    return max(numbers)


def serialize_history_row(row: dict, fields: dict[str, str]) -> dict:
    pai_retail = safe_number(row.get(fields["pai_retail"]))
    pai_bot = safe_number(row.get(fields["pai_bot"]))
    pai_seller = safe_number(row.get(fields["pai_seller"]))
    pci_retail = safe_number(row.get(fields["pci_retail"]))
    pci_bot = safe_number(row.get(fields["pci_bot"]))
    pci_seller = safe_number(row.get(fields["pci_seller"]))
    pai_total = get_first_number(
        row,
        [
            f"pai_total_{fields['mode']}",
            f"pai_{fields['mode']}_total",
            f"pai_total_{fields['mode']}_avg",
        ],
    )
    pci_total = get_first_number(
        row,
        [
            f"pci_total_{fields['mode']}_avg",
            f"pci_total_{fields['mode']}",
            f"pci_{fields['mode']}_total_avg",
            f"pci_{fields['mode']}_total",
        ],
    )

    if pai_total is None:
        pai_total = compute_pai_total([pai_retail, pai_bot, pai_seller])

    if pci_total is None:
        pci_total = compute_average_total([pci_retail, pci_bot, pci_seller])

    return {
        "category": str(row.get("category") or "").strip(),
        "date": row.get("date"),
        "time": row.get("time"),
        "timestamp_label": build_timestamp_label(row),
        "pai_retail": pai_retail,
        "pai_bot": pai_bot,
        "pai_seller": pai_seller,
        "pci_retail": pci_retail,
        "pci_bot": pci_bot,
        "pci_seller": pci_seller,
        "pai_total": pai_total,
        "pci_total": pci_total,
    }


def serialize_history_rows(rows: list[dict], metric_mode: str) -> list[dict]:
    fields = get_mode_fields(metric_mode)
    return [serialize_history_row(row, fields) for row in rows]


def build_category_latest_map(data: list[dict], metric_mode: str) -> list[dict]:
    category_key = get_category_key(data)
    if category_key is None:
        return []

    latest_by_category: dict[str, dict] = {}
    for row in data:
        category = str(row.get(category_key, "")).strip()
        if not category:
            continue
        latest_by_category[category] = row

    serialized = []
    for category, row in latest_by_category.items():
        latest_row = serialize_history_row(row, get_mode_fields(metric_mode))
        latest_row["category"] = category
        serialized.append(latest_row)
    return serialized


def parse_categories_param(categories: list[str]) -> list[str]:
    parsed: list[str] = []
    for value in categories:
        for item in value.split(","):
            clean_item = item.strip()
            if clean_item and clean_item not in parsed:
                parsed.append(clean_item)
    return parsed


@app.get("/kpis/history")
async def get_kpi_history(
    category: Optional[str] = Query(default=None),
    metric_mode: str = Query(default="weighted"),
) -> list[dict]:
    data = load_history_data()
    filtered = filter_history_by_category(data, category)
    return serialize_history_rows(filtered, metric_mode)


@app.get("/kpis/categories")
async def get_categories() -> list[str]:
    data = load_history_data()

    if not data:
        return []

    category_key = get_category_key(data)
    if category_key is None:
        return []

    categories = sorted(
        {
            str(row.get(category_key, "")).strip()
            for row in data
            if str(row.get(category_key, "")).strip()
        }
    )
    return categories


@app.get("/kpis/rankings")
async def get_rankings(
    metric_mode: str = Query(default="weighted"),
    limit: int = Query(default=5, ge=1, le=20),
) -> dict[str, list[dict]]:
    data = load_history_data()
    latest_rows = build_category_latest_map(data, metric_mode)

    top_pai = sorted(
        [row for row in latest_rows if row.get("pai_total") is not None],
        key=lambda row: row["pai_total"],
        reverse=True,
    )[:limit]
    worst_pci = sorted(
        [row for row in latest_rows if row.get("pci_total") is not None],
        key=lambda row: row["pci_total"],
        reverse=True,
    )[:limit]

    return {
        "top_pai": top_pai,
        "worst_pci": worst_pci,
    }


@app.get("/kpis/compare")
async def get_compare_data(
    categories: list[str] = Query(default=[]),
    metric_mode: str = Query(default="weighted"),
) -> list[dict]:
    selected_categories = parse_categories_param(categories)
    if not selected_categories:
        return []

    data = load_history_data()
    category_key = get_category_key(data)
    if category_key is None:
        return []

    selected_lookup = {category.lower(): category for category in selected_categories}
    rows_by_category: dict[str, list[dict]] = {category: [] for category in selected_categories}

    for row in data:
        row_category = str(row.get(category_key, "")).strip()
        matched_category = selected_lookup.get(row_category.lower())
        if matched_category:
            rows_by_category[matched_category].append(row)

    return [
        {
            "category": category,
            "history": serialize_history_rows(rows_by_category.get(category, []), metric_mode),
        }
        for category in selected_categories
    ]


@app.get("/debug/history-columns")
async def debug_history_columns() -> dict:
    data = load_history_data()
    if not data:
        return {"columns": [], "sample": None}

    return {
        "columns": list(data[0].keys()),
        "sample": data[0],
    }


@app.get("/debug/cache-status")
async def debug_cache_status() -> dict:
    return {
        "cached_rows": len(history_cache["data"]),
        "fetched_at": history_cache["fetched_at"].isoformat() if history_cache["fetched_at"] else None,
        "ttl_seconds": CACHE_TTL_SECONDS,
    }
