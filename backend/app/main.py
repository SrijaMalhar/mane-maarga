from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from .database import Base, engine, get_db
from .models import Case
from .schemas import CaseCreate, CaseUpdate, CaseOut

Base.metadata.create_all(bind=engine)
app = FastAPI(title="Sooru API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def calculate_gap(case):
    # Prototype estimate only; scheme/lender rules must be verified before use.
    return max(0, float(case.estimated_cost or 0) - float(case.sanctioned_amount or 0) - float(case.existing_loan or 0))

@app.get("/health")
def health():
    return {"status": "ok", "service": "sooru-api"}

@app.get("/api/cases", response_model=list[CaseOut])
def list_cases(db: Session = Depends(get_db)):
    return db.query(Case).order_by(Case.created_at.desc()).all()

@app.post("/api/cases", response_model=CaseOut, status_code=201)
def create_case(payload: CaseCreate, db: Session = Depends(get_db)):
    case = Case(**payload.model_dump())
    case.gap_amount = calculate_gap(case)
    db.add(case)
    db.commit()
    db.refresh(case)
    return case

@app.get("/api/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case

@app.patch("/api/cases/{case_id}", response_model=CaseOut)
def update_case(case_id: int, payload: CaseUpdate, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(case, key, value)
    case.gap_amount = calculate_gap(case)
    db.commit()
    db.refresh(case)
    return case

@app.delete("/api/cases/{case_id}", status_code=204)
def delete_case(case_id: int, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    db.delete(case)
    db.commit()
