from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Response, Cookie, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
import os, uuid, bcrypt, jwt, logging, random, string, smtplib, asyncio, re, warnings
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from concurrent.futures import ThreadPoolExecutor
from pymongo.errors import DuplicateKeyError
from urllib.parse import quote, urlparse, urlunparse, urlencode
import hashlib, httpx, json as _json
warnings.filterwarnings("ignore", message=".*HMAC key.*below the minimum.*")

_email_executor = ThreadPoolExecutor(max_workers=2)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env", override=True)

def _encode_mongo_url(url: str) -> str:
    import re
    match = re.match(r'^(mongodb(?:\+srv)?://)([^:]+):(.+)@(.+)$', url)
    if match:
        scheme_and_user = match.group(1) + match.group(2) + ':'
        password = match.group(3)
        rest = '@' + match.group(4)
        encoded_password = quote(password, safe='')
        return scheme_and_user + encoded_password + rest
    return url

MONGO_URL = _encode_mongo_url(os.environ["MONGO_URL"])
DB_NAME = os.environ["DB_NAME"]
SECRET_KEY = os.environ.get("JWT_SECRET", "prawwreads-secret-key-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # 7 days

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)  # Display "from" address, defaults to SMTP_USER

# ── Web Push / VAPID ─────────────────────────────────────────────────────────
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY_B64 = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "mailto:noreply@praww.co.za")

_vapid_private_pem: str | None = None
if VAPID_PRIVATE_KEY_B64:
    try:
        import base64 as _b64
        from cryptography.hazmat.primitives.serialization import (
            load_der_private_key as _load_der,
            Encoding as _Enc,
            PrivateFormat as _PF,
            NoEncryption as _NE,
        )
        _padding = "=" * (4 - len(VAPID_PRIVATE_KEY_B64) % 4)
        _der = _b64.urlsafe_b64decode(VAPID_PRIVATE_KEY_B64 + _padding)
        _key = _load_der(_der, password=None)
        _vapid_private_pem = _key.private_bytes(_Enc.PEM, _PF.TraditionalOpenSSL, _NE()).decode()
    except Exception as _e:
        logging.getLogger("server").warning("VAPID key setup failed: %s", _e)

_push_executor = ThreadPoolExecutor(max_workers=2)

def _do_webpush_sync(sub_info: dict, payload: str, vapid_pem: str, claims: dict):
    try:
        from pywebpush import webpush, WebPushException
        webpush(subscription_info=sub_info, data=payload, vapid_private_key=vapid_pem, vapid_claims=claims)
        return None
    except Exception as exc:
        return str(exc)

async def send_push_notification(user_id: str, title: str, body: str, url: str = "/"):
    if not _vapid_private_pem:
        return
    try:
        subscriptions = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(10)
        if not subscriptions:
            return
        payload = _json.dumps({"title": title, "body": body, "url": url})
        claims = {"sub": VAPID_CLAIMS_EMAIL}
        loop = asyncio.get_event_loop()
        for sub in subscriptions:
            sub_info = {"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}}
            err = await loop.run_in_executor(_push_executor, _do_webpush_sync, sub_info, payload, _vapid_private_pem, claims)
            if err and ("410" in str(err) or "404" in str(err)):
                await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
    except Exception as exc:
        logging.getLogger("server").debug("Push notification error: %s", exc)

USERNAME_CHANGE_DAYS = 30

RESERVED_USERNAMES = {"prawwreads", "prawwread", "praww", "prawwreadsofficial", "praww_reads", "admin", "administrator", "support", "moderator", "prawwreads_official", "prawwreadsapp", "prawwreadscom"}

PREMIUM_MONTHLY_ZAR = 59
PREMIUM_SEMI_ZAR = 29
PREMIUM_SEMI_MONTHS = 6
PHONE_CHANGE_DAYS = 15

def _normalize_username(name: str) -> str:
    return re.sub(r'[^a-z0-9]', '', name.lower())

def is_reserved_username(name: str) -> bool:
    normalized = _normalize_username(name)
    return normalized in {_normalize_username(r) for r in RESERVED_USERNAMES}

OFFICIAL_USERNAME = "PRawwReads"

async def auto_follow_official(new_user_id: str):
    """Auto-follow the PRaww Reads Official account when a new user registers."""
    try:
        official = await db.users.find_one({"username": OFFICIAL_USERNAME}, {"_id": 0, "id": 1})
        if not official or official["id"] == new_user_id:
            return
        existing = await db.follows.find_one({"follower_id": new_user_id, "following_id": official["id"]})
        if not existing:
            await db.follows.insert_one({
                "follower_id": new_user_id,
                "following_id": official["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        logging.warning(f"auto_follow_official: failed to auto-follow official account for user {new_user_id}: {e}")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="PRaww Reads API")
api_router = APIRouter(prefix="/api")

# ── In-memory rate limiter (IP → list of timestamps) ───────────────────────
_rate_store: dict = {}
_RATE_STORE_MAX_KEYS = 5000

def _rate_check(key: str, limit: int = 5, window_secs: int = 300) -> bool:
    """Returns True if request is allowed, False if rate limit exceeded."""
    now_ts = datetime.now(timezone.utc).timestamp()
    cutoff = now_ts - window_secs
    # Prune expired entries when the store grows too large to prevent memory leak
    if len(_rate_store) > _RATE_STORE_MAX_KEYS:
        stale_keys = [k for k, v in _rate_store.items() if not any(t > cutoff for t in v)]
        for k in stale_keys:
            del _rate_store[k]
    timestamps = [t for t in _rate_store.get(key, []) if t > cutoff]
    if len(timestamps) >= limit:
        _rate_store[key] = timestamps
        return False
    timestamps.append(now_ts)
    _rate_store[key] = timestamps
    return True

replit_dev_domain = os.environ.get("REPLIT_DEV_DOMAIN", "")
default_origins = "https://prawwfront.onrender.com,http://localhost:5000"
if replit_dev_domain:
    default_origins += f",https://{replit_dev_domain}"
origins = os.environ.get("CORS_ORIGINS", default_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Email ────────────────────────────────────────────────────────────────────
def _send_email_sync(to: str, subject: str, body_html: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"PRaww Reads <{SMTP_FROM}>"
    msg["To"] = to
    msg.attach(MIMEText(body_html, "html"))
    # Use SSL for port 465, STARTTLS for everything else
    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to, msg.as_string())
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to, msg.as_string())

async def send_email(to: str, subject: str, body_html: str, code: str = ""):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP not configured — verification code for %s: %s", to, code)
        return
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_email_executor, _send_email_sync, to, subject, body_html)
        logger.info("Email sent to %s", to)
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, e)
        # Log code to console so the app still works even if SMTP is misconfigured
        if code:
            logger.warning("SMTP failed — verification code for %s is: %s", to, code)

def generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))

# ── Helpers ─────────────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None

def _extract_token(request) -> Optional[str]:
    """Extract token from Authorization header OR cookie"""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("praww_token")

async def get_current_user(request: Request):
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user_id}, {"$set": {"last_seen_at": now}})
    user["last_seen_at"] = now
    return user

async def get_optional_user(request: Request):
    token = _extract_token(request)
    if not token:
        return None
    user_id = decode_token(token)
    if not user_id:
        return None
    return await db.users.find_one({"id": user_id}, {"_id": 0})

def safe_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k != "password_hash"}

def to_str_id(doc: dict) -> dict:
    """Ensure all IDs are strings and remove MongoDB _id"""
    doc.pop("_id", None)
    return doc

# ── Models ──────────────────────────────────────────────────────────────────
class RegisterInput(BaseModel):
    email: str
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class VerifyEmailInput(BaseModel):
    email: str
    code: str

class LoginInput(BaseModel):
    email: str
    password: str

class UpdateProfileInput(BaseModel):
    username: Optional[str] = None
    bio: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    profile_image_url: Optional[str] = None
    hide_online_status: Optional[bool] = None

class SendDMInput(BaseModel):
    content: str

class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str

class CreateStoryInput(BaseModel):
    title: str
    content: Optional[str] = ""
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    is_paid: Optional[bool] = False
    price: Optional[float] = 0.0

