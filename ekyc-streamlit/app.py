"""ClaimPilot AI — Intelligent eKYC (Streamlit)

A self-contained companion app to the React claims platform: onboarding,
CIN OCR (Arabic + French), liveness + face match, political/terrorism
screening, an income/living-conditions questionnaire feeding a policy
recommendation, a signed KYC document, and a handoff link/QR into the
claims app's shared accident session.

Run:  streamlit run app.py
"""
from __future__ import annotations

import dataclasses
from datetime import datetime

import numpy as np
import streamlit as st
from PIL import Image
from streamlit_drawable_canvas import st_canvas

from lib import face_match, handoff, liveness, ocr, pdf_export, underwriting, watchlist

st.set_page_config(page_title="ClaimPilot AI — eKYC", page_icon="🛡️", layout="centered")

STEPS = ["Welcome", "Document", "Confirm", "Liveness", "Screening", "Profile", "Policy", "Sign", "Done"]


# --------------------------------------------------------------------------- helpers
def to_array(uploaded_file) -> np.ndarray:
    return np.array(Image.open(uploaded_file).convert("RGB"))


def to_image(uploaded_file) -> Image.Image:
    return Image.open(uploaded_file).convert("RGB")


def init_state():
    defaults = {
        "step": 0,
        "fields": {"full_name": "", "dob": "", "cin_number": "", "address": ""},
        "cin_front_img": None,
        "cin_back_lines": [],
        "checks": {},
        "liveness_method": None,
        "liveness_stage": "start",
        "liveness_passed": False,
        "selfie_img": None,
        "match_result": None,
        "screening_result": None,
        "uw_answers": None,
        "uw_result": None,
        "signature_img": None,
        "claims_app_url": handoff.DEFAULT_CLAIMS_APP_URL,
    }
    for k, v in defaults.items():
        st.session_state.setdefault(k, v)


def goto(step: int):
    st.session_state.step = step
    st.rerun()


def render_stepper():
    cur = st.session_state.step
    cols = st.columns(len(STEPS))
    for i, (col, label) in enumerate(zip(cols, STEPS)):
        with col:
            if i < cur:
                st.markdown(f"<div style='text-align:center;color:#059669;font-size:11px;font-weight:700'>✓<br>{label}</div>", unsafe_allow_html=True)
            elif i == cur:
                st.markdown(f"<div style='text-align:center;color:#2563eb;font-size:11px;font-weight:800'>●<br>{label}</div>", unsafe_allow_html=True)
            else:
                st.markdown(f"<div style='text-align:center;color:#94a3b8;font-size:11px'>○<br>{label}</div>", unsafe_allow_html=True)
    st.divider()


def header():
    st.markdown(
        "<h1 style='margin-bottom:0'>🛡️ ClaimPilot AI</h1>"
        "<p style='color:#64748b;margin-top:0'>Intelligent eKYC — onboarding in minutes, not forms</p>",
        unsafe_allow_html=True,
    )
    render_stepper()


# --------------------------------------------------------------------------- steps
def step_welcome():
    st.subheader("Let's verify your identity")
    st.write(
        "You'll need your Tunisian CIN (front + back) and a working camera. "
        "This whole flow — document, liveness, screening, policy match, signature — "
        "takes a few minutes instead of the usual 20–30."
    )
    st.info("Nothing here leaves this machine except the mocked screening/signing calls — same trust model as the claims app.")
    if st.button("Start eKYC →", type="primary"):
        goto(1)


def step_document():
    st.subheader("📄 1 · Your CIN — front, then back")
    st.caption("OCR reads Arabic *and* French off the card automatically. Poor lighting? You can always fix fields on the next screen.")

    side = "front" if not st.session_state.cin_front_img else "back"
    st.write(f"**Capture or upload the {side} of your CIN**")
    
    # Tabs for camera vs file upload
    tab1, tab2 = st.tabs(["📷 Camera", "📁 Upload File"])
    
    with tab1:
        shot = st.camera_input(f"CIN {side}", key=f"cin_{side}_cam", label_visibility="collapsed")
        if shot is not None:
            process_cin_image(shot, side)
    
    with tab2:
        uploaded = st.file_uploader(
            f"Upload CIN {side} image", 
            type=['png', 'jpg', 'jpeg', 'pdf'],
            key=f"cin_{side}_upload",
            label_visibility="collapsed"
        )
        if uploaded is not None:
            process_cin_image(uploaded, side)

    with st.expander("Camera not working / no CIN handy? Fill in manually"):
        if st.button("Skip OCR, enter fields by hand"):
            goto(2)


