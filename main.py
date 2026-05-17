from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import os
import json
import re
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="TruthShield API", version="1.0.0")

# ── CORS (allows your React frontend to call this API) ──────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # In production, replace * with your Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Groq client ─────────────────────────────────────────────────────────────
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ── Request & Response models ────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    text: str
    url: str = ""          # optional — user can paste URL or raw text

class AnalyzeResponse(BaseModel):
    verdict: str           # "REAL" | "FAKE" | "SUSPICIOUS" | "UNVERIFIABLE"
    confidence: int        # 0–100
    reasons: list[str]     # 3 bullet-point reasons
    summary: str           # 1-sentence plain-English explanation
    claims: list[str]      # top 3 factual claims extracted from the text
    bias_indicators: list[str]   # emotional/manipulative language found

# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "TruthShield API is running", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "ok"}

# ── Main analysis endpoint ────────────────────────────────────────────────────
@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):

    if not request.text or len(request.text.strip()) < 30:
        raise HTTPException(
            status_code=400,
            detail="Please provide at least 30 characters of text to analyze."
        )

    if len(request.text) > 8000:
        # Groq has token limits — trim very long articles
        text = request.text[:8000] + "..."
    else:
        text = request.text

    # ── Prompt sent to Groq LLM ───────────────────────────────────────────
    prompt = f"""You are TruthShield, an expert AI fact-checker and media analyst.

Analyze the following news article or text for misinformation, fake news, and manipulation.

TEXT TO ANALYZE:
\"\"\"
{text}
\"\"\"

Respond ONLY with a valid JSON object. No explanation before or after. No markdown code blocks. Just raw JSON.

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
    "Any emotionally charged or manipulative language found"
  ]
}}

Verdict guide:
- REAL: credible, factual, verifiable claims, neutral language
- FAKE: false claims, fabricated quotes, known hoaxes, impossible claims  
- SUSPICIOUS: some red flags but not conclusively false
- UNVERIFIABLE: cannot be fact-checked without more context

Be specific. Reference actual words or claims from the text in your reasons."""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",   # Best free Groq model
            messages=[
                {
                    "role": "system",
                    "content": "You are a fact-checking AI. You respond ONLY with valid JSON. Never add any text outside the JSON object."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1,      # Low = more consistent, factual responses
            max_tokens=1000,
        )

        raw = response.choices[0].message.content.strip()

        # ── Safety: strip markdown code blocks if Groq adds them ─────────
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        raw = raw.strip()

        result = json.loads(raw)

        # ── Validate and fill missing fields safely ───────────────────────
        verdict = result.get("verdict", "UNVERIFIABLE").upper()
        if verdict not in ["REAL", "FAKE", "SUSPICIOUS", "UNVERIFIABLE"]:
            verdict = "UNVERIFIABLE"

        confidence = int(result.get("confidence", 50))
        confidence = max(0, min(100, confidence))  # clamp 0–100

        reasons = result.get("reasons", ["Analysis could not be completed."])
        if not isinstance(reasons, list):
            reasons = [str(reasons)]
        reasons = reasons[:3]   # max 3

        summary = result.get("summary", "Analysis complete.")
        claims = result.get("claims", [])
        if not isinstance(claims, list):
            claims = []
        claims = claims[:3]

        bias_indicators = result.get("bias_indicators", [])
        if not isinstance(bias_indicators, list):
            bias_indicators = []

        return AnalyzeResponse(
            verdict=verdict,
            confidence=confidence,
            summary=summary,
            reasons=reasons,
            claims=claims,
            bias_indicators=bias_indicators,
        )

    except json.JSONDecodeError:
        # If Groq returns something we can't parse, return a safe fallback
        raise HTTPException(
            status_code=502,
            detail="AI model returned an unexpected response. Please try again."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )
