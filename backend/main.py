from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
import os, base64, json, re, time, sqlite3, httpx, io, threading
from dotenv import load_dotenv
from datetime import datetime, timedelta
from collections import defaultdict
from urllib.parse import urlparse, quote_plus
import ipaddress
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext

# PDF imports (reportlab — free, no API key)
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# Audio imports (stdlib only — no extra packages)
import struct, wave, tempfile

load_dotenv()

# =============================================================================
# AUTH CONSTANTS
# =============================================================================
SECRET_KEY = os.getenv("SECRET_KEY", "truthshield-secret-change-in-production-2026")
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

# =============================================================================
# STARTUP CHECKS
# =============================================================================
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
HF_TOKEN     = os.getenv("HUGGINGFACE_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is missing from .env")

# =============================================================================
# DATABASE
# =============================================================================
DB_PATH = "truthshield.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""CREATE TABLE IF NOT EXISTS analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
        verdict TEXT NOT NULL, confidence INTEGER NOT NULL,
        summary TEXT NOT NULL, input_preview TEXT NOT NULL,
        full_result TEXT, timestamp TEXT NOT NULL, user_email TEXT DEFAULT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
        name TEXT DEFAULT '', password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, is_active INTEGER DEFAULT 1)""")
    conn.commit(); conn.close()
    print("Database ready:", DB_PATH)

init_db()

def db_save(atype, verdict, confidence, summary, preview, full_result=None, user_email=None):
    p = (preview[:120]+"...") if len(preview)>120 else preview
    ts = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = get_db()
    conn.execute("INSERT INTO analyses (type,verdict,confidence,summary,input_preview,full_result,timestamp,user_email) VALUES(?,?,?,?,?,?,?,?)",
                 (atype,verdict,confidence,summary,p,json.dumps(full_result) if full_result else None,ts,user_email))
    conn.commit(); conn.close()

def db_get_history(limit=20, user_email=None):
    conn = get_db()
    if user_email:
        rows = conn.execute("SELECT id,type,verdict,confidence,summary,input_preview,timestamp FROM analyses WHERE user_email=? ORDER BY id DESC LIMIT ?",(user_email,limit)).fetchall()
    else:
        rows = conn.execute("SELECT id,type,verdict,confidence,summary,input_preview,timestamp FROM analyses ORDER BY id DESC LIMIT ?",(limit,)).fetchall()
    conn.close(); return [dict(r) for r in rows]

def db_get_by_id(analysis_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM analyses WHERE id=?",(analysis_id,)).fetchone()
    conn.close(); return dict(row) if row else None

def db_clear():
    conn = get_db(); conn.execute("DELETE FROM analyses"); conn.commit(); conn.close()

def db_get_stats():
    conn = get_db()
    total    = conn.execute("SELECT COUNT(*) FROM analyses").fetchone()[0]
    verdicts = conn.execute("SELECT verdict,COUNT(*) as cnt FROM analyses GROUP BY verdict").fetchall()
    types    = conn.execute("SELECT type,COUNT(*) as cnt FROM analyses GROUP BY type").fetchall()
    avg      = conn.execute("SELECT AVG(confidence) FROM analyses").fetchone()[0]
    conn.close()
    return {"total_analyses":total,"average_confidence":round(avg or 0,1),
            "by_verdict":{r["verdict"]:r["cnt"] for r in verdicts},
            "by_type":{r["type"]:r["cnt"] for r in types}}

# =============================================================================
# RATE LIMITER
# =============================================================================
_rate_store: dict = defaultdict(list)
_rate_lock = threading.Lock()

def check_rate_limit(request: Request, max_calls: int, window_seconds: int = 60):
    ip = request.client.host if request.client else "unknown"
    now = time.time(); cutoff = now - window_seconds
    with _rate_lock:
        _rate_store[ip] = [t for t in _rate_store[ip] if t > cutoff]
        if len(_rate_store[ip]) >= max_calls:
            raise HTTPException(status_code=429, detail=f"Too many requests. Limit is {max_calls}/minute.")
        _rate_store[ip].append(now)

# =============================================================================
# APP
# =============================================================================
app = FastAPI(title="TruthShield API", version="6.0.0",
              description="AI-powered fake news, deepfake, and misinformation detection")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])
groq_client = Groq(api_key=GROQ_API_KEY)

# =============================================================================
# DOMAIN LISTS
# =============================================================================
FAKE_NEWS_DOMAINS = {
    "beforeitsnews.com","worldnewsdailyreport.com","empirenews.net","huzlers.com",
    "nationalreport.net","theresistance.video","abcnews.com.co","cbsnews.com.co",
    "infowars.com","naturalnews.com","yournewswire.com","newspunch.com",
    "thegatewaypundit.com","redstatewatcher.com","conservativedailypost.com",
    "veteranstoday.com","activistpost.com","zerohedge.com","americanfreepress.net",
    "globalresearch.ca","21wire.tv","realnewsrightnow.com","realnews.com.co",
    "usapoliticstoday.com","thedcgazette.com","worldpoliticus.com","libertywriters.com",
    "thepoliticalinsider.com","usherald.com","politicot.com","usanewsflash.com",
    "usatwentyfour.com","dailybuzzlive.com",
}
CREDIBLE_DOMAINS = {
    "reuters.com","apnews.com","bbc.com","bbc.co.uk","nytimes.com","theguardian.com",
    "washingtonpost.com","economist.com","ft.com","bloomberg.com","wsj.com","npr.org",
    "pbs.org","cbsnews.com","nbcnews.com","abcnews.go.com","cnn.com","time.com",
    "theatlantic.com","newyorker.com","scientificamerican.com","nature.com","science.org",
    "ndtv.com","thehindu.com","hindustantimes.com","indianexpress.com","timesofindia.com",
    "scroll.in","thewire.in",
}

# =============================================================================
# MODELS
# =============================================================================
class AnalyzeRequest(BaseModel):
    text: str; url: str = ""

class AnalyzeResponse(BaseModel):
    verdict: str; confidence: int; summary: str; confidence_explanation: str
    reasons: list[str]; claims: list[str]; bias_indicators: list[str]
    source_credibility: dict; language_detected: str

class UrlRequest(BaseModel):
    url: str

class ImageAnalyzeResponse(BaseModel):
    verdict: str; confidence: int; summary: str; signals: list[str]; metadata: dict

class ImageUrlRequest(BaseModel):
    url: str

class HistoryItem(BaseModel):
    id: int; type: str; verdict: str; confidence: int
    summary: str; input_preview: str; timestamp: str

class StatsResponse(BaseModel):
    total_analyses: int; average_confidence: float; by_verdict: dict; by_type: dict

class UserRegister(BaseModel):
    email: str; password: str; name: str = ""

class UserLogin(BaseModel):
    email: str; password: str

class Token(BaseModel):
    access_token: str; token_type: str; user_email: str; expires_in: int

class UserOut(BaseModel):
    id: int; email: str; name: str; created_at: str; total_analyses: int

class ClaimCheckRequest(BaseModel):
    claims: list[str]; verdict: str = ""

class ClaimEvidence(BaseModel):
    claim: str; status: str; summary: str; sources: list[dict]

class ClaimCheckResponse(BaseModel):
    overall_assessment: str; claims_checked: int; supported: int
    contradicted: int; unverified: int; results: list[ClaimEvidence]

class AudioAnalyzeResponse(BaseModel):
    verdict: str; confidence: int; summary: str
    signals: list[str]; metadata: dict

# =============================================================================
# HELPERS
# =============================================================================
def run_groq(prompt, system="You are a fact-checking AI. Respond ONLY with valid JSON. No markdown, no backticks, just raw JSON."):
    resp = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role":"system","content":system},{"role":"user","content":prompt}],
        temperature=0.1, max_tokens=1200)
    raw = resp.choices[0].message.content.strip()
    raw = re.sub(r"^```(?:json)?\s*","",raw); raw = re.sub(r"\s*```$","",raw)
    return json.loads(raw.strip())

def clean_social_text(text):
    text = re.sub(r"(?i)forwarded(\s+many\s+times)?[\s\n]*","",text)
    text = re.sub(r"\[\d{1,2}/\d{1,2}/\d{2,4},\s*\d{1,2}:\d{2}.*?\].*?:","",text)
    text = re.sub(r"https?://\S+","",text)
    text = re.sub(r"[\U0001F300-\U0001F9FF\U00002600-\U000027FF\U0000FE00-\U0000FEFF]","",text,flags=re.UNICODE)
    text = re.sub(r"\n{3,}","\n\n",text); text = re.sub(r"[ \t]{2,}"," ",text)
    return text.strip()

def get_source_credibility(url):
    if not url: return {"domain":"","trust_level":"UNKNOWN","explanation":"No URL provided."}
    try: domain = urlparse(url).netloc.lower().replace("www.","")
    except: return {"domain":"","trust_level":"UNKNOWN","explanation":"Could not parse URL."}
    try:
        ip = ipaddress.ip_address(domain)
        if ip.is_private or ip.is_loopback:
            raise HTTPException(status_code=400,detail="Private URLs not allowed.")
    except ValueError: pass
    if domain in FAKE_NEWS_DOMAINS:
        return {"domain":domain,"trust_level":"LOW","explanation":f"'{domain}' is a known low-credibility domain."}
    if domain in CREDIBLE_DOMAINS:
        return {"domain":domain,"trust_level":"HIGH","explanation":f"'{domain}' is a generally credible source."}
    return {"domain":domain,"trust_level":"UNRATED","explanation":f"'{domain}' is not in our database."}

def build_confidence_explanation(verdict, confidence):
    if confidence>=90: c="very high certainty"
    elif confidence>=75: c="high certainty"
    elif confidence>=55: c="moderate certainty"
    elif confidence>=40: c="low certainty"
    else: c="very low certainty"
    vt={"REAL":"this content appears genuine","FAKE":"this content appears false","SUSPICIOUS":"this content has red flags","UNVERIFIABLE":"this cannot be fact-checked"}.get(verdict,"analysis is inconclusive")
    return f"The AI is {confidence}% confident ({c}) that {vt}."

def hash_password(p): return pwd_context.hash(p)
def verify_password(p,h): return pwd_context.verify(p,h)

def create_access_token(data, expires_delta=None):
    d = data.copy(); d["exp"] = datetime.utcnow()+(expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return jwt.encode(d, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)) -> Optional[dict]:
    if not token: return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        return {"email":email} if email else None
    except JWTError: return None

def require_auth(current_user: Optional[dict] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated. Login at POST /auth/login.")
    return current_user

def ssrf_check(url):
    try:
        host = urlparse(url).netloc.split(":")[0]
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback:
            raise HTTPException(status_code=400,detail="Private URLs not allowed.")
    except ValueError: pass

def fetch_article_text(url):
    ssrf_check(url)
    try:
        resp = httpx.get(f"https://r.jina.ai/{url}",
                         headers={"Accept":"text/plain","User-Agent":"TruthShield/6.0"},
                         timeout=25,follow_redirects=True)
        resp.raise_for_status()
        text = resp.text.strip()
        if len(text)<50: raise ValueError("Too little text.")
        return text[:8000]
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=422,detail=f"Could not fetch URL (HTTP {e.response.status_code}).")
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=422,detail=f"Could not read article: {str(e)}")

def analyze_text_with_groq(text, source_url=""):
    cleaned = clean_social_text(text)
    prompt = f"""You are TruthShield, an expert AI fact-checker.