class UpdateStoryInput(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    is_paid: Optional[bool] = None
    price: Optional[float] = None

class DonationInput(BaseModel):
    amount: float

class WithdrawalRequestInput(BaseModel):
    amount: float

class CreateChapterInput(BaseModel):
    title: str
    content: str
    order_index: Optional[int] = None

class UpdateChapterInput(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    order_index: Optional[int] = None

class CreateCommentInput(BaseModel):
    content: str
    parent_id: Optional[str] = None

class CreateBookInput(BaseModel):
    title: str
    author: Optional[str] = None
    price: float
    condition: str = "good"
    allow_swap: bool = False
    swap_for: Optional[str] = None
    image_url: Optional[str] = None

class UpdateBookInput(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    price: Optional[float] = None
    condition: Optional[str] = None
    allow_swap: Optional[bool] = None
    swap_for: Optional[str] = None
    image_url: Optional[str] = None
    is_sold: Optional[bool] = None

class SendMessageInput(BaseModel):
    book_id: str
    receiver_id: str
    content: str

class RequestEmailChangeInput(BaseModel):
    new_email: str
    current_password: str

class VerifyEmailChangeInput(BaseModel):
    code: str

class UpdateBackupContactInput(BaseModel):
    backup_contact: Optional[str] = None

class RequestPremiumInput(BaseModel):
    plan: str  # "monthly" or "semi"

class RequestPhoneVerifyInput(BaseModel):
    phone: str

class VerifyPhoneInput(BaseModel):
    code: str

class RequestPasswordChangeCodeInput(BaseModel):
    pass

class VerifyAndChangePasswordInput(BaseModel):
    code: str
    new_password: str

class ForgotPasswordInput(BaseModel):
    email: str

class ResetPasswordInput(BaseModel):
    email: str
    code: str
    new_password: str

# ── Auth Routes ─────────────────────────────────────────────────────────────
@api_router.post("/auth/register")
async def register(data: RegisterInput, response: Response, request: Request):
    """Step 1: validate inputs. If SMTP configured, send verification code. Otherwise create account directly."""
    client_ip = request.client.host if request.client else "unknown"
    # Rate limit: max 5 registrations per IP per hour
    if not _rate_check(f"register:{client_ip}", limit=5, window_secs=3600):
        raise HTTPException(429, "Too many registration attempts. Please try again later.")
    email = data.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Valid email required")
    if not data.password or len(data.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(409, "An account with this email already exists. Please log in instead.")

    smtp_configured = bool(SMTP_HOST and SMTP_USER and SMTP_PASS)

    if not smtp_configured:
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        base_username = email.split("@")[0].replace(".", "_").replace("+", "_")
        if is_reserved_username(base_username):
            base_username = f"user_{base_username}"
        username_candidate = base_username
        suffix = 1
        while await db.users.find_one({"username": username_candidate}) or is_reserved_username(username_candidate):
            username_candidate = f"{base_username}_{suffix}"
            suffix += 1
        user = {
            "id": user_id,
            "email": email,
            "password_hash": hash_password(data.password),
            "first_name": data.first_name or "",
            "last_name": data.last_name or "",
            "username": username_candidate,
            "username_changed_at": now,
            "bio": "",
            "profile_image_url": "",
            "email_verified": True,
            "is_verified": False,
            "is_premium": False,
            "wallet_balance": 0.0,
            "total_earnings": 0.0,
            "created_at": now,
            "updated_at": now,
        }
        try:
            await db.users.insert_one(user)
        except DuplicateKeyError:
            raise HTTPException(409, "An account with this email already exists. Please log in instead.")
        await auto_follow_official(user_id)
        token = create_token(user_id)
        response.set_cookie("praww_token", token, httponly=True, max_age=3600 * ACCESS_TOKEN_EXPIRE_HOURS, samesite="lax")
        result = safe_user(to_str_id(user))
        result["token"] = token
        return result

    code = generate_code()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db.pending_registrations.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "password_hash": hash_password(data.password),
            "first_name": data.first_name or "",
            "last_name": data.last_name or "",
            "code": code,
            "expires_at": expires.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    await send_email(
        to=email,
        subject="Your PRaww Reads verification code",
        body_html=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:28px;font-weight:800;color:#1a1a1a;">📖 PRaww Reads</span>
          </div>
          <h2 style="margin-bottom:8px;color:#1a1a1a;">Welcome! Verify your email</h2>
          <p style="color:#6b7280;margin-bottom:4px;">Enter the code below to activate your account. It expires in <strong>10 minutes</strong>.</p>
          <div style="font-size:40px;font-weight:700;letter-spacing:10px;text-align:center;padding:28px 0;color:#4f46e5;background:#f5f3ff;border-radius:10px;margin:20px 0;">{code}</div>
          <p style="color:#9ca3af;font-size:13px;">If you did not create a PRaww Reads account, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:20px 0;" />
          <p style="color:#d1d5db;font-size:11px;text-align:center;">Sent by PRaww Reads · noreply@praww.co.za</p>
        </div>
        """,
        code=code,
    )
    return {"message": "Verification code sent. Check your email.", "email": email}

@api_router.post("/auth/verify-email")
async def verify_email(data: VerifyEmailInput, response: Response):
    """Step 2: verify the code and create the account."""
    email = data.email.strip().lower()
    pending = await db.pending_registrations.find_one({"email": email})
    if not pending:
        raise HTTPException(404, "No pending registration found. Please sign up first.")
    expires_at = datetime.fromisoformat(pending["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.pending_registrations.delete_one({"email": email})
        raise HTTPException(410, "Verification code expired. Please sign up again.")
    if pending["code"] != data.code.strip():
        raise HTTPException(400, "Invalid verification code.")
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.pending_registrations.delete_one({"email": email})
        raise HTTPException(409, "An account with this email already exists. Please log in instead.")
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    base_username = email.split("@")[0].replace(".", "_").replace("+", "_")
    if is_reserved_username(base_username):
        base_username = f"user_{base_username}"
    username_candidate = base_username
    suffix = 1
    while await db.users.find_one({"username": username_candidate}) or is_reserved_username(username_candidate):
        username_candidate = f"{base_username}_{suffix}"
        suffix += 1
    user = {
        "id": user_id,
        "email": email,
        "password_hash": pending["password_hash"],
        "first_name": pending.get("first_name", ""),
        "last_name": pending.get("last_name", ""),
        "username": username_candidate,
        "username_changed_at": now,
        "bio": "",
        "profile_image_url": "",
        "email_verified": True,
        "is_verified": False,
        "is_premium": False,
        "created_at": now,
        "updated_at": now,
    }
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError:
        await db.pending_registrations.delete_one({"email": email})
        raise HTTPException(409, "An account with this email already exists. Please log in instead.")
    await db.pending_registrations.delete_one({"email": email})
    await auto_follow_official(user_id)
    token = create_token(user_id)
    response.set_cookie("praww_token", token, httponly=True, max_age=3600 * ACCESS_TOKEN_EXPIRE_HOURS, samesite="lax")
    result = safe_user(to_str_id(user))
    result["token"] = token
    return result

@api_router.post("/auth/login")
async def login(data: LoginInput, response: Response, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    email_key = data.email.strip().lower()
    # Rate limit: max 10 login attempts per IP per 15 minutes to block brute force
    if not _rate_check(f"login:{client_ip}", limit=10, window_secs=900):
        raise HTTPException(429, "Too many login attempts. Please wait 15 minutes before trying again.")
    email = email_key
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    token = create_token(user["id"])
    response.set_cookie("praww_token", token, httponly=True, max_age=3600 * ACCESS_TOKEN_EXPIRE_HOURS, samesite="lax")
    result = safe_user(user)
    result["token"] = token
    return result

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("praww_token")
    return {"message": "Logged out"}

@api_router.post("/auth/change-password")
async def change_password_legacy(data: ChangePasswordInput, current_user: dict = Depends(get_current_user)):
    """Legacy endpoint — kept for compatibility. Use /auth/request-password-change-code + /auth/verify-and-change-password instead."""
    raise HTTPException(410, "This endpoint is no longer supported. Use the new password change flow: request a verification code from Settings.")

@api_router.post("/auth/request-email-change")
async def request_email_change(data: RequestEmailChangeInput, request: Request, current_user: dict = Depends(get_current_user)):
    """Step 1: Verify current password, then send a code to the NEW email."""
    client_ip = request.client.host if request.client else "unknown"
    if not _rate_check(f"email_change:{current_user['id']}", limit=3, window_secs=600):
        raise HTTPException(429, "Too many email change requests. Please wait 10 minutes before trying again.")
    if not _rate_check(f"email_change_ip:{client_ip}", limit=5, window_secs=600):
        raise HTTPException(429, "Too many requests from this IP. Please try again later.")
    if not verify_password(data.current_password, current_user.get("password_hash", "")):
        raise HTTPException(400, "Current password is incorrect")
    new_email = data.new_email.strip().lower()
    if not new_email or "@" not in new_email:
        raise HTTPException(400, "Valid email address required")
    if new_email == current_user["email"]:
        raise HTTPException(400, "New email must be different from your current email")
    existing = await db.users.find_one({"email": new_email, "id": {"$ne": current_user["id"]}})
    if existing:
        raise HTTPException(409, "An account with this email already exists")
    code = generate_code()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db.pending_email_changes.update_one(
        {"user_id": current_user["id"]},
        {"$set": {
            "user_id": current_user["id"],
            "new_email": new_email,
            "code": code,
            "expires_at": expires.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    backup_contact = current_user.get("backup_contact", "")
    backup_note = f"<p style='color:#6b7280;font-size:13px;'>If you did not request this, your backup contact ({backup_contact}) has also been noted.</p>" if backup_contact else ""
    await send_email(
        to=new_email,
        subject="Confirm your new email — PRaww Reads",
        body_html=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;">
          <h2 style="margin-bottom:8px;">Confirm your new email</h2>
          <p style="color:#6b7280;">Enter this code in the app to confirm your new email address. It expires in <strong>10 minutes</strong>.</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;padding:24px 0;color:#4f46e5;">{code}</div>
          <p style="color:#9ca3af;font-size:13px;">If you did not request this change, you can safely ignore this email.</p>
          {backup_note}
        </div>
        """,
        code=code,
    )
    return {"message": "Verification code sent to your new email address. Enter it to confirm the change.", "new_email": new_email}

@api_router.post("/auth/verify-email-change")
async def verify_email_change(data: VerifyEmailChangeInput, current_user: dict = Depends(get_current_user)):
    """Step 2: Accept the code and apply the new email."""
    pending = await db.pending_email_changes.find_one({"user_id": current_user["id"]})
    if not pending:
        raise HTTPException(404, "No pending email change found. Please request a change first.")
    expires_at = datetime.fromisoformat(pending["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.pending_email_changes.delete_one({"user_id": current_user["id"]})
        raise HTTPException(410, "Verification code has expired. Please request a new one.")
    if pending["code"] != data.code.strip():
        raise HTTPException(400, "Invalid verification code")
    new_email = pending["new_email"]
    conflict = await db.users.find_one({"email": new_email, "id": {"$ne": current_user["id"]}})
    if conflict:
        await db.pending_email_changes.delete_one({"user_id": current_user["id"]})
        raise HTTPException(409, "This email is already in use by another account")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"email": new_email, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.pending_email_changes.delete_one({"user_id": current_user["id"]})
    return {"message": "Email address updated successfully", "email": new_email}

@api_router.post("/auth/update-backup-contact")
async def update_backup_contact(data: UpdateBackupContactInput, current_user: dict = Depends(get_current_user)):
    """Save or remove an optional backup contact (e.g. phone number) for account recovery."""
    contact = (data.backup_contact or "").strip()
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"backup_contact": contact, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Backup contact updated", "backup_contact": contact}

@api_router.post("/auth/request-premium")
async def request_premium(data: RequestPremiumInput, current_user: dict = Depends(get_current_user)):
    """Record a premium subscription request. Plan: 'monthly' (R59) or 'semi' (R29 for 6 months)."""
    if current_user.get("is_premium"):
        raise HTTPException(400, "You already have an active premium account.")
    if data.plan not in ("monthly", "semi"):
        raise HTTPException(400, "Plan must be 'monthly' or 'semi'")
    # Block duplicate pending requests submitted within 24 hours
    existing = await db.premium_requests.find_one({"user_id": current_user["id"], "status": "pending"})
    if existing:
        req_time_str = existing.get("requested_at", "")
        if req_time_str:
            req_time = datetime.fromisoformat(req_time_str)
            if req_time.tzinfo is None:
                req_time = req_time.replace(tzinfo=timezone.utc)
            hours_since = (datetime.now(timezone.utc) - req_time).total_seconds() / 3600
            if hours_since < 24:
                raise HTTPException(400, "You already have a pending premium request. We will contact you at your email shortly.")
    price = PREMIUM_MONTHLY_ZAR if data.plan == "monthly" else PREMIUM_SEMI_ZAR
    months = 1 if data.plan == "monthly" else PREMIUM_SEMI_MONTHS
    now = datetime.now(timezone.utc)
    await db.premium_requests.update_one(
        {"user_id": current_user["id"], "status": "pending"},
        {"$set": {
            "user_id": current_user["id"],
            "email": current_user["email"],
            "username": current_user.get("username", ""),
            "plan": data.plan,
            "price_zar": price,
            "months": months,
            "status": "pending",
            "requested_at": now.isoformat(),
        }},
        upsert=True,
    )
    return {
        "message": f"Premium request submitted! Plan: {data.plan} — R{price} for {months} month{'s' if months > 1 else ''}. We will contact you at {current_user['email']} with payment details.",
        "plan": data.plan,
        "price_zar": price,
        "months": months,
    }

@api_router.post("/auth/request-phone-verify")
async def request_phone_verify(data: RequestPhoneVerifyInput, request: Request, current_user: dict = Depends(get_current_user)):
    """Send a verification code to the user's email to verify a new phone number."""
    if not _rate_check(f"phone_verify:{current_user['id']}", limit=3, window_secs=600):
        raise HTTPException(429, "Too many phone verification requests. Please wait 10 minutes before trying again.")
    phone = data.phone.strip()
    if not phone:
        raise HTTPException(400, "Phone number is required")
    # Enforce 15-day cooldown on phone changes
    now = datetime.now(timezone.utc)
    last_changed_str = current_user.get("phone_changed_at")
    if last_changed_str:
        last_changed = datetime.fromisoformat(last_changed_str)
        if last_changed.tzinfo is None:
            last_changed = last_changed.replace(tzinfo=timezone.utc)
        days_since = (now - last_changed).days
        if days_since < PHONE_CHANGE_DAYS:
            days_left = PHONE_CHANGE_DAYS - days_since
            raise HTTPException(400, f"You can only change your phone number once every {PHONE_CHANGE_DAYS} days. Try again in {days_left} day(s).")
    code = generate_code()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db.pending_phone_verifications.update_one(
        {"user_id": current_user["id"]},
        {"$set": {
            "user_id": current_user["id"],
            "pending_phone": phone,
            "code": code,
            "expires_at": expires.isoformat(),
            "created_at": now.isoformat(),
        }},
        upsert=True,
    )
    await send_email(
        to=current_user["email"],
        subject="Verify your phone number — PRaww Reads",
        body_html=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:28px;font-weight:800;color:#1a1a1a;">📖 PRaww Reads</span>
          </div>
          <h2 style="margin-bottom:8px;color:#1a1a1a;">Verify your phone number</h2>
          <p style="color:#6b7280;">You are adding <strong>{phone}</strong> as your phone number. Enter this code to confirm. It expires in <strong>10 minutes</strong>.</p>
          <div style="font-size:40px;font-weight:700;letter-spacing:10px;text-align:center;padding:28px 0;color:#4f46e5;background:#f5f3ff;border-radius:10px;margin:20px 0;">{code}</div>
          <p style="color:#9ca3af;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:20px 0;" />
          <p style="color:#d1d5db;font-size:11px;text-align:center;">Sent by PRaww Reads · noreply@praww.co.za</p>
        </div>
        """,
        code=code,
    )
    return {"message": f"Verification code sent to your email. Enter it to confirm your phone number.", "email": current_user["email"]}

@api_router.post("/auth/verify-phone")
async def verify_phone(data: VerifyPhoneInput, current_user: dict = Depends(get_current_user)):
    """Confirm the phone verification code and save the phone number."""
    pending = await db.pending_phone_verifications.find_one({"user_id": current_user["id"]})
    if not pending:
        raise HTTPException(404, "No pending phone verification. Please request a code first.")
    expires_at = datetime.fromisoformat(pending["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.pending_phone_verifications.delete_one({"user_id": current_user["id"]})
        raise HTTPException(410, "Verification code has expired. Please request a new one.")
    if pending["code"] != data.code.strip():
        raise HTTPException(400, "Invalid verification code")
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"phone": pending["pending_phone"], "phone_verified": True, "phone_changed_at": now, "updated_at": now}}
    )
    await db.pending_phone_verifications.delete_one({"user_id": current_user["id"]})
    return {"message": "Phone number verified and saved successfully", "phone": pending["pending_phone"]}

@api_router.post("/auth/request-password-change-code")
async def request_password_change_code(request: Request, current_user: dict = Depends(get_current_user)):
    """Send a verification code to the user's email before allowing a password change."""
    if not _rate_check(f"pw_change:{current_user['id']}", limit=3, window_secs=600):
        raise HTTPException(429, "Too many password change requests. Please wait 10 minutes before trying again.")
    code = generate_code()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db.pending_password_changes.update_one(
        {"user_id": current_user["id"]},
        {"$set": {
            "user_id": current_user["id"],
            "code": code,
            "expires_at": expires.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    phone = current_user.get("phone", "")
    phone_note = f"<p style='color:#6b7280;font-size:13px;'>Your registered phone: <strong>{phone}</strong></p>" if phone else ""
    await send_email(
        to=current_user["email"],
        subject="Password change verification — PRaww Reads",
        body_html=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:28px;font-weight:800;color:#1a1a1a;">📖 PRaww Reads</span>
          </div>
          <h2 style="margin-bottom:8px;color:#1a1a1a;">Confirm your password change</h2>
          <p style="color:#6b7280;">Someone requested a password change on your account. Enter this code to proceed. It expires in <strong>10 minutes</strong>.</p>
          <div style="font-size:40px;font-weight:700;letter-spacing:10px;text-align:center;padding:28px 0;color:#4f46e5;background:#f5f3ff;border-radius:10px;margin:20px 0;">{code}</div>
          {phone_note}
          <p style="color:#9ca3af;font-size:13px;">If you did not request this change, secure your account immediately.</p>
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:20px 0;" />
          <p style="color:#d1d5db;font-size:11px;text-align:center;">Sent by PRaww Reads · noreply@praww.co.za</p>
        </div>
        """,
        code=code,
    )
    return {"message": f"Verification code sent to {current_user['email']}. Enter it along with your new password."}

@api_router.post("/auth/verify-and-change-password")
async def verify_and_change_password(data: VerifyAndChangePasswordInput, current_user: dict = Depends(get_current_user)):
    """Verify the code and change the password in one step."""
    pending = await db.pending_password_changes.find_one({"user_id": current_user["id"]})
    if not pending:
        raise HTTPException(404, "No pending password change. Please request a verification code first.")
    expires_at = datetime.fromisoformat(pending["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.pending_password_changes.delete_one({"user_id": current_user["id"]})
        raise HTTPException(410, "Verification code has expired. Please request a new one.")
    if pending["code"] != data.code.strip():
        raise HTTPException(400, "Invalid verification code")
    if not data.new_password or len(data.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"password_hash": new_hash, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.pending_password_changes.delete_one({"user_id": current_user["id"]})
    return {"message": "Password changed successfully"}

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordInput, request: Request):
    """Send a password reset code to the given email."""
    # Rate limit: max 3 forgot-password attempts per IP per 15 minutes
    client_ip = request.client.host if request.client else "unknown"
    if not _rate_check(f"forgot:{client_ip}", limit=3, window_secs=900):
        raise HTTPException(429, "Too many password reset attempts. Please wait 15 minutes before trying again.")
    email = data.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If an account with that email exists, a reset code has been sent."}
    code = generate_code()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db.password_reset_codes.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "code": code,
            "expires_at": expires.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    phone = user.get("phone", "")
    phone_note = f"<p style='color:#6b7280;font-size:13px;'>Your registered phone: <strong>{phone}</strong></p>" if phone else ""
    await send_email(
        to=email,
        subject="Reset your password — PRaww Reads",
        body_html=f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:28px;font-weight:800;color:#1a1a1a;">📖 PRaww Reads</span>
          </div>
          <h2 style="margin-bottom:8px;color:#1a1a1a;">Reset your password</h2>
          <p style="color:#6b7280;">Enter this code in the app to reset your password. It expires in <strong>10 minutes</strong>.</p>
          <div style="font-size:40px;font-weight:700;letter-spacing:10px;text-align:center;padding:28px 0;color:#4f46e5;background:#f5f3ff;border-radius:10px;margin:20px 0;">{code}</div>
          {phone_note}
          <p style="color:#9ca3af;font-size:13px;">If you did not request a password reset, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:20px 0;" />
          <p style="color:#d1d5db;font-size:11px;text-align:center;">Sent by PRaww Reads · noreply@praww.co.za</p>
        </div>
        """,
        code=code,
    )
    return {"message": "If an account with that email exists, a reset code has been sent."}

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordInput):
    """Verify the reset code and set a new password."""
    email = data.email.strip().lower()
    pending = await db.password_reset_codes.find_one({"email": email})
    if not pending:
        raise HTTPException(404, "No password reset was requested for this email.")
    expires_at = datetime.fromisoformat(pending["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.password_reset_codes.delete_one({"email": email})
        raise HTTPException(410, "Reset code has expired. Please request a new one.")
    if pending["code"] != data.code.strip():
        raise HTTPException(400, "Invalid reset code")
    if not data.new_password or len(data.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": new_hash, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.password_reset_codes.delete_one({"email": email})
    return {"message": "Password reset successfully. You can now log in with your new password."}

@api_router.get("/auth/phone-status")
async def phone_status(current_user: dict = Depends(get_current_user)):
    """Returns phone verification status and cooldown info."""
    now = datetime.now(timezone.utc)
    last_changed_str = current_user.get("phone_changed_at")
    can_change = True
    days_left = 0
    if last_changed_str:
        last_changed = datetime.fromisoformat(last_changed_str)
        if last_changed.tzinfo is None:
            last_changed = last_changed.replace(tzinfo=timezone.utc)
        days_since = (now - last_changed).days
        if days_since < PHONE_CHANGE_DAYS:
            can_change = False
            days_left = PHONE_CHANGE_DAYS - days_since
    return {
        "phone": current_user.get("phone", ""),
        "phone_verified": current_user.get("phone_verified", False),
        "can_change": can_change,
        "days_left": days_left,
    }

@api_router.get("/auth/user")
async def get_user(current_user: dict = Depends(get_current_user)):
    return safe_user(current_user)

# ── Profile Routes ──────────────────────────────────────────────────────────
@api_router.get("/profile/me")
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    stories = await db.stories.find({"author_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    followers = await db.follows.count_documents({"following_id": current_user["id"]})
    following = await db.follows.count_documents({"follower_id": current_user["id"]})
    online_status = _get_online_status(current_user, viewer_id=current_user["id"])
    return {**safe_user(current_user), "stories": stories, "follower_count": followers, "following_count": following, **online_status}

@api_router.get("/profile/username-status")
async def username_status(current_user: dict = Depends(get_current_user)):
    """Returns whether the user can change their username and how many days remain."""
    now = datetime.now(timezone.utc)
    last_changed_str = current_user.get("username_changed_at")
    if not last_changed_str:
        return {"can_change": True, "days_left": 0}
    last_changed = datetime.fromisoformat(last_changed_str)
    if last_changed.tzinfo is None:
        last_changed = last_changed.replace(tzinfo=timezone.utc)
    days_since = (now - last_changed).days
    if days_since >= USERNAME_CHANGE_DAYS:
        return {"can_change": True, "days_left": 0}
    return {"can_change": False, "days_left": USERNAME_CHANGE_DAYS - days_since}

@api_router.get("/profile/{user_id}")
async def get_profile(user_id: str, current_user: Optional[dict] = Depends(get_optional_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    stories = await db.stories.find({"author_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    followers = await db.follows.count_documents({"following_id": user_id})
    following = await db.follows.count_documents({"follower_id": user_id})
    is_following = False
    if current_user:
        is_following = await db.follows.count_documents({"follower_id": current_user["id"], "following_id": user_id}) > 0
    return {**safe_user(user), "stories": stories, "follower_count": followers, "following_count": following, "is_following": is_following}

@api_router.patch("/profile")
async def update_profile(data: UpdateProfileInput, current_user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    now = datetime.now(timezone.utc)

    if "username" in updates and updates["username"] != current_user.get("username"):
        new_username = updates["username"].strip()
        if not new_username:
            raise HTTPException(400, "Username cannot be empty")
        if len(new_username) < 3:
            raise HTTPException(400, "Username must be at least 3 characters")
        if is_reserved_username(new_username):
            raise HTTPException(400, "That username is reserved and cannot be used.")
        last_changed_str = current_user.get("username_changed_at")
        if last_changed_str:
            last_changed = datetime.fromisoformat(last_changed_str)
            if last_changed.tzinfo is None:
                last_changed = last_changed.replace(tzinfo=timezone.utc)
            days_since = (now - last_changed).days
            if days_since < USERNAME_CHANGE_DAYS:
                days_left = USERNAME_CHANGE_DAYS - days_since
                raise HTTPException(400, f"You can only change your username once every {USERNAME_CHANGE_DAYS} days. You can change it again in {days_left} day(s).")
        taken = await db.users.find_one({"username": new_username, "id": {"$ne": current_user["id"]}})
        if taken:
            raise HTTPException(409, "That username is already taken. Please choose a different one.")
        previously_used = await db.used_usernames.find_one({"username": new_username.lower()})
        if previously_used and previously_used.get("user_id") != current_user["id"]:
            raise HTTPException(409, "That username is no longer available. Please choose a different one.")
        old_username = current_user.get("username", "")
        if old_username and old_username.lower() != new_username.lower():
            await db.used_usernames.update_one(
                {"username": old_username.lower()},
                {"$set": {"username": old_username.lower(), "user_id": current_user["id"], "released_at": now.isoformat()}},
                upsert=True,
            )
        updates["username_changed_at"] = now.isoformat()

    updates["updated_at"] = now.isoformat()
    try:
        await db.users.update_one({"id": current_user["id"]}, {"$set": updates})
    except DuplicateKeyError:
        raise HTTPException(409, "That username is already taken. Please choose a different one.")
    updated = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return safe_user(updated)

# ── Follow Routes ───────────────────────────────────────────────────────────
@api_router.post("/follow/{user_id}")
async def follow_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if user_id == current_user["id"]:
        raise HTTPException(400, "Cannot follow yourself")
    existing = await db.follows.find_one({"follower_id": current_user["id"], "following_id": user_id})
    if not existing:
        await db.follows.insert_one({"follower_id": current_user["id"], "following_id": user_id, "created_at": datetime.now(timezone.utc).isoformat()})
        follower_name = _get_display_name(current_user)
        asyncio.create_task(send_push_notification(
            user_id,
            "New Follower",
            f"{follower_name} started following you",
            f"/profile/{current_user.get('username') or current_user['id']}",
        ))
    count = await db.follows.count_documents({"following_id": user_id})
    return {"following": True, "follower_count": count}

@api_router.delete("/follow/{user_id}")
async def unfollow_user(user_id: str, current_user: dict = Depends(get_current_user)):
    await db.follows.delete_one({"follower_id": current_user["id"], "following_id": user_id})
    count = await db.follows.count_documents({"following_id": user_id})
    return {"following": False, "follower_count": count}

@api_router.get("/follow/{user_id}/status")
async def follow_status(user_id: str, current_user: dict = Depends(get_current_user)):
    following = await db.follows.count_documents({"follower_id": current_user["id"], "following_id": user_id}) > 0
    count = await db.follows.count_documents({"following_id": user_id})
    return {"following": following, "follower_count": count}

# ── Story Routes ─────────────────────────────────────────────────────────────
@api_router.get("/stories")
async def list_stories(current_user: Optional[dict] = Depends(get_optional_user)):
    stories = await db.stories.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for s in stories:
        author = await db.users.find_one({"id": s["author_id"]}, {"_id": 0, "first_name": 1, "last_name": 1, "username": 1, "is_verified": 1, "is_premium": 1})
        s["author_name"] = _get_display_name(author) if author else "Unknown"
        s["author_is_verified"] = bool((author or {}).get("is_verified"))
        s["author_is_premium"] = bool((author or {}).get("is_premium"))
        like_count = await db.story_likes.count_documents({"story_id": s["id"]})
        s["like_count"] = like_count
        s["view_count"] = await db.story_views.count_documents({"story_id": s["id"]})
        s["user_liked"] = False
        if current_user:
            s["user_liked"] = await db.story_likes.count_documents({"story_id": s["id"], "user_id": current_user["id"]}) > 0
    return stories

@api_router.get("/stories/favorites")
async def get_story_favorites(current_user: dict = Depends(get_current_user)):
    favs = await db.story_favorites.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(100)
    story_ids = [f["story_id"] for f in favs]
    if not story_ids:
        return []
    stories = await db.stories.find({"id": {"$in": story_ids}}, {"_id": 0}).to_list(100)
    return stories

@api_router.get("/stories/trending")
async def get_trending_stories():
    pipeline = [
        {"$lookup": {"from": "story_likes", "localField": "id", "foreignField": "story_id", "as": "likes"}},
        {"$addFields": {
            "like_count": {"$size": "$likes"},
            "trending_score": {
                "$add": [
                    {"$multiply": [{"$size": "$likes"}, 3]},
                    {"$multiply": [{"$ifNull": ["$total_donations", 0]}, 2]},
                    {"$multiply": [{"$ifNull": ["$total_sales", 0]}, 5]},
                ]
            }
        }},
        {"$sort": {"trending_score": -1, "created_at": -1}},
        {"$limit": 20},
        {"$project": {"_id": 0, "likes": 0}}
    ]
    stories = await db.stories.aggregate(pipeline).to_list(20)
    for s in stories:
        author = await db.users.find_one({"id": s.get("author_id")}, {"_id": 0, "first_name": 1, "last_name": 1, "username": 1, "is_verified": 1, "is_premium": 1})
        s["author_name"] = _get_display_name(author) if author else "Unknown"
        s["author_is_verified"] = bool((author or {}).get("is_verified"))
        s["author_is_premium"] = bool((author or {}).get("is_premium"))
        s["view_count"] = await db.story_views.count_documents({"story_id": s["id"]})
    return stories

@api_router.get("/stories/{story_id}")
async def get_story(story_id: str, request: Request, current_user: Optional[dict] = Depends(get_optional_user)):
    story = await db.stories.find_one({"id": story_id}, {"_id": 0})
    if not story:
        raise HTTPException(404, "Story not found")
    author = await db.users.find_one({"id": story["author_id"]}, {"_id": 0, "first_name": 1, "last_name": 1, "username": 1, "profile_image_url": 1})
    story["author_name"] = _get_display_name(author) if author else "Unknown"
    story["author_profile_image_url"] = (author or {}).get("profile_image_url", "")
    like_count = await db.story_likes.count_documents({"story_id": story_id})
    story["like_count"] = like_count
    story["user_liked"] = False
    if current_user:
        story["user_liked"] = await db.story_likes.count_documents({"story_id": story_id, "user_id": current_user["id"]}) > 0
    story["user_favorited"] = False
    if current_user:
        story["user_favorited"] = await db.story_favorites.count_documents({"story_id": story_id, "user_id": current_user["id"]}) > 0
    story["user_purchased"] = False
    if current_user:
        if story.get("author_id") == current_user["id"]:
            story["user_purchased"] = True
        else:
            purchase = await db.story_purchases.find_one({"story_id": story_id, "buyer_id": current_user["id"], "status": "completed"})
            story["user_purchased"] = bool(purchase)
    # Track view
    viewer_key = current_user["id"] if current_user else request.client.host
    now = datetime.now(timezone.utc).isoformat()
    await db.story_views.update_one(
        {"story_id": story_id, "viewer_key": viewer_key},
        {"$set": {"story_id": story_id, "viewer_key": viewer_key, "viewed_at": now}},
        upsert=True
    )
    view_count = await db.story_views.count_documents({"story_id": story_id})
    story["view_count"] = view_count
    return story

@api_router.post("/stories")
async def create_story(data: CreateStoryInput, current_user: dict = Depends(get_current_user)):
    if not data.title or not data.title.strip():
        raise HTTPException(400, "Story title is required")
    if len(data.title.strip()) > 200:
        raise HTTPException(400, "Story title must be 200 characters or fewer")
    if data.description and len(data.description) > 2000:
        raise HTTPException(400, "Description must be 2000 characters or fewer")
    if data.content and len(data.content) > 500000:
        raise HTTPException(400, "Story content is too long (max 500,000 characters)")
    if data.is_paid and (not data.price or data.price < 5 or data.price > 9999):
        raise HTTPException(400, "Paid story price must be between R5 and R9999")
    story_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    story = {
        "id": story_id,
        "title": data.title.strip(),
        "content": data.content,
        "description": data.description or "",
        "cover_image_url": data.cover_image_url or "",
        "author_id": current_user["id"],
        "is_paid": data.is_paid or False,
        "price": data.price or 0.0,
        "total_donations": 0.0,
        "total_sales": 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.stories.insert_one(story)
    story.pop("_id", None)
    return story

@api_router.patch("/stories/{story_id}")
async def update_story(story_id: str, data: UpdateStoryInput, current_user: dict = Depends(get_current_user)):
    story = await db.stories.find_one({"id": story_id, "author_id": current_user["id"]})
    if not story:
        raise HTTPException(403, "Story not found or unauthorized")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.stories.update_one({"id": story_id}, {"$set": updates})
    updated = await db.stories.find_one({"id": story_id}, {"_id": 0})
    return updated

@api_router.delete("/stories/{story_id}")
async def delete_story(story_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.stories.delete_one({"id": story_id, "author_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(403, "Story not found or unauthorized")
    return {"deleted": True}

# ── Monetization / PayFast ────────────────────────────────────────────────────
PLATFORM_COMMISSION = 0.30
WRITER_SHARE = 0.70
VALID_DONATION_AMOUNTS = [5, 10, 20, 50]
MIN_WITHDRAWAL = 100.0

PAYFAST_MERCHANT_ID  = os.environ.get("PAYFAST_MERCHANT_ID",  "10000100")
PAYFAST_MERCHANT_KEY = os.environ.get("PAYFAST_MERCHANT_KEY", "46f0cd694581a")
PAYFAST_PASSPHRASE   = os.environ.get("PAYFAST_PASSPHRASE",   "")
PAYFAST_SANDBOX      = os.environ.get("PAYFAST_SANDBOX", "true").lower() == "true"
PAYFAST_BASE         = "https://sandbox.payfast.co.za" if PAYFAST_SANDBOX else "https://www.payfast.co.za"
_replit_domain       = os.environ.get("REPLIT_DEV_DOMAIN", "")
APP_URL              = (os.environ.get("APP_URL", "").rstrip("/") or
                        (f"https://{_replit_domain}" if _replit_domain else ""))

def _payfast_sig(fields: list) -> str:
    params = [(k, v) for k, v in fields if v not in (None, "")]
    if PAYFAST_PASSPHRASE:
        params.append(("passphrase", PAYFAST_PASSPHRASE))
    return hashlib.md5(urlencode(params).encode()).hexdigest()

def _build_payfast(fields: list) -> dict:
    sig = _payfast_sig(fields)
    return {"payfast_url": f"{PAYFAST_BASE}/eng/process",
            "form_data": dict(fields + [("signature", sig)])}

class PayFastDonationInput(BaseModel):
    story_id: str
    amount: float

class PayFastPurchaseInput(BaseModel):
    story_id: str

@api_router.post("/payfast/initiate-donation")
async def initiate_donation(data: PayFastDonationInput, current_user: dict = Depends(get_current_user)):
    story = await db.stories.find_one({"id": data.story_id}, {"_id": 0})
    if not story:
        raise HTTPException(404, "Story not found")
    if story["author_id"] == current_user["id"]:
        raise HTTPException(400, "You cannot donate to your own story")
    if data.amount not in VALID_DONATION_AMOUNTS:
        raise HTTPException(400, f"Invalid donation amount. Choose from: {VALID_DONATION_AMOUNTS}")
    now = datetime.now(timezone.utc).isoformat()
    writer_amount  = round(data.amount * WRITER_SHARE, 2)
    platform_amount = round(data.amount * PLATFORM_COMMISSION, 2)
    donation_id = str(uuid.uuid4())
    await db.donations.insert_one({
        "id": donation_id, "story_id": data.story_id,
        "donor_id": current_user["id"], "writer_id": story["author_id"],
        "amount": data.amount, "writer_amount": writer_amount,
        "platform_amount": platform_amount, "status": "pending", "created_at": now,
    })
    base = APP_URL
    full_name = f"{current_user.get('first_name', '')} {current_user.get('last_name', '')}".strip() or current_user["username"]
    name_parts = full_name.split(maxsplit=1)
    item_name = f"Donation – {story.get('title', 'Story')[:80]}"
    fields = [
        ("merchant_id",    PAYFAST_MERCHANT_ID),
        ("merchant_key",   PAYFAST_MERCHANT_KEY),
        ("return_url",     f"{base}/stories/{data.story_id}?payment=success&type=donation&ref={donation_id}"),
        ("cancel_url",     f"{base}/stories/{data.story_id}?payment=cancelled"),
        ("notify_url",     f"{base}/api/payfast/itn"),
        ("name_first",     name_parts[0]),
        ("name_last",      name_parts[1] if len(name_parts) > 1 else ""),
        ("email_address",  current_user["email"]),
        ("m_payment_id",   donation_id),
        ("amount",         f"{data.amount:.2f}"),
        ("item_name",      item_name),
        ("custom_str1",    "donation"),
        ("custom_str2",    data.story_id),
        ("custom_str3",    current_user["id"]),
    ]
    return _build_payfast(fields)

@api_router.get("/stories/{story_id}/purchase-status")
async def get_purchase_status(story_id: str, current_user: Optional[dict] = Depends(get_optional_user)):
    if not current_user:
        return {"purchased": False}
    purchase = await db.story_purchases.find_one({
        "story_id": story_id, "buyer_id": current_user["id"], "status": "completed"
    })
    story = await db.stories.find_one({"id": story_id}, {"_id": 0, "author_id": 1})
    is_author = story and story["author_id"] == current_user["id"]
    return {"purchased": bool(purchase) or is_author}

@api_router.post("/payfast/initiate-purchase")
async def initiate_purchase(data: PayFastPurchaseInput, current_user: dict = Depends(get_current_user)):
    story = await db.stories.find_one({"id": data.story_id}, {"_id": 0})
    if not story:
        raise HTTPException(404, "Story not found")
    if not story.get("is_paid"):
        raise HTTPException(400, "This story is free to read")
    if story["author_id"] == current_user["id"]:
        raise HTTPException(400, "You cannot purchase your own story")
    existing = await db.story_purchases.find_one({
        "story_id": data.story_id, "buyer_id": current_user["id"], "status": "completed"
    })
    if existing:
        raise HTTPException(400, "You have already purchased this story")
    now = datetime.now(timezone.utc).isoformat()
    price = story.get("price", 0.0)
    if price <= 0:
        raise HTTPException(400, "Story price is not set")
    writer_amount   = round(price * WRITER_SHARE, 2)
    platform_amount = round(price * PLATFORM_COMMISSION, 2)
    purchase_id = str(uuid.uuid4())
    await db.story_purchases.insert_one({
        "id": purchase_id, "story_id": data.story_id,
        "buyer_id": current_user["id"], "writer_id": story["author_id"],
        "amount": price, "writer_amount": writer_amount,
        "platform_amount": platform_amount, "status": "pending", "created_at": now,
    })
    base = APP_URL
    full_name = f"{current_user.get('first_name', '')} {current_user.get('last_name', '')}".strip() or current_user["username"]
    name_parts = full_name.split(maxsplit=1)
    item_name = f"Story Purchase – {story.get('title', 'Story')[:75]}"
    fields = [
        ("merchant_id",    PAYFAST_MERCHANT_ID),
        ("merchant_key",   PAYFAST_MERCHANT_KEY),
        ("return_url",     f"{base}/stories/{data.story_id}?payment=success&type=purchase&ref={purchase_id}"),
        ("cancel_url",     f"{base}/stories/{data.story_id}?payment=cancelled"),
        ("notify_url",     f"{base}/api/payfast/itn"),
        ("name_first",     name_parts[0]),
        ("name_last",      name_parts[1] if len(name_parts) > 1 else ""),
        ("email_address",  current_user["email"]),
        ("m_payment_id",   purchase_id),
        ("amount",         f"{price:.2f}"),
        ("item_name",      item_name),
        ("custom_str1",    "purchase"),
        ("custom_str2",    data.story_id),
        ("custom_str3",    current_user["id"]),
    ]
    return _build_payfast(fields)

@api_router.post("/payfast/itn")
async def payfast_itn(request: Request):
    form   = await request.form()
    data   = dict(form)
    pf_sig = data.get("signature", "")

    sig_fields = [(k, v) for k, v in data.items() if k != "signature"]
    expected   = _payfast_sig(sig_fields)
    if pf_sig != expected:
        logging.warning(f"PayFast ITN bad signature. got={pf_sig} expected={expected}")
        return Response(content="Invalid signature", status_code=400)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{PAYFAST_BASE}/eng/query/validate",
                content=urlencode(sig_fields).encode(),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.text.strip() != "VALID":
                logging.warning(f"PayFast ITN validate failed: {resp.text}")
                return Response(content="Invalid payment", status_code=400)
    except Exception as exc:
        logging.error(f"PayFast validate request error: {exc}")
        return Response(content="Validation error", status_code=500)

    if data.get("payment_status") != "COMPLETE":
        return Response(content="OK")

    payment_type = data.get("custom_str1", "")
    payment_id   = data.get("m_payment_id", "")
    pf_payment_id = data.get("pf_payment_id", "")
    now = datetime.now(timezone.utc).isoformat()

    if payment_type == "donation":
        donation = await db.donations.find_one({"id": payment_id})
        if not donation or donation.get("status") == "completed":
            return Response(content="OK")
        await db.donations.update_one(
            {"id": payment_id},
            {"$set": {"status": "completed", "payfast_id": pf_payment_id, "completed_at": now}},
        )
        await db.stories.update_one(
            {"id": donation["story_id"]}, {"$inc": {"total_donations": donation["amount"]}}
        )
        await db.users.update_one(
            {"id": donation["writer_id"]},
            {"$inc": {"wallet_balance": donation["writer_amount"], "total_earnings": donation["writer_amount"]}},
        )
        await db.platform_revenue.insert_one({
            "id": str(uuid.uuid4()), "type": "donation",
            "ref_id": payment_id, "amount": donation["platform_amount"], "created_at": now,
        })

    elif payment_type == "purchase":
        purchase = await db.story_purchases.find_one({"id": payment_id})
        if not purchase or purchase.get("status") == "completed":
            return Response(content="OK")
        await db.story_purchases.update_one(
            {"id": payment_id},
            {"$set": {"status": "completed", "payfast_id": pf_payment_id, "completed_at": now}},
        )
        await db.stories.update_one(
            {"id": purchase["story_id"]}, {"$inc": {"total_sales": 1}}
        )
        await db.users.update_one(
            {"id": purchase["writer_id"]},
            {"$inc": {"wallet_balance": purchase["writer_amount"], "total_earnings": purchase["writer_amount"]}},
        )
        await db.platform_revenue.insert_one({
            "id": str(uuid.uuid4()), "type": "story_purchase",
            "ref_id": payment_id, "amount": purchase["platform_amount"], "created_at": now,
        })

    return Response(content="OK")

# ── Wallet & Earnings ─────────────────────────────────────────────────────────
@api_router.get("/wallet")
async def get_wallet(current_user: dict = Depends(get_current_user)):
    donations = await db.donations.find({"writer_id": current_user["id"], "status": "completed"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    purchases = await db.story_purchases.find({"writer_id": current_user["id"], "status": "completed"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    withdrawals = await db.withdrawals.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    total_donation_income = sum(d.get("writer_amount", 0) for d in donations)
    total_sales_income = sum(p.get("writer_amount", 0) for p in purchases)
    stories = await db.stories.find({"author_id": current_user["id"]}, {"_id": 0, "id": 1, "title": 1, "total_donations": 1, "total_sales": 1, "is_paid": 1, "price": 1}).to_list(100)
    return {
        "wallet_balance": current_user.get("wallet_balance", 0.0),
        "total_earnings": current_user.get("total_earnings", 0.0),
        "total_donation_income": total_donation_income,
        "total_sales_income": total_sales_income,
        "donations": donations,
        "purchases": purchases,
        "withdrawals": withdrawals,
        "stories": stories,
        "min_withdrawal": MIN_WITHDRAWAL,
    }

@api_router.post("/wallet/withdraw")
async def request_withdrawal(data: WithdrawalRequestInput, current_user: dict = Depends(get_current_user)):
    balance = current_user.get("wallet_balance", 0.0)
    if balance < MIN_WITHDRAWAL:
        raise HTTPException(400, f"Minimum withdrawal is R{MIN_WITHDRAWAL}. Your balance is R{balance:.2f}")
    if data.amount > balance:
        raise HTTPException(400, f"Insufficient balance. Available: R{balance:.2f}")
    if data.amount < MIN_WITHDRAWAL:
        raise HTTPException(400, f"Minimum withdrawal amount is R{MIN_WITHDRAWAL}")
    now = datetime.now(timezone.utc).isoformat()
    withdrawal_id = str(uuid.uuid4())
    withdrawal = {
        "id": withdrawal_id,
        "user_id": current_user["id"],
        "amount": data.amount,
        "status": "pending",
        "created_at": now,
    }
    await db.withdrawals.insert_one(withdrawal)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$inc": {"wallet_balance": -data.amount}}
    )
    return {
        "message": f"Withdrawal request of R{data.amount:.2f} submitted. We will contact you at {current_user['email']} with payment details.",
        "withdrawal_id": withdrawal_id,
    }

# Story Likes
@api_router.get("/stories/{story_id}/likes")
async def get_story_likes(story_id: str, current_user: Optional[dict] = Depends(get_optional_user)):
    count = await db.story_likes.count_documents({"story_id": story_id})
    user_liked = False
    if current_user:
        user_liked = await db.story_likes.count_documents({"story_id": story_id, "user_id": current_user["id"]}) > 0
    return {"count": count, "user_liked": user_liked}

@api_router.post("/stories/{story_id}/like")
async def toggle_story_like(story_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.story_likes.find_one({"story_id": story_id, "user_id": current_user["id"]})
    if existing:
        await db.story_likes.delete_one({"story_id": story_id, "user_id": current_user["id"]})
        liked = False
    else:
        await db.story_likes.insert_one({"story_id": story_id, "user_id": current_user["id"], "created_at": datetime.now(timezone.utc).isoformat()})
        liked = True
    count = await db.story_likes.count_documents({"story_id": story_id})
    if liked:
        story = await db.stories.find_one({"id": story_id}, {"_id": 0, "author_id": 1, "title": 1})
        if story and story.get("author_id") != current_user["id"]:
            liker_name = _get_display_name(current_user)
            asyncio.create_task(send_push_notification(
                story["author_id"],
                "New Like",
                f"{liker_name} liked your story \"{story.get('title', 'Untitled')}\"",
                f"/stories/{story_id}",
            ))
    return {"liked": liked, "count": count}

# Story Favorites
@api_router.post("/stories/{story_id}/favorite")
async def toggle_story_favorite(story_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.story_favorites.find_one({"story_id": story_id, "user_id": current_user["id"]})
    if existing:
        await db.story_favorites.delete_one({"story_id": story_id, "user_id": current_user["id"]})
        favorited = False
    else:
        await db.story_favorites.insert_one({"story_id": story_id, "user_id": current_user["id"], "created_at": datetime.now(timezone.utc).isoformat()})
        favorited = True
    return {"favorited": favorited}

# Story Progress
@api_router.get("/stories/{story_id}/progress")
async def get_story_progress(story_id: str, current_user: dict = Depends(get_current_user)):
    prog = await db.story_progress.find_one({"story_id": story_id, "user_id": current_user["id"]}, {"_id": 0})
    return prog or {"progress": 0, "chapter_id": None, "scroll_pct": 0}

@api_router.post("/stories/{story_id}/progress")
async def update_story_progress(story_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    progress = max(0, min(100, int(data.get("progress", 0))))
    chapter_id = data.get("chapter_id") or None
    scroll_pct = max(0.0, min(100.0, float(data.get("scroll_pct", progress))))
    now = datetime.now(timezone.utc).isoformat()
    await db.story_progress.update_one(
        {"story_id": story_id, "user_id": current_user["id"]},
        {"$set": {
            "progress": progress,
            "chapter_id": chapter_id,
            "scroll_pct": scroll_pct,
            "updated_at": now,
            "story_id": story_id,
            "user_id": current_user["id"],
        }},
        upsert=True
    )
    return {"progress": progress}

# Story Comments
@api_router.get("/stories/{story_id}/comments")
async def get_story_comments(story_id: str, current_user: Optional[dict] = Depends(get_optional_user)):
    raw = await db.story_comments.find({"story_id": story_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    enriched = []
    for c in raw:
        author = await db.users.find_one({"id": c["user_id"]}, {"_id": 0, "username": 1, "first_name": 1, "last_name": 1, "profile_image_url": 1})
        like_count = await db.comment_likes.count_documents({"comment_id": c["id"]})
        user_liked = False
        if current_user:
            user_liked = await db.comment_likes.count_documents({"comment_id": c["id"], "user_id": current_user["id"]}) > 0
        enriched.append({**c, "author_name": _get_display_name(author) if author else "Unknown", "author_profile_image_url": (author or {}).get("profile_image_url", ""), "like_count": like_count, "user_liked": user_liked, "replies": []})
    # Nest replies
    top_level = [c for c in enriched if not c.get("parent_id")]
    replies = [c for c in enriched if c.get("parent_id")]
    for comment in top_level:
        comment["replies"] = [r for r in replies if r.get("parent_id") == comment["id"]]
    return top_level

@api_router.post("/stories/{story_id}/comments")
async def create_story_comment(story_id: str, data: CreateCommentInput, current_user: dict = Depends(get_current_user)):
    if not data.content or not data.content.strip():
        raise HTTPException(400, "Comment content is required")
    if len(data.content) > 2000:
        raise HTTPException(400, "Comment must be 2000 characters or fewer")
    comment_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    comment = {"id": comment_id, "story_id": story_id, "user_id": current_user["id"], "content": data.content, "parent_id": data.parent_id, "created_at": now, "updated_at": now}
    await db.story_comments.insert_one(comment)
    comment.pop("_id", None)
    author = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "username": 1, "first_name": 1, "last_name": 1})
    story = await db.stories.find_one({"id": story_id}, {"_id": 0, "author_id": 1, "title": 1})
    if story and story.get("author_id") != current_user["id"]:
        commenter_name = _get_display_name(author)
        asyncio.create_task(send_push_notification(
            story["author_id"],
            "New Comment",
            f"{commenter_name} commented on \"{story.get('title', 'Untitled')}\"",
            f"/stories/{story_id}",
        ))
    return {**comment, "author_name": _get_display_name(author), "like_count": 0, "user_liked": False, "replies": []}

@api_router.patch("/stories/comments/{comment_id}")
async def update_comment(comment_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(400, "Content required")
    result = await db.story_comments.update_one({"id": comment_id, "user_id": current_user["id"]}, {"$set": {"content": content, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if result.modified_count == 0:
        raise HTTPException(403, "Comment not found or unauthorized")
    updated = await db.story_comments.find_one({"id": comment_id}, {"_id": 0})
    return updated

@api_router.delete("/stories/comments/{comment_id}")
async def delete_comment(comment_id: str, current_user: dict = Depends(get_current_user)):
    await db.story_comments.delete_many({"parent_id": comment_id})
    await db.comment_likes.delete_many({"comment_id": comment_id})
    result = await db.story_comments.delete_one({"id": comment_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(403, "Comment not found or unauthorized")
    return {"deleted": True}

@api_router.post("/stories/comments/{comment_id}/like")
async def toggle_comment_like(comment_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.comment_likes.find_one({"comment_id": comment_id, "user_id": current_user["id"]})
    if existing:
        await db.comment_likes.delete_one({"comment_id": comment_id, "user_id": current_user["id"]})
        liked = False
    else:
        await db.comment_likes.insert_one({"comment_id": comment_id, "user_id": current_user["id"], "created_at": datetime.now(timezone.utc).isoformat()})
        liked = True
    count = await db.comment_likes.count_documents({"comment_id": comment_id})
    return {"liked": liked, "count": count}

# ── Chapter Routes ───────────────────────────────────────────────────────────
@api_router.get("/stories/{story_id}/chapters")
async def get_chapters(story_id: str):
    chapters = await db.chapters.find({"story_id": story_id}, {"_id": 0}).sort("order_index", 1).to_list(100)
    return chapters

@api_router.post("/stories/{story_id}/chapters")
async def create_chapter(story_id: str, data: CreateChapterInput, current_user: dict = Depends(get_current_user)):
    if not data.title or not data.title.strip():
        raise HTTPException(400, "Chapter title is required")
    if len(data.title.strip()) > 200:
        raise HTTPException(400, "Chapter title must be 200 characters or fewer")
    if data.content and len(data.content) > 500000:
        raise HTTPException(400, "Chapter content is too long (max 500,000 characters)")
    story = await db.stories.find_one({"id": story_id, "author_id": current_user["id"]})
    if not story:
        raise HTTPException(403, "Story not found or unauthorized")
    count = await db.chapters.count_documents({"story_id": story_id})
    chapter_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    chapter = {"id": chapter_id, "story_id": story_id, "title": data.title, "content": data.content, "order_index": data.order_index if data.order_index is not None else count, "created_at": now, "updated_at": now}
    await db.chapters.insert_one(chapter)
    chapter.pop("_id", None)
    return chapter

@api_router.patch("/chapters/{chapter_id}")
async def update_chapter(chapter_id: str, data: UpdateChapterInput, current_user: dict = Depends(get_current_user)):
    chapter = await db.chapters.find_one({"id": chapter_id})
    if not chapter:
        raise HTTPException(404, "Chapter not found")
    story = await db.stories.find_one({"id": chapter["story_id"], "author_id": current_user["id"]})
    if not story:
        raise HTTPException(403, "Unauthorized")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.chapters.update_one({"id": chapter_id}, {"$set": updates})
    updated = await db.chapters.find_one({"id": chapter_id}, {"_id": 0})
    return updated

@api_router.delete("/chapters/{chapter_id}")
async def delete_chapter(chapter_id: str, current_user: dict = Depends(get_current_user)):
    chapter = await db.chapters.find_one({"id": chapter_id})
    if not chapter:
        raise HTTPException(404, "Chapter not found")
    story = await db.stories.find_one({"id": chapter["story_id"], "author_id": current_user["id"]})
    if not story:
        raise HTTPException(403, "Unauthorized")
    await db.chapters.delete_one({"id": chapter_id})
    return {"deleted": True}

# ── Marketplace (Books) Routes ───────────────────────────────────────────────
@api_router.get("/books")
async def list_books(current_user: Optional[dict] = Depends(get_optional_user)):
    books = await db.books.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for b in books:
        seller = await db.users.find_one({"id": b["seller_id"]}, {"_id": 0, "username": 1, "first_name": 1, "last_name": 1, "email": 1})
        b["seller_name"] = _get_display_name(seller) if seller else "Unknown"
    return books

@api_router.get("/books/{book_id}")
async def get_book(book_id: str):
    book = await db.books.find_one({"id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(404, "Book not found")
    seller = await db.users.find_one({"id": book["seller_id"]}, {"_id": 0, "username": 1, "first_name": 1, "last_name": 1, "email": 1})
    book["seller_name"] = _get_display_name(seller) if seller else "Unknown"
    book["seller_email"] = seller.get("email") if seller else None
    return book

@api_router.post("/books")
async def create_book(data: CreateBookInput, current_user: dict = Depends(get_current_user)):
    book_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    book = {
        "id": book_id,
        "title": data.title,
        "author": data.author or "",
        "price": data.price,
        "condition": data.condition,
        "allow_swap": data.allow_swap,
        "swap_for": data.swap_for or "",
        "image_url": data.image_url or "",
        "seller_id": current_user["id"],
        "is_sold": False,
        "created_at": now,
    }
    await db.books.insert_one(book)
    book.pop("_id", None)
    return book

@api_router.patch("/books/{book_id}")
async def update_book(book_id: str, data: UpdateBookInput, current_user: dict = Depends(get_current_user)):
    book = await db.books.find_one({"id": book_id, "seller_id": current_user["id"]})
    if not book:
        raise HTTPException(403, "Book not found or unauthorized")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    await db.books.update_one({"id": book_id}, {"$set": updates})
    updated = await db.books.find_one({"id": book_id}, {"_id": 0})
    return updated

@api_router.delete("/books/{book_id}")
async def delete_book(book_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.books.delete_one({"id": book_id, "seller_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(403, "Book not found or unauthorized")
    return {"deleted": True}

@api_router.post("/books/{book_id}/sold")
async def mark_book_sold(book_id: str, current_user: dict = Depends(get_current_user)):
    book = await db.books.find_one({"id": book_id, "seller_id": current_user["id"]})
    if not book:
        raise HTTPException(403, "Book not found or unauthorized")
    await db.books.update_one({"id": book_id}, {"$set": {"is_sold": not book.get("is_sold", False)}})
    updated = await db.books.find_one({"id": book_id}, {"_id": 0})
    return updated

class SwapRequestInput(BaseModel):
    offered_book_id: str
    message: Optional[str] = None

@api_router.post("/books/{book_id}/swap-request")
async def request_book_swap(book_id: str, data: SwapRequestInput, current_user: dict = Depends(get_current_user)):
    """Propose a swap: offer your book in exchange for another user's book."""
    target_book = await db.books.find_one({"id": book_id}, {"_id": 0})
    if not target_book:
        raise HTTPException(404, "Book not found")
    if target_book.get("seller_id") == current_user["id"]:
        raise HTTPException(400, "You cannot swap with your own listing")
    if not target_book.get("allow_swap"):
        raise HTTPException(400, "This book is not available for swapping")
    if target_book.get("is_sold"):
        raise HTTPException(400, "This book has already been sold")
    offered_book = await db.books.find_one({"id": data.offered_book_id, "seller_id": current_user["id"]}, {"_id": 0})
    if not offered_book:
        raise HTTPException(404, "Offered book not found or does not belong to you")
    if offered_book.get("is_sold"):
        raise HTTPException(400, "Your offered book has already been sold")
    existing = await db.swap_requests.find_one({
        "target_book_id": book_id,
        "offered_book_id": data.offered_book_id,
        "status": "pending",
    })
    if existing:
        raise HTTPException(409, "A pending swap request already exists for these books")
    swap_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    swap_request = {
        "id": swap_id,
        "target_book_id": book_id,
        "target_seller_id": target_book["seller_id"],
        "offered_book_id": data.offered_book_id,
        "requester_id": current_user["id"],
        "message": (data.message or "").strip(),
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    await db.swap_requests.insert_one(swap_request)
    swap_request.pop("_id", None)
    return swap_request

@api_router.get("/swap-requests")
async def get_my_swap_requests(current_user: dict = Depends(get_current_user)):
    """Get all swap requests sent to or by the current user."""
    uid = current_user["id"]
    requests = await db.swap_requests.find(
        {"$or": [{"requester_id": uid}, {"target_seller_id": uid}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return requests

@api_router.patch("/swap-requests/{swap_id}")
async def respond_to_swap_request(swap_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Accept or decline a swap request (target seller only)."""
    action = data.get("action")
    if action not in ("accept", "decline"):
        raise HTTPException(400, "action must be 'accept' or 'decline'")
    swap = await db.swap_requests.find_one({"id": swap_id, "target_seller_id": current_user["id"]})
    if not swap:
        raise HTTPException(404, "Swap request not found or unauthorized")
    if swap.get("status") != "pending":
        raise HTTPException(400, "This swap request has already been resolved")
    new_status = "accepted" if action == "accept" else "declined"
    await db.swap_requests.update_one(
        {"id": swap_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if new_status == "accepted":
        now = datetime.now(timezone.utc).isoformat()
        await db.books.update_one({"id": swap["target_book_id"]}, {"$set": {"is_sold": True, "updated_at": now}})
        await db.books.update_one({"id": swap["offered_book_id"]}, {"$set": {"is_sold": True, "updated_at": now}})
    updated = await db.swap_requests.find_one({"id": swap_id}, {"_id": 0})
    return updated

# ── Messaging Routes ─────────────────────────────────────────────────────────
@api_router.post("/messages")
async def send_message(data: SendMessageInput, current_user: dict = Depends(get_current_user)):
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    msg = {
        "id": msg_id,
        "book_id": data.book_id,
        "sender_id": current_user["id"],
        "receiver_id": data.receiver_id,
        "content": data.content,
        "is_read": False,
        "created_at": now,
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    return msg

@api_router.get("/messages/book/{book_id}")
async def get_book_messages(book_id: str, current_user: dict = Depends(get_current_user)):
    book = await db.books.find_one({"id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(404, "Book not found")
    is_seller = book["seller_id"] == current_user["id"]
    if is_seller:
        msgs = await db.messages.find({"book_id": book_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    else:
        msgs = await db.messages.find({"book_id": book_id, "$or": [{"sender_id": current_user["id"]}, {"receiver_id": current_user["id"]}]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    # Enrich with sender names
    for m in msgs:
        sender = await db.users.find_one({"id": m["sender_id"]}, {"_id": 0, "username": 1, "first_name": 1, "last_name": 1})
        m["sender_name"] = _get_display_name(sender) if sender else "Unknown"
    # Mark as read
    await db.messages.update_many({"book_id": book_id, "receiver_id": current_user["id"]}, {"$set": {"is_read": True}})
    return msgs

@api_router.get("/messages/unread-count")
async def get_marketplace_unread_count(current_user: dict = Depends(get_current_user)):
    count = await db.messages.count_documents({
        "receiver_id": current_user["id"],
        "is_read": False,
    })
    return {"count": count}

@api_router.get("/messages/inbox")
async def get_inbox(current_user: dict = Depends(get_current_user)):
    msgs = await db.messages.find(
        {"$or": [{"sender_id": current_user["id"]}, {"receiver_id": current_user["id"]}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    threads: dict = {}
    for m in msgs:
        other_user = m["receiver_id"] if m["sender_id"] == current_user["id"] else m["sender_id"]
        key = f"{m['book_id']}:{other_user}"
        if key not in threads:
            threads[key] = {"messages": [], "other_user_id": other_user, "book_id": m["book_id"]}
        threads[key]["messages"].append(m)
    
    result = []
    for key, thread in threads.items():
        book = await db.books.find_one({"id": thread["book_id"]}, {"_id": 0, "title": 1})
        other_user = await db.users.find_one({"id": thread["other_user_id"]}, {"_id": 0, "username": 1, "first_name": 1, "last_name": 1, "email": 1})
        if not book:
            continue
        unread = sum(1 for m in thread["messages"] if m["receiver_id"] == current_user["id"] and not m["is_read"])
        result.append({
            "book_id": thread["book_id"],
            "book_title": book.get("title", ""),
            "other_user_id": thread["other_user_id"],
            "other_user_name": _get_display_name(other_user) if other_user else "Unknown",
            "other_user_email": other_user.get("email", "") if other_user else "",
            "last_message": thread["messages"][0],
            "unread": unread,
        })
    return sorted(result, key=lambda x: x["last_message"]["created_at"], reverse=True)

# ── Favorites (Books) Routes ─────────────────────────────────────────────────
@api_router.get("/favorites")
async def get_book_favorites(current_user: dict = Depends(get_current_user)):
    favs = await db.book_favorites.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(100)
    book_ids = [f["book_id"] for f in favs]
    if not book_ids:
        return []
    books = await db.books.find({"id": {"$in": book_ids}}, {"_id": 0}).to_list(100)
    return books

@api_router.post("/books/{book_id}/favorite")
async def toggle_book_favorite(book_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.book_favorites.find_one({"book_id": book_id, "user_id": current_user["id"]})
    if existing:
        await db.book_favorites.delete_one({"book_id": book_id, "user_id": current_user["id"]})
        return {"is_favorite": False}
    await db.book_favorites.insert_one({"book_id": book_id, "user_id": current_user["id"], "created_at": datetime.now(timezone.utc).isoformat()})
    return {"is_favorite": True}

# ── Helper ───────────────────────────────────────────────────────────────────
def _get_display_name(user: Optional[dict]) -> str:
    if not user:
        return "Unknown"
    if user.get("username"):
        return user["username"]
    fn = user.get("first_name", "")
    ln = user.get("last_name", "")
    if fn or ln:
        return f"{fn} {ln}".strip()
    return user.get("email", "Unknown")

ONLINE_THRESHOLD_MINUTES = 5

def _get_online_status(user: dict, viewer_id: Optional[str] = None) -> dict:
    """Returns online status info, respecting hide_online_status setting."""
    is_own = viewer_id and viewer_id == user.get("id")
    if user.get("hide_online_status") and not is_own:
        return {"is_online": None, "last_seen_at": None}
    last_seen_str = user.get("last_seen_at")
    if not last_seen_str:
        return {"is_online": False, "last_seen_at": None}
    try:
        last_seen = datetime.fromisoformat(last_seen_str)
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        diff = datetime.now(timezone.utc) - last_seen
        is_online = diff.total_seconds() < ONLINE_THRESHOLD_MINUTES * 60
        return {"is_online": is_online, "last_seen_at": last_seen_str}
    except Exception:
        return {"is_online": False, "last_seen_at": None}

# ── Search ───────────────────────────────────────────────────────────────────
@api_router.get("/search")
async def search(q: str = "", type: str = "all", current_user: Optional[dict] = Depends(get_optional_user)):
    q = q.strip()
    if not q or len(q) < 1:
        return {"users": [], "stories": [], "books": []}
    pattern = {"$regex": q, "$options": "i"}
    results = {"users": [], "stories": [], "books": []}

    if type in ("all", "users"):
        users = await db.users.find(
            {"$or": [{"username": pattern}, {"first_name": pattern}, {"last_name": pattern}]},
            {"_id": 0, "password_hash": 0}
        ).limit(10).to_list(10)
        for u in users:
            followers = await db.follows.count_documents({"following_id": u["id"]})
            u["follower_count"] = followers
        results["users"] = users

    if type in ("all", "stories"):
        stories = await db.stories.find(
            {"$or": [{"title": pattern}, {"description": pattern}, {"genre": pattern}]},
            {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        for s in stories:
            author = await db.users.find_one({"id": s["author_id"]}, {"_id": 0, "first_name": 1, "last_name": 1, "username": 1})
            s["author_name"] = _get_display_name(author) if author else "Unknown"
            s["like_count"] = await db.story_likes.count_documents({"story_id": s["id"]})
            if current_user:
                s["user_liked"] = await db.story_likes.count_documents({"story_id": s["id"], "user_id": current_user["id"]}) > 0
        results["stories"] = stories

    if type in ("all", "books"):
        books = await db.books.find(
            {"$or": [{"title": pattern}, {"author": pattern}, {"description": pattern}, {"genre": pattern}]},
            {"_id": 0}
        ).sort("listed_at", -1).limit(20).to_list(20)
        results["books"] = books

    return results

# ── AI Content Detection ──────────────────────────────────────────────────────
def _analyze_ai_content(text: str) -> dict:
    import math
    from collections import Counter

    words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]

    if len(words) < 60:
        return {"score": 0, "verdict": "too_short", "indicators": [], "word_count": len(words)}

    scores = []
    indicators = []

    # 1. Burstiness — humans vary sentence length, AI is uniform
    if len(sentences) >= 4:
        lengths = [len(s.split()) for s in sentences]
        mean = sum(lengths) / len(lengths)
        variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
        cv = math.sqrt(variance) / mean if mean > 0 else 0
        bust_score = max(0, min(100, int(100 - cv * 180)))
        scores.append(bust_score)
        if bust_score >= 60:
            indicators.append("Very uniform sentence lengths")

    # 2. Common AI telltale phrases
    ai_phrases = [
        "it's worth noting", "it is worth noting", "it's important to note",
        "it is important to note", "in conclusion", "in summary", "to summarize",
        "furthermore", "moreover", "additionally", "subsequently",
        "delve into", "delved into", "delves into", "dive into",
        "navigate the", "navigating the", "at its core", "in the realm of",
        "the intricacies", "a tapestry of", "underscore", "underscores",
        "embark on", "embarking on", "shed light on", "sheds light on",
        "holistic approach", "multifaceted", "leverage", "leveraging",
        "paramount importance", "it goes without saying", "as mentioned earlier",
        "as previously mentioned", "in today's world", "in today's society",
        "plays a crucial role", "plays an important role", "a testament to",
        "stands as a", "it is essential", "it is crucial", "needless to say",
        "first and foremost", "last but not least", "on the other hand",
        "in other words", "with that said", "having said that",
    ]
    text_lower = text.lower()
    found = [p for p in ai_phrases if p in text_lower]
    phrase_score = min(100, len(found) * 12)
    scores.append(phrase_score)
    if found:
        indicators.append(f"AI-associated phrases detected ({len(found)})")

    # 3. Vocabulary diversity — type-token ratio
    if len(words) >= 30:
        ttr = len(set(words)) / len(words)
        if ttr < 0.35:
            ttr_score = 70
            indicators.append("Low vocabulary diversity")
        elif ttr > 0.75:
            ttr_score = 15
        else:
            ttr_score = int((0.75 - ttr) / 0.4 * 60)
        scores.append(ttr_score)

    # 4. Average sentence length — AI favours 15–22 words consistently
    if sentences:
        avg_len = sum(len(s.split()) for s in sentences) / len(sentences)
        if 14 <= avg_len <= 23:
            scores.append(45)
            indicators.append("Consistently medium sentence length")
        else:
            scores.append(10)

    # 5. Passive voice density
    passive_hits = len(re.findall(r'\b(is|are|was|were|has been|have been|had been|being)\s+\w+ed\b', text_lower))
    passive_ratio = passive_hits / max(len(sentences), 1)
    if passive_ratio >= 0.4:
        scores.append(65)
        indicators.append("High passive voice usage")
    else:
        scores.append(max(0, int(passive_ratio * 100)))

    # 6. Punctuation variety — humans use em-dashes, ellipses, exclamations more
    special = len(re.findall(r'[—–…!]', text))
    special_ratio = special / max(len(sentences), 1)
    if special_ratio < 0.1:
        scores.append(40)
        indicators.append("Low punctuation variety")
    else:
        scores.append(5)

    # 7. Repeated sentence starters
    starters = [s.split()[0].lower() for s in sentences if s.split()]
    starter_counts = Counter(starters)
    repeated = sum(1 for c in starter_counts.values() if c >= 3)
    if repeated >= 2:
        scores.append(55)
        indicators.append("Repeated sentence-starting words")
    else:
        scores.append(10)

    final_score = int(sum(scores) / len(scores)) if scores else 0
    final_score = max(0, min(100, final_score))

    if final_score >= 80:
        verdict = "likely_ai"
    elif final_score >= 40:
        verdict = "possibly_ai"
    else:
        verdict = "likely_human"

    return {
        "score": final_score,
        "verdict": verdict,
        "indicators": indicators,
        "word_count": len(words),
    }


class CheckAIInput(BaseModel):
    content: str
    chapters: Optional[list] = None

@api_router.post("/stories/check-ai")
async def check_ai_content(data: CheckAIInput, request: Request, current_user: dict = Depends(get_current_user)):
    if not _rate_check(f"ai_check:{current_user['id']}", limit=20, window_secs=600):
        raise HTTPException(429, "Too many AI checks. Please wait before trying again.")
    if data.chapters:
        full_text = "\n\n".join(ch.get("content", "") for ch in data.chapters)
    else:
        full_text = data.content or ""
    result = _analyze_ai_content(full_text)
    return result


# ── Direct Messages (E2E Encrypted) ──────────────────────────────────────────
class SendDMInput(BaseModel):
    receiver_id: str
    receiver_encrypted: dict
    sender_encrypted: dict

@api_router.put("/users/public-key")
async def update_public_key(data: dict, current_user: dict = Depends(get_current_user)):
    public_key = data.get("public_key")
    if not public_key:
        raise HTTPException(400, "public_key is required")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"public_key": public_key}})
    return {"ok": True}

@api_router.get("/users/{user_id}/public-key")
async def get_user_public_key(user_id: str, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "public_key": 1})
    if not user:
        raise HTTPException(404, "User not found")
    if not user.get("public_key"):
        raise HTTPException(404, "This user hasn't set up encrypted messaging yet")
    return {"public_key": user["public_key"]}

@api_router.post("/dm")
async def send_dm(data: SendDMInput, current_user: dict = Depends(get_current_user)):
    if data.receiver_id == current_user["id"]:
        raise HTTPException(400, "Cannot send messages to yourself")
    receiver = await db.users.find_one({"id": data.receiver_id}, {"_id": 0, "id": 1})
    if not receiver:
        raise HTTPException(404, "Recipient not found")
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    msg = {
        "id": msg_id,
        "sender_id": current_user["id"],
        "receiver_id": data.receiver_id,
        "receiver_encrypted": data.receiver_encrypted,
        "sender_encrypted": data.sender_encrypted,
        "is_read": False,
        "created_at": now,
    }
    await db.direct_messages.insert_one(msg)
    msg.pop("_id", None)
    sender_name = _get_display_name(current_user)
    asyncio.create_task(send_push_notification(
        data.receiver_id,
        "New Message",
        f"{sender_name} sent you a message",
        "/messages",
    ))
    return msg

@api_router.get("/dm/unread-count")
async def get_dm_unread_count(current_user: dict = Depends(get_current_user)):
    count = await db.direct_messages.count_documents({"receiver_id": current_user["id"], "is_read": False})
    return {"count": count}

@api_router.get("/dm/conversations")
async def get_dm_conversations(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    msgs = await db.direct_messages.find(
        {"$or": [{"sender_id": uid}, {"receiver_id": uid}]},
        {"_id": 0, "id": 1, "sender_id": 1, "receiver_id": 1, "created_at": 1, "is_read": 1}
    ).sort("created_at", -1).to_list(100)
    seen: dict = {}
    for m in msgs:
        other = m["receiver_id"] if m["sender_id"] == uid else m["sender_id"]
        if other not in seen:
            seen[other] = {"last_at": m["created_at"], "unread": 0}
        if m["receiver_id"] == uid and not m["is_read"]:
            seen[other]["unread"] += 1
    result = []
    for other_id, meta in seen.items():
        other_user = await db.users.find_one({"id": other_id}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "username": 1, "profile_image_url": 1})
        if not other_user:
            continue
        result.append({
            "other_user_id": other_id,
            "other_user_name": _get_display_name(other_user),
            "other_user_profile_image_url": other_user.get("profile_image_url"),
            "last_at": meta["last_at"],
            "unread": meta["unread"],
        })
    return sorted(result, key=lambda x: x["last_at"], reverse=True)

@api_router.get("/dm/{user_id}")
async def get_dm_conversation(user_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    msgs = await db.direct_messages.find(
        {"$or": [
            {"sender_id": uid, "receiver_id": user_id},
            {"sender_id": user_id, "receiver_id": uid},
        ]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    await db.direct_messages.update_many(
        {"sender_id": user_id, "receiver_id": uid, "is_read": False},
        {"$set": {"is_read": True}}
    )
    return msgs

# ── Health ───────────────────────────────────────────────────────────────────
# ── Push Notification Endpoints ──────────────────────────────────────────────
class PushSubscribeInput(BaseModel):
    endpoint: str
    keys: dict

@api_router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    return {"public_key": VAPID_PUBLIC_KEY}

@api_router.post("/push/subscribe")
async def push_subscribe(data: PushSubscribeInput, current_user: dict = Depends(get_current_user)):
    endpoint = data.endpoint.strip()
    p256dh = data.keys.get("p256dh", "").strip()
    auth = data.keys.get("auth", "").strip()
    if not endpoint or not p256dh or not auth:
        raise HTTPException(400, "Invalid subscription data")
    await db.push_subscriptions.update_one(
        {"endpoint": endpoint},
        {"$set": {"endpoint": endpoint, "p256dh": p256dh, "auth": auth, "user_id": current_user["id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"subscribed": True}

@api_router.delete("/push/unsubscribe")
async def push_unsubscribe(data: dict, current_user: dict = Depends(get_current_user)):
    endpoint = data.get("endpoint", "")
    if endpoint:
        await db.push_subscriptions.delete_one({"endpoint": endpoint, "user_id": current_user["id"]})
    return {"unsubscribed": True}

@api_router.get("/")
async def root():
    return {"message": "PRaww Reads API"}

app.include_router(api_router)

# ── Startup: create unique indexes ───────────────────────────────────────────
@app.on_event("startup")
async def create_indexes():
    try:
        await db.users.create_index("email", unique=True, background=True)
        await db.users.create_index("username", unique=True, sparse=True, background=True)
        await db.pending_registrations.create_index("email", unique=True, background=True)
        await db.pending_registrations.create_index(
            "expires_at", expireAfterSeconds=0, background=True
        )
        await db.story_views.create_index(
            [("story_id", 1), ("viewer_key", 1)], unique=True, background=True
        )
        await db.story_views.create_index("story_id", background=True)
        logger.info("Database indexes created/verified")
    except Exception as e:
        logger.warning("Index creation warning: %s", e)

FRONTEND_BUILD = ROOT_DIR.parent / "frontend" / "build"
if FRONTEND_BUILD.exists():
    static_dir = FRONTEND_BUILD / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static_assets")

    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        file_path = FRONTEND_BUILD / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_BUILD / "index.html"))