def process_cin_image(image_file, side):
    """Process CIN image from either camera or file upload"""
    img = to_array(image_file)
    with st.spinner("Reading Arabic + French text (first run loads the OCR models, ~10-20s)…"):
        lines = ocr.run_ocr(img)

    if side == "front":
        st.session_state.cin_front_img = to_image(image_file)
        parsed = ocr.parse_front(lines)
        st.session_state.fields.update(
            {k: v for k, v in dataclasses.asdict(parsed).items() if k in st.session_state.fields and v}
        )
        st.success(f"✅ Front read — {len(lines)} text lines detected.")
        if st.button("Continue to back side →", type="primary", key="continue_to_back"):
            st.rerun()
    else:
        parsed = ocr.parse_back(lines, ocr.CinFields(**st.session_state.fields))
        st.session_state.fields.update(
            {k: v for k, v in dataclasses.asdict(parsed).items() if k in st.session_state.fields and v}
        )
        st.session_state.cin_back_lines = [ln.text for ln in lines]
        st.success(f"✅ Back read — {len(lines)} text lines detected.")
        if st.button("Continue →", type="primary", key="continue_from_back"):
            goto(2)


def step_confirm():
    st.subheader("✓ 2 · Confirm what we read")
    f = st.session_state.fields
    f["full_name"] = st.text_input("Full name", f["full_name"])
    f["dob"] = st.text_input("Date of birth (dd/mm/yyyy)", f["dob"])
    f["cin_number"] = st.text_input("CIN number", f["cin_number"])
    f["address"] = st.text_input("Address", f["address"])

    c1, c2 = st.columns(2)
    if c1.button("← Back"):
        goto(1)
    if c2.button("Confirm identity →", type="primary", disabled=not f["full_name"].strip()):
        st.session_state.checks["Document OCR"] = "Passed" if any(st.session_state.fields.values()) else "Manual entry"
        goto(3)


def step_liveness():
    st.subheader("🧬 3 · Prove you're really here")
    
    # Add bypass option at the top
    with st.expander("⚠️ Skip liveness check (for testing only)"):
        st.warning("This bypasses biometric verification. Only use for testing purposes.")
        if st.button("Skip to next step", key="bypass_liveness"):
            # Create a mock selfie from CIN front if available
            if st.session_state.cin_front_img:
                st.session_state.selfie_img = st.session_state.cin_front_img
            st.session_state.liveness_passed = True
            st.session_state.checks["Liveness"] = "Bypassed (testing mode)"
            st.session_state.checks["Face match"] = "Skipped (testing mode)"
            st.session_state.match_result = None
            goto(4)
            return
    
    if st.session_state.liveness_method is None:
        st.write("Pick a liveness check:")
        c1, c2 = st.columns(2)
        if c1.button("👁 Blink twice"):
            st.session_state.liveness_method = "blink"
            st.session_state.liveness_stage = "open"
            st.session_state.liveness_attempt = 0
            st.rerun()
        if c2.button("↔️ Turn head left → right"):
            st.session_state.liveness_method = "turn"
            st.session_state.liveness_stage = "center"
            st.session_state.liveness_attempt = 0
            st.rerun()
        return

    method = st.session_state.liveness_method
    stage = st.session_state.liveness_stage
    attempt = st.session_state.get("liveness_attempt", 0)

    if st.session_state.get("_live_error"):
        st.error(st.session_state.pop("_live_error"))

    if method == "blink":
        if stage == "open":
            st.write("**Step 1/2** — look at the camera, eyes open.")
            shot = st.camera_input("Eyes open", key=f"live_open_{attempt}", label_visibility="collapsed")
            if shot is not None:
                st.session_state["_open_frame"] = to_array(shot)
                st.session_state.liveness_stage = "blink"
                st.rerun()
        elif stage == "blink":
            st.write("**Step 2/2** — now blink as you capture.")
            shot = st.camera_input("Blink", key=f"live_blink_{attempt}", label_visibility="collapsed")
            if shot is not None:
                result = liveness.check_blink(st.session_state["_open_frame"], to_array(shot))
                st.session_state.selfie_img = to_image(shot)
                apply_liveness_result(result.passed, result.detail, "Blink", restart_stage="open")

    else:  # head turn
        order = ["center", "left", "right"]
        prompts = {"center": "Look straight at the camera.", "left": "Now turn your head to the LEFT.", "right": "Now turn your head to the RIGHT."}
        st.write(f"**Step {order.index(stage) + 1}/3** — {prompts[stage]}")
        shot = st.camera_input(stage, key=f"live_{stage}_{attempt}", label_visibility="collapsed")
        if shot is not None:
            st.session_state[f"_frame_{stage}"] = to_array(shot)
            if stage == "center":
                st.session_state.liveness_stage = "left"
                st.rerun()
            elif stage == "left":
                st.session_state.liveness_stage = "right"
                st.rerun()
            else:
                result = liveness.check_head_turn(
                    st.session_state["_frame_center"], st.session_state["_frame_left"], to_array(shot)
                )
                st.session_state.selfie_img = to_image(shot)
                apply_liveness_result(result.passed, result.detail, "Head turn", restart_stage="center")

    if st.button("← Choose a different check"):
        st.session_state.liveness_method = None
        st.rerun()