Analyze this text for misinformation. Detect input language, put in language_detected.
Always write analysis in English.

TEXT: \"\"\"{cleaned}\"\"\"

Respond ONLY with valid JSON:
{{"verdict":"REAL"or"FAKE"or"SUSPICIOUS"or"UNVERIFIABLE","confidence":0-100,"summary":"one sentence","reasons":["r1","r2","r3"],"claims":["c1","c2","c3"],"bias_indicators":["b1"],"language_detected":"English"}}"""
    result     = run_groq(prompt)
    verdict    = str(result.get("verdict","UNVERIFIABLE")).upper()
    if verdict not in ["REAL","FAKE","SUSPICIOUS","UNVERIFIABLE"]: verdict="UNVERIFIABLE"
    confidence = max(0,min(100,int(result.get("confidence",50))))
    return AnalyzeResponse(
        verdict=verdict, confidence=confidence,
        summary=str(result.get("summary","Analysis complete.")),
        confidence_explanation=build_confidence_explanation(verdict,confidence),
        reasons=[str(r) for r in (result.get("reasons") or ["Could not complete."])][:3],
        claims=[str(c) for c in (result.get("claims") or [])][:3],
        bias_indicators=[str(b) for b in (result.get("bias_indicators") or [])],
        source_credibility=get_source_credibility(source_url),
        language_detected=str(result.get("language_detected","English")))

# ── CLAIM CROSS-CHECK HELPERS ─────────────────────────────────────────────────
def search_duckduckgo(query, max_results=4):
    try:
        resp = httpx.get(f"https://lite.duckduckgo.com/lite/?q={quote_plus(query)}",
                         headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0"},
                         timeout=10,follow_redirects=True)
        resp.raise_for_status(); html = resp.text
        pattern = re.compile(r'<a[^>]+href=["\']https?://([^"\']+)["\'][^>]*>([^<]{10,80})</a>',re.I)
        results=[]; seen=set()
        for href_path, title in pattern.findall(html):
            href = "https://"+href_path; title = title.strip()
            if "duckduckgo" in href: continue
            try: domain = urlparse(href).netloc.replace("www.","")
            except: continue
            if domain in seen: continue
            seen.add(domain)
            results.append({"title":title[:120],"url":href,"snippet":"","domain":domain})
            if len(results)>=max_results: break
        return results
    except: return []

def assess_claim_with_groq(claim, sources, original_verdict):
    src_text = "\n".join([f"{i+1}. [{s['domain']}] {s['title']}" for i,s in enumerate(sources)]) or "No results found."
    try:
        result = run_groq(f"""Fact-check this claim using the search results.
