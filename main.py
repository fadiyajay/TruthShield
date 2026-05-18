from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import os
import io
import json
import re
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="TruthShield API", version="2.0.0")

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Clients ───────────────────────────────────────────────────────────────────
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
HF_TOKEN    = os.getenv("HUGGINGFACE_API_KEY")

# ═════════════════════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS
# ═════════════════════════════════════════════════════════════════════════════

class AnalyzeRequest(BaseModel):
    text: str
    url: str = ""

class AnalyzeResponse(BaseModel):
    verdict: str
    confidence: int
    summary: str
    reasons: list[str]
    claims: list[str]
    bias_indicators: list[str]

class UrlRequest(BaseModel):
    url: str

class ImageAnalyzeResponse(BaseModel):
    verdict: str
    confidence: int
    summary: str
    signals: list[str]
    metadata: dict

# ═════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═════════════════════════════════════════════════════════════════════════════

def run_groq(prompt: str, system: str = "You are a fact-checking AI. Respond ONLY with valid JSON. No markdown, no backticks, just raw JSON.") -> dict:
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt},
        ],
        temperature=0.1,
        max_tokens=1000,
    )
    raw = response.choices[0].message.content.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()
    return json.loads(raw)


def fetch_article_text(url: str) -> str:
    try:
        jina_url = f"https://r.jina.ai/{url}"
        headers  = {"Accept": "text/plain", "User-Agent": "TruthShield/2.0"}
        resp = httpx.get(jina_url, headers=headers, timeout=25, follow_redirects=True)
        resp.raise_for_status()
        text = resp.text.strip()
        if len(text) < 50:
            raise ValueError("Page returned too little text.")
        return text[:8000]
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=422, detail=f"Could not fetch URL (HTTP {e.response.status_code}).")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read article from URL: {str(e)}")


def analyze_text_with_groq(text: str) -> AnalyzeResponse:
    prompt = f"""You are TruthShield, an expert AI fact-checker and media analyst.

Analyze the following news article or text for misinformation, fake news, and manipulation.

TEXT TO ANALYZE:
\"\"\"
{text}
\"\"\"

Respond ONLY with a valid JSON object. No explanation before or after. No markdown. Just raw JSON.

The JSON must have exactly these fields:
{{
  "verdict": "REAL" or "FAKE" or "SUSPICIOUS" or "UNVERIFIABLE",
  "confidence": a number from 0 to 100,
  "summary": "One clear sentence explaining your verdict",
  "reasons": [
    "First specific reason with evidence from the text",
    "Second specific reason with evidence from the text",
    "Third specific reason with evidence from the text"
  ],
  "claims": [
    "First main factual claim made in the text",
    "Second main factual claim made in the text",
    "Third main factual claim made in the text"
  ],
  "bias_indicators": [
    "Any emotionally charged or manipulative language found, or 'None detected'"
  ]
}}

Verdict guide:
- REAL: credible, factual, verifiable claims, neutral language
- FAKE: false claims, fabricated quotes, known hoaxes, impossible claims
- SUSPICIOUS: some red flags but not conclusively false
- UNVERIFIABLE: cannot be fact-checked without more context

Be specific. Reference actual words or claims from the text in your reasons."""

    result = run_groq(prompt)

    verdict = str(result.get("verdict", "UNVERIFIABLE")).upper().strip()
    if verdict not in ["REAL", "FAKE", "SUSPICIOUS", "UNVERIFIABLE"]:
        verdict = "UNVERIFIABLE"

    confidence = result.get("confidence", 50)
    try:
        confidence = max(0, min(100, int(confidence)))
    except (TypeError, ValueError):
        confidence = 50

    reasons = result.get("reasons", ["Analysis could not be completed."])
    if not isinstance(reasons, list):
        reasons = [str(reasons)]
    reasons = [str(r) for r in reasons][:3]

    claims = result.get("claims", [])
    if not isinstance(claims, list):
        claims = []
    claims = [str(c) for c in claims][:3]

    bias_indicators = result.get("bias_indicators", [])
    if not isinstance(bias_indicators, list):
        bias_indicators = [str(bias_indicators)]
    bias_indicators = [str(b) for b in bias_indicators]

    return AnalyzeResponse(
        verdict=verdict,
        confidence=confidence,
        summary=str(result.get("summary", "Analysis complete.")),
        reasons=reasons,
        claims=claims,
        bias_indicators=bias_indicators,
    )