def apply_liveness_result(passed: bool, detail: str, method_label: str, restart_stage: str):
    st.session_state.liveness_passed = passed
    st.session_state.checks["Liveness"] = f"{method_label} — {'Passed' if passed else 'Not confirmed'}"
    if not passed:
        st.session_state["_live_error"] = detail
        st.session_state.liveness_stage = restart_stage
        st.session_state.liveness_attempt = st.session_state.get("liveness_attempt", 0) + 1
        st.rerun()

    if st.session_state.cin_front_img is not None and st.session_state.selfie_img is not None:
        mr = face_match.compare_faces(np.array(st.session_state.cin_front_img), np.array(st.session_state.selfie_img))
        st.session_state.match_result = mr
        st.session_state.checks["Face match"] = "Passed" if mr.matched else "Review needed"
    else:
        st.session_state.checks["Face match"] = "No document photo to compare"
    goto(4)


def step_screening():
    st.subheader("🌐 4 · Political / terrorism screening")
    f = st.session_state.fields
    st.write(f"Screening **{f['full_name'] or '—'}** (CIN {f['cin_number'] or '—'}) against watchlists…")
    if st.session_state.screening_result is None:
        with st.spinner("Checking 4 watchlists…"):
            st.session_state.screening_result = watchlist.screen(f["full_name"], f["cin_number"])

    res = st.session_state.screening_result
    if res.status == "clear":
        st.success("Clear — no sanctions or PEP matches.")
    else:
        st.warning("Potential watchlist match — would route to compliance review in production.")
        for hit in res.hits:
            st.markdown(f"- **{hit['name']}** · {hit['list']} · {hit['note']} · match {hit['score']}% (matched on {hit['matched_on']})")

    st.session_state.checks["AML/PEP screening"] = f"{res.status} ({len(res.hits)} hit(s))"
    st.caption(" · ".join(watchlist.LISTS_CHECKED))
    if st.button("Continue →", type="primary"):
        goto(5)


