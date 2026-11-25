"""Deterministic Mane Maarga agent orchestration prototype.

No external LLM is connected. Agents produce evidence-backed suggestions; all
financial, eligibility, permission and irreversible actions remain human-gated.
"""

from typing import Any

AGENT_VERSION = "0.1.0-deterministic"


def run_case_agents(
    case: Any, documents: list[Any], extractions: list[Any], funding: list[Any], stages: list[Any]
) -> dict:
    document_agent = _document_agent(documents, extractions)
    finance_agent = _finance_agent(case, funding)
    construction_agent = _construction_agent(stages)
    recovery_agent = _recovery_agent(case, document_agent, finance_agent, construction_agent)
    specialists = [document_agent, finance_agent, construction_agent, recovery_agent]

    priorities = []
    priorities.extend(document_agent["recommended_actions"])
    priorities.extend(finance_agent["recommended_actions"])
    priorities.extend(construction_agent["recommended_actions"])
    priorities.extend(recovery_agent["recommended_actions"])
    priorities = _dedupe(priorities)

    return {
        "case_id": case.id,
        "agent_version": AGENT_VERSION,
        "mode": "deterministic_prototype",
        "disclaimer": "These are workflow suggestions, not legal, scheme-eligibility, credit, or payment decisions. Verify evidence and obtain beneficiary approval before submissions or payments.",
        "case_manager": {
            "summary": f"Case for {case.beneficiary_name} in {case.village}, {case.taluk}. Current status: {case.status}.",
            "case_status": case.status,
            "specialists": specialists,
            "priority_actions": priorities,
        },
        "approval_gate": {
            "required_for": [
                "government_or_bank_submission",
                "financial_offer_or_loan",
                "payment_or_disbursement",
                "case_status_change",
            ],
            "approved": False,
            "message": "No external action was performed. Operator review and beneficiary consent are required.",
        },
    }


def _document_agent(documents, extractions):
    extraction_by_doc = {e.document_id: e for e in extractions}
    missing = []
    review = []
    for d in documents:
        extraction = extraction_by_doc.get(d.id)
        if not extraction:
            missing.append(d.original_name)
        elif extraction.extraction_status == "review_required":
            review.append(d.original_name)
    actions = []
    if missing:
        actions.append(
            {
                "agent": "document_agent",
                "priority": "high",
                "action": "Run extraction and review uploaded documents",
                "reason": f"{len(missing)} uploaded document(s) have no extraction record.",
                "evidence": missing,
            }
        )
    if review:
        actions.append(
            {
                "agent": "document_agent",
                "priority": "high",
                "action": "Resolve document mismatch flags",
                "reason": "Extraction indicates fields requiring human review.",
                "evidence": review,
            }
        )
    if not documents:
        actions.append(
            {
                "agent": "document_agent",
                "priority": "high",
                "action": "Collect required land and sanction documents",
                "reason": "No documents are attached to this case yet.",
                "evidence": [],
            }
        )
    return {
        "agent": "document_agent",
        "status": "attention_required" if actions else "no_action",
        "findings": {"document_count": len(documents), "not_extracted": missing, "review_required": review},
        "recommended_actions": actions,
    }


def _finance_agent(case, funding):
    cost = float(case.estimated_cost or 0)
    sanctioned = float(case.sanctioned_amount or 0)
    confirmed = sum(float(f.amount or 0) for f in funding if f.status in ("confirmed", "received"))
    proposed = sum(float(f.amount or 0) for f in funding if f.status == "proposed")
    gap = max(0, cost - sanctioned - confirmed)
    actions = []
    if cost <= 0:
        actions.append(
            {
                "agent": "finance_agent",
                "priority": "medium",
                "action": "Record a construction cost estimate",
                "reason": "A funding gap cannot be estimated without a cost estimate.",
                "evidence": [],
            }
        )
    elif gap > 0:
        actions.append(
            {
                "agent": "finance_agent",
                "priority": "high",
                "action": "Review funding gap and stage-wise cash needs",
                "reason": f"Estimated unfunded amount is ₹{gap:,.0f}; proposed funding is not counted as confirmed.",
                "evidence": [],
            }
        )
    if proposed:
        actions.append(
            {
                "agent": "finance_agent",
                "priority": "medium",
                "action": "Verify proposed funding sources",
                "reason": f"₹{proposed:,.0f} is proposed and not treated as confirmed/received.",
                "evidence": [],
            }
        )
    return {
        "agent": "finance_agent",
        "status": "attention_required" if actions else "no_action",
        "findings": {
            "estimated_cost": cost,
            "sanctioned_amount": sanctioned,
            "confirmed_or_received_funding": confirmed,
            "proposed_funding_not_counted": proposed,
            "estimated_gap": gap,
        },
        "recommended_actions": actions,
    }


def _construction_agent(stages):
    stalled = [s for s in stages if s.status in ("planned", "delayed")]
    incomplete = [s for s in stages if s.status not in ("completed",)]
    actions = []
    if not stages:
        actions.append(
            {
                "agent": "construction_agent",
                "priority": "medium",
                "action": "Create a construction stage plan",
                "reason": "No stages are recorded for this case.",
                "evidence": [],
            }
        )
    elif stalled:
        actions.append(
            {
                "agent": "construction_agent",
                "priority": "medium",
                "action": "Review planned or delayed construction stages",
                "reason": f"{len(stalled)} stage(s) need progress review.",
                "evidence": [s.stage_name for s in stalled],
            }
        )
    return {
        "agent": "construction_agent",
        "status": "attention_required" if actions else "no_action",
        "findings": {
            "stage_count": len(stages),
            "incomplete_stages": [s.stage_name for s in incomplete],
            "planned_or_delayed": [s.stage_name for s in stalled],
        },
        "recommended_actions": actions,
    }


def _recovery_agent(case, document, finance, construction):
    issues = document["findings"]["review_required"] + document["findings"]["not_extracted"]
    if finance["findings"]["estimated_gap"] > 0:
        issues.append("funding gap")
    issues.extend(construction["findings"]["planned_or_delayed"])
    actions = []
    if issues:
        actions.append(
            {
                "agent": "recovery_agent",
                "priority": "high",
                "action": "Create a recovery checklist with owner and due date",
                "reason": "Multiple unresolved blockers may delay the case.",
                "evidence": _dedupe(issues),
            }
        )
    return {
        "agent": "recovery_agent",
        "status": "attention_required" if actions else "no_action",
        "findings": {"blocker_count": len(_dedupe(issues)), "blockers": _dedupe(issues)},
        "recommended_actions": actions,
    }


def _dedupe(items):
    seen = set()
    result = []
    for item in items:
        if isinstance(item, dict):
            key = (item.get("action"), tuple(item.get("evidence", [])))
        else:
            key = item
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result
