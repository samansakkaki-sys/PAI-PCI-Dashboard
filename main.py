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


@app.get("/kpis/history")
async def get_kpi_history(category: Optional[str] = Query(default=None)) -> list[dict]:
    data = load_history_data()

    if not data:
        return []

    category_key = find_key(data[0], "category")
    if category_key is None:
        return data

    if not category:
        return data

    filtered = [
        row
        for row in data
        if str(row.get(category_key, "")).strip().lower() == category.strip().lower()
    ]
    return filtered


@app.get("/kpis/categories")
async def get_categories() -> list[str]:
    data = load_history_data()

    if not data:
        return []

    category_key = find_key(data[0], "category")
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
