import unittest
from rcsa_engine.esg_taxonomy import catalogue, normalize_l1_id, validate_esg_matches
from rcsa_engine.phase2c import InputValidationError, evaluate_phase2c


class ESGTaxonomyReferenceTests(unittest.TestCase):
    def test_catalogue_rows_and_pillars_are_exact(self):
        rows = catalogue()
        self.assertEqual(len(rows), 34)
        self.assertEqual([x['id'] for x in rows], list(range(1, 35)))
        self.assertEqual([sum(x['pillar'] == p for x in rows) for p in ('E', 'S', 'G')], [20, 7, 7])

    def test_operational_risk_l1_crosswalk_handles_legacy_excel_labels(self):
        self.assertEqual(normalize_l1_id('_8_تنفيذ وتوصيل وإدارة العمليات'), 'L1-08')
        self.assertEqual(normalize_l1_id('_5_ عملاء و منتجات'), 'L1-05')
        self.assertEqual(normalize_l1_id('_2_احتيال خارجي'), 'L1-02')
        self.assertEqual(normalize_l1_id('L1-07'), 'L1-07')
        self.assertIsNone(normalize_l1_id('unknown'))

    def test_matching_category_and_multidriver(self):
        result = validate_esg_matches({'pillars': ['E', 'S'], 'catalogue_ids': [12, 21]}, '_5_ عملاء و منتجات')
        self.assertEqual(set(x['pillar'] for x in result), {'E', 'S'})
        self.assertFalse(any(x['taxonomy_mismatch'] for x in result))

    def test_mismatch_requires_review_reason(self):
        with self.assertRaises(InputValidationError):
            validate_esg_matches({'pillars': ['G'], 'catalogue_ids': [33]}, '_8_تنفيذ وتوصيل وإدارة العمليات')
        r = validate_esg_matches({'pillars': ['G'], 'catalogue_ids': [33],
                                  'taxonomy_mismatch_reason': 'تفسير الاختلاف مستند إلى فحص السجلات وموافقة المدقق'}, 'L1-08')
        self.assertTrue(r[0]['taxonomy_mismatch'])

    def test_wrong_pillar_and_missing_reference_rejected(self):
        for esg in ({'pillars': ['E'], 'catalogue_ids': [33]},
                    {'pillars': ['E'], 'catalogue_ids': []},
                    {'pillars': ['E'], 'catalogue_ids': [99]},
                    {'pillars': ['G'], 'catalogue_ids': [33, 33]}):
            with self.subTest(esg=esg), self.assertRaises(InputValidationError):
                validate_esg_matches(esg, 'L1-02')

    def test_output_tracks_verified_catalogue_references(self):
        data = {
            'taxonomy_l1_ar': 'L1-05', 'financial_rating': 'M',
            'nfi': {d: {'rating': '-', 'evidence': 'مراجعة مستقلة لا يوجد أثر على هذا البعد'}
                    for d in ('service', 'reputation', 'regulatory', 'legal')},
            'esg': {'status': 'ASSESSED', 'pillars': ['S'], 'catalogue_ids': [21],
                    'evidence': {'S': 'مستند داعم واضح: تقرير تفتيش داخلي صفحة 5'}},
            'acceptance_class': 2, 'acceptance_rationale': 'مراجعة الضابط وفعاليته مدعومة بتقرير تفصيلي',
            'corrective_action': ''
        }
        result = evaluate_phase2c(data)
        self.assertTrue(result['ready_for_export'])
        self.assertEqual(result['esg_catalogue_matches'][0]['id'], 21)


if __name__ == '__main__':
    unittest.main()
