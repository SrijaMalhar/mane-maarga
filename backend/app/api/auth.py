"""Sign-in, first-administrator bootstrap and user management."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..core.audit import write_audit
from ..core.config import BOOTSTRAP_ENABLED
from ..core.security import Admin, Authenticated, enforce_auth_rate_limit, make_token, password_hash, verify_password
from ..database import get_db
from ..models import User
from ..schemas import BootstrapRequest, LoginRequest, TokenOut, UserCreate, UserOut

router = APIRouter()


@router.get("/api/auth/status")
def auth_status(db: Session = Depends(get_db)):
    return {
        "bootstrap_required": db.query(User).count() == 0 and BOOTSTRAP_ENABLED,
        "bootstrap_enabled": BOOTSTRAP_ENABLED,
    }


@router.post("/api/auth/bootstrap", response_model=TokenOut, status_code=201)
def bootstrap_admin(payload: BootstrapRequest, request: Request, db: Session = Depends(get_db)):
    if not BOOTSTRAP_ENABLED:
        raise HTTPException(status_code=403, detail="Administrator bootstrap is disabled")
    enforce_auth_rate_limit(request, "bootstrap", 5)
    if db.query(User).count() != 0:
        raise HTTPException(status_code=409, detail="Bootstrap is already complete")
    user = User(
        username=payload.username.strip(),
        email=payload.email.strip().lower(),
        password_hash=password_hash(payload.password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": make_token(user), "token_type": "bearer", "user": user}


@router.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    enforce_auth_rate_limit(request, "login", 30)
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash) or (not user.is_active):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"access_token": make_token(user), "token_type": "bearer", "user": user}


@router.get("/api/auth/me", response_model=UserOut)
def me(user: Authenticated):
    return user


@router.post("/api/auth/users", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, admin: Admin, db: Session = Depends(get_db)):
    if db.query(User).filter((User.username == payload.username) | (User.email == payload.email.lower())).first():
        raise HTTPException(status_code=409, detail="Username or email already exists")
    user = User(
        username=payload.username.strip(),
        email=payload.email.strip().lower(),
        password_hash=password_hash(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.flush()
    write_audit(db, "user_created", None, f"username={user.username}; role={user.role}", admin.username)
    db.commit()
    db.refresh(user)
    return user


@router.get("/api/auth/users", response_model=list[UserOut])
def list_users(admin: Admin, db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at.desc()).all()
