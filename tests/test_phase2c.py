import unittest
from rcsa_engine.phase2c import evaluate_phase2c, InputValidationError

class Phase2CValidationTests(unittest.TestCase):
    def base(self):
        return dict(financial_rating="L", nfi={k: {"rating": "-", "evidence": "مراجعة مؤيدة بعدم التأثر"} for k in ("service", "reputation", "regulatory", "legal")},
                    esg={"status": "NO_DOCUMENTED_LINK", "pillars": [], "justification": "لا رابط مثبت في المستندات الحالية"},
                    acceptance_class=1, acceptance_rationale="المخاطرة منخفضة والضوابط كافية وفق مراجعة الموظف", corrective_action="")
    def test_max_and_high_key_risk(self):
        p=self.base(); p['nfi']['regulatory']={"rating":"VH", "evidence":"صفحة 4 تقرير التفتيش"}
        r=evaluate_phase2c(p); self.assertEqual((r['nfi_overall'],r['key_risk']),('VH','YES'))
    def test_missing_not_low_or_zero(self):
        p=self.base(); del p['nfi']['legal']
        r=evaluate_phase2c(p); self.assertEqual(r['nfi_overall'],'PENDING'); self.assertFalse(r['ready_for_export'])
    def test_financial_high_key_risk(self):
        p=self.base(); p['financial_rating']='H'
        self.assertEqual(evaluate_phase2c(p)['key_risk'],'YES')
    def test_no_evidence_rejected(self):
        p=self.base(); p['nfi']['service']={"rating":"M"}
        with self.assertRaises(InputValidationError): evaluate_phase2c(p)
    def test_no_unproven_esg(self):
        p=self.base(); p['esg']={"status":"ASSESSED", "pillars":["G"], "evidence":{}}
        with self.assertRaises(InputValidationError): evaluate_phase2c(p)
    def test_esg_multi_pillar(self):
        p=self.base(); p['taxonomy_l1_ar']="L1-05"; p['esg']={"status":"ASSESSED", "pillars":["E","S"], "evidence":{"E":"SOP §3","S":"Audit §4"}, "catalogue_ids":[12,21]}
        self.assertEqual(evaluate_phase2c(p)['esg_pillars'],['E','S'])
    def test_no_auto_acceptance(self):
        p=self.base(); p['acceptance_class']=None
        self.assertIn('acceptance_class',evaluate_phase2c(p)['pending_inputs'])
    def test_action_required(self):
        p=self.base(); p['acceptance_class']=3
        self.assertIn('corrective_action', evaluate_phase2c(p)['pending_inputs'])
    def test_no_mandatory_action_for_adequate_control(self):
        p=self.base(); p['corrective_action']='تطوير مطلوب'
        with self.assertRaises(InputValidationError): evaluate_phase2c(p)

if __name__=='__main__': unittest.main()
