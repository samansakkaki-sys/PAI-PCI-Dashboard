import re

_WHITESPACE_RE = re.compile(r"\s+")

# Keep this config-style so category merges stay easy to maintain.
EXACT_CATEGORY_MAP = {
    "کالای دیجیتال": "کالای دیجیتال",
}

KEYWORD_CATEGORY_RULES: list[tuple[tuple[str, ...], str]] = []

CHARACTER_REPLACEMENTS = str.maketrans(
    {
        "ي": "ی",
        "ى": "ی",
        "ك": "ک",
        "ة": "ه",
        "أ": "ا",
        "إ": "ا",
        "ؤ": "و",
        "ۀ": "ه",
        "‌": " ",
        "\u200f": " ",
        "\u200e": " ",
    }
)


def clean_category_text(value: str | None) -> str:
    text = str(value or "").translate(CHARACTER_REPLACEMENTS).strip()
    return _WHITESPACE_RE.sub(" ", text)


def normalize_category(value: str | None) -> str:
    cleaned = clean_category_text(value)
    if not cleaned:
        return ""

    mapped = EXACT_CATEGORY_MAP.get(cleaned)
    if mapped:
        return mapped

    lowered = cleaned.casefold()
    for keywords, normalized in KEYWORD_CATEGORY_RULES:
        if all(keyword.casefold() in lowered for keyword in keywords):
            return normalized

    return cleaned
