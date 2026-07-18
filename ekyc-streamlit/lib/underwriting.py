"""Underwriting questionnaire — income / living-conditions → policy fit.

Mirrors the *same* 5-policy catalog as the Node claims app's
server/policyEngine.mjs (same ids/names/covers) so both apps recommend from
one consistent product line, even though they score independently. This
module adds the income/living-conditions layer the eKYC brief asks for —
an affordability & asset-context signal layered on top of the vehicle-based
scoring already demoed in the React app, not a replacement for it.

The "dataset" behind it is a small synthetic Tunisia-flavoured cost-of-
living/asset index — clearly a hackathon stand-in for a real actuarial
table, not sourced from any real insurer or statistics office.
"""
from __future__ import annotations

from dataclasses import dataclass, field

POLICIES = [
    {
        "id": "rc-essentielle",
        "name": "RC Essentielle",
        "tier": 1,
        "tagline": "The legal minimum, done right",
        "base": 240,
        "covers": ["Third-party liability (RC) — mandatory cover", "Legal defense & recourse", "Driver injury up to 20,000 TND"],
    },
    {
        "id": "tiers-confort",
        "name": "Tiers Confort",
        "tier": 2,
        "tagline": "Liability plus the everyday annoyances",
        "base": 420,
        "covers": ["Everything in RC Essentielle", "Glass breakage", "24/7 roadside assistance & towing", "Natural events (hail, flood)"],
    },
    {
        "id": "vol-incendie",
        "name": "Vol & Incendie Plus",
        "tier": 3,
        "tagline": "Protects the car you still owe money on",
        "base": 640,
        "covers": ["Everything in Tiers Confort", "Theft & attempted theft", "Fire & explosion", "Vandalism (up to 5,000 TND)"],
    },
    {
        "id": "tous-risques-optima",
        "name": "Tous Risques Optima",
        "tier": 4,
        "tagline": "Full comprehensive cover",
        "base": 980,
        "covers": ["Everything in Vol & Incendie Plus", "All-accident own-damage cover", "New-value replacement first 2 years"],
    },
    {
        "id": "tous-risques-prestige",
        "name": "Tous Risques Prestige",
        "tier": 5,
        "tagline": "Zero deductible, replacement car, concierge claims",
        "base": 1450,
        "covers": ["Everything in Optima", "Zero deductible", "Replacement car up to 15 days", "Priority claims concierge"],
    },
]

# Synthetic asset/cost-of-living index by living area (fictional demo data).
LIVING_AREA_INDEX = {
    "grand_tunis": {"label": "Grand Tunis (Tunis, Ariana, Ben Arous, Manouba)", "cost_index": 1.25, "theft_risk": "elevated"},
    "coastal_city": {"label": "Coastal city (Sousse, Sfax, Nabeul, Bizerte...)", "cost_index": 1.05, "theft_risk": "moderate"},
    "inland_town": {"label": "Inland town or regional capital", "cost_index": 0.85, "theft_risk": "low"},
    "rural": {"label": "Rural / village", "cost_index": 0.7, "theft_risk": "low"},
}

INCOME_BRACKETS = {
    "lt1200": {"label": "Under 1,200 TND / month", "affordability": 0.55},
    "1200-2500": {"label": "1,200 – 2,500 TND / month", "affordability": 0.8},
    "2500-4500": {"label": "2,500 – 4,500 TND / month", "affordability": 1.05},
    "gt4500": {"label": "Over 4,500 TND / month", "affordability": 1.35},
}

LIVING_CONDITION_ITEMS = [
    ("owns_home", "Owns their home (vs. renting)"),
    ("has_wifi", "Has home internet / wifi"),
    ("has_fridge", "Has a refrigerator"),
    ("has_ac", "Has air conditioning"),
    ("has_second_vehicle", "Household has a second vehicle"),
]


@dataclass
class UnderwritingAnswers:
    income_bracket: str
    living_area: str
    conditions: dict = field(default_factory=dict)  # item_key -> bool


@dataclass
class UnderwritingResult:
    policy: dict
    confidence: int
    affordability_note: str
    asset_score: int  # 0-5, how many living-condition items are present
    reasons: list[str]


def score(answers: UnderwritingAnswers) -> UnderwritingResult:
    income = INCOME_BRACKETS[answers.income_bracket]
    area = LIVING_AREA_INDEX[answers.living_area]
    asset_score = sum(1 for k, _ in LIVING_CONDITION_ITEMS if answers.conditions.get(k))

    # Affordability signal: income bracket × local cost-of-living index.
    afford = income["affordability"] / area["cost_index"]

    reasons: list[str] = []
    scores = {p["id"]: 0.0 for p in POLICIES}

    if afford < 0.75:
        for p in POLICIES:
            scores[p["id"]] += (3 - p["tier"]) * 12
        reasons.append("At this income-to-local-cost ratio, a lean policy keeps cover affordable without lapsing on renewal.")
    elif afford > 1.15:
        for p in POLICIES:
            scores[p["id"]] += (p["tier"] - 3) * 12
        reasons.append("Income comfortably covers a higher tier — worth protecting the asset itself, not just third parties.")
    else:
        for p in POLICIES:
            scores[p["id"]] += 10 - abs(p["tier"] - 3) * 4
        reasons.append("A balanced income-to-cost ratio points at the mid-tier cover as the rational default.")

    if area["theft_risk"] == "elevated":
        for p in POLICIES:
            if p["id"] in ("vol-incendie", "tous-risques-optima", "tous-risques-prestige"):
                scores[p["id"]] += 15
        reasons.append(f"{area['label']} carries elevated theft exposure in our book — theft & fire cover earns its premium here.")

    if asset_score >= 4:
        for p in POLICIES:
            if p["tier"] >= 4:
                scores[p["id"]] += 10
        reasons.append("A well-equipped household profile correlates with lower claims volatility — eligible for our higher tiers.")
    elif asset_score <= 1:
        for p in POLICIES:
            if p["tier"] <= 2:
                scores[p["id"]] += 8

    ranked = sorted(POLICIES, key=lambda p: scores[p["id"]], reverse=True)
    winner = ranked[0]
    top, second = scores[ranked[0]["id"]], scores[ranked[1]["id"]]
    confidence = min(95, max(60, round(60 + (top - second) / max(top, 1) * 35)))

    afford_label = "tight" if afford < 0.75 else "strong" if afford > 1.15 else "comfortable"
    affordability_note = f"Affordability profile: {afford_label} ({income['label']} in a {area['label']} cost context)."

    return UnderwritingResult(
        policy=winner,
        confidence=confidence,
        affordability_note=affordability_note,
        asset_score=asset_score,
        reasons=reasons[:4],
    )
