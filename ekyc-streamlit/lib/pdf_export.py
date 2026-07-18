"""KYC document generation — one-page summary PDF with photo, fields,
verification badges, QR handoff code and the driver's drawn signature.
"""
from __future__ import annotations

import hashlib
import io
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

import qrcode
from fpdf import FPDF
from PIL import Image

BRAND = (37, 99, 235)  # #2563eb
INK = (15, 23, 42)
SOFT = (71, 85, 105)
GREEN = (5, 150, 105)


@dataclass
class KycProfile:
    full_name: str
    dob: str
    cin_number: str
    address: str
    checks: dict = field(default_factory=dict)
    policy_name: str = ""
    premium_note: str = ""
    profile_id: str = ""
    signed_at: str = ""
    integrity_hash: str = ""


def build_profile(fields: dict, checks: dict, policy_name: str, premium_note: str) -> KycProfile:
    payload = {
        "full_name": fields.get("full_name", ""),
        "dob": fields.get("dob", ""),
        "cin_number": fields.get("cin_number", ""),
        "address": fields.get("address", ""),
        "checks": checks,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    profile_id = "CP-" + digest[:12].upper()

    return KycProfile(
        full_name=fields.get("full_name", ""),
        dob=fields.get("dob", ""),
        cin_number=fields.get("cin_number", ""),
        address=fields.get("address", ""),
        checks=checks,
        policy_name=policy_name,
        premium_note=premium_note,
        profile_id=profile_id,
        signed_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        integrity_hash=digest,
    )


def _qr_image(data: str) -> Image.Image:
    qr = qrcode.QRCode(border=1, box_size=6)
    qr.add_data(data)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")


def generate_kyc_pdf(
    profile: KycProfile,
    id_photo: Image.Image | None,
    signature_image: Image.Image | None,
    handoff_url: str,
) -> bytes:
    pdf = FPDF(format="A4", unit="mm")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Header band
    pdf.set_fill_color(*BRAND)
    pdf.rect(0, 0, 210, 24, style="F")
    pdf.set_xy(12, 6)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 8, "ClaimPilot AI - eKYC Verification Summary", ln=1)
    pdf.set_x(12)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, f"Profile {profile.profile_id}  -  signed {profile.signed_at}", ln=1)

    pdf.set_text_color(*INK)
    pdf.set_xy(12, 32)

    # ID photo
    if id_photo is not None:
        buf = io.BytesIO()
        id_photo.save(buf, format="PNG")
        buf.seek(0)
        pdf.image(buf, x=12, y=32, w=32, h=40)

    # Fields
    field_x = 50
    pdf.set_xy(field_x, 32)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Identity", ln=1)
    pdf.set_font("Helvetica", "", 10)
    rows = [
        ("Full name", profile.full_name or "-"),
        ("Date of birth", profile.dob or "-"),
        ("CIN number", profile.cin_number or "-"),
        ("Address", profile.address or "-"),
    ]
    for label, value in rows:
        pdf.set_x(field_x)
        pdf.set_text_color(*SOFT)
        pdf.cell(32, 6, label)
        pdf.set_text_color(*INK)
        pdf.multi_cell(0, 6, value)

    # QR
    qr_img = _qr_image(handoff_url)
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    buf.seek(0)
    pdf.image(buf, x=170, y=32, w=28, h=28)
    pdf.set_xy(168, 61)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*SOFT)
    pdf.cell(32, 4, "scan: continue to", ln=1, align="C")
    pdf.set_x(168)
    pdf.cell(32, 4, "claims app", align="C")

    # Verification checks
    y = 80
    pdf.set_xy(12, y)
    pdf.set_text_color(*INK)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Verification checks", ln=1)
    pdf.set_font("Helvetica", "", 10)
    for label, value in profile.checks.items():
        pdf.set_x(12)
        pdf.set_text_color(*SOFT)
        pdf.cell(55, 6, label)
        ok = str(value).lower().startswith(("pass", "clear", "match", "confirm"))
        pdf.set_text_color(*(GREEN if ok else INK))
        pdf.cell(0, 6, str(value), ln=1)

    # Policy
    pdf.set_text_color(*INK)
    pdf.ln(3)
    pdf.set_x(12)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Recommended policy", ln=1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_x(12)
    pdf.cell(0, 6, f"{profile.policy_name}  ({profile.premium_note})", ln=1)

    # Integrity + signature
    pdf.ln(6)
    pdf.set_x(12)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*SOFT)
    pdf.multi_cell(0, 5, f"Integrity hash (SHA-256): {profile.integrity_hash}")

    if signature_image is not None:
        buf = io.BytesIO()
        signature_image.save(buf, format="PNG")
        buf.seek(0)
        pdf.image(buf, x=12, y=pdf.get_y() + 4, w=55, h=22)
        pdf.set_xy(12, pdf.get_y() + 27)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*SOFT)
    pdf.cell(0, 5, "Signature of the account holder", ln=1)

    pdf.set_y(-15)
    pdf.set_font("Helvetica", "I", 7)
    pdf.cell(0, 5, "Hackathon prototype - screening and signing are mocked - no real personal data stored", align="C")

    return bytes(pdf.output())
