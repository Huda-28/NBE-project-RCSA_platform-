import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBoilerplateOrCoverChunk,
  extractControlDetailsFromText,
  extractRiskDetailsFromText,
  extractMatchedPatternsFromFullDocument,
  stripLocationMarkers,
  stripControlMechanismFromDescription,
  snapToOfficialReferenceAnchor,
  normalizeOfficialControlFrequency,
  normalizeOfficialStrategicObjective,
  OFFICIAL_NBE_STRATEGIC_OBJECTIVES,
  OFFICIAL_FINANCIAL_ANCHORS_EGP,
  OFFICIAL_NBE_CONTROL_FREQUENCIES,
} from '../src/server/proposal-extractor.js';

test('stripLocationMarkers removes page/section coordinate noise cleanly', () => {
  assert.equal(stripLocationMarkers('صفحة 1 • مقطع (1)'), '');
  assert.equal(stripLocationMarkers('1.3 آلية تفادي المخاطر (صفحة 1)'), '1.3 آلية تفادي المخاطر');
  assert.equal(stripLocationMarkers('PDF section 2 • مقطع (4)'), '');
});

test('isBoilerplateOrCoverChunk skips cover title and preface when document has multiple chunks', () => {
  assert.equal(isBoilerplateOrCoverChunk('دليل اجراءات العمل الافتراضية لأعمال الحوالات', 20), true);
  assert.equal(
    isBoilerplateOrCoverChunk(
      'المقدمة والأهداف العامة للوثيقة يهدف هذا الدليل التشغيلي إلى وضع إطار عمل معياري شامل وموحد لتنفيذ ومراقبة وتسوية كافة التحويلات المالية',
      20
    ),
    true
  );
  assert.equal(
    isBoilerplateOrCoverChunk(
      '• فحص قوائم الحظر (AML/AML System): تمرير كافة التحويلات عبر نظام الفحص الفوري (Sanction Screening Engine) للكشف عن الأشخاص المدرجين بقوائم الحظر.',
      20
    ),
    false
  );
});

test('extractControlDetailsFromText & extractRiskDetailsFromText produce named controls with NBE Page 2 types and real risks without location wrappers', () => {
  const sanctionChunk =
    '• فحص قوائم الحظر (AML/AML System): تمرير كافة التحويلات عبر نظام الفحص الفوري (Sanction Screening Engine) للكشف عن الأسماء والأشخاص المدرجين بقوائم الحظر (OFAC, UN, EU, البنك المركزي).';
  const ctrl = extractControlDetailsFromText(sanctionChunk, 'صفحة 1 • مقطع (8)');
  const risk = extractRiskDetailsFromText(
    sanctionChunk,
    'إدارة التحويلات المركزية والتسويات وسويفت',
    ctrl,
    'صفحة 1 • مقطع (8)'
  );

  assert.ok(ctrl.control_name_ar.includes('الحظر') || ctrl.control_name_ar.includes('Sanction'));
  assert.equal(ctrl.design_classification, 'PREVENTIVE');
  assert.equal(ctrl.automation_level, 'AUTOMATED');
  assert.equal(ctrl.control_type_label_ar, 'ضوابط رقابية مانعة');
  assert.equal(ctrl.control_method_label_ar, 'آلي');
  assert.ok(!ctrl.description_ar.includes('صفحة 1'));
  assert.ok(!ctrl.description_ar.includes('مقطع'));
  assert.ok(!ctrl.description_ar.includes('(ضابط رقابي'));

  assert.ok(!risk.process_name_ar.includes('صفحة 1'));
  assert.ok(!risk.risk_title_ar.includes('صفحة 1'));
  assert.ok(!risk.description_ar.includes('مخاطرة مستنبطة من تحليل المستند'));
  assert.ok(!risk.description_ar.startsWith('احتمال '));
  assert.ok(risk.risk_title_ar.includes('الحظر') || risk.risk_title_ar.includes('غسل الأموال'));
});

