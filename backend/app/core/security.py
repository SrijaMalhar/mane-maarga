"""Password hashing, signed access tokens, role checks and sign-in throttling."""

import base64
import hashlib
import hmac
import json
import secrets
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from .config import JWT_SECRET, JWT_TTL_MINUTES

PBKDF2_ROUNDS = 310_000


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, salt, digest = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        calculated = hashlib.pbkdf2_hmac("sha256", password.encode(), _unb64(salt), int(rounds))
        return hmac.compare_digest(_b64(calculated), digest)
    except (ValueError, TypeError):
        return False


def make_token(user: User) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=JWT_TTL_MINUTES)).timestamp()),
    }
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signature = _b64(hmac.new(JWT_SECRET, f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{signature}"


def decode_token(token: str) -> dict:
    try:
        header, body, signature = token.split(".")
        expected = _b64(hmac.new(JWT_SECRET, f"{header}.{body}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        payload = json.loads(_unb64(body))
        if int(payload.get("exp", 0)) < int(datetime.now(UTC).timestamp()):
            raise ValueError("expired")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired access token") from exc


def current_user(authorization: Annotated[str | None, Header()] = None, db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_token(authorization[7:].strip())
    user = db.get(User, int(payload.get("sub", 0)))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User is inactive or unavailable")
    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return dependency


Admin = Annotated[User, Depends(require_roles("admin"))]
Operator = Annotated[User, Depends(require_roles("admin", "operator"))]
Authenticated = Annotated[User, Depends(current_user)]

# In-memory sign-in throttle per client and bucket. Replace with Redis when running more than one API process.
_auth_attempts: defaultdict[str, deque] = defaultdict(deque)


def enforce_auth_rate_limit(request: Request, bucket: str, limit: int, window_seconds: int = 60) -> None:
    key = f"{bucket}:{request.client.host if request.client else 'unknown'}"
    now = time.monotonic()
    attempts = _auth_attempts[key]
    while attempts and now - attempts[0] > window_seconds:
        attempts.popleft()
    if len(attempts) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Too many authentication attempts. Try again later.",
            headers={"Retry-After": str(window_seconds)},
        )
    attempts.append(now)