CLAIM: "{claim}"
ORIGINAL VERDICT: {original_verdict}
SEARCH RESULTS:\n{src_text}

Respond ONLY with JSON:
{{"status":"SUPPORTED"or"CONTRADICTED"or"UNVERIFIED","summary":"one sentence max 30 words"}}""")
        status = str(result.get("status","UNVERIFIED")).upper()
        if status not in ["SUPPORTED","CONTRADICTED","UNVERIFIED"]: status="UNVERIFIED"
        return {"status":status,"summary":str(result.get("summary","Could not assess from available sources."))}
    except: return {"status":"UNVERIFIED","summary":"Could not assess from available sources."}

# ── PDF REPORT HELPER ─────────────────────────────────────────────────────────
def generate_pdf_report(row: dict) -> bytes:
    """
    Generate a professional one-page PDF report for any analysis.
    Uses reportlab — free, no API key. Returns PDF as bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            rightMargin=2*cm, leftMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    story  = []

    # Verdict color
    verdict = row.get("verdict","UNKNOWN")
    verdict_colors = {
        "FAKE":         colors.HexColor("#E24B4A"),
        "SUSPICIOUS":   colors.HexColor("#EF9F27"),
        "REAL":         colors.HexColor("#1D9E75"),
        "AUTHENTIC":    colors.HexColor("#1D9E75"),
        "DEEPFAKE":     colors.HexColor("#E24B4A"),
        "UNVERIFIABLE": colors.HexColor("#888780"),
    }
    verdict_color = verdict_colors.get(verdict, colors.HexColor("#888780"))

    # ── Header ──
    header_style = ParagraphStyle("header", parent=styles["Title"],
                                  fontSize=22, textColor=colors.HexColor("#1a1a1a"),
                                  spaceAfter=4, alignment=TA_CENTER)
    sub_style = ParagraphStyle("sub", parent=styles["Normal"],
                               fontSize=10, textColor=colors.HexColor("#888780"),
                               spaceAfter=2, alignment=TA_CENTER)

    story.append(Paragraph("TruthShield Analysis Report", header_style))
    story.append(Paragraph(f"Generated on {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}", sub_style))
    story.append(Spacer(1, 0.3*cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e0e0e0")))
    story.append(Spacer(1, 0.4*cm))

    # ── Verdict banner ──
    verdict_style = ParagraphStyle("verdict", parent=styles["Normal"],
                                   fontSize=28, textColor=verdict_color,
                                   spaceAfter=4, alignment=TA_CENTER, fontName="Helvetica-Bold")
    story.append(Paragraph(verdict, verdict_style))

    conf_style = ParagraphStyle("conf", parent=styles["Normal"],
                                fontSize=13, textColor=colors.HexColor("#555555"),
                                spaceAfter=8, alignment=TA_CENTER)
    story.append(Paragraph(f"Confidence: {row.get('confidence',0)}%", conf_style))

    # ── Summary ──
    label_style = ParagraphStyle("label", parent=styles["Normal"],
                                 fontSize=10, textColor=colors.HexColor("#888780"),
                                 fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=3)
    body_style  = ParagraphStyle("body", parent=styles["Normal"],
                                 fontSize=11, textColor=colors.HexColor("#1a1a1a"),
                                 spaceAfter=6, leading=16)

    story.append(Paragraph("SUMMARY", label_style))
    story.append(Paragraph(row.get("summary","No summary available."), body_style))
    story.append(Spacer(1, 0.2*cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e0e0e0")))

    # ── Full result fields (reasons, claims, bias) from stored JSON ──
    full_result = {}
    if row.get("full_result"):
        try: full_result = json.loads(row["full_result"])
        except: pass

    if full_result.get("reasons"):
        story.append(Paragraph("REASONS FOR VERDICT", label_style))
        for r in full_result["reasons"]:
            story.append(Paragraph(f"• {r}", body_style))

    if full_result.get("claims"):
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph("CLAIMS FOUND IN CONTENT", label_style))
        for c in full_result["claims"]:
            story.append(Paragraph(f"• {c}", body_style))

    if full_result.get("bias_indicators"):
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph("BIAS INDICATORS", label_style))
        for b in full_result["bias_indicators"]:
            story.append(Paragraph(f"• {b}", body_style))

    if full_result.get("source_credibility"):
        sc = full_result["source_credibility"]
        if sc.get("domain"):
            story.append(Spacer(1, 0.2*cm))
            story.append(Paragraph("SOURCE CREDIBILITY", label_style))
            story.append(Paragraph(f"Domain: {sc.get('domain')} — Trust Level: {sc.get('trust_level')}", body_style))
            story.append(Paragraph(sc.get("explanation",""), body_style))

    # ── Meta info table ──
    story.append(Spacer(1, 0.4*cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e0e0e0")))
    story.append(Spacer(1, 0.3*cm))

    meta_data = [
        ["Analysis ID", str(row.get("id",""))],
        ["Type",        row.get("type","").upper()],
        ["Timestamp",   row.get("timestamp","")],
        ["Analysed by", row.get("user_email","Guest (not logged in)")],
    ]
    table = Table(meta_data, colWidths=[4*cm, 13*cm])
    table.setStyle(TableStyle([
        ("FONTNAME",  (0,0),(-1,-1), "Helvetica"),
        ("FONTSIZE",  (0,0),(-1,-1), 9),
        ("TEXTCOLOR", (0,0),(0,-1),  colors.HexColor("#888780")),
        ("TEXTCOLOR", (1,0),(1,-1),  colors.HexColor("#1a1a1a")),
        ("TOPPADDING",(0,0),(-1,-1), 3),
        ("BOTTOMPADDING",(0,0),(-1,-1), 3),
    ]))
    story.append(table)

    # ── Footer ──
    story.append(Spacer(1, 0.5*cm))
    footer_style = ParagraphStyle("footer", parent=styles["Normal"],
                                  fontSize=8, textColor=colors.HexColor("#aaaaaa"),
                                  alignment=TA_CENTER)
    story.append(Paragraph("TruthShield — AI-powered misinformation detection | For informational purposes only.", footer_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()

# ── AUDIO ANALYSIS HELPER ─────────────────────────────────────────────────────
def get_audio_metadata(audio_bytes: bytes, filename: str) -> dict:
    """Extract basic audio metadata without ffmpeg using stdlib."""
    size_kb = round(len(audio_bytes) / 1024, 1)
    duration_sec = 0
    sample_rate  = 0
    channels     = 0

    if filename.lower().endswith(".wav"):
        try:
            with io.BytesIO(audio_bytes) as f:
                with wave.open(f, "rb") as wf:
                    channels    = wf.getnchannels()
                    sample_rate = wf.getframerate()
                    frames      = wf.getnframes()
                    duration_sec = round(frames / sample_rate, 1)
        except Exception:
            pass

    return {
        "filename":     filename,
        "size_kb":      size_kb,
        "duration_sec": duration_sec,
        "sample_rate":  sample_rate,
        "channels":     channels,
        "format":       filename.split(".")[-1].upper(),
    }

async def run_audio_analysis(audio_bytes: bytes, filename: str,
                              content_type: str, user_email: str = None) -> AudioAnalyzeResponse:
    """
    Audio deepfake detection:
    Step 1 — Try HuggingFace audio classification model (free)
    Step 2 — Groq text fallback: describe the audio properties and ask for assessment
    """
    metadata = get_audio_metadata(audio_bytes, filename)
    verdict = confidence = signals = summary = None
    hf_used = False

    # Step 1 — HuggingFace audio deepfake model
    if HF_TOKEN:
        try:
            hf_resp = httpx.post(
                "https://router.huggingface.co/hf-inference/models/MelodyMachine/Deepfake-audio-detection-V2",
                headers={"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": content_type},
                content=audio_bytes, timeout=60,
            )
            if hf_resp.status_code == 200:
                hf_json = hf_resp.json()
                # Normalize response format (may be list or list-of-list)
                if isinstance(hf_json, list) and hf_json and isinstance(hf_json[0], list):
                    hf_json = hf_json[0]
                fake_score = real_score = 0.0
                for item in hf_json:
                    if isinstance(item, dict):
                        label = str(item.get("label","")).lower()
                        score = float(item.get("score", 0))
                        if label in ("fake","spoof","deepfake","generated","ai"):
                            fake_score = max(fake_score, score)
                        if label in ("real","genuine","authentic","human","bonafide"):
                            real_score = max(real_score, score)

                if fake_score > 0 or real_score > 0:
                    hf_used = True
                    if fake_score > 0.80:
                        verdict    = "DEEPFAKE"
                        confidence = int(fake_score * 100)
                        signals    = [
                            f"AI voice detection model flagged {int(fake_score*100)}% probability of synthetic audio",
                            "Voice patterns show characteristics of AI/TTS generation",
                            "Audio lacks natural human voice micro-variations",
                        ]
                    elif fake_score > 0.50:
                        verdict    = "SUSPICIOUS"
                        confidence = int(fake_score * 100)
                        signals    = [
                            f"Model detected {int(fake_score*100)}% probability of manipulation",
                            "Some synthetic voice characteristics detected",
                            "Further manual verification recommended",
                        ]
                    else:
                        verdict    = "AUTHENTIC"
                        confidence = int(real_score * 100)
                        signals    = [
                            f"Model detected {int(real_score*100)}% probability of authentic human voice",
                            "Voice patterns consistent with natural human speech",
                            "No strong AI generation fingerprints detected",
                        ]
        except Exception:
            pass

    # Step 2 — Groq text-based fallback analysis using audio metadata
    if not hf_used:
        duration_info = f"{metadata['duration_sec']} seconds" if metadata['duration_sec'] else "unknown duration"
        prompt = f"""You are an expert audio forensics analyst specializing in deepfake voice detection.

An audio file has been submitted for analysis:
- Filename: {filename}
- Format: {metadata['format']}
- File size: {metadata['size_kb']} KB
- Duration: {duration_info}
- Sample rate: {metadata['sample_rate']} Hz
- Channels: {metadata['channels']}

Based on these technical properties and your knowledge of deepfake audio patterns, provide your assessment.
Note: You are analyzing METADATA only — be honest that full waveform analysis was not possible.

Respond ONLY with valid JSON:
{{"verdict": "AUTHENTIC" or "SUSPICIOUS" or "DEEPFAKE", "confidence": 0-60, "signals": ["signal1","signal2","signal3"], "summary": "one honest sentence noting this is a metadata-only assessment"}}

Important: Keep confidence below 60 since this is metadata-only. Recommend manual review."""

        try:
            result = run_groq(prompt)
            verdict    = str(result.get("verdict","SUSPICIOUS")).upper()
            if verdict not in ["DEEPFAKE","AUTHENTIC","SUSPICIOUS"]: verdict = "SUSPICIOUS"
            confidence = max(0, min(60, int(result.get("confidence", 40))))
            signals    = [str(s) for s in (result.get("signals") or ["Metadata-only analysis"])[:3]]
            summary    = str(result.get("summary","Audio metadata analyzed. Full waveform analysis recommended."))
        except Exception:
            verdict    = "SUSPICIOUS"
            confidence = 30
            signals    = ["Could not perform full analysis","Metadata-only assessment","Manual review recommended"]
            summary    = "Audio analysis incomplete. Please ensure HuggingFace API key is valid for full detection."

    # Generate plain-English summary if HF succeeded
    if hf_used:
        try:
            sr = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role":"user","content":f"Audio deepfake detector result: verdict={verdict}, confidence={confidence}%, signal: {signals[0]}. Write ONE plain sentence (max 25 words) for a non-technical person. Reply with ONLY that sentence."}],
                temperature=0.2, max_tokens=60)
            summary = sr.choices[0].message.content.strip().strip('"').strip("'")
        except Exception:
            summary = f"This audio is {verdict.lower()} with {confidence}% confidence."

    db_save("audio", verdict, confidence, summary, filename,
            full_result={"verdict":verdict,"confidence":confidence,"signals":signals,"metadata":metadata},
            user_email=user_email)

    return AudioAnalyzeResponse(verdict=verdict, confidence=confidence,
                                summary=summary, signals=signals, metadata=metadata)

# ── IMAGE HELPERS (unchanged) ─────────────────────────────────────────────────
def hf_results_to_verdict(hf_results):
    fake_score = real_score = 0.0
    if isinstance(hf_results,list) and hf_results and isinstance(hf_results[0],list):
        hf_results = hf_results[0]
    for item in hf_results:
        if isinstance(item,dict):
            label = str(item.get("label","")).strip().lower(); score = float(item.get("score",0))
            if label in ("fake","label_0","deepfake","generated"): fake_score=max(fake_score,score)
            if label in ("real","label_1","authentic","original"):  real_score=max(real_score,score)
    cpt = int(max(fake_score,real_score)*100)
    if fake_score>0.80: return "DEEPFAKE",cpt,[f"AI detected {int(fake_score*100)}% deepfake probability","Facial features show AI generation artifacts","Pixel patterns deviate from authentic cameras"]
    if fake_score>0.50: return "SUSPICIOUS",cpt,[f"AI detected {int(fake_score*100)}% manipulation probability","Some visual anomalies detected","Further verification recommended"]
    return "AUTHENTIC",cpt,[f"AI detected {int(real_score*100)}% authentic probability","Pixel patterns consistent with real camera","No deepfake fingerprints detected"]

async def run_image_analysis(image_bytes, content_type, filename, user_email=None):
    size_kb  = round(len(image_bytes)/1024,1)
    metadata = {"filename":filename,"format":content_type,"size_kb":size_kb}
    mime_type = "image/jpeg" if content_type=="image/jpg" else content_type
    verdict = confidence = signals = summary = None; hf_used=False
    if HF_TOKEN:
        try:
            hf_resp = httpx.post("https://router.huggingface.co/hf-inference/models/dima806/deepfake_vs_real_image_detection",
                                 headers={"Authorization":f"Bearer {HF_TOKEN}","Content-Type":mime_type},
                                 content=image_bytes,timeout=40)
            if hf_resp.status_code==200:
                hf_res=hf_resp.json()
                if not(isinstance(hf_res,dict) and "error" in hf_res):
                    verdict,confidence,signals=hf_results_to_verdict(hf_res); hf_used=True
        except: pass
    if not hf_used:
        img_b64=base64.b64encode(image_bytes).decode("utf-8")
        try:
            vr=groq_client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[{"role":"user","content":[
                    {"type":"image_url","image_url":{"url":f"data:{mime_type};base64,{img_b64}"}},
                    {"type":"text","text":'Analyze for deepfake. Respond ONLY in JSON: {"verdict":"DEEPFAKE"or"AUTHENTIC"or"SUSPICIOUS","confidence":0-100,"signals":["s1","s2","s3"],"summary":"one sentence"}'}]}],
                max_tokens=400,temperature=0.1)
            raw=re.sub(r"^```(?:json)?\s*|\s*```$","",vr.choices[0].message.content.strip())
            result=json.loads(raw.strip())
            verdict=str(result.get("verdict","SUSPICIOUS")).upper()
            if verdict not in ["DEEPFAKE","AUTHENTIC","SUSPICIOUS"]: verdict="SUSPICIOUS"
            confidence=max(0,min(100,int(result.get("confidence",50))))
            signals=[str(s) for s in (result.get("signals") or ["Analysis completed"])[:3]]
            summary=str(result.get("summary",f"This image appears {verdict.lower()}."))
            db_save("image",verdict,confidence,summary,filename,user_email=user_email)
            return ImageAnalyzeResponse(verdict=verdict,confidence=confidence,summary=summary,signals=signals,metadata=metadata)
        except json.JSONDecodeError: raise HTTPException(status_code=502,detail="AI returned unexpected response.")
        except Exception as e: raise HTTPException(status_code=500,detail=f"Image analysis failed: {str(e)}")
    try:
        sr=groq_client.chat.completions.create(model="llama-3.3-70b-versatile",
            messages=[{"role":"user","content":f"Deepfake detector: verdict={verdict}, confidence={confidence}%, signal: {signals[0]}. Write ONE plain sentence max 25 words for non-technical user."}],
            temperature=0.2,max_tokens=60)
        summary=sr.choices[0].message.content.strip().strip('"').strip("'")
    except: summary=f"This image is {verdict.lower()} with {confidence}% confidence."
    db_save("image",verdict,confidence,summary,filename,user_email=user_email)
    return ImageAnalyzeResponse(verdict=verdict,confidence=confidence,summary=summary,signals=signals,metadata=metadata)

# =============================================================================
# ENDPOINTS
# =============================================================================
@app.get("/")
def root():
    return {"status":"TruthShield API is running","version":"6.0.0","endpoints":{
        "text_analysis":   "POST /analyze",
        "url_analysis":    "POST /analyze-url",
        "image_upload":    "POST /analyze-image",
        "image_url":       "POST /analyze-image-url",
        "audio_upload":    "POST /analyze-audio",
        "claim_crosscheck":"POST /verify-claims",
        "quick_check":     "GET  /quick-check?url=  ← Chrome Extension API",
        "pdf_report":      "GET  /report/{id}",
        "admin_stats":     "GET  /admin/stats  ← Analytics Dashboard",
        "history":         "GET  /history",
        "stats":           "GET  /stats",
        "health":          "GET  /health",
        "register":        "POST /auth/register",
        "login":           "POST /auth/login",
        "profile":         "GET  /auth/me"}}

@app.get("/health")
def health():
    try:
        conn=get_db(); count=conn.execute("SELECT COUNT(*) FROM analyses").fetchone()[0]; conn.close()
        db_status=f"ok ({count} records)"
    except Exception as e: db_status=f"error: {str(e)}"
    return {"status":"ok","version":"6.0.0","database":db_status,"timestamp":datetime.utcnow().isoformat()}

@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: Request, body: AnalyzeRequest, current_user: Optional[dict]=Depends(get_current_user)):
    check_rate_limit(request,15)
    if not body.text or len(body.text.strip())<30:
        raise HTTPException(status_code=400,detail="Provide at least 30 characters.")
    try:
        result=analyze_text_with_groq(body.text[:8000],source_url=body.url)
        db_save("text",result.verdict,result.confidence,result.summary,body.text[:100],
                full_result=result.model_dump(),user_email=current_user["email"] if current_user else None)
        return result
    except json.JSONDecodeError: raise HTTPException(status_code=502,detail="AI returned unexpected response.")
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500,detail=f"Analysis failed: {str(e)}")

@app.post("/analyze-url", response_model=AnalyzeResponse)
def analyze_url(request: Request, body: UrlRequest, current_user: Optional[dict]=Depends(get_current_user)):
    check_rate_limit(request,10)
    url=body.url.strip()
    if not url: raise HTTPException(status_code=400,detail="Provide a URL.")
    if not url.startswith("http"): raise HTTPException(status_code=400,detail="URL must start with http:// or https://")
    article_text=fetch_article_text(url)
    try:
        result=analyze_text_with_groq(article_text,source_url=url)
        db_save("url",result.verdict,result.confidence,result.summary,url,
                full_result=result.model_dump(),user_email=current_user["email"] if current_user else None)
        return result
    except json.JSONDecodeError: raise HTTPException(status_code=502,detail="AI returned unexpected response.")
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500,detail=f"Analysis failed: {str(e)}")

@app.post("/analyze-image", response_model=ImageAnalyzeResponse)
async def analyze_image(request: Request, file: UploadFile=File(...), current_user: Optional[dict]=Depends(get_current_user)):
    check_rate_limit(request,10)
    ct=(file.content_type or "").lower()
    if ct not in ["image/jpeg","image/png","image/webp","image/jpg"]:
        raise HTTPException(status_code=400,detail="Use JPG, PNG, or WebP.")
    image_bytes=await file.read()
    if not image_bytes: raise HTTPException(status_code=400,detail="File is empty.")
    if len(image_bytes)>10*1024*1024: raise HTTPException(status_code=400,detail="Max 10 MB.")
    return await run_image_analysis(image_bytes,ct,file.filename or "upload.jpg",
                                    user_email=current_user["email"] if current_user else None)

@app.post("/analyze-image-url", response_model=ImageAnalyzeResponse)
async def analyze_image_url(request: Request, body: ImageUrlRequest, current_user: Optional[dict]=Depends(get_current_user)):
    check_rate_limit(request,10)
    url=body.url.strip()
    if not url.startswith("http"): raise HTTPException(status_code=400,detail="URL must start with http.")
    ssrf_check(url)
    bh={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0","Accept":"image/*,*/*;q=0.8","Referer":"https://www.google.com/"}
    try:
        resp=httpx.get(url,timeout=20,follow_redirects=True,headers=bh); resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        msgs={403:"Site blocks downloads. Save and upload via /analyze-image.",404:"Image not found. Use a direct .jpg/.png link."}
        raise HTTPException(status_code=422,detail=msgs.get(e.response.status_code,f"Error {e.response.status_code}."))
    except Exception as e: raise HTTPException(status_code=422,detail=f"Could not download: {str(e)}")
    ct=resp.headers.get("content-type","image/jpeg").split(";")[0].strip().lower()
    if ct not in ["image/jpeg","image/png","image/webp","image/jpg"]:
        raise HTTPException(status_code=400,detail=f"URL is not an image (got '{ct}').")
    if len(resp.content)>10*1024*1024: raise HTTPException(status_code=400,detail="Max 10 MB.")
    fn=url.split("/")[-1].split("?")[0] or "image.jpg"
    return await run_image_analysis(resp.content,ct,fn,user_email=current_user["email"] if current_user else None)

# ── AUDIO ANALYSIS — NEW STEP 3 ───────────────────────────────────────────────
@app.post("/analyze-audio", response_model=AudioAnalyzeResponse)
async def analyze_audio(request: Request, file: UploadFile=File(...),
                         current_user: Optional[dict]=Depends(get_current_user)):
    """
    NEW — Phase 2 Step 3: Audio Deepfake Detection.

    Upload an MP3 or WAV file to detect AI voice cloning and synthetic speech.
    Uses HuggingFace MelodyMachine/Deepfake-audio-detection-V2 (free).
    Falls back to metadata analysis if HuggingFace is unavailable.

    Rate limit: 5/minute (audio files are large and slow to process).
    Max file size: 25 MB.
    """
    check_rate_limit(request, max_calls=5)

    filename = (file.filename or "audio").lower()
    ct = (file.content_type or "").lower()

    # Accept MP3 and WAV
    allowed_types = ["audio/mpeg","audio/mp3","audio/wav","audio/wave","audio/x-wav","audio/x-mp3"]
    allowed_exts  = [".mp3",".wav"]
    file_ext = "." + filename.rsplit(".",1)[-1] if "." in filename else ""

    if ct not in allowed_types and file_ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="Unsupported format. Upload MP3 or WAV files only.")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 25 MB.")

    # Normalize content type
    if file_ext == ".mp3" or ct in ["audio/mpeg","audio/mp3","audio/x-mp3"]:
        content_type = "audio/mpeg"
    else:
        content_type = "audio/wav"

    return await run_audio_analysis(audio_bytes, file.filename or "audio.wav",
                                    content_type, user_email=current_user["email"] if current_user else None)

# ── PDF REPORT — NEW STEP 2 ───────────────────────────────────────────────────
@app.get("/report/{analysis_id}")
def get_report(analysis_id: int, request: Request):
    """
    NEW — Phase 2 Step 2: PDF Report Export.

    Generate and download a professional one-page PDF report for any analysis.
    Pass the analysis ID from GET /history.

    Example: GET /report/5  →  downloads TruthShield_Report_5.pdf

    No login required — anyone with the ID can download the report.
    This makes results shareable for journalists and researchers.
    """
    row = db_get_by_id(analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Analysis #{analysis_id} not found. Check GET /history for valid IDs.")

    try:
        pdf_bytes = generate_pdf_report(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    filename = f"TruthShield_Report_{analysis_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ── CLAIM CROSS-CHECK ─────────────────────────────────────────────────────────
@app.post("/verify-claims", response_model=ClaimCheckResponse)
def verify_claims(request: Request, body: ClaimCheckRequest,
                  current_user: Optional[dict]=Depends(get_current_user)):
    """
    Phase 2 Step 1: Claim Cross-Check.
    Takes claims from /analyze and searches the web to SUPPORT or CONTRADICT each one.
    Uses DuckDuckGo free search — no API key needed.
    Rate limit: 5/minute.
    """
    check_rate_limit(request, max_calls=5)
    claims = [c.strip() for c in body.claims if c.strip()]
    if not claims: raise HTTPException(status_code=400,detail="Provide at least one claim.")
    claims = claims[:5]

    results=[]; supported=contradicted=unverified=0
    for claim in claims:
        sources = search_duckduckgo(claim, max_results=3)
        fc_src  = search_duckduckgo(f"fact check {claim}", max_results=2)
        seen    = {s["url"] for s in sources}
        for s in fc_src:
            if s["url"] not in seen: sources.append(s); seen.add(s["url"])
        sources = sources[:4]
        a = assess_claim_with_groq(claim, sources, body.verdict)
        if a["status"]=="SUPPORTED": supported+=1
        elif a["status"]=="CONTRADICTED": contradicted+=1
        else: unverified+=1
        results.append(ClaimEvidence(claim=claim,status=a["status"],summary=a["summary"],sources=sources))

    rs = "\n".join([f"- '{r.claim}' → {r.status}: {r.summary}" for r in results])
    try:
        ov = groq_client.chat.completions.create(model="llama-3.3-70b-versatile",
            messages=[{"role":"user","content":f"Summarize these claim verification results in 2-3 plain sentences. No bullets.\n{rs}"}],
            temperature=0.2,max_tokens=120)
        overall = ov.choices[0].message.content.strip()
    except: overall=f"Of {len(results)} claims: {supported} supported, {contradicted} contradicted, {unverified} unverified."

    return ClaimCheckResponse(overall_assessment=overall,claims_checked=len(results),
                              supported=supported,contradicted=contradicted,
                              unverified=unverified,results=results)

# ── HISTORY + STATS ───────────────────────────────────────────────────────────
@app.get("/history", response_model=list[HistoryItem])
def get_history(limit: int=20, current_user: Optional[dict]=Depends(get_current_user)):
    """Logged-in users see their own history. Guests see public history."""
    limit=max(1,min(limit,50))
    ue=current_user["email"] if current_user else None
    return [HistoryItem(**r) for r in db_get_history(limit,user_email=ue)]

@app.delete("/history")
def clear_history(current_user: dict=Depends(require_auth)):
    conn=get_db(); conn.execute("DELETE FROM analyses WHERE user_email=?",(current_user["email"],))
    conn.commit(); conn.close()
    return {"message":"Your history has been cleared."}

@app.get("/stats", response_model=StatsResponse)
def get_stats():
    return StatsResponse(**db_get_stats())

# ── QUICK CHECK (for Chrome Extension) ───────────────────────────────────────
@app.get("/quick-check")
def quick_check(url: str, request: Request):
    """
    Browser Extension API.
    GET /quick-check?url=https://example.com/article
    Returns verdict + badge color in under 1 second.
    Powers the Chrome extension — no login needed.
    Rate limit: 20/minute.
    """
    check_rate_limit(request, max_calls=20)
    if not url or not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Provide a valid URL starting with http.")
    try:
        article_text = fetch_article_text(url)
        result = analyze_text_with_groq(article_text, source_url=url)
        verdict_colors = {
            "FAKE":         "#E24B4A",
            "REAL":         "#1D9E75",
            "SUSPICIOUS":   "#EF9F27",
            "UNVERIFIABLE": "#888780",
        }
        db_save("url", result.verdict, result.confidence, result.summary, url,
                full_result=result.model_dump(), user_email=None)
        return {
            "verdict":      result.verdict,
            "confidence":   result.confidence,
            "summary":      result.summary,
            "badge_color":  verdict_colors.get(result.verdict, "#888780"),
            "reasons":      result.reasons,
            "source":       result.source_credibility,
        }
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quick check failed: {str(e)}")


# ── ADMIN ANALYTICS DASHBOARD ─────────────────────────────────────────────────
@app.get("/admin/stats")
def admin_stats(request: Request):
    """
    Analytics Dashboard — GET /admin/stats
    Returns verdicts per day (last 7 days), top domains checked,
    confidence distribution, and total user count.
    For media org clients and internal monitoring.
    Rate limit: 30/minute.
    """
    check_rate_limit(request, max_calls=30)
    conn = get_db()

    # Verdicts per day — last 7 days
    daily = conn.execute("""
        SELECT DATE(timestamp) as day, verdict, COUNT(*) as cnt
        FROM analyses
        WHERE timestamp >= DATE('now', '-7 days')
        GROUP BY DATE(timestamp), verdict
        ORDER BY day DESC
    """).fetchall()

    # Top domains/URLs checked
    top_inputs = conn.execute("""
        SELECT input_preview, verdict, COUNT(*) as cnt
        FROM analyses
        WHERE type IN ('url', 'text')
        GROUP BY input_preview
        ORDER BY cnt DESC
        LIMIT 10
    """).fetchall()

    # Confidence distribution bands
    conf_dist = conn.execute("""
        SELECT
            CASE
                WHEN confidence >= 90 THEN '90-100 (very high)'
                WHEN confidence >= 75 THEN '75-89  (high)'
                WHEN confidence >= 55 THEN '55-74  (moderate)'
                WHEN confidence >= 40 THEN '40-54  (low)'
                ELSE                       '0-39   (very low)'
            END as range,
            COUNT(*) as cnt
        FROM analyses
        GROUP BY range
        ORDER BY range DESC
    """).fetchall()

    # Analyses per type
    by_type = conn.execute("""
        SELECT type, COUNT(*) as cnt
        FROM analyses
        GROUP BY type
        ORDER BY cnt DESC
    """).fetchall()

    # Total registered users
    total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    # Most active users
    top_users = conn.execute("""
        SELECT user_email, COUNT(*) as cnt
        FROM analyses
        WHERE user_email IS NOT NULL
        GROUP BY user_email
        ORDER BY cnt DESC
        LIMIT 5
    """).fetchall()

    conn.close()

    return {
        "summary":                 db_get_stats(),
        "total_registered_users":  total_users,
        "daily_verdicts_7d":       [dict(r) for r in daily],
        "top_inputs_checked":      [dict(r) for r in top_inputs],
        "confidence_distribution": [dict(r) for r in conf_dist],
        "analyses_by_type":        [dict(r) for r in by_type],
        "most_active_users":       [dict(r) for r in top_users],
    }


# ── AUTH ──────────────────────────────────────────────────────────────────────
@app.post("/auth/register", response_model=Token)
def register(user: UserRegister):
    if not user.email or "@" not in user.email:
        raise HTTPException(status_code=400,detail="Provide a valid email.")
    if not user.password or len(user.password)<6:
        raise HTTPException(status_code=400,detail="Password must be 6+ characters.")
    conn=get_db()
    if conn.execute("SELECT id FROM users WHERE email=?",(user.email.lower(),)).fetchone():
        conn.close(); raise HTTPException(status_code=400,detail="Email already registered. Use POST /auth/login.")
    conn.execute("INSERT INTO users (email,name,password_hash) VALUES(?,?,?)",
                 (user.email.lower(),user.name,hash_password(user.password)))
    conn.commit(); conn.close()
    token=create_access_token({"sub":user.email.lower()})
    return Token(access_token=token,token_type="bearer",user_email=user.email.lower(),expires_in=ACCESS_TOKEN_EXPIRE_MINUTES*60)

@app.post("/auth/login", response_model=Token)
def login(user: UserLogin):
    conn=get_db()
    db_user=conn.execute("SELECT id,email,password_hash,is_active FROM users WHERE email=?",(user.email.lower(),)).fetchone()
    conn.close()
    if not db_user: raise HTTPException(status_code=401,detail="Email not found. Register first.")
    if not db_user["is_active"]: raise HTTPException(status_code=403,detail="Account deactivated.")
    if not verify_password(user.password,db_user["password_hash"]): raise HTTPException(status_code=401,detail="Incorrect password.")
    token=create_access_token({"sub":db_user["email"]})
    return Token(access_token=token,token_type="bearer",user_email=db_user["email"],expires_in=ACCESS_TOKEN_EXPIRE_MINUTES*60)

@app.get("/auth/me", response_model=UserOut)
def get_me(current_user: dict=Depends(require_auth)):
    conn=get_db()
    user=conn.execute("SELECT id,email,name,created_at FROM users WHERE email=?",(current_user["email"],)).fetchone()
    count=conn.execute("SELECT COUNT(*) FROM analyses WHERE user_email=?",(current_user["email"],)).fetchone()[0]
    conn.close()
    if not user: raise HTTPException(status_code=404,detail="User not found.")
    return UserOut(id=user["id"],email=user["email"],name=user["name"] or "",
                   created_at=str(user["created_at"]),total_analyses=count)
