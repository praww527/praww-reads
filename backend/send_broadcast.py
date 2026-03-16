"""
One-shot script to broadcast a push notification to all subscribed users.
Run: cd backend && python send_broadcast.py
"""
import asyncio, os, base64, json as _json
from dotenv import load_dotenv
load_dotenv()

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY_B64 = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "mailto:noreply@praww.co.za")
MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = "praww_reads"

_vapid_private_pem = None
if VAPID_PRIVATE_KEY_B64:
    try:
        from cryptography.hazmat.primitives.serialization import (
            Encoding as _Enc, PrivateFormat as _PF, NoEncryption as _NE
        )
        from cryptography.hazmat.primitives.asymmetric.ec import (
            SECP256R1, derive_private_key
        )
        from cryptography.hazmat.backends import default_backend
        _padding = "=" * (4 - len(VAPID_PRIVATE_KEY_B64) % 4)
        _der = base64.urlsafe_b64decode(VAPID_PRIVATE_KEY_B64 + _padding)
        from cryptography.hazmat.primitives.serialization import load_der_private_key
        _key = load_der_private_key(_der, password=None, backend=default_backend())
        _vapid_private_pem = _key.private_bytes(_Enc.PEM, _PF.TraditionalOpenSSL, _NE()).decode()
    except Exception as e:
        print("VAPID setup failed:", e)

def _do_send(sub_info, payload, pem, claims):
    try:
        from pywebpush import webpush, WebPushException
        webpush(subscription_info=sub_info, data=payload, vapid_private_key=pem, vapid_claims=claims)
        return None
    except Exception as e:
        return str(e)

async def main():
    from motor.motor_asyncio import AsyncIOMotorClient
    from concurrent.futures import ThreadPoolExecutor
    executor = ThreadPoolExecutor(max_workers=4)
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if not _vapid_private_pem:
        print("ERROR: VAPID not configured. Check env vars.")
        return

    title = "📖 New story trending on PRaww Reads"
    body = '"The Weight of Becoming" is getting attention. Come read it now.'
    url = "/"

    payload = _json.dumps({"title": title, "body": body, "url": url})
    claims = {"sub": VAPID_CLAIMS_EMAIL}

    subs = await db.push_subscriptions.find({}, {"_id": 0}).to_list(10000)
    print(f"Found {len(subs)} subscriptions")
    if not subs:
        print("No push subscribers yet. Users need to accept notifications first.")
        return

    loop = asyncio.get_event_loop()
    sent = failed = 0
    for sub in subs:
        sub_info = {"endpoint": sub["endpoint"], "keys": {"p256dh": sub.get("p256dh",""), "auth": sub.get("auth","")}}
        err = await loop.run_in_executor(executor, _do_send, sub_info, payload, _vapid_private_pem, claims)
        if err:
            print(f"  FAIL: {sub['endpoint'][:50]}... ({err})")
            await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
            failed += 1
        else:
            print(f"  OK:   {sub['endpoint'][:50]}...")
            sent += 1

    print(f"\nDone: {sent} sent, {failed} failed/removed")
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
