from sqlalchemy import String, Integer, Numeric, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from .database import Base

class Case(Base):
    __tablename__ = "cases"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    beneficiary_name: Mapped[str] = mapped_column(String(160))
    village: Mapped[str] = mapped_column(String(160))
    taluk: Mapped[str] = mapped_column(String(160))
    phone_last4: Mapped[str] = mapped_column(String(4), default="")
    status: Mapped[str] = mapped_column(String(40), default="intake")
    sanctioned_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    estimated_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    existing_loan: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    gap_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