test('extractControlDetailsFromText handles Nostro/GL reconciliation and generic unseen clauses cleanly', () => {
  const nostroChunk =
    '• مطابقة حسابات النوسترو (Nostro Reconciliation): إجراء المطابقة اليومية لحسابات البنوك المراسلة (MT950/MT940) مع حسابات الأستاذ العام ومتابعة الفروقات المعلقة.';
  const ctrl = extractControlDetailsFromText(nostroChunk);
  assert.equal(ctrl.design_classification, 'DETECTIVE');
  assert.equal(ctrl.control_type_label_ar, 'ضوابط رقابية كاشفة');
  assert.ok(ctrl.control_name_ar.includes('النوسترو') || ctrl.control_name_ar.includes('المطابقة'));

  const genericClause =
    '• التحقق من سقف البطاقة: مراجعة الحد الائتماني اليومي للبطاقة عبر النظام الآلي قبل تمرير طلب الزيادة.';
  const genericCtrl = extractControlDetailsFromText(genericClause, 'صفحة 3 • مقطع (2)');
  const genericRisk = extractRiskDetailsFromText(
    genericClause,
    'إدارة البطاقات',
    genericCtrl,
    'صفحة 3 • مقطع (2)'
  );
  assert.ok(genericCtrl.control_name_ar.includes('التحقق من سقف البطاقة'));
  assert.ok(!genericCtrl.description_ar.includes('صفحة 3'));
  assert.ok(genericRisk.process_name_ar.includes('التحقق من سقف البطاقة'));
  assert.ok(!genericRisk.description_ar.includes('مخاطرة مستنبطة من تحليل المستند'));
  assert.ok(genericRisk.controls.length >= 2);
});

test('NBE Methodology helpers strictly enforce anchors, control frequencies, strategic objectives, and clean control text', () => {
  assert.equal(
    stripControlMechanismFromDescription('(ضابط رقابي وقائي - آلي) تمرير التحويلات عبر نظام الفحص الفوري'),
    'تمرير التحويلات عبر نظام الفحص الفوري'
  );
  assert.equal(
    stripControlMechanismFromDescription('(Semi-Automated / Preventive) مطابقة التوقيعات والبيانات'),
    'مطابقة التوقيعات والبيانات'
  );

  // Official reference anchors only (never 250,000)
  assert.equal(snapToOfficialReferenceAnchor(50000), 50000);
  assert.equal(snapToOfficialReferenceAnchor(250000), 151000);
  assert.equal(snapToOfficialReferenceAnchor(501000), 501000);
  assert.equal(snapToOfficialReferenceAnchor(1800000), 1501000);
  assert.equal(snapToOfficialReferenceAnchor(4000000), 3001000);

  // Official 7 control frequencies only (no Per Transaction / Per Event)
  assert.equal(normalizeOfficialControlFrequency('Per Transaction'), 'Multiple times a day\nعدة مرات في اليوم');
  assert.equal(normalizeOfficialControlFrequency('Per Event'), 'Ad-hoc\nوفقاً والحالة');
  assert.equal(normalizeOfficialControlFrequency('يومي'), 'Daily\nيومياً');

  // Official 5 NBE Strategic Objectives only
  for (const sample of ['الكفاءة والأمان', 'التركيز على العملاء', 'التحول الرقمي', 'الشمول المالي', 'النمو المستدام', 'نص عام']) {
    const obj = normalizeOfficialStrategicObjective(sample);
    assert.ok((OFFICIAL_NBE_STRATEGIC_OBJECTIVES as readonly string[]).includes(obj));
  }
});

