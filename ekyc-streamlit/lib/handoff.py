"""Cross-app handoff — carries the verified identity from this Streamlit
eKYC app to the React claims app (a *different* codebase, likely on a
*different* laptop) via a URL/QR, so nothing is re-typed at the start of
Phase 3.

No shared backend, no shared localStorage (different origins) — so the
handoff has to travel in the URL itself. It is a compact, unsigned token:
good enough to *pre-fill* the claims app's join screen for a demo, but it
is not cryptographically verified end-to-end. That's a real gap worth
flagging to judges if asked ("day-2" fix: have the claims app call back to
this app's /verify endpoint, mirroring how the Node app's own
POST /api/profile/verify already works for its in-app signed profiles).
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass

DEFAULT_CLAIMS_APP_URL = "http://localhost:5173"


@dataclass
class HandoffPayload:
    name: str
    dob: str
    policy: str
    integrity_hash: str


def encode_token(payload: HandoffPayload) -> str:
    compact = {
        "n": payload.name,
        "d": payload.dob,
        "p": payload.policy,
        "h": payload.integrity_hash[:16],
        "v": 1,
    }
    raw = json.dumps(compact, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def build_claim_url(payload: HandoffPayload, claims_app_base_url: str) -> str:
    base = claims_app_base_url.rstrip("/")
    token = encode_token(payload)
    return f"{base}/#claim/{token}"
