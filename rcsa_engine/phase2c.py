"""Phase 2C deterministic NFI, ESG evidence validation and reviewer risk acceptance.

No language-model scoring. Missing documentary evidence is never interpreted as zero.
The bank's four acceptance classes require a recorded human judgment rather than
an unsupported automatic decision from the financial rating alone.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping

RANK = {"L": 1, "M": 2, "H": 3, "VH": 4, "C": 5}
NFI_DIMENSIONS = ("service", "reputation", "regulatory", "legal")
ACCEPTANCE = {
    1: "مخاطرة مقبولة / ضوابط رقابية كافية",
    2: "مخاطرة مقبولة / ضوابط رقابية كافية ولكن يمكن تجويد الضوابط مستقبلا بغرض تحسين الخدمة/ الأعمال",
    3: "مخاطرة غير مقبولة حيث أن الضوابط الرقابية تحتاج تطوير",
    4: "مخاطرة غير مقبولة حيث لا يوجد ضوابط رقابية",
}


class InputValidationError(ValueError):
    """Invalid or unsupported reviewer input."""


def evaluate_phase2c(data: Mapping[str, Any]) -> Dict[str, Any]:
    nfi = data.get("nfi") or {}
    if not isinstance(nfi, dict):
        raise InputValidationError("nfi must be an object")
    nfi_values: Dict[str, str] = {}
    pending = []
    for dim in NFI_DIMENSIONS:
        item = nfi.get(dim)
        if not isinstance(item, dict):
            item = {}
        val = item.get("rating", "PENDING")
        if val is None or val == "":
            val = "PENDING"
        if val not in (*RANK.keys(), "-", "PENDING"):
            raise InputValidationError(f"invalid {dim} rating: {val!r}")
        evidence = str(item.get("evidence") or "").strip()
        if val in RANK and not evidence:
            raise InputValidationError(f"{dim} requires source evidence")
        if val == "-" and not evidence:
            raise InputValidationError(f"{dim} requires justification that it is unaffected")
        nfi_values[dim] = val
        if val == "PENDING":
            pending.append(f"nfi.{dim}")
    assessed = [v for v in nfi_values.values() if v in RANK]
    overall = max(assessed, key=RANK.get) if assessed else "-"
    if pending:
        overall = "PENDING"

    financial = data.get("financial_rating")
    if financial not in (*RANK.keys(), "PENDING", None):
        raise InputValidationError("financial_rating must be L/M/H/VH/C or PENDING")
    key_risk = "YES" if any(
        v in ("H", "VH", "C") for v in (financial, overall, *nfi_values.values())
    ) else "PENDING" if (financial is None or financial == "PENDING" or overall == "PENDING") else "NO"

    esg = data.get("esg") or {}
    if not isinstance(esg, dict):
        raise InputValidationError("esg must be an object")
    pillars = esg.get("pillars", [])
    if not isinstance(pillars, list) or len(pillars) != len(set(pillars)) or any(x not in ("E", "S", "G") for x in pillars):
        raise InputValidationError("esg.pillars must contain distinct E/S/G values")
    esg_evidence = esg.get("evidence") or {}
    if not isinstance(esg_evidence, dict):
        raise InputValidationError("esg.evidence must be an object")
    if any(not str(esg_evidence.get(p) or "").strip() for p in pillars):
        raise InputValidationError("each selected ESG pillar requires evidence")
    esg_status = esg.get("status", "PENDING")
    if esg_status not in ("PENDING", "ASSESSED", "NO_DOCUMENTED_LINK"):
        raise InputValidationError("invalid ESG status")
    if esg_status == "ASSESSED" and not pillars:
        raise InputValidationError("ASSESSED requires at least one evidenced ESG pillar")
    if esg_status == "NO_DOCUMENTED_LINK" and (pillars or not str(esg.get("justification") or "").strip()):
        raise InputValidationError("NO_DOCUMENTED_LINK requires a justification and no selected pillars")
    esg_matches = []
    if esg_status == "ASSESSED":
        from rcsa_engine.esg_taxonomy import validate_esg_matches
        esg_matches = validate_esg_matches(esg, data.get("taxonomy_l1_ar"))
    if esg_status == "PENDING":
        pending.append("esg")

    choice = data.get("acceptance_class")
    if choice in (None, "", "PENDING"):
        choice = None
        pending.append("acceptance_class")
    elif type(choice) is not int or choice not in ACCEPTANCE:
        raise InputValidationError("acceptance_class must be one of 1, 2, 3, 4")
    rationale = str(data.get("acceptance_rationale") or "").strip()
    if choice is not None and not rationale:
        raise InputValidationError("acceptance decision requires a documented reviewer rationale")
    corrective = str(data.get("corrective_action") or "").strip()
    if choice in (3, 4) and not corrective:
        pending.append("corrective_action")
    if choice == 1 and corrective:
        raise InputValidationError("mandatory corrective action must be empty for an adequate-control accepted risk")

    return {
        "status": "COMPLETE" if not pending else "PENDING_INPUT",
        "nfi_dimensions": nfi_values,
        "nfi_overall": overall,
        "key_risk": key_risk,
        "esg_status": esg_status,
        "esg_pillars": pillars,
        "esg_catalogue_matches": esg_matches,
        "esg_taxonomy_override_required": any(m["taxonomy_mismatch"] for m in esg_matches),
        "acceptance_class": choice,
        "acceptance_label_ar": ACCEPTANCE.get(choice),
        "pending_inputs": pending,
        "ready_for_export": not pending and financial in RANK and key_risk in ("YES", "NO"),
    }
