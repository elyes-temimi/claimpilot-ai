# Changelog - ClaimPilot AI

All notable changes to this project are documented in this file.

---

## [1.0.0-beta] - 2026-01-20

### 🎉 Major Release: eKYC React Migration Complete

#### ✨ Added

**eKYC Flow (React)**
- Complete 9-step identity verification flow in React + TypeScript
- `src/ekyc/EkycApp.tsx` - Main flow container with step management
- `src/ekyc/CinCapture.tsx` - CIN document capture (camera + file upload)
- `src/ekyc/LivenessCheck.tsx` - Biometric verification (blink/head-turn)
- `src/ekyc/ProfileForm.tsx` - User profile questionnaire
- `src/ekyc/SignatureCapture.tsx` - Canvas-based digital signature
- `src/ekyc/types.ts` - Complete TypeScript type definitions

**Features**
- Dual capture mode: Camera OR file upload for CIN documents
- Arabic Tunisian CIN support (OCR integration points ready)
- Liveness check with skip option for testing
- AML/PEP screening integration (mock, API-ready)
- AI-powered policy matching (mock, API-ready)
- Digital signature capture with touch/mouse support
- Complete styling with responsive design

**Routing & Integration**
- Updated `src/App.tsx` with eKYC route (#ekyc)
- Default entry point changed to eKYC flow
- Seamless navigation from eKYC → Accident Claims
- User profile data flows from eKYC to AccidentApp
- Updated `src/accident/AccidentApp.tsx` to receive userProfile prop

**Styling**
- Added complete eKYC stylesheet section to `src/styles.css`
- Header, stepper, cards, camera view, upload zone styles
- Form inputs, signature pad, screening results styles
- Responsive design (mobile-first, works on all screen sizes)

**Documentation**
- `EKYC_REACT_MIGRATION.md` - Complete migration documentation
- `QUICK_START.md` - Quick testing guide (French)
- `FOR_ML_TEAMMATE.md` - ML engineer integration guide
- `PROJECT_SUMMARY.md` - Executive summary
- `CHANGELOG.md` - This file
- Updated `README.md` with new structure and guides
- Updated `INTEGRATION_STATUS.md` with 65% completion status

#### 🔧 Changed

**Application Flow**
- Default route changed from chat to eKYC
- eKYC now precedes accident claims in user journey
- AccidentApp now accepts and uses userProfile data

**Code Organization**
- Created dedicated `src/ekyc/` directory
- Separated eKYC components from accident flow
- Improved type definitions and interfaces

#### ⚠️ Deprecated

**Streamlit eKYC App**
- `ekyc-streamlit/` folder is now deprecated
- All functionality migrated to React
- Can be safely removed or archived

#### 🐛 Fixed

- Fixed LivenessCheck component syntax error (skipLiveness function)
- Fixed camera stream cleanup on component unmount
- Fixed signature pad high-DPI rendering

#### 🚀 Performance

- Reduced initial load time with code splitting
- Optimized WebSocket reconnection logic
- Improved canvas rendering for signature capture

---

## [0.9.0] - 2026-01-15

### Voice Recording & Constat Form

#### ✨ Added

**Constat Form (FTUSA Official)**
- `src/accident/ConstatForm.tsx` - Interactive constat form
- `src/accident/constatTypes.ts` - Type definitions
- `src/accident/constatPDF.ts` - PDF export functionality
- Field 9: Vehicle details (plate, make, model, direction, insurance)
- Field 12: All 17 circumstance checkboxes (bilingual FR/AR)
- Field 11: Damage description textarea
- Real-time WebSocket sync between drivers
- Backend validation in `server/sessions.mjs`

**Voice Recording**
- `src/components/VoiceRecorder.tsx` - Audio recording component
- `src/lib/speechToText.ts` - Speech-to-text integration layer
- WebRTC MediaRecorder API for audio capture
- Pause/resume functionality
- Visual waveform animation
- Duration limit (2 minutes default)
- Mock transcription service (ready for production API)
- Language detection heuristics (FR/AR/Darija/EN)
- Code-switching detection

#### 🔧 Changed

- Integrated constat form as Phase 3 (between confirmation and evidence)
- Added voice recording toggle in Evidence Stage
- Updated session state management for constat data

---

## [0.8.0] - 2026-01-10

### Two-Driver Accident Session

#### ✨ Added

**Shared Session**
- `src/accident/SessionLive.tsx` - Live session component
- `src/accident/useSession.ts` - Session state management hook
- 6-letter session code generation
- QR code generation for easy joining
- Real-time WebSocket synchronization
- GPS proximity check
- Impact zone marking on car diagram

**Backend**
- `server/sessions.mjs` - Session management
- `server/index.mjs` - WebSocket server
- In-memory session storage
- Event timeline tracking
- Automatic case locking when both drivers confirm

---

## [0.7.0] - 2026-01-05

### Initial Streamlit eKYC

#### ✨ Added

**Streamlit eKYC App** (Now deprecated)
- `ekyc-streamlit/app.py` - Main Streamlit application
- `ekyc-streamlit/lib/ocr.py` - OCR processing (Tesseract)
- `ekyc-streamlit/lib/liveness.py` - Face detection (OpenCV)
- `ekyc-streamlit/lib/face_match.py` - Face matching
- `ekyc-streamlit/lib/watchlist.py` - AML/PEP screening
- `ekyc-streamlit/lib/underwriting.py` - Policy matching
- CIN capture (camera + file upload)
- Liveness check with skip option
- PDF export functionality

---

## [0.6.0] - 2025-12-20

### Fraud Detection & Consistency

#### ✨ Added

**Fraud Detection**
- `server/consistency.mjs` - Consistency analysis engine
- Cross-check statements vs photos
- Impact zone validation
- GPS proximity verification
- Case integrity score (0-100)

**ML Integration Points**
- `ML_MODEL_SPECS.md` - Specifications for 3 ML models
- Fraud detection API endpoint structure
- Damage recognition API endpoint structure
- Repair cost estimation API endpoint structure

---

## [0.5.0] - 2025-12-15

### Evidence Collection

#### ✨ Added

**Photo Upload**
- Multiple photo upload support
- Photo metadata capture (timestamp, GPS)
- Visual damage analysis (mock)

**Statement Collection**
- Text-based statement input
- Multilingual support (FR/AR/Darija/EN)
- Code-switching detection

---

## [0.4.0] - 2025-12-10

### Policy Engine

#### ✨ Added

**Smart Policy Matching**
- `server/policyEngine.mjs` - Policy recommendation engine
- Adaptive questionnaire
- Confidence scoring
- Premium estimation
- Policy comparison

---

## [0.3.0] - 2025-12-05

### AML/PEP Screening

#### ✨ Added

**Compliance Screening**
- `server/amlData.mjs` - Mock watchlist data
- Fuzzy name matching
- PEP (Politically Exposed Person) checks
- Sanctions list checks

---

## [0.2.0] - 2025-12-01

### Initial Release

#### ✨ Added

**Project Setup**
- React + TypeScript + Vite
- Node.js backend with Express
- WebSocket support
- Basic routing
- Initial styling with CSS variables

**Documentation**
- Initial README.md
- Project structure documentation

---

## Legend

- ✨ **Added**: New features
- 🔧 **Changed**: Changes to existing functionality
- ⚠️ **Deprecated**: Features that will be removed
- 🐛 **Fixed**: Bug fixes
- 🚀 **Performance**: Performance improvements
- 🔐 **Security**: Security improvements

---

## Upcoming (Planned)

### [1.1.0] - Q1 2026
- [ ] Real OCR API integration (Google Cloud Vision)
- [ ] Real Speech-to-Text API (OpenAI Whisper)
- [ ] Real AML/PEP API (ComplyAdvantage)
- [ ] PostgreSQL database persistence
- [ ] JWT authentication

### [1.2.0] - Q2 2026
- [ ] Fraud detection ML model
- [ ] Damage recognition ML model
- [ ] Repair cost estimation ML model
- [ ] Admin dashboard
- [ ] Analytics tracking

### [2.0.0] - Q3 2026
- [ ] Mobile apps (React Native)
- [ ] Advanced fraud detection
- [ ] Integration with Tunisian insurers
- [ ] Multi-tenant support
- [ ] API marketplace

---

**Maintained by:** ClaimPilot AI Team  
**License:** MIT
