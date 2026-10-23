#!/usr/bin/env python3
"""
tools/check_translations.py
Validates that strings.en.json, strings.pa.json, and strings.hi.json have identical keys
and matching placeholders (e.g., {loss}, {date}).
"""

import json
import re
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
LANGUAGES = ["en", "pa", "hi"]
PLACEHOLDER_REGEX = re.compile(r"\{([a-zA-Z0-9_]+)\}")

def load_json(lang):
    file_path = DATA_DIR / f"strings.{lang}.json"
    if not file_path.exists():
        print(f"ERROR: Missing translation file: {file_path}")
        sys.exit(1)
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def main():
    data = {lang: load_json(lang) for lang in LANGUAGES}
    keys_en = set(data["en"].keys())
    has_error = False

    for lang in ["pa", "hi"]:
        keys_lang = set(data[lang].keys())
        missing = keys_en - keys_lang
        extra = keys_lang - keys_en

        if missing:
            print(f"[{lang.upper()}] Missing keys: {sorted(missing)}")
            has_error = True
        if extra:
            print(f"[{lang.upper()}] Unexpected extra keys: {sorted(extra)}")
            has_error = True

    # Check placeholder consistency
    for key in keys_en:
        ph_en = set(PLACEHOLDER_REGEX.findall(data["en"].get(key, "")))
        for lang in ["pa", "hi"]:
            ph_lang = set(PLACEHOLDER_REGEX.findall(data[lang].get(key, "")))
            if ph_en != ph_lang:
                print(f"[{lang.upper()}] Placeholder mismatch on key '{key}': EN has {ph_en}, but {lang} has {ph_lang}")
                has_error = True

    if has_error:
        print("FAIL: Translation check found discrepancies.")
        sys.exit(1)
    else:
        print(f"SUCCESS: All {len(keys_en)} keys and placeholders matched perfectly across en, pa, hi!")

if __name__ == "__main__":
    main()
