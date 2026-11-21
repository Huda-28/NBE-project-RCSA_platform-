"""Verified ESG CBE operational-risk reference mapping (34 user-supplied rows).

This module validates reviewer selections; it does NOT infer ESG from general
fraud/control vocabulary and does NOT substitute for document understanding.
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from typing import Any, Mapping

CATALOG_PATH = Path(__file__).resolve().parents[1] / 'reference_data' / 'ESG_CBE_OpRisk_Categories_34.json'

# Exact source-column terminology is intentionally preserved in the catalogue.
# Explicit crosswalk to the operational-risk taxonomy supplied for this project.
CBE_L1_TO_TAXONOMY_ID = {
    'وسائل احتيال داخلية': 'L1-01',
    'وسائل احتيال خارجية': 'L1-02',
    'وسائل احتيال على بطاقات الائتمان': 'L1-03',
    'مخالفة قوانين العمل والسلامة والصحة المهنية': 'L1-04',
    'الممارسات الخاطئة في حق عملاء البنك': 'L1-05',
    'الإضرار بالأصول المادية للبنك': 'L1-06',
    'تعطل العمل وإخفاق النظم': 'L1-07',
    'القصور في إدارة وتنفيذ العمليات': 'L1-08',
}
TAXONOMY_L1_LABELS = {
    'L1-01': 'احتيال داخلي',
    'L1-02': 'احتيال خارجي',
    'L1-03': 'أساليب الاحتيال ببطاقات الائتمان',
    'L1-04': 'مخالفة قوانين العمل والسلامة المهنية',
    'L1-05': 'ممارسات غير سليمة تمس حقوق عملاء البنك',
    'L1-06': 'الأضرار التي تلحق بالأصول المادية',
    'L1-07': 'توقف الأعمال وتعطل الأنظمة',
    'L1-08': 'تنفيذ المعاملات وتسليمها وإدارتها',
}


def catalogue() -> list[dict]:
    data = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))['entries']
    if len(data) != 34 or {e['id'] for e in data} != set(range(1, 35)):
        raise ValueError('Official ESG mapping catalogue is incomplete')
    for entry in data:
        if entry['l1_ar'] not in CBE_L1_TO_TAXONOMY_ID:
            raise ValueError(f"Unknown ESG L1 category: {entry['l1_ar']}")
    return data


def normalize_l1_id(value: Any) -> str | None:
    text = str(value or '').strip()
    if not text:
        return None
    if text in TAXONOMY_L1_LABELS:
        return text
    legacy = re.match(r'^_([1-8])_', text)
    if legacy:
        return f'L1-0{legacy.group(1)}'
    embedded = re.match(r'^(L1-0[1-8])(?:\b|\s|\s*[-–—:])', text)
    if embedded:
        return embedded.group(1)
    for code, label in TAXONOMY_L1_LABELS.items():
        if text == label:
            return code
    return CBE_L1_TO_TAXONOMY_ID.get(text)


def validate_esg_matches(esg: Mapping[str, Any], selected_l1: Any) -> list[dict]:
    """Validate source-backed catalogue examples against the risk's independently selected L1.

    Multiple examples may describe a pillar; one recorded match per selected pillar
    is necessary. A reviewer override is allowed only with an explicit mismatch
    explanation, and exposed in result for downstream review. Not an AI inference.
    """
    from rcsa_engine.phase2c import InputValidationError
    selected = list(esg.get('pillars') or [])
    ids = esg.get('catalogue_ids') or []
    if not isinstance(ids, list) or any(type(i) is not int for i in ids) or len(ids) != len(set(ids)):
        raise InputValidationError('esg.catalogue_ids must be unique integer catalogue references')
    entries = {row['id']: row for row in catalogue()}
    if any(i not in entries for i in ids):
        raise InputValidationError('unknown ESG catalogue reference')
    if selected and not ids:
        raise InputValidationError('ESG classification requires relevant evidence-backed catalogue references')
    if set(entries[i]['pillar'] for i in ids) != set(selected):
        raise InputValidationError('ESG catalogue selections must match exactly the chosen E/S/G pillars')
    l1_id = normalize_l1_id(selected_l1)
    if not l1_id:
        raise InputValidationError('Risk L1 operational taxonomy must be selected before ESG classification')
    justification = str(esg.get('taxonomy_mismatch_reason') or '').strip()
    matched = []
    for i in ids:
        row = entries[i]
        expected_id = CBE_L1_TO_TAXONOMY_ID[row['l1_ar']]
        mismatch = expected_id != l1_id
        if mismatch and len(justification) < 20:
            raise InputValidationError(f'ESG catalogue reference {i} conflicts with risk L1; reviewer mismatch justification required')
        matched.append({**row, 'taxonomy_l1_id': expected_id, 'risk_l1_id': l1_id,
                        'taxonomy_mismatch': mismatch})
    return matched
