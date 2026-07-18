"""CIN OCR — front + back, Arabic + French.

EasyOCR's recognition models are grouped by script: Arabic can only be
paired with English in one Reader (not French, not Darija — Darija written
in Arabic script uses the same character set as Standard Arabic, so no
separate model exists or is needed for the *reading* step; language-*id*
of Derja vs Fusha is a text-classification problem, not an OCR one — see
the Node app's src/evidence/language.ts for that layer). So we run two
passes per image — one Arabic+English reader, one French reader — and
merge the results before field parsing.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np
import streamlit as st


@st.cache_resource(show_spinner=False)
def _get_reader(langs: tuple[str, ...]):
    import easyocr

    return easyocr.Reader(list(langs), gpu=False, verbose=False)


@dataclass
class OcrLine:
    text: str
    confidence: float


@dataclass
class CinFields:
    full_name: str = ""
    dob: str = ""
    place_of_birth: str = ""
    cin_number: str = ""
    address: str = ""
    issue_date: str = ""
    raw_lines: list[str] = field(default_factory=list)


def run_ocr(image: np.ndarray) -> list[OcrLine]:
    """Run both Arabic+English and French passes, merge, dedupe."""
    ar_reader = _get_reader(("ar", "en"))
    fr_reader = _get_reader(("fr",))

    lines: list[OcrLine] = []
    for reader in (ar_reader, fr_reader):
        for _bbox, text, conf in reader.readtext(image):
            text = text.strip()
            if text:
                lines.append(OcrLine(text=text, confidence=float(conf)))

    # Drop near-duplicate reads of the same Latin token picked up by both
    # passes (Arabic+English reader still catches some Latin digits/labels).
    seen: set[str] = set()
    deduped: list[OcrLine] = []
    for ln in lines:
        key = ln.text.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ln)
    return deduped


# ---------------------------------------------------------------------------
# Field parsing — bilingual label matching against Tunisian CIN layouts.
# ---------------------------------------------------------------------------

_DATE_RE = re.compile(r"(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})")
_CIN_NO_RE = re.compile(r"\b(\d{8})\b")

_NAME_LABELS = ("nom", "prenom", "prénom", "الاسم", "اللقب", "الإسم")
_DOB_LABELS = ("naissance", "né le", "née le", "تاريخ الولادة", "ولد في")
_BIRTHPLACE_LABELS = ("lieu de naissance", "à ", "مكان الولادة")
_ID_LABELS = ("carte d'identité", "n°", "no ", "رقم بطاقة", "رقم التعريف")
_ADDRESS_LABELS = ("adresse", "domicile", "العنوان", "بالعنوان")
_ISSUE_LABELS = ("délivrée le", "delivree le", "تاريخ الإصدار", "صادرة في")


def _line_matches(text: str, labels: tuple[str, ...]) -> bool:
    low = text.lower()
    return any(lbl in low or lbl in text for lbl in labels)


def parse_front(lines: list[OcrLine]) -> CinFields:
    fields = CinFields(raw_lines=[ln.text for ln in lines])
    name_parts: list[str] = []

    for ln in lines:
        t = ln.text.strip()
        if not t:
            continue

        if not fields.dob:
            m = _DATE_RE.search(t)
            if m and (_line_matches(t, _DOB_LABELS) or not fields.dob):
                fields.dob = f"{m.group(1)}/{m.group(2)}/{m.group(3)}"

        if not fields.cin_number:
            m = _CIN_NO_RE.search(t)
            if m:
                fields.cin_number = m.group(1)

        # Latin uppercase name-shaped lines (Tunisian CIN prints the Latin
        # transliteration alongside the Arabic name) — collect candidates.
        if re.fullmatch(r"[A-ZÀ-Ý][A-ZÀ-Ý'\-\s]{2,30}", t) and not _line_matches(t, _ID_LABELS):
            name_parts.append(t)

    if name_parts:
        # Usually two lines: family name + given name, printed in that order.
        fields.full_name = " ".join(name_parts[:2]).title()

    return fields


def parse_back(lines: list[OcrLine], fields: CinFields | None = None) -> CinFields:
    fields = fields or CinFields()
    fields.raw_lines += [ln.text for ln in lines]
    addr_parts: list[str] = []

    for ln in lines:
        t = ln.text.strip()
        if not t:
            continue
        if _line_matches(t, _ADDRESS_LABELS):
            continue  # the label itself, not the value
        if not fields.issue_date:
            m = _DATE_RE.search(t)
            if m:
                fields.issue_date = f"{m.group(1)}/{m.group(2)}/{m.group(3)}"
        # Heuristic: longer free-text lines on the back are address lines.
        if len(t) > 8 and not _DATE_RE.search(t):
            addr_parts.append(t)

    if addr_parts and not fields.address:
        fields.address = ", ".join(addr_parts[:2])

    return fields
