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
import os, uuid, bcrypt, jwt, logging, random, string, smtplib, asyncio, re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from concurrent.futures import ThreadPoolExecutor
from pymongo.errors import DuplicateKeyError
from urllib.parse import quote, urlparse, urlunparse

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

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="PRaww Reads API")
api_router = APIRouter(prefix="/api")

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

class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str

class CreateStoryInput(BaseModel):
    title: str
    content: str
    description: Optional[str] = None
    cover_image_url: Optional[str] = None

class UpdateStoryInput(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None

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
async def register(data: RegisterInput, response: Response):
    """Step 1: validate inputs. If SMTP configured, send verification code. Otherwise create account directly."""
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
            "created_at": now,
            "updated_at": now,
        }
        try:
            await db.users.insert_one(user)
        except DuplicateKeyError:
            raise HTTPException(409, "An account with this email already exists. Please log in instead.")
        token = create_token(user_id)
        response.set_cookie("praww_token", token, httponly=True, max_age=3600 * ACCESS_TOKEN_EXPIRE_HOURS, samesite="lax")
        result = safe_user(to_str_id(user))
        result["token"] = token
        return result

    code = generate_code()
    expires = datetime.now(timezone.utc) + timedelta(seconds=60)
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
          <p style="color:#6b7280;margin-bottom:4px;">Enter the code below to activate your account. It expires in <strong>60 seconds</strong>.</p>
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
    token = create_token(user_id)
    response.set_cookie("praww_token", token, httponly=True, max_age=3600 * ACCESS_TOKEN_EXPIRE_HOURS, samesite="lax")
    result = safe_user(to_str_id(user))
    result["token"] = token
    return result

@api_router.post("/auth/login")
async def login(data: LoginInput, response: Response):
    email = data.email.strip().lower()
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
async def change_password(data: ChangePasswordInput, current_user: dict = Depends(get_current_user)):
    if not verify_password(data.current_password, current_user.get("password_hash", "")):
        raise HTTPException(400, "Current password is incorrect")
    if len(data.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    new_hash = hash_password(data.new_password)
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"password_hash": new_hash, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Password changed successfully"}

@api_router.post("/auth/request-email-change")
async def request_email_change(data: RequestEmailChangeInput, current_user: dict = Depends(get_current_user)):
    """Step 1: Verify current password, then send a code to the NEW email."""
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
    expires = datetime.now(timezone.utc) + timedelta(seconds=60)
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
          <p style="color:#6b7280;">Enter this code in the app to confirm your new email address. It expires in <strong>60 seconds</strong>.</p>
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
    if data.plan not in ("monthly", "semi"):
        raise HTTPException(400, "Plan must be 'monthly' or 'semi'")
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
async def request_phone_verify(data: RequestPhoneVerifyInput, current_user: dict = Depends(get_current_user)):
    """Send a verification code to the user's email to verify a new phone number."""
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
    expires = datetime.now(timezone.utc) + timedelta(seconds=60)
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
          <p style="color:#6b7280;">You are adding <strong>{phone}</strong> as your phone number. Enter this code to confirm. It expires in <strong>60 seconds</strong>.</p>
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
async def request_password_change_code(current_user: dict = Depends(get_current_user)):
    """Send a verification code to the user's email before allowing a password change."""
    code = generate_code()
    expires = datetime.now(timezone.utc) + timedelta(seconds=60)
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
          <p style="color:#6b7280;">Someone requested a password change on your account. Enter this code to proceed. It expires in <strong>60 seconds</strong>.</p>
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
async def forgot_password(data: ForgotPasswordInput):
    """Send a password reset code to the given email."""
    email = data.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If an account with that email exists, a reset code has been sent."}
    code = generate_code()
    expires = datetime.now(timezone.utc) + timedelta(seconds=60)
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
          <p style="color:#6b7280;">Enter this code in the app to reset your password. It expires in <strong>60 seconds</strong>.</p>
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
    return {**safe_user(current_user), "stories": stories, "follower_count": followers, "following_count": following}

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
    await db.users.update_one({"id": current_user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return safe_user(updated)

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

# ── Follow Routes ───────────────────────────────────────────────────────────
@api_router.post("/follow/{user_id}")
async def follow_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if user_id == current_user["id"]:
        raise HTTPException(400, "Cannot follow yourself")
    existing = await db.follows.find_one({"follower_id": current_user["id"], "following_id": user_id})
    if not existing:
        await db.follows.insert_one({"follower_id": current_user["id"], "following_id": user_id, "created_at": datetime.now(timezone.utc).isoformat()})
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
    stories = await db.stories.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
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
        {"$addFields": {"like_count": {"$size": "$likes"}}},
        {"$sort": {"like_count": -1, "created_at": -1}},
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
    story_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    story = {
        "id": story_id,
        "title": data.title,
        "content": data.content,
        "description": data.description or "",
        "cover_image_url": data.cover_image_url or "",
        "author_id": current_user["id"],
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
    return prog or {"progress": 0}

@api_router.post("/stories/{story_id}/progress")
async def update_story_progress(story_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    progress = data.get("progress", 0)
    now = datetime.now(timezone.utc).isoformat()
    await db.story_progress.update_one(
        {"story_id": story_id, "user_id": current_user["id"]},
        {"$set": {"progress": progress, "updated_at": now, "story_id": story_id, "user_id": current_user["id"]}},
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
    comment_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    comment = {"id": comment_id, "story_id": story_id, "user_id": current_user["id"], "content": data.content, "parent_id": data.parent_id, "created_at": now, "updated_at": now}
    await db.story_comments.insert_one(comment)
    comment.pop("_id", None)
    author = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "username": 1, "first_name": 1, "last_name": 1})
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
    books = await db.books.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
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

# ── Health ───────────────────────────────────────────────────────────────────
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
