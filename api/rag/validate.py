"""
api/rag/validate.py
Safety Net Validator: Ensures all numbers and quantities in generated answers
are strictly supported by retrieved official passages.
Normalises Gurmukhi (੦-੯) and Devanagari (०-९) digits to standard ASCII before comparison.
"""

import re

# Match integers and decimals
NUM_REGEX = re.compile(r"\b\d+(?:[.,]\d+)?\b")

# Conversion tables for Gurmukhi and Devanagari digits
GURMUKHI_DIGITS = "੦੧੨੩੪੫੬੭੮੯"
DEVANAGARI_DIGITS = "०१२३४५६७८९"

def normalise_digits(text: str) -> str:
    """Converts Gurmukhi and Devanagari script digits to standard ASCII 0-9."""
    if not text:
        return ""
    trans_table = {ord(c): str(i) for i, c in enumerate(GURMUKHI_DIGITS)}
    trans_table.update({ord(c): str(i) for i, c in enumerate(DEVANAGARI_DIGITS)})
    return text.translate(trans_table)

def extract_numbers(text: str) -> set[str]:
    """Extracts all normalised numeric strings, ignoring citation brackets [1], [2], etc."""
    cleaned = normalise_digits(text)
    # Remove bracketed source markers like [1], [2], [1][3]
    cleaned = re.sub(r"\[\d+\]", " ", cleaned)
    found = NUM_REGEX.findall(cleaned)
    # Return as standardized float-string or int-string to handle 14.0 vs 14
    res = set()
    for n in found:
        cleaned_num = n.replace(",", "")
        try:
            val = float(cleaned_num)
            res.add(str(int(val)) if val.is_integer() else str(val))
        except ValueError:
            res.add(cleaned_num)
    return res

def numbers_supported(answer_text: str, source_passages: list[dict]) -> tuple[bool, set[str]]:
    """
    Validates whether every number in answer_text appears in at least one source passage.
    Returns (True, set()) if all numbers are grounded,
    or (False, unsupported_numbers) if hallucinated numbers exist.
    """
    answer_numbers = extract_numbers(answer_text)
    if not answer_numbers:
        return True, set()

    combined_sources = " ".join(p.get("text", "") for p in source_passages)
    source_numbers = extract_numbers(combined_sources)

    unsupported = answer_numbers - source_numbers
    is_valid = len(unsupported) == 0
    return is_valid, unsupported
