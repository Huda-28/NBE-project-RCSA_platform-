import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

function parseCSVLine(line: string): string[] {
  const res: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      res.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  res.push(cur);
  return res;
}

/**
 * Idempotently creates reference catalogue tables and registers authoritative Phase 2 reference sources
 * without duplicating records or altering Phase 1 assessments.
 */
export function registerReferenceSources(db: Database.Database): void {
  db.exec(`
    -- 13. Official Operational Risk Taxonomy (L1-L3)
    CREATE TABLE IF NOT EXISTS risk_taxonomy (
      taxonomy_id TEXT PRIMARY KEY,
      parent_taxonomy_id TEXT,
      level TEXT CHECK(level IN ('L1', 'L2', 'L3')) NOT NULL,
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      l1_id TEXT NOT NULL,
      l1_en TEXT NOT NULL,
      l1_ar TEXT NOT NULL,
      l2_id TEXT,
      l2_en TEXT,
      l2_ar TEXT,
      l3_id TEXT,
      l3_en TEXT,
      l3_ar TEXT
    );

    -- 14. Official ESG Reference Catalogue (CBE OpRisk Mapping)
    CREATE TABLE IF NOT EXISTS esg_catalogue (
      esg_id TEXT PRIMARY KEY,
      item_number INTEGER NOT NULL UNIQUE,
      risk_name_ar TEXT NOT NULL,
      esg_driver TEXT CHECK(esg_driver IN ('E', 'S', 'G')) NOT NULL,
      cbe_l1_ar TEXT NOT NULL,
      cbe_l2_ar TEXT NOT NULL
    );

    -- 15. Structured Historical Incidents Registry
    CREATE TABLE IF NOT EXISTS historical_incidents (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      incident_code TEXT NOT NULL,
      event_summary_ar TEXT NOT NULL,
      incident_detail_ar TEXT NOT NULL,
      net_loss_amount REAL NOT NULL,
      risk_category_l1_raw TEXT NOT NULL,
      mapped_l1_id TEXT NOT NULL,
      source_document_id TEXT NOT NULL REFERENCES documents(id),
      UNIQUE(unit_id, incident_code)
    );

    -- 16. Structured Audit Findings Registry
    CREATE TABLE IF NOT EXISTS audit_findings (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      finding_number INTEGER NOT NULL,
      title_ar TEXT NOT NULL,
      details_ar TEXT NOT NULL,
      root_causes_ar TEXT NOT NULL,
      impact_ar TEXT NOT NULL,
      corrective_action_ar TEXT NOT NULL,
      source_document_id TEXT NOT NULL REFERENCES documents(id),
      UNIQUE(unit_id, finding_number)
    );

    -- 17. Business Unit Source Coverage & Missing-vs-Zero Registry
    CREATE TABLE IF NOT EXISTS bu_source_coverage (
      unit_id TEXT PRIMARY KEY REFERENCES business_units(id),
      tier TEXT CHECK(tier IN ('DATA_READY_BU', 'PARTIAL_DATA_NEW_BU')) NOT NULL,
      sop_status TEXT CHECK(sop_status IN ('AVAILABLE', 'MISSING_DOCUMENT')) NOT NULL,
      incidents_status TEXT CHECK(incidents_status IN ('AVAILABLE', 'MISSING_DOCUMENT', 'CONFIRMED_ZERO')) NOT NULL,
      audit_findings_status TEXT CHECK(audit_findings_status IN ('AVAILABLE', 'MISSING_DOCUMENT', 'CONFIRMED_ZERO')) NOT NULL,
      rcsa_register_status TEXT CHECK(rcsa_register_status IN ('AVAILABLE_WORKBOOK', 'DERIVED_FROM_SOURCES_REQUIRED', 'EMPTY_INITIAL_STATE')) NOT NULL,
      sop_procedures_count INTEGER NOT NULL DEFAULT 0,
      incidents_count INTEGER,
      audit_findings_count INTEGER,
      workbook_risks_count INTEGER NOT NULL DEFAULT 0,
      workbook_controls_count INTEGER NOT NULL DEFAULT 0,
      notes_ar TEXT
    );
  `);

  // 1. Register Risk Taxonomy (84 entries from reference_data/Risk_Taxonomy__1_Risk_Taxonomy_L1_L3.csv)
  const taxonomyCsvPath = path.resolve('reference_data', 'Risk_Taxonomy__1_Risk_Taxonomy_L1_L3.csv');
  if (fs.existsSync(taxonomyCsvPath)) {
    const lines = fs.readFileSync(taxonomyCsvPath, 'utf-8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const insertTax = db.prepare(`
      INSERT OR IGNORE INTO risk_taxonomy (
        taxonomy_id, parent_taxonomy_id, level, name_en, name_ar,
        l1_id, l1_en, l1_ar, l2_id, l2_en, l2_ar, l3_id, l3_en, l3_ar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const taxId = cols[1]?.trim();
      if (!taxId || taxId === 'Taxonomy ID') continue;
      insertTax.run(
        taxId,
        cols[2]?.trim() || null,
        cols[3]?.trim(),
        cols[4]?.trim(),
        cols[5]?.trim(),
        cols[6]?.trim(),
        cols[7]?.trim(),
        cols[8]?.trim(),
        cols[9]?.trim() || null,
        cols[10]?.trim() || null,
        cols[11]?.trim() || null,
        cols[12]?.trim() || null,
        cols[13]?.trim() || null,
        cols[14]?.trim() || null
      );
    }
  }

  // 2. Register ESG Catalogue (34 entries from reference_data/ESG_Catalogue__1_ESG.csv)
  const esgCsvPath = path.resolve('reference_data', 'ESG_Catalogue__1_ESG.csv');
  if (fs.existsSync(esgCsvPath)) {
    const lines = fs.readFileSync(esgCsvPath, 'utf-8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const insertEsg = db.prepare(`
      INSERT OR IGNORE INTO esg_catalogue (
        esg_id, item_number, risk_name_ar, esg_driver, cbe_l1_ar, cbe_l2_ar
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const num = parseInt(cols[1]?.trim() || '', 10);
      const driver = cols[3]?.trim();
      if (!isNaN(num) && (driver === 'E' || driver === 'S' || driver === 'G')) {
        const esgId = `ESG-${String(num).padStart(2, '0')}`;
        insertEsg.run(
          esgId,
          num,
          cols[2]?.trim(),
          driver,
          cols[4]?.trim(),
          cols[5]?.trim()
        );
      }
    }
  }

  // 3. Register Authoritative Documents (Deduplicated: 7 distinct PDFs + 1 RCSA Workbook template)
  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO documents (id, unit_id, filename, file_type, file_hash, uploaded_by)
    VALUES (?, ?, ?, ?, ?, 'EMP-9009')
  `);

  // SOPs (3 BUs)
  insertDoc.run(
    'DOC-SOP-SYND',
    'BU-SYNDICATED',
    'public/assets/aistudio/_______________________________________________1__4__4f301a30.pdf',
    'SOP',
    '4f301a30'
  );
  insertDoc.run(
    'DOC-SOP-ACCT',
    'BU-ACCOUNT',
    'public/assets/aistudio/_________________________________1__4__492fe846.pdf',
    'SOP',
    '492fe846'
  );
  insertDoc.run(
    'DOC-SOP-POS',
    'BU-POS',
    'public/assets/aistudio/_____________________________________________________002___1__3__8191fc9a.pdf',
    'SOP',
    '8191fc9a'
  );

  // Incident Logs (2 BUs: BU-SYNDICATED, BU-ACCOUNT)
  insertDoc.run(
    'DOC-INC-SYND',
    'BU-SYNDICATED',
    'public/assets/aistudio/_____________________________1__3__7725d811.pdf',
    'INCIDENT_LOG',
    '7725d811'
  );
  insertDoc.run(
    'DOC-INC-ACCT',
    'BU-ACCOUNT',
    'public/assets/aistudio/_________________________________1__3__95fdf53e.pdf',
    'INCIDENT_LOG',
    '95fdf53e'
  );

  // Audit Reports (2 BUs: BU-SYNDICATED, BU-ACCOUNT — duplicate 1___1__0aa1c9e1.pdf excluded by hash 0aa1c9e1)
  insertDoc.run(
    'DOC-AUD-SYND',
    'BU-SYNDICATED',
    'public/assets/aistudio/_______________________________________________1__5__0aa1c9e1.pdf',
    'AUDIT_REPORT',
    '0aa1c9e1'
  );
  insertDoc.run(
    'DOC-AUD-ACCT',
    'BU-ACCOUNT',
    'public/assets/aistudio/___________________________________________5__ac4aff51.pdf',
    'AUDIT_REPORT',
    'ac4aff51'
  );

  // Official RCSA Workbook Reference (BU-SYNDICATED)
  insertDoc.run(
    'DOC-RCSA-SYND-XLSX',
    'BU-SYNDICATED',
    'reference_data/Official_RCSA_Template__1_Risk_Profile.json',
    'PREVIOUS_RCSA',
    'synd-rcsa-003'
  );

  // 4. Register SOP Document Chunks (7 for SYND, 8 for ACCT, 5 for POS = 20 SOP chunks)
  const insertChunk = db.prepare(`
    INSERT OR IGNORE INTO document_chunks (id, document_id, chunk_index, section_title, content_text, page_number)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const syndSopChunks = [
    { idx: 1, page: 1, title: 'الإجراء الأول: التحقق من شخصية العميل والتفويضات الرقابة المسبقة', text: 'منع الاحتيال المصرفي، والتأكد من صدور طلب العملية من الأشخاص المفوضين قانوناً بموجب عقود القروض المشتركة والسجلات التجارية. مطابقة التوقيعات والأختام والتحقق من الصلاحيات والحدود ومراجعة سريان المستندات القانونية.' },
    { idx: 2, page: 1, title: 'الإجراء الثاني: الكشف عن العملاء بقوائم الحظر', text: 'منع التعامل مع الأشخاص أو الكيانات المحظورة محلياً أو دولياً ومكافحة عمليات غسل الأموال وتمويل الإرهاب. الفحص الآلي عبر النظام لكافة الأطراف المرتبطة بالتحويل المالي وإيقاف التحويل فوراً حال وجود اشتباه آلي.' },
    { idx: 3, page: 2, title: 'الإجراء الثالث: تنفيذ طلبات التحويلات المالية ومد سريان خطابات الضمان', text: 'استلام إشعار وكيل التسهيل ومراجعة شروط السحب والتحقق المزدوج وإدخال أمر الدفع والمراجعة والاعتماد بواسطة المشرف المباشر، وإصدار واعتماد ملاحق مد سريان خطابات الضمان.' },
    { idx: 4, page: 2, title: 'الإجراء الرابع: متابعة مد سريان خطابات الضمان عبر التقارير الآلية', text: 'منع سقوط خطابات الضمان الصادرة أو انتهاء سريانها دون تجديد بالاعتماد على التقارير الآلية الدورية المستخرجة من النظام المصرفي الأساسي بمهلة 30، 60، 90 يوماً قبل تاريخ الانتهاء.' },
    { idx: 5, page: 3, title: 'الإجراء الخامس: تسجيل القيود المحاسبية الخاصة بالإدارة على الأنظمة', text: 'تسجيل قيود السحب والتوزيع وقيود السداد والفوائد وقيود الالتزامات العرضية مع تطبيق قاعدة الرقابة المزدوجة وإرفاق أصل/صورة طبق الأصل من المستند المؤيد للقيد.' },
    { idx: 6, page: 3, title: 'الإجراء السادس: ضبط وتسوية حسابات الأستاذ العام', text: 'استخراج الكشوف اليومية والمطابقة الآلية واليدوية لأرصدة التسهيلات والفوائد والعمولات والالتزامات العرضية وتسوية الحسابات الوسيطة ومعالجة المعلقات خلال 24 إلى 48 ساعة.' },
    { idx: 7, page: 4, title: 'الإجراء السابع: حفظ أصول المستندات بدواليب تحت الرقابة الثنائية', text: 'حفظ جميع الأصول القانونية والمالية داخل دواليب/خزائن مصفحة ومقاومة للحريق مقفلة بنظام الرقابة الثنائية مع استقلال أمناء الحفظ وسجل حركة المستندات والجرد الدوري والمفاجئ.' }
  ];
  for (const c of syndSopChunks) {
    insertChunk.run(`CHK-SOP-SYND-0${c.idx}`, 'DOC-SOP-SYND', c.idx, c.title, c.text, c.page);
  }

  const acctSopChunks = [
    { idx: 1, page: 1, title: 'الإجراء الأول: استلام ومراجعة طلبات فتح الحسابات', text: 'استلام طلب فتح الحساب من الفرع أو القناة المعتمدة والتحقق من اكتمال الملف ومراجعة صلاحية المستندات الرسمية ووضوحها وإيقاف العملية حال وجود نواقص.' },
    { idx: 2, page: 2, title: 'الإجراء الثاني: التحقق من هوية العميل وبياناته الأساسية', text: 'مطابقة الاسم والرقم القومي أو جواز السفر وتاريخ الميلاد والعنوان مع مستندات إثبات الشخصية، والبحث على النظام للتأكد من عدم وجود ملف سابق للعميل ومراجعة بيانات الكيانات والمستفيد الحقيقي.' },
    { idx: 3, page: 2, title: 'الإجراء الثالث: تنفيذ الفحوصات الرقابية وقوائم الحظر', text: 'تمرير بيانات العميل والمستفيد الحقيقي والمفوضين بالتوقيع والممثلين القانونيين من خلال الأنظمة والقوائم الرقابية المعتمدة بالبنك وتعليق العملية عند ظهور تطابق محتمل.' },
    { idx: 4, page: 3, title: 'الإجراء الرابع: إدخال بيانات العميل والحساب على النظام', text: 'إدخال جميع البيانات المطلوبة من المستندات الأصلية واستيفاء جميع الحقول الإلزامية على النظام ومراجعة مطابقة البيانات المسجلة مع طلب فتح الحساب.' },
    { idx: 5, page: 3, title: 'الإجراء الخامس: المراجعة والاعتماد وفقاً لمبدأ الرقابة المزدوجة', text: 'الفصل بين الموظف القائم بإدخال أو تنفيذ العملية والموظف القائم بالمراجعة والاعتماد (Maker/Checker) والتحقق من اكتمال المستندات وصحة البيانات قبل الاعتماد.' },
    { idx: 6, page: 3, title: 'الإجراء السادس: فتح وتفعيل الحساب', text: 'إنشاء الحساب على النظام بعد اكتمال البيانات والمستندات والتحقق النهائي من استكمال الفحوصات الرقابية والموافقات قبل التفعيل.' },
    { idx: 7, page: 4, title: 'الإجراء السابع: إدارة الاستثناءات والتعديلات اليدوية', text: 'تحديد سبب اللجوء إلى الاستثناء أو التدخل اليدوي وعدم تنفيذه إلا بعد الحصول على موافقة المستوى الإداري صاحب الصلاحية وإدراجه ضمن تقارير رقابية دورية.' },
    { idx: 8, page: 4, title: 'الإجراء الثامن: حفظ وأرشفة مستندات فتح الحساب', text: 'تحميل المستندات على نظام الأرشفة المعتمد وربطها بالرقم التعريفي الصحيح للعميل والحساب والتحقق من جودة الأرشفة واكتمال الملف وحماية المستندات الورقية.' }
  ];
  for (const c of acctSopChunks) {
    insertChunk.run(`CHK-SOP-ACCT-0${c.idx}`, 'DOC-SOP-ACCT', c.idx, c.title, c.text, c.page);
  }

  const posSopChunks = [
    { idx: 1, page: 1, title: 'أولاً: متابعة تركيب وتشغيل ماكينات POS للتجار المتعاقدين مع مصرفنا / الفروع', text: 'استلام أمر التركيب والتحقق من استيفائه البيانات وتوجيهه للشركة المختصة، واستلام بيان التركيب وتسجيل بيانات الماكينة على النظام والتحقق والمراجعة اليومية وتفعيل بنود الخصومات والجزاءات.' },
    { idx: 2, page: 1, title: 'ثانياً: متابعة سحب ماكينات POS', text: 'استلام أوامر السحب وإرسالها للشركات المختصة واستلام محضر السحب وإلغاء تفعيل الماكينات على النظام ومراجعة صحة إلغاء التفعيل وتفعيل بنود الخصومات والجزاءات.' },
    { idx: 3, page: 1, title: 'ثالثاً: مناقصات وعقود الماكينات / البكر الحراري', text: 'مراجعة واعتماد المواصفات الفنية المطلوبة للماكينات والبكر الحراري واستلامها ومطابقتها مع أوامر التوريد والتحقق من وجود نص بالعقد على فترة ضمان محددة ضد عيوب الصناعة.' },
    { idx: 4, page: 2, title: 'رابعاً: متابعة الشكاوى الخاصة بأعطال / توقف ماكينات POS', text: 'استقبال الشكاوى والاستفسارات الخاصة بأعطال الماكينات من التجار والفروع ومتابعة حل المشكلات وتصعيد الشكاوى المسجلة حال تجاوز التوقيتات المعيارية للحل.' },
    { idx: 5, page: 2, title: 'خامساً: متابعة اختبار التطبيقات UAT', text: 'قيام السلطة الإشرافية بالإدارة بالتحقق من إجراء كافة الاختبارات على العينة المختارة من التجار والتعزيز على نتائج الاختبارات والتأكد من عمل ماكينات POS بصورة سليمة بعد تحميل التطبيقات الجديدة.' }
  ];
  for (const c of posSopChunks) {
    insertChunk.run(`CHK-SOP-POS-0${c.idx}`, 'DOC-SOP-POS', c.idx, c.title, c.text, c.page);
  }

  // 5. Register Historical Incidents (5 for BU-SYNDICATED, 4 for BU-ACCOUNT = 9 distinct records)
  const insertIncident = db.prepare(`
    INSERT OR IGNORE INTO historical_incidents (
      id, unit_id, incident_code, event_summary_ar, incident_detail_ar,
      net_loss_amount, risk_category_l1_raw, mapped_l1_id, source_document_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const syndIncidents = [
    { id: 'INC-SYND-100', code: '100', summary: 'اغفال تنفيذ طلبات احد العملاء', detail: 'اغفال تعزيز طلبات تنفيذ التحويلات الخاصة بأحد العملاء', loss: 150000, cat: '8 Executing, Delivering & Managing Transactions', l1: 'L1-08' },
    { id: 'INC-SYND-101', code: '101', summary: 'فقد مستندات تحويل', detail: 'فقد المستندات الخاص بتنفيذ تحويلات', loss: 599000, cat: '8 Executing, Delivering & Managing Transactions', l1: 'L1-08' },
    { id: 'INC-SYND-102', code: '102', summary: 'فقد مستندات خطابات ضمان', detail: 'فقد مستندات خطابات ضمان الخاصة بأحد العملاء', loss: 100000, cat: '8 Executing, Delivering & Managing Transactions', l1: 'L1-08' },
    { id: 'INC-SYND-103', code: '103', summary: 'اغفال تنفيذ طلبات احد العملاء', detail: 'اغفال تعزيز طلبات تنفيذ التحويلات الخاصة بأحد العملاء', loss: 700000, cat: '8 Executing, Delivering & Managing Transactions', l1: 'L1-08' },
    { id: 'INC-SYND-106', code: '106', summary: 'تقديم احد العملاء مستندات مزورة', detail: 'تقديم احد العملاء مستندات مزورة ( بطاقة الرقم القومي ) و تم الاكتشاف من الزملاء قبل تنفيذ العملية', loss: 300000, cat: '2 External Fraud', l1: 'L1-02' }
  ];
  for (const inc of syndIncidents) {
    insertIncident.run(inc.id, 'BU-SYNDICATED', inc.code, inc.summary, inc.detail, inc.loss, inc.cat, inc.l1, 'DOC-INC-SYND');
  }

  const acctIncidents = [
    { id: 'INC-ACCT-201', code: '201', summary: 'اغفال تنفيذ طلبات احد العملاء', detail: 'اغفال تعزيز طلبات تنفيذ العملاء على النظام مما أدى الى عدم تنفيذ طلب العميل', loss: 1500, cat: '8 Executing, Delivering & Managing Transactions', l1: 'L1-08' },
    { id: 'INC-ACCT-220', code: '220', summary: 'فقد مستندات فتح الحساب', detail: 'فقد المستندات الخاص بفتح الحسابات لعدد 3 عملاء حيث تم فقدهم من شركة الشحن خلال توصيلها الى الإدارة من الفرع', loss: 600000, cat: '8 Executing, Delivering & Managing Transactions', l1: 'L1-08' },
    { id: 'INC-ACCT-200', code: '200', summary: 'فتح حساب عميل بمستندات غير صحيحة', detail: 'فتح حساب عميل بمستندات غير صحيحة حيث ان بطاقة الرقم القومي منتهية', loss: 201000, cat: '8 Executing, Delivering & Managing Transactions', l1: 'L1-08' },
    { id: 'INC-ACCT-106', code: '106', summary: 'تقديم احد العملاء مستندات مزورة', detail: 'تقديم احد العملاء مستندات مزورة ( بطاقة الرقم القومي ) و تم الاكتشاف من الزملاء قبل تنفيذ العملية', loss: 1000, cat: '2 External Fraud', l1: 'L1-02' }
  ];
  for (const inc of acctIncidents) {
    insertIncident.run(inc.id, 'BU-ACCOUNT', inc.code, inc.summary, inc.detail, inc.loss, inc.cat, inc.l1, 'DOC-INC-ACCT');
  }

  // 6. Register Audit Findings (2 for BU-SYNDICATED, 4 for BU-ACCOUNT = 6 distinct findings)
  const insertFinding = db.prepare(`
    INSERT OR IGNORE INTO audit_findings (
      id, unit_id, finding_number, title_ar, details_ar,
      root_causes_ar, impact_ar, corrective_action_ar, source_document_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertFinding.run(
    'AUD-SYND-01',
    'BU-SYNDICATED',
    1,
    'الملاحظة الأولى: عدم العثور وفقدان أصول مستندات التحويلات المالية ورسائل السويفت',
    'أثناء جرد عينة من ملفات التحويلات المالية الخاصة بالقروض المشتركة، تبين فقدان وعدم استيفاء الأصول الورقية لنماذج طلب التحويل ورسائل السويفت المؤيدة لعدد من العمليات المنفذة، واكتفاء الإدارة بوجود صور ضوئية مرسلة عبر البريد الإلكتروني دون وجود الأصل الموقع أو كتاب الإفراج الرسمي.',
    'غياب نظام الأرشفة الإلكترونية المركزية، الاعتماد على الحفظ الورقي اليدوي غير المنتظم، وعدم تفعيل سجل تتبع وحركة الملفات والمستندات بقطاع العمليات.',
    'ضعف الموقف القانوني للبنك في حالة إقامة دعوى قضائية أو وجود نزاع مع العميل المقترض أو البنوك المشاركة، عدم القدرة على تقديم المستندات الأصلية للجهات القضائية أو البنك المركزي، واحتمالية تكرار التحويل أو صرف مبالغ غير مستحقة.',
    'بحث مدى إمكانية ميكنة أعمال الحفظ لدى القطاع',
    'DOC-AUD-SYND'
  );

  insertFinding.run(
    'AUD-SYND-02',
    'BU-SYNDICATED',
    2,
    'الملاحظة الثانية: قبول واستيفاء مستندات مزورة وغير صحيحة من العملاء',
    'أسفر الفحص الدقيق والتدقيق المتبادل لعينة من السجلات التجارية، كتاب السحب المعتمد، وإيصالات التحويل المقدمة من بعض العملاء المقترضين، عن قبول الإدارة لمستندات تحتوي على توقيعات وأختام مزورة وتعديلات جوهرية في بيانات المفوضين.',
    'ضعف كفاءة آليات التحقق اليدوي، الاعتماد على المراجعة الظاهرية للتوقيعات دون استخدام أدوات كشف التزوير الرقمية، عدم تفعيل بروتوكول الاتصال التأكيدي مع المفوضين المعتمدين، وغياب الربط الإلكتروني المباشر مع الجهات المصدرة للمستندات.',
    'تعرض البنك لمخاطر الاحتيال المالي المباشر، احتمالية تكبد خسائر مالية جسيمة نتيجة صرف مبالغ لأطراف غير مفوضة، التعرض لجزاءات وغرامات مالية وصارمة من البنك المركزي المصري لمخالفة تعليمات اعرف عميلك وضوابط حظر غسل الأموال، بالإضافة إلى المساس بسمعة البنك المصرفية.',
    'بحث مدى إمكانية توفير أنظمة خاصة بالكشف عن المستندات.',
    'DOC-AUD-SYND'
  );

  insertFinding.run(
    'AUD-ACCT-01',
    'BU-ACCOUNT',
    1,
    'الملاحظة الأولى: عدم اكتمال بعض مستندات ومتطلبات فتح الحسابات',
    'أسفر الفحص التفصيلي لعينة من ملفات فتح الحسابات عن وجود حالات لم تستوف بصورة كاملة جميع المستندات والبيانات المطلوبة وفقاً للإجراءات المعتمدة، أو تم استكمال بعض المتطلبات في مراحل لاحقة من تنفيذ العملية.',
    'الاعتماد الجزئي على المراجعة اليدوية للمستندات، وعدم وجود ضابط آلي مانع في جميع مراحل العملية يضمن عدم استكمال الإجراء قبل استيفاء كافة المتطلبات الإلزامية.',
    'احتمالية فتح أو تفعيل حسابات دون استيفاء المتطلبات المعتمدة، وما قد يترتب على ذلك من مخاطر تشغيلية ورقابية ومخاطر عدم الالتزام، بالإضافة إلى صعوبة إثبات سلامة الإجراءات حال إجراء مراجعات لاحقة.',
    'دراسة تطبيق النظام المستخدم آلية Mandatory Checklist / System Validation بحيث لا يسمح باستكمال فتح أو تفعيل الحساب قبل استيفاء وتوثيق جميع المستندات والبيانات الإلزامية، مع إجراء مراجعات دورية على الاستثناءات.',
    'DOC-AUD-ACCT'
  );

  insertFinding.run(
    'AUD-ACCT-02',
    'BU-ACCOUNT',
    2,
    'الملاحظة الثانية: مخاطر عدم دقة أو اتساق البيانات المسجلة على النظام مع المستندات',
    'تبين من أعمال المراجعة وجود حاجة إلى تعزيز آليات التحقق من تطابق البيانات المسجلة على النظام مع المستندات المقدمة من العملاء، خاصة البيانات الأساسية التي يترتب على عدم دقتها تأثير على سلامة ملف العميل والإجراءات اللاحقة المرتبطة بالحساب.',
    'وجود مراحل تعتمد على الإدخال والمراجعة اليدوية، بما يزيد من احتمالية الخطأ البشري، إلى جانب محدودية بعض أدوات التحقق الآلي بين البيانات المدخلة والمستندات المؤيدة.',
    'إمكانية تسجيل بيانات غير دقيقة أو غير متطابقة مع المستندات الأصلية، بما قد يؤدي إلى أخطاء تشغيلية لاحقة أو قصور في جودة بيانات العملاء ومخاطر مرتبطة بالالتزام بالمتطلبات الرقابية.',
    'تعزيز ضوابط للبيانات الجوهرية، ودراسة زيادة الاعتماد على أدوات التحقق الآلي وربط الحقول الأساسية بالمستندات والمصادر المعتمدة، مع إصدار تقارير استثنائية دورية للحالات التي يتم تعديل بياناتها أو تجاوز الضوابط المعتادة بشأنها.',
    'DOC-AUD-ACCT'
  );

  insertFinding.run(
    'AUD-ACCT-03',
    'BU-ACCOUNT',
    3,
    'الملاحظة الثالثة: قصور محتمل في حفظ واسترجاع مستندات فتح الحسابات',
    'أظهرت أعمال الفحص الحاجة إلى تعزيز آليات حفظ وأرشفة مستندات فتح الحسابات بما يضمن سهولة وسرعة استرجاع المستندات وربطها بصورة واضحة بالحساب والعميل، مع تقليل الاعتماد على الحفظ أو التداول اليدوي للمستندات.',
    'الاعتماد على إجراءات يدوية أو شبه آلية في بعض مراحل حفظ وأرشفة المستندات، وعدم اكتمال الربط الإلكتروني المركزي لكافة المستندات المؤيدة للعملية.',
    'احتمالية فقد أو تعذر استرجاع بعض المستندات عند الحاجة، بما قد يؤثر على قدرة البنك على إثبات سلامة إجراءات فتح الحساب أمام الجهات الرقابية أو القانونية، بالإضافة إلى زيادة المخاطر التشغيلية المرتبطة بتداول المستندات.',
    'استكمال ميكنة عملية الأرشفة وربط جميع مستندات فتح الحساب إلكترونياً بملف العميل، مع وضع آلية للتحقق من اكتمال الأرشفة وإصدار تقارير دورية بالحالات التي لم يتم استيفاء مستنداتها إلكترونياً.',
    'DOC-AUD-ACCT'
  );

  insertFinding.run(
    'AUD-ACCT-04',
    'BU-ACCOUNT',
    4,
    'الملاحظة الرابعة: الحاجة إلى تعزيز الرقابة على الاستثناءات والتدخلات اليدوية',
    'تبين من مراجعة الضوابط المرتبطة بعملية فتح الحسابات وجود بعض الإجراءات التي يتم تنفيذها يدوياً أو من خلال استثناءات تشغيلية، الأمر الذي يستلزم وجود رقابة مستقلة ومستمرة على تلك الحالات لضمان استخدامها في الأغراض المصرح بها فقط.',
    'عدم اكتمال أتمتة بعض مراحل العملية، والحاجة إلى تطوير تقارير رقابية موحدة لرصد الاستثناءات والتعديلات اليدوية.',
    'زيادة احتمالية الخطأ البشري أو تنفيذ معاملات خارج المسار التشغيلي المعتاد، بالإضافة إلى صعوبة اكتشاف بعض الأخطاء أو التجاوزات في الوقت المناسب.',
    'إعداد Exception Report دوري يتضمن جميع التدخلات اليدوية والاستثناءات والتعديلات الجوهرية، على أن تتم مراجعته واعتماده من مستوى إداري مستقل، مع توثيق أسباب الاستثناء والإجراء المتخذ بشأنه.',
    'DOC-AUD-ACCT'
  );

  // 7. Register Business Unit Source Coverage Matrix (Distinguishes MISSING_DOCUMENT from CONFIRMED_ZERO)
  const insertCoverage = db.prepare(`
    INSERT OR REPLACE INTO bu_source_coverage (
      unit_id, tier, sop_status, incidents_status, audit_findings_status,
      rcsa_register_status, sop_procedures_count, incidents_count, audit_findings_count,
      workbook_risks_count, workbook_controls_count, notes_ar
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCoverage.run(
    'BU-SYNDICATED',
    'DATA_READY_BU',
    'AVAILABLE',
    'AVAILABLE',
    'AVAILABLE',
    'AVAILABLE_WORKBOOK',
    7,
    5,
    2,
    8,
    20,
    'كافة المراجع متوفرة: دليل SOP (7 إجراءات)، سجل الحوادث (5 حوادث)، تقرير التفتيش (ملاحظتان)، ونموذج RCSA المرجعي الكامل (8 مخاطر و20 ضابطاً رقابياً في الصفوف 8..27 و3 إجراءات تصحيحية).'
  );

  insertCoverage.run(
    'BU-ACCOUNT',
    'DATA_READY_BU',
    'AVAILABLE',
    'AVAILABLE',
    'AVAILABLE',
    'DERIVED_FROM_SOURCES_REQUIRED',
    8,
    4,
    4,
    0,
    0,
    'تتوفر المصادر التشغيلية والرقابية الكاملة: دليل SOP (8 إجراءات)، سجل الحوادث (4 حوادث)، وتقرير التفتيش (4 ملاحظات). لا يوجد ملف إكسيل RCSA مسبق؛ يُشتق سجل المخاطر والضوابط في المرحلة 2A من هذه المصادر المعتمدة.'
  );

  insertCoverage.run(
    'BU-POS',
    'DATA_READY_BU',
    'AVAILABLE',
    'MISSING_DOCUMENT',
    'MISSING_DOCUMENT',
    'DERIVED_FROM_SOURCES_REQUIRED',
    5,
    null,
    null,
    0,
    0,
    'يتوفر دليل SOP (5 أقسام تشغيلية). لم يتم إرفاق سجل حوادث أو تقرير تفتيش؛ يُصنف كـ (مستند غير مرفق - MISSING_DOCUMENT) وليس (صفر حوادث مؤكدة) لحين استيفاء المدخلات المفقودة في المرحلة 2A.'
  );

  insertCoverage.run(
    'BU-BRANCHES',
    'PARTIAL_DATA_NEW_BU',
    'MISSING_DOCUMENT',
    'MISSING_DOCUMENT',
    'MISSING_DOCUMENT',
    'EMPTY_INITIAL_STATE',
    0,
    null,
    null,
    0,
    0,
    'وحدة أعمال مهيأة لاستقبال مستندات SOP جزئية واستيفاء البيانات المفقودة تفاعلياً (Partial-Data Workflow). الحالة المبدئية: لم يتم إنشاء تقييم بعد.'
  );

  insertCoverage.run(
    'BU-TRADING',
    'PARTIAL_DATA_NEW_BU',
    'MISSING_DOCUMENT',
    'MISSING_DOCUMENT',
    'MISSING_DOCUMENT',
    'EMPTY_INITIAL_STATE',
    0,
    null,
    null,
    0,
    0,
    'وحدة أعمال مهيأة لاستقبال مستندات SOP جزئية واستيفاء البيانات المفقودة تفاعلياً (Partial-Data Workflow). الحالة المبدئية: لم يتم إنشاء تقييم بعد.'
  );

  // 8. Phase 2B Additive Schema Extensions — Risk-Control Evidence Links & RRF/Residual Provenance
  db.exec(`
    -- 18. Authoritative Workbook Reference Controls (19 controls across 8 risks in BU-SYNDICATED)
    CREATE TABLE IF NOT EXISTS workbook_reference_controls (
      control_id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      linked_risk_code TEXT NOT NULL,
      excel_row INTEGER NOT NULL,
      control_description TEXT NOT NULL,
      control_owner TEXT,
      control_method TEXT NOT NULL,
      control_type TEXT NOT NULL,
      control_frequency TEXT,
      effectiveness_classification TEXT NOT NULL,
      implementation_status TEXT NOT NULL DEFAULT 'IMPLEMENTED',
      applicable_rrf REAL NOT NULL,
      workbook_rrf_key TEXT NOT NULL,
      is_eligible_for_residual INTEGER NOT NULL DEFAULT 1
    );

    -- 19. Control-to-SOP Evidence Links
    CREATE TABLE IF NOT EXISTS control_sop_evidence_links (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      control_id TEXT NOT NULL,
      sop_chunk_id TEXT NOT NULL REFERENCES document_chunks(id),
      evidence_note_ar TEXT
    );

    -- 20. Incident-to-Control Evidence & Deficiency Links
    CREATE TABLE IF NOT EXISTS control_incident_evidence_links (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      incident_id TEXT NOT NULL REFERENCES historical_incidents(id),
      linked_risk_code TEXT NOT NULL,
      control_id TEXT NOT NULL,
      failure_mechanism_ar TEXT NOT NULL,
      deficiency_category TEXT NOT NULL,
      deficiency_status TEXT CHECK(deficiency_status IN ('CONFIRMED', 'SUSPECTED', 'UNSUPPORTED', 'HUMAN_REVIEW_REQUIRED')) NOT NULL,
      supporting_rationale_ar TEXT NOT NULL
    );

    -- 21. Audit-Finding-to-Control Evidence & Deficiency Links
    CREATE TABLE IF NOT EXISTS control_audit_finding_links (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      audit_finding_id TEXT NOT NULL REFERENCES audit_findings(id),
      linked_risk_code TEXT NOT NULL,
      control_id TEXT NOT NULL,
      failure_mechanism_ar TEXT NOT NULL,
      deficiency_category TEXT NOT NULL,
      deficiency_status TEXT CHECK(deficiency_status IN ('CONFIRMED', 'SUSPECTED', 'UNSUPPORTED', 'HUMAN_REVIEW_REQUIRED')) NOT NULL,
      supporting_rationale_ar TEXT NOT NULL
    );

    -- 22. Risk MAX RRF Selection Provenance & Residual Calculation Traces
    CREATE TABLE IF NOT EXISTS risk_rrf_residual_traces (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      risk_code TEXT NOT NULL,
      excel_row INTEGER,
      expected_annual_loss REAL NOT NULL,
      selected_max_rrf_control_id TEXT,
      selected_workbook_rrf_key TEXT,
      effective_rrf REAL NOT NULL,
      residual_factor REAL NOT NULL,
      residual_financial_amount REAL NOT NULL,
      excel_u_column_rating TEXT NOT NULL,
      pdf_page6_methodology_status TEXT NOT NULL,
      selection_rationale_ar TEXT NOT NULL,
      trace_json TEXT NOT NULL
    );
  `);

  const insertRefControl = db.prepare(`
    INSERT OR REPLACE INTO workbook_reference_controls (
      control_id, unit_id, linked_risk_code, excel_row, control_description,
      control_owner, control_method, control_type, control_frequency,
      effectiveness_classification, implementation_status, applicable_rrf,
      workbook_rrf_key, is_eligible_for_residual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const wbJsonPath = path.resolve(process.cwd(), 'reference_data/Official_RCSA_Template__1_Risk_Profile.json');
  if (fs.existsSync(wbJsonPath)) {
    const wbData = JSON.parse(fs.readFileSync(wbJsonPath, 'utf-8')) as {
      cells?: Array<{ cell: string; value: unknown }>;
    };
    const cellMap = new Map<string, string>();
    for (const c of wbData.cells ?? []) {
      cellMap.set(c.cell, String(c.value ?? '').trim());
    }
    const rowRiskGroups: Array<[string, number[]]> = [
      ['RSK-SYND-01', [8, 9]],
      ['RSK-SYND-02', [10, 11, 12, 13, 14, 15]],
      ['RSK-SYND-03', [16, 17, 18]],
      ['RSK-SYND-04', [19]],
      ['RSK-SYND-05', [20]],
      ['RSK-SYND-06', [21, 22]],
      ['RSK-SYND-07', [23, 24, 25]],
      ['RSK-SYND-08', [26, 27]],
    ];
    const rrfLookup: Record<string, [number, string]> = {
      'AUTOMATED:PREVENTIVE': [0.95, 'Automated / preventive'],
      'AUTOMATED:DETECTIVE': [0.85, 'Automated / detective'],
      'AUTOMATED:CORRECTIVE': [0.50, 'Automated / corrective'],
      'SEMI_AUTOMATED:PREVENTIVE': [0.90, 'Semi Auto / preventive'],
      'SEMI_AUTOMATED:DETECTIVE': [0.80, 'Semi Auto / detective'],
      'SEMI_AUTOMATED:CORRECTIVE': [0.40, 'Semi Auto / corrective'],
      'MANUAL:PREVENTIVE': [0.75, 'Manual / preventive'],
      'MANUAL:DETECTIVE': [0.60, 'Manual / detective'],
      'MANUAL:CORRECTIVE': [0.30, 'Manual / corrective'],
    };

    for (const [riskCode, rows] of rowRiskGroups) {
      for (const r of rows) {
        const desc = cellMap.get(`M${r}`) ?? '';
        const owner = cellMap.get(`N${r}`) || null;
        const oRaw = (cellMap.get(`O${r}`) ?? '').toLowerCase();
        const pRaw = cellMap.get(`P${r}`) ?? '';
        const qRaw = cellMap.get(`Q${r}`) || null;
        const rRaw = (cellMap.get(`R${r}`) ?? '').toLowerCase();

        const method = oRaw.includes('semi') || oRaw.includes('شبه') || oRaw.includes('شبة')
          ? 'SEMI_AUTOMATED'
          : oRaw.includes('auto') || oRaw.includes('آلي') || oRaw.includes('ألي')
            ? 'AUTOMATED'
            : 'MANUAL';
        const ctype = rRaw.includes('detect') || rRaw.includes('كاشف')
          ? 'DETECTIVE'
          : rRaw.includes('correct') || rRaw.includes('تصحيح')
            ? 'CORRECTIVE'
            : 'PREVENTIVE';
        const eff = !pRaw
          ? 'PENDING_REVIEW'
          : pRaw.includes('يحتاج')
            ? 'ضابط رقابي يحتاج إلى تطوير'
            : 'ضابط رقابي فعال';
        const [rrfVal, wbKey] = rrfLookup[`${method}:${ctype}`] ?? [0.75, 'Manual / preventive'];
        const isEligible = eff === 'PENDING_REVIEW' ? 0 : 1;

        insertRefControl.run(
          `CTL-SYND-R${r}`,
          'BU-SYNDICATED',
          riskCode,
          r,
          desc,
          owner,
          method,
          ctype,
          qRaw,
          eff,
          'IMPLEMENTED',
          rrfVal,
          wbKey,
          isEligible
        );
      }
    }
  }

  const insertIncLink = db.prepare(`
    INSERT OR IGNORE INTO control_incident_evidence_links (
      id, unit_id, incident_id, linked_risk_code, control_id,
      failure_mechanism_ar, deficiency_category, deficiency_status, supporting_rationale_ar
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertIncLink.run(
    'CIL-SYND-100-R19',
    'BU-SYNDICATED',
    'INC-SYND-100',
    'RSK-SYND-04',
    'CTL-SYND-R19',
    'اغفال تعزيز طلبات تنفيذ التحويلات الخاصة بأحد العملاء',
    'CONTROL_EXECUTION_FAILURE',
    'CONFIRMED',
    'الضابط اليدوي (CTL-SYND-R19: التحقق من تعزيز كافة العمليات) لم يمنع إغفال تعزيز طلب التحويل في الحادثة 100؛ صُنف في P19 كضابط يحتاج إلى تطوير.'
  );
  insertIncLink.run(
    'CIL-SYND-103-R19',
    'BU-SYNDICATED',
    'INC-SYND-103',
    'RSK-SYND-04',
    'CTL-SYND-R19',
    'اغفال تعزيز طلبات تنفيذ التحويلات الخاصة بأحد العملاء',
    'CONTROL_EXECUTION_FAILURE',
    'CONFIRMED',
    'تكرار إغفال تعزيز طلب التحويل في الحادثة 103 يؤكد الحاجة لتطوير الضابط اليدوي CTL-SYND-R19 واستحداث تقرير متابعة طلبات العملاء (AB19).'
  );
  insertIncLink.run(
    'CIL-SYND-101-R23',
    'BU-SYNDICATED',
    'INC-SYND-101',
    'RSK-SYND-07',
    'CTL-SYND-R23',
    'فقد المستندات الخاص بتنفيذ تحويلات مالية',
    'INCOMPLETE_CONTROL_IMPLEMENTATION',
    'CONFIRMED',
    'تم ربط الحادثة 101 بالضابط اليدوي لحفظ أصول الطلبات الورقية (CTL-SYND-R23) فقط دون تعميم القصور على ضابط حفظ المراسلات الإلكتروني (CTL-SYND-R24).'
  );
  insertIncLink.run(
    'CIL-SYND-102-R23',
    'BU-SYNDICATED',
    'INC-SYND-102',
    'RSK-SYND-07',
    'CTL-SYND-R23',
    'فقد مستندات خطابات ضمان الخاصة بأحد العملاء',
    'INCOMPLETE_CONTROL_IMPLEMENTATION',
    'CONFIRMED',
    'تم ربط الحادثة 102 بالضابط اليدوي لحفظ أصول الطلبات ومستندات الضمان الورقية (CTL-SYND-R23) المصنف يحتاج تطوير في P23.'
  );
  insertIncLink.run(
    'CIL-SYND-106-R26',
    'BU-SYNDICATED',
    'INC-SYND-106',
    'RSK-SYND-08',
    'CTL-SYND-R26',
    'تقديم أحد العملاء مستندات مزورة والاعتماد على الفحص اليدوي الظاهري',
    'CONTROL_DESIGN_DEFICIENCY',
    'CONFIRMED',
    'تم ربط الحادثة 106 بضابط الفحص اليدوي لأصول المستندات (CTL-SYND-R26) المصنف يحتاج تطوير في P26، بينما بقي ضابط مطابقة النظام (CTL-SYND-R27) فعالاً.'
  );

  const insertAudLink = db.prepare(`
    INSERT OR IGNORE INTO control_audit_finding_links (
      id, unit_id, audit_finding_id, linked_risk_code, control_id,
      failure_mechanism_ar, deficiency_category, deficiency_status, supporting_rationale_ar
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudLink.run(
    'CAL-SYND-01-R23',
    'BU-SYNDICATED',
    'AUD-SYND-01',
    'RSK-SYND-07',
    'CTL-SYND-R23',
    'غياب نظام الأرشفة الإلكترونية المركزية والاعتماد على الحفظ الورقي اليدوي غير المنتظم',
    'INCOMPLETE_CONTROL_IMPLEMENTATION',
    'CONFIRMED',
    'ملحوظة التفتيش رقم 1 تؤكد قصور ضابط الحفظ الورقي اليدوي (CTL-SYND-R23) فقط مع بقاء ضابط المراسلات الإلكترونية (CTL-SYND-R24) فعالاً.'
  );
  insertAudLink.run(
    'CAL-SYND-02-R26',
    'BU-SYNDICATED',
    'AUD-SYND-02',
    'RSK-SYND-08',
    'CTL-SYND-R26',
    'ضعف كفاءة آليات التحقق اليدوي والاعتماد على المراجعة الظاهرية للتوقيعات والأختام دون أدوات كشف التزوير الرقمية',
    'CONTROL_DESIGN_DEFICIENCY',
    'CONFIRMED',
    'ملحوظة التفتيش رقم 2 تؤكد قصور تصميم ضابط الفحص اليدوي للتوقيعات والأختام (CTL-SYND-R26) وتوصي بتوفير أنظمة كشف التزوير (AB26).'
  );
}