def step_profile_questions():
    st.subheader("📋 5 · A few questions for the right policy")
    st.caption("This is what lets us suggest one well-matched policy instead of a wall of comparisons.")

    income = st.selectbox(
        "Household income", list(underwriting.INCOME_BRACKETS), format_func=lambda k: underwriting.INCOME_BRACKETS[k]["label"]
    )
    area = st.selectbox(
        "Where do you live?", list(underwriting.LIVING_AREA_INDEX), format_func=lambda k: underwriting.LIVING_AREA_INDEX[k]["label"]
    )
    st.write("Living conditions:")
    conditions = {}
    cols = st.columns(2)
    for i, (key, label) in enumerate(underwriting.LIVING_CONDITION_ITEMS):
        conditions[key] = cols[i % 2].checkbox(label, key=f"cond_{key}")

    if st.button("Get my policy match →", type="primary"):
        answers = underwriting.UnderwritingAnswers(income_bracket=income, living_area=area, conditions=conditions)
        st.session_state.uw_answers = answers
        st.session_state.uw_result = underwriting.score(answers)
        goto(6)


def step_policy():
    st.subheader("🎯 6 · Your matched policy")
    r = st.session_state.uw_result
    p = r.policy
    st.markdown(f"### {p['name']} — {r.confidence}% fit")
    st.write(p["tagline"])
    for c in p["covers"]:
        st.markdown(f"- ✓ {c}")
    st.info(r.affordability_note)
    for reason in r.reasons:
        st.markdown(f"- {reason}")
    if st.button("Continue to signature →", type="primary"):
        goto(7)


def step_sign():
    st.subheader("✍️ 7 · Sign to confirm")
    st.caption("This consent covers identity verification and your insurance application — nothing else.")
    canvas = st_canvas(
        stroke_width=3,
        stroke_color="#1e293b",
        background_color="#fdfefe",
        height=150,
        width=500,
        drawing_mode="freedraw",
        key="sig_canvas",
    )
    claims_url = st.text_input(
        "Claims app URL (the other laptop's address — leave as-is on one machine)", st.session_state.claims_app_url
    )
    st.session_state.claims_app_url = claims_url

    has_ink = canvas.image_data is not None and canvas.image_data[:, :, 3].max() > 0
    if st.button("Seal my profile →", type="primary", disabled=not has_ink):
        sig_img = Image.fromarray(canvas.image_data.astype("uint8"), "RGBA").convert("RGB")
        st.session_state.signature_img = sig_img
        st.session_state.checks["Consent"] = "Signed"
        goto(8)


def step_done():
    st.subheader("✅ You're verified")
    f = st.session_state.fields
    r = st.session_state.uw_result

    profile = pdf_export.build_profile(
        f, st.session_state.checks, r.policy["name"], f"{r.confidence}% fit confidence"
    )
    payload = handoff.HandoffPayload(
        name=f["full_name"], dob=f["dob"], policy=r.policy["name"], integrity_hash=profile.integrity_hash
    )
    claim_url = handoff.build_claim_url(payload, st.session_state.claims_app_url)

    st.success(f"Profile **{profile.profile_id}** sealed at {profile.signed_at}.")
    for label, value in st.session_state.checks.items():
        st.markdown(f"- **{label}:** {value}")

    pdf_bytes = pdf_export.generate_kyc_pdf(profile, st.session_state.cin_front_img, st.session_state.signature_img, claim_url)
    st.download_button("⬇ Download signed KYC document (PDF)", data=pdf_bytes, file_name=f"{profile.profile_id}.pdf", mime="application/pdf")

    st.divider()
    st.markdown("### 🚨 Continue to the shared accident session")
    st.write("Scan this on the claims-app laptop/phone, or click through if you're on the same machine — your verified identity and policy travel with you, nothing re-typed.")
    st.link_button("Open shared accident session →", claim_url, type="primary")
    st.code(claim_url, language=None)

    if st.button("Start a new eKYC session"):
        for k in list(st.session_state.keys()):
            del st.session_state[k]
        st.rerun()


# --------------------------------------------------------------------------- main
init_state()
header()

renderers = [
    step_welcome,
    step_document,
    step_confirm,
    step_liveness,
    step_screening,
    step_profile_questions,
    step_policy,
    step_sign,
    step_done,
]
renderers[st.session_state.step]()

st.markdown(
    "<p style='text-align:center;color:#94a3b8;font-size:11px;margin-top:24px'>"
    "Hackathon prototype · screening &amp; matching are mocked / classical-CV heuristics · no real personal data stored</p>",
    unsafe_allow_html=True,
)
