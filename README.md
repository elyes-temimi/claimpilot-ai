# ClaimPilot AI — Phases 1–4

Hackathon prototype implementing the first four phases of the ClaimPilot AI pipeline:

- **Phase 1 — Intelligent eKYC**: conversational onboarding with document OCR (Tesseract.js),
  face match + blink-based liveness (face-api / TensorFlow.js, fully in-browser),
  mocked AML/PEP screening, and an ECDSA-signed digital profile with QR verification.
- **Phase 2 — Smart Policy Selection**: a short *adaptive* Q&A (questions appear/disappear
  based on earlier answers and the eKYC profile) that recommends **one** policy with premium
  estimate, fit-confidence, reasons, and a "why not the runner-up" explanation.
- **Phase 3 — Shared Accident Session** (signature feature): both drivers join **one live case**
  over WebSockets — via QR scan or a 6-letter session code. GPS, date and time are captured
  automatically (never typed), each driver marks their point of impact on a car diagram the
  other driver sees update in real time, a proximity check confirms both phones are at the
  scene, and a two-sided confirm locks and seals the case. Verified identity + matched policy
  from Phases 1–2 attach automatically — nothing is re-entered.
- **Phase 4 — AI Evidence Analysis**: three engines on the locked case.
  - *Vision AI* (on-device): Sobel gradient + orientation-entropy analysis localizes damage
    texture in photos, draws a heatmap + bounding box, grades severity, and rejects clean
    panels (verified: damaged samples → 1 tight region on the correct end; clean car → zero).
  - *Language AI*: token-level code-switch detection for **French / Arabic / Tunisian Darija
    (incl. arabizi) / English** — every word tagged and colored — plus a multilingual lexicon
    that extracts impact direction, movement, fault claim, injuries and conditions from one
    mixed sentence, with real mic dictation (Web Speech: fr-FR / ar-TN / en-US) where available.
  - *Consistency Engine* (server): cross-examines story vs dents vs the Phase 3 diagram vs the
    other driver — collision-geometry plausibility, statement agreement, GPS proximity — into a
    **case integrity score** that routes fast-track / standard / human adjuster. The flags
    assist; the liability call stays human.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 — Vite client on `:5173`, mocked trust-services API on `:8787`.

## Demo tips (for the pitch)

- **Specimen document**: click *"Use specimen ID"* to run real OCR live without showing a real ID.
- **Demo mode**: open `http://localhost:5173/?demo=1` — shortens typing delays and adds
  *"Simulate"* buttons for the biometric step (your recorded-fallback insurance).
- **AML review path**: enter the name `Faycal Trabelsi` (fictional PEP entry) at the identity
  confirmation step to demo the compliance-flag flow instead of the happy path.
- **The timer** in the header is the proof point: full eKYC + policy match in minutes.
- Best on a laptop with a webcam (liveness = blink twice) or a phone on the same network.

### Phase 3 demo

- Open the shared session with the **🚨 button** in the header, the chip at the end of
  onboarding, or directly at `http://localhost:5173/#accident`.
- **Two-device demo**: driver A starts a session; driver B scans the QR (it encodes your LAN
  IP) or types the 6-letter code. Two browser tabs on one laptop work great on a projector —
  each tab is its own driver.
- **Solo demo**: with `?demo=1`, the *"Simulate other driver joining"* button plays a scripted
  second driver (labeled SIMULATED) — she joins, her GPS locks, she marks her impact, she
  confirms. You confirm your side and watch the case lock.
- **Real GPS on phones** needs a secure context: run `npm run dev:https` (self-signed cert —
  accept the warning on the phone). Over plain http, the app falls back to a labeled demo
  location. A mid-demo page refresh is safe: the tab re-attaches to its session automatically.

### Phase 4 demo

- After the case locks, hit **"Continue to AI evidence analysis"**.
- **Vision AI**: add a real photo, or use *"Sample: rear hit"* / *"Sample: front hit"*
  (synthetic, watermarked) — the heatmap and severity are computed live in the browser either way.
- **Language AI**: dictate in French/Arabic/English (Chrome), type any mix, or use
  *"⚡ Demo: mixed-language statement"* — one sentence in Darija + Arabic + French, fully parsed.
- **The pitch beat**: *"⚠ Demo: fraud scenario"* files a statement claiming a rear-end hit with
  photos showing front damage — watch the integrity score drop from 100 to ~64 and the case
  re-route to review. "The AI checks whether the story and the dents agree."
- The simulated driver files her own evidence a few seconds after the case locks, so the
  consistency report is always two-sided even solo.

## Architecture

```
client (Vite + React + TS)                server (Express + ws, mocked trust services)
├─ conversational flow engine             ├─ POST /api/aml/screen      fuzzy watchlist match
├─ Tesseract.js OCR (in browser)          ├─ POST /api/profile/sign    ECDSA P-256 signature
├─ face-api: match + blink liveness       ├─ POST /api/profile/verify  signature check
├─ chat widgets (camera, signature…)      ├─ POST /api/policy/step     adaptive Q&A + scoring
├─ accident session (QR, GPS,             ├─ /api/session/*            create / join / simulate
│  car diagram, live timeline)            ├─ WS /ws                    live two-driver case sync
├─ vision.ts — damage heatmap/severity    └─ consistency.mjs           cross-checks + integrity
└─ language.ts — code-switch ID + NLU                                  score (story vs evidence)
```

All biometrics run **on-device** (models served from `/public/models`); nothing leaves the
machine except mocked screening/signing calls. The watchlist contains only fictional names.
