"""Face match — CIN photo vs. live selfie, classical CV (no deep net).

Combines a color-histogram correlation with an ORB keypoint-match ratio on
the aligned face crops. This is a coarse verifier, not biometric-grade
recognition — good enough to demo "does the live face plausibly match the
document photo", explicitly not good enough for a production KYC decision.
A real deployment would use a proper face-embedding model (e.g. ArcFace)
behind a licensed liveness/match SDK.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .liveness import FaceBox, detect_face

MATCH_THRESHOLD = 0.42


def _crop(image: np.ndarray, face: FaceBox, pad: float = 0.15) -> np.ndarray:
    h, w = image.shape[:2]
    px, py = int(face.w * pad), int(face.h * pad)
    x0, y0 = max(0, face.x - px), max(0, face.y - py)
    x1, y1 = min(w, face.x + face.w + px), min(h, face.y + face.h + py)
    return image[y0:y1, x0:x1]


def _hist_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a = cv2.resize(a, (128, 128))
    b = cv2.resize(b, (128, 128))
    ha = cv2.calcHist([cv2.cvtColor(a, cv2.COLOR_RGB2HSV)], [0, 1], None, [50, 60], [0, 180, 0, 256])
    hb = cv2.calcHist([cv2.cvtColor(b, cv2.COLOR_RGB2HSV)], [0, 1], None, [50, 60], [0, 180, 0, 256])
    cv2.normalize(ha, ha)
    cv2.normalize(hb, hb)
    corr = cv2.compareHist(ha, hb, cv2.HISTCMP_CORREL)
    return max(0.0, corr)


def _orb_similarity(a: np.ndarray, b: np.ndarray) -> float:
    orb = cv2.ORB_create(nfeatures=300)
    ga = cv2.cvtColor(cv2.resize(a, (160, 160)), cv2.COLOR_RGB2GRAY)
    gb = cv2.cvtColor(cv2.resize(b, (160, 160)), cv2.COLOR_RGB2GRAY)
    k1, d1 = orb.detectAndCompute(ga, None)
    k2, d2 = orb.detectAndCompute(gb, None)
    if d1 is None or d2 is None or len(k1) < 4 or len(k2) < 4:
        return 0.0
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = bf.match(d1, d2)
    if not matches:
        return 0.0
    good = [m for m in matches if m.distance < 55]
    return len(good) / max(len(k1), len(k2))


@dataclass
class MatchResult:
    matched: bool
    score: float
    hist_score: float
    orb_score: float
    detail: str


def compare_faces(document_image: np.ndarray, selfie_image: np.ndarray) -> MatchResult:
    doc_face = detect_face(document_image)
    selfie_face = detect_face(selfie_image)
    if doc_face is None:
        return MatchResult(False, 0, 0, 0, "No face detected on the document photo.")
    if selfie_face is None:
        return MatchResult(False, 0, 0, 0, "No face detected in the selfie.")

    doc_crop = _crop(document_image, doc_face)
    selfie_crop = _crop(selfie_image, selfie_face)

    hist_score = _hist_similarity(doc_crop, selfie_crop)
    orb_score = _orb_similarity(doc_crop, selfie_crop)
    score = 0.5 * hist_score + 0.5 * orb_score
    matched = score >= MATCH_THRESHOLD

    detail = (
        f"Similarity {score:.2f} (≥ {MATCH_THRESHOLD}) — plausible match."
        if matched
        else f"Similarity {score:.2f} (< {MATCH_THRESHOLD}) — doesn't clearly match, routed to manual review."
    )
    return MatchResult(matched, round(score, 3), round(hist_score, 3), round(orb_score, 3), detail)
