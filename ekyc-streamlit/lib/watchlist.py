"""Political / terrorism-relationship screening — mocked trust service.

Every entry below is invented for this demo; any resemblance to real people
is coincidental. This mirrors the Node app's server/amlData.mjs (same
fictional names, for cross-app consistency) and adds exact ID-number
lookup, since the Streamlit brief screens "using his id number".

A real deployment would call a licensed sanctions/PEP data provider
(Refinitiv World-Check, Dow Jones, ComplyAdvantage, ...) — never a scraped
or self-assembled list of real designations.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field


@dataclass(frozen=True)
class WatchlistEntry:
    name: str
    dob: str
    id_number: str
    list_type: str  # "SANCTIONS" | "PEP"
    program: str
    note: str


WATCHLIST: list[WatchlistEntry] = [
    WatchlistEntry("Rachid El Kandari", "1969-04-02", "11982045", "SANCTIONS", "INTL-ARMS-2021", "Arms embargo designation (fictional)"),
    WatchlistEntry("Viktor Malenko", "1975-11-19", "22045871", "SANCTIONS", "FIN-FRAUD-2019", "Financial fraud network (fictional)"),
    WatchlistEntry("Salem Abu Draz", "1981-02-27", "30587412", "SANCTIONS", "TER-FIN-2020", "Terror financing designation (fictional)"),
    WatchlistEntry("Dmitri Voskov", "1963-07-08", "40219873", "SANCTIONS", "CYBER-2022", "Cybercrime proceeds (fictional)"),
    WatchlistEntry("Hamid Al Rachidi", "1958-01-30", "51663290", "SANCTIONS", "INTL-ARMS-2021", "Procurement agent (fictional)"),
    WatchlistEntry("Faycal Trabelsi", "1966-09-12", "60874521", "PEP", "PEP-TN", "Former senior public official (fictional)"),
    WatchlistEntry("Mongi Ben Aissa", "1971-05-23", "70123456", "PEP", "PEP-TN", "Regional governor family member (fictional)"),
    WatchlistEntry("Leila Ben Slimane", "1974-12-04", "80456789", "PEP", "PEP-TN", "State enterprise board member (fictional)"),
    WatchlistEntry("Karim Bouzidi", "1979-08-15", "90234567", "PEP", "PEP-INTL", "Diplomatic staff (fictional)"),
    WatchlistEntry("Nadia El Mansouri", "1983-03-09", "10345678", "PEP", "PEP-INTL", "Central bank committee (fictional)"),
]

LISTS_CHECKED = [
    "UN Consolidated (mock)",
    "OFAC SDN (mock)",
    "EU Financial Sanctions (mock)",
    "PEP registry (mock)",
]


def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _bigrams(s: str) -> list[str]:
    clean = s.replace(" ", "")
    return [clean[i : i + 2] for i in range(len(clean) - 1)]


def _dice(a: str, b: str) -> float:
    ga, gb = _bigrams(a), _bigrams(b)
    if not ga or not gb:
        return 0.0
    from collections import Counter

    ca = Counter(ga)
    overlap = 0
    for g in gb:
        if ca[g] > 0:
            overlap += 1
            ca[g] -= 1
    return 2 * overlap / (len(ga) + len(gb))


@dataclass
class ScreeningResult:
    status: str  # "clear" | "review"
    hits: list[dict] = field(default_factory=list)


def screen(full_name: str, id_number: str | None = None) -> ScreeningResult:
    """Screen by name (fuzzy) and, if given, by exact ID number."""
    query = _normalize(full_name)
    hits: list[dict] = []

    for entry in WATCHLIST:
        score = 0.0
        reason = None
        if id_number and entry.id_number == id_number.strip():
            score = 1.0
            reason = "id_number_exact"
        else:
            d = _dice(query, _normalize(entry.name))
            if d >= 0.62:
                score = d
                reason = "name_fuzzy"
        if score:
            hits.append(
                {
                    "name": entry.name,
                    "dob": entry.dob,
                    "list": entry.list_type,
                    "program": entry.program,
                    "note": entry.note,
                    "score": round(score * 100),
                    "matched_on": reason,
                }
            )

    hits.sort(key=lambda h: h["score"], reverse=True)
    status = "review" if hits else "clear"
    return ScreeningResult(status=status, hits=hits[:3])