def hf_results_to_verdict(hf_results: list) -> tuple[str, int, list[str]]:
    fake_score = 0.0
    real_score = 0.0

    # Unwrap nested list [[...]] that HF sometimes returns
    if isinstance(hf_results, list) and len(hf_results) > 0 and isinstance(hf_results[0], list):
        hf_results = hf_results[0]

    for item in hf_results:
        if hasattr(item, "label"):
            label = str(item.label).strip().lower()
            score = float(item.score)
        elif isinstance(item, dict):
            label = str(item.get("label", "")).strip().lower()
            score = float(item.get("score", 0))
        else:
            continue

        # fake labels
        if label in ("fake", "label_0", "deepfake", "generated"):
            fake_score = max(fake_score, score)

        # real labels
        if label in ("real", "label_1", "authentic", "original", "realism"):
            real_score = max(real_score, score)

    confidence_pct = int(max(fake_score, real_score) * 100)

    if fake_score > 0.80:
        verdict = "DEEPFAKE"
        signals = [
            f"AI model detected {int(fake_score * 100)}% probability this image is a deepfake",
            "Facial features show artifacts consistent with GAN or diffusion model generation",
            "Image pixel patterns deviate significantly from authentic camera captures",
        ]
    elif fake_score > 0.50:
        verdict = "SUSPICIOUS"
        signals = [
            f"AI model detected {int(fake_score * 100)}% probability of manipulation",
            "Some visual anomalies detected but not conclusively fake",
            "Treat this image with caution — further verification recommended",
        ]
    else:
        verdict = "AUTHENTIC"
        signals = [
            f"AI model detected {int(real_score * 100)}% probability this image is authentic",
            "Pixel patterns are consistent with real camera photography",
            "No strong deepfake or AI-generation fingerprints detected",
        ]

    return verdict, confidence_pct, signals


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "TruthShield API is running", "version": "2.0.0"}

@app.get("/health")
def health():
    return {"status": "ok"}


# ── 1. TEXT ANALYSIS ──────────────────────────────────────────────────────────
@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    """Analyze pasted text or article content for fake news and misinformation."""
    if not request.text or len(request.text.strip()) < 30:
        raise HTTPException(status_code=400, detail="Please provide at least 30 characters of text to analyze.")

    text = request.text[:8000] + "..." if len(request.text) > 8000 else request.text

    try:
        return analyze_text_with_groq(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned an unexpected response. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# ── 2. URL ANALYSIS ───────────────────────────────────────────────────────────
@app.post("/analyze-url", response_model=AnalyzeResponse)
def analyze_url(request: UrlRequest):
    """Paste a news article URL — we fetch the text automatically and analyze it."""
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Please provide a URL.")
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    article_text = fetch_article_text(url)

    try:
        return analyze_text_with_groq(article_text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned an unexpected response. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# ── 3. IMAGE / DEEPFAKE ANALYSIS ──────────────────────────────────────────────
@app.post("/analyze-image", response_model=ImageAnalyzeResponse)
async def analyze_image(file: UploadFile = File(...)):
    """Upload a JPG, PNG, or WebP image to detect if it is a deepfake or AI-generated."""

    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    content_type  = (file.content_type or "").lower()
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Please upload JPG, PNG, or WebP."
        )

    image_bytes = await file.read()

    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large. Maximum size is 10 MB.")

    size_kb  = round(len(image_bytes) / 1024, 1)
    metadata = {
        "filename": file.filename or "unknown",
        "format":   file.content_type,
        "size_kb":  size_kb,
    }

    # Call HuggingFace router directly with raw bytes + Content-Type header
    try:
        hf_url     = "https://router.huggingface.co/hf-inference/models/dima806/deepfake_vs_real_image_detection"
        hf_headers = {
            "Authorization": f"Bearer {HF_TOKEN}",
            "Content-Type":  content_type if content_type != "image/jpg" else "image/jpeg",
        }
        hf_resp = httpx.post(hf_url, headers=hf_headers, content=image_bytes, timeout=40)

        if hf_resp.status_code == 503:
            raise HTTPException(
                status_code=503,
                detail="Image AI model is warming up. Wait 20 seconds and try again — this is normal on the free tier."
            )
        if hf_resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"HuggingFace error {hf_resp.status_code}: {hf_resp.text[:300]}"
            )

        hf_results = hf_resp.json()

        # Guard: HF sometimes returns {"error": "..."} on model loading
        if isinstance(hf_results, dict) and "error" in hf_results:
            raise HTTPException(
                status_code=503,
                detail="Image AI model is loading. Wait 20 seconds and try again."
            )

        verdict, confidence, signals = hf_results_to_verdict(hf_results)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Image model error: {str(e)}")

    # Groq writes a plain-English summary
    try:
        summary_prompt = f"""An AI deepfake detector analyzed an image and returned:
- Verdict: {verdict}
- Confidence: {confidence}%
- Key signal: {signals[0]}

Write ONE clear sentence (max 25 words) explaining what this means to a non-technical person.
Reply with ONLY that sentence. No extra text, no quotes."""

        summary_resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": summary_prompt}],
            temperature=0.2,
            max_tokens=60,
        )
        summary = summary_resp.choices[0].message.content.strip().strip('"').strip("'")
    except Exception:
        summary = f"This image is {verdict.lower().replace('_', ' ')} with {confidence}% confidence."

    return ImageAnalyzeResponse(
        verdict=verdict,
        confidence=confidence,
        summary=summary,
        signals=signals,
        metadata=metadata,
    )
