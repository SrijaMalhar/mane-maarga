"""Unit economics and the operator-income check from the review of the plan."""
from __future__ import annotations


def operator_income(houses_sanctioned: int, panchayats: int, per_case_pay: float, share: float) -> dict:
    per_gp = houses_sanctioned / panchayats
    families = per_gp * share
    return {"houses_per_panchayat": round(per_gp), "families": round(families, 1),
            "total_pay": round(families * per_case_pay)}


def cases_needed_per_month(target_monthly: float, per_case_pay: float) -> float:
    return target_monthly / per_case_pay


def segment_a_contribution(operator_pay: float = 500) -> float:
    revenue = 1500 + 0.4 * 1_00_000 * 0.015 + 0.4 * 2_00_000 * 0.015  # state fee + gap-loan fee + kit margin
    cost = 450 + operator_pay + 150
    return revenue - cost