test('extractMatchedPatternsFromFullDocument covers all 8 core Transfers SOP operational risks with NBE QA compliance', () => {
  const transfersSopCorpus = `
    دليل إجراءات العمل الافتراضية لأعمال الحوالات
    1. التحويلات الصادرة (Outgoing Transfers / MT103 / PACS.008): التحقق من صحة رقم الحساب والآيبان IBAN ومبدأ الصلاحيات المزدوجة (Maker-Checker) وقطع الرسائل في مواعيد القطع (Cut-off Times).
    2. التحويلات الواردة (Incoming Transfers): استلام رسائل سويفت الواردة ومطابقة بيانات المستفيد وتطبيق STP أو الإضافة اليدوية لحساب العميل.
    3. الاستفسارات والمرتجعات والتعديلات والالغاءات (Queries / Investigations / MT199 / MT192): متابعة طلبات الاستفسار والرد ضمن SLA وعدم إغفال تنفيذ الطلبات.
    4. مطابقة حسابات النوسترو وحسابات الأستاذ العام (Nostro / GL Reconciliation / MT950 / MT940): حصر الفروقات المعلقة والترحيل المحاسبي.
    5. فحص قوائم الحظر ومكافحة غسل الأموال (Sanction Screening / OFAC / AML): حجز المعاملات المشتبه بها وإخطار قطاع الامتثال.
    6. الوقاية من الاحتيال الخارجي والتزوير ومعاودة الاتصال (Call-Back Verification): التحقق من صحة التوقيعات والرسائل الواردة عبر القنوات الإلكترونية.
    7. القيود المحاسبية والترحيل وتحصيل العمولات والمصاريف (Accounting Entries / GL Posting / FX Rates).
    8. تجميد الأموال وفك التجميد (Funds Freeze / Release): حظر فك تجميد أي مبلغ إلا بموافقة خطية رسمية من قطاع الامتثال.
  `;

  const extracted = extractMatchedPatternsFromFullDocument(transfersSopCorpus, 8);
  assert.equal(extracted.length, 8, 'Must extract all 8 core operational risks from Transfers SOP');

  const validAnchors = new Set<number>(Object.values(OFFICIAL_FINANCIAL_ANCHORS_EGP));
  const validFreqs = new Set<string>(OFFICIAL_NBE_CONTROL_FREQUENCIES);
  const validObjectives = new Set<string>(OFFICIAL_NBE_STRATEGIC_OBJECTIVES);

  const distinctInherentFreqs = new Set<string>();
  const correctiveActions = new Set<string>();
  let esgAssessedCount = 0;

  for (const r of extracted) {
    // 1. Direct NBE risk wording (never starts with "احتمال ")
    assert.ok(!r.description_ar.trim().startsWith('احتمال '), `Risk wording must not start with احتمال: ${r.description_ar}`);

    // 2. Official strategic objective
    assert.ok(validObjectives.has(r.strategic_objective_ar), `Invalid strategic objective: ${r.strategic_objective_ar}`);

    // 3. Official financial reference anchor only (never 250,000)
    assert.ok(validAnchors.has(r.reference_anchor_egp), `Non-official anchor: ${r.reference_anchor_egp}`);
    assert.notEqual(r.reference_anchor_egp, 250000);

    // 4. Multiple controls per risk (>= 2) with clean descriptions and official frequencies
    assert.ok(r.controls.length >= 2, `Risk ${r.pattern_id} must have at least 2 controls`);
    for (const c of r.controls) {
      assert.ok(validFreqs.has(c.control_frequency_raw), `Non-official control frequency: ${c.control_frequency_raw}`);
      assert.ok(!/per\s*transaction|per\s*event/i.test(c.control_frequency_raw));
      assert.ok(!c.description_ar.includes('(ضابط رقابي'), `Control description contains mechanism prefix: ${c.description_ar}`);
      assert.ok(!/semi[\s-]*automated|preventive|detective/i.test(c.description_ar), `Control description contains English mechanism text: ${c.description_ar}`);
    }

    // 5. Class 1 acceptance MUST have empty corrective action; non-Class-1 MUST have unique specific action
    if (r.acceptance_class === 1) {
      assert.equal(r.corrective_action_ar, '', `Class 1 risk ${r.pattern_id} must have empty corrective action`);
    } else {
      assert.ok(r.corrective_action_ar.trim().length > 15, `Class ${r.acceptance_class} risk ${r.pattern_id} needs specific corrective action`);
      assert.ok(!correctiveActions.has(r.corrective_action_ar), `Duplicate corrective action found: ${r.corrective_action_ar}`);
      correctiveActions.add(r.corrective_action_ar);
    }

    // 6. Track inherent frequency diversity and ESG assessment coverage
    distinctInherentFreqs.add(r.inherent_frequency_text);
    if (r.esg.status === 'ASSESSED') {
      esgAssessedCount += 1;
      assert.ok(r.esg.pillars.length > 0);
      assert.ok(r.esg.catalogue_ids.length > 0);
    }
  }

  assert.ok(distinctInherentFreqs.size >= 3, `Expected varied inherent frequencies, got: ${[...distinctInherentFreqs].join(', ')}`);
  assert.ok(esgAssessedCount >= 4, `Expected at least 4 ESG-assessed risks, got ${esgAssessedCount}`);
});
