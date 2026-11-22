import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';

const DIMENSIONS = [
  ['service', 'استمرارية الخدمة'],
  ['reputation', 'السمعة والعملاء'],
  ['regulatory', 'الأثر الرقابي'],
  ['legal', 'الأثر القانوني'],
] as const;
const CHOICES = [
  [1, 'مخاطرة مقبولة / ضوابط رقابية كافية'],
  [2, 'مخاطرة مقبولة / ضوابط رقابية كافية ويمكن تحسينها مستقبلًا'],
  [3, 'مخاطرة غير مقبولة والضوابط تحتاج إلى تطوير'],
  [4, 'مخاطرة غير مقبولة ولا توجد ضوابط رقابية'],
] as const;
const INITIAL = {
  nfi: Object.fromEntries(DIMENSIONS.map(([k]) => [k, { rating: 'PENDING', evidence: '' }])) as Record<string, {rating: string; evidence: string}>,
  esg: { status: 'PENDING', pillars: [] as string[], evidence: {} as Record<string, string>, catalogue_ids: [] as number[], taxonomy_mismatch_reason: '', justification: '' },
  acceptance_class: null as number | null,
  acceptance_rationale: '',
  corrective_action: '',
};

export function Phase2CReviewPanel({ assessmentId, riskId, editable, riskL1, onSaved }: {
  assessmentId: string; riskId: string; editable: boolean; riskL1?: string; onSaved?: () => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState(INITIAL);
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNfiGuide, setShowNfiGuide] = useState(false);
  const [nfiOtherMode, setNfiOtherMode] = useState<Record<string, boolean>>({});
  const [esgOtherMode, setEsgOtherMode] = useState(false);
  const [accOtherMode, setAccOtherMode] = useState(false);
  const [catalog, setCatalog] = useState<Array<{id: number; risk_example_ar: string; pillar: string; l1_ar: string; l2_ar: string}>>([]);
  useEffect(() => {
    if (!token) return;
    fetch('/api/reference/esg-catalogue', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { if (!r.ok) throw new Error('تعذر تحميل كتالوج ESG'); return r.json(); })
      .then(data => setCatalog(data.entries || []))
      .catch(() => setCatalog([]));
  }, [token]);
  useEffect(() => {
    if (!token || !assessmentId || !riskId) return;
    let active = true;
    setLoading(true);
    setResult(null); setForm(structuredClone(INITIAL)); setMessage('');
    setNfiOtherMode({}); setEsgOtherMode(false); setAccOtherMode(false);
    fetch(`/api/hitl/assessments/${encodeURIComponent(assessmentId)}/risks/${encodeURIComponent(riskId)}/phase2c`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(async r => { const x = await r.json(); if (!r.ok) throw new Error(x.error || 'تعذر تحميل التقييم غير المالي'); return x; })
      .then(data => { if (active) { setForm(data.inputs ? { ...structuredClone(INITIAL), ...data.inputs, esg: { ...structuredClone(INITIAL).esg, ...data.inputs.esg } } : structuredClone(INITIAL)); setResult(data.result); } })
      .catch(e => { if (active) setMessage(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assessmentId, riskId, token]);

  const save = async () => {
    if (!token) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/hitl/assessments/${encodeURIComponent(assessmentId)}/risks/${encodeURIComponent(riskId)}/phase2c`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ التقييم.');
      setResult(data.result);
      onSaved?.();
      setMessage(data.result.ready_for_export ? 'تم حفظ التقييم؛ بيانات هذه المخاطرة مكتملة.' : 'تم حفظ البيانات مع توضيح البنود الناقصة.');
    } catch (error: any) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  return (
    <section className="m-4 bg-white rounded-2xl border border-[#DCDAD5] p-5 space-y-4 shadow-2xs" aria-label="تقييم الأثر غير المالي والاستدامة">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E5E3DE]">
        <div>
          <h4 className="text-sm font-extrabold text-[#09331F]">الأثر غير المالي والاستدامة وقبول المخاطرة</h4>
          <p className="text-[11px] text-slate-600 mt-0.5">
            قاعدة المخاطرة الرئيسية (Key Risk): الأثر المالي المتبقي (Residual Financial) أو أي بُعد غير مالي (NFI) يساوي H أو VH أو C • * يتم الاعتماد على التأثير الأعلى تقييماً وفقاً ومبدأ الأكثر تحوطاً.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNfiGuide(prev => !prev)}
            className="px-2.5 py-1 rounded-lg bg-[#F8F8F6] hover:bg-[#EFECE6] border border-[#DCDAD5] text-[11px] font-bold text-[#09331F] cursor-pointer"
          >
            {showNfiGuide ? 'إخفاء مصفوفة NFI المعتمدة (الشريحة 4)' : 'عرض مصفوفة تقييم الأثر غير المالي (الشريحة 4)'}
          </button>
          <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${result?.status === 'COMPLETE' ? 'bg-emerald-50 text-[#006547] border-emerald-300' : 'bg-amber-50 text-amber-900 border-amber-300'}`}>
            {result?.status === 'COMPLETE' ? 'مكتمل ✓' : 'يتطلب استكمالًا'}
          </span>
        </div>
      </div>

      {showNfiGuide && (
        <div className="rounded-xl border border-[#006547]/40 bg-[#F8FAF9] p-3 overflow-x-auto text-[11px] space-y-2" data-testid="nfi-slide4-matrix-guide">
          <div className="font-extrabold text-[#09331F]">
            معايير تقييم الأثر غير المالي المعتمدة (الشريحة 4 — 4 أبعاد × 5 درجات، مع استخدام «-» عند عدم وجود تعرض مباشر)
          </div>
          <table className="w-full text-right border-collapse border border-[#DCDAD5] bg-white">
            <thead className="bg-[#09331F] text-white">
              <tr>
                <th className="p-1.5 border border-[#DCDAD5]">البعد غير المالي</th>
                <th className="p-1.5 border border-[#DCDAD5]">منخفض (L)</th>
                <th className="p-1.5 border border-[#DCDAD5]">متوسط (M)</th>
                <th className="p-1.5 border border-[#DCDAD5]">كبير (H)</th>
                <th className="p-1.5 border border-[#DCDAD5]">كبير جداً (VH)</th>
                <th className="p-1.5 border border-[#DCDAD5]">كارثي (C)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E3DE]">
              <tr>
                <td className="p-1.5 font-bold bg-[#F8F8F6] border border-[#DCDAD5]">تقديم الخدمة</td>
                <td className="p-1.5 border border-[#DCDAD5]">عطل داخلي بسيط دون أثر على العملاء</td>
                <td className="p-1.5 border border-[#DCDAD5]">اضطراب طفيف بمستوى الخدمة لبعض العملاء</td>
                <td className="p-1.5 border border-[#DCDAD5]">تعطل جزئي بخط أعمال أو خدمة رئيسية</td>
                <td className="p-1.5 border border-[#DCDAD5]">تعطل شامل لوظيفة جوهرية (&gt; يوم)</td>
                <td className="p-1.5 border border-[#DCDAD5]">فقدان قدرة تقديم الخدمة لأجل غير مسمى</td>
              </tr>
              <tr>
                <td className="p-1.5 font-bold bg-[#F8F8F6] border border-[#DCDAD5]">السمعة والعملاء</td>
                <td className="p-1.5 border border-[#DCDAD5]">شكاوى محدودة تعالج فوراً</td>
                <td className="p-1.5 border border-[#DCDAD5]">تغطية سلبية محلية محدودة/فقدان عملاء محدودين</td>
                <td className="p-1.5 border border-[#DCDAD5]">انتقاد إعلامي مستمر أو فقدان شريحة مهمة</td>
                <td className="p-1.5 border border-[#DCDAD5]">تغطية سلبية واسعة وفقدان كبير للعملاء</td>
                <td className="p-1.5 border border-[#DCDAD5]">انهيار ثقة الجمهور وتدخل قيادي واسع</td>
              </tr>
              <tr>
                <td className="p-1.5 font-bold bg-[#F8F8F6] border border-[#DCDAD5]">الجهات الرقابية</td>
                <td className="p-1.5 border border-[#DCDAD5]">ملاحظات تفتيش داخلي بسيطة</td>
                <td className="p-1.5 border border-[#DCDAD5]">مخالفات محدودة لإجراءات وتوصيات تفتيشية</td>
                <td className="p-1.5 border border-[#DCDAD5]">مخالفات جسيمة وغرامات/جزاءات من الجهة الرقابية</td>
                <td className="p-1.5 border border-[#DCDAD5]">تحذيرات رسمية وتغليظ إشرافي على البنك</td>
                <td className="p-1.5 border border-[#DCDAD5]">تهديد للترخيص أو قيود رقابية شاملة</td>
              </tr>
              <tr>
                <td className="p-1.5 font-bold bg-[#F8F8F6] border border-[#DCDAD5]">الإجراءات القضائية</td>
                <td className="p-1.5 border border-[#DCDAD5]">استخدام (-) عند عدم وجود تعرض قضائي، أو L لنزاع محدود غير جوهري</td>
                <td className="p-1.5 border border-[#DCDAD5]">دعاوى تعاقدية/مطالبات متوسطة الأثر</td>
                <td className="p-1.5 border border-[#DCDAD5]">قضايا جوهرية أو غرامات قضائية مرتفعة</td>
                <td className="p-1.5 border border-[#DCDAD5]">دعاوى جسيمة متعددة ذات أثر مالي/تنظيمي واسع</td>
                <td className="p-1.5 border border-[#DCDAD5]">أحكام قضائية/عقابية تهدد استمرارية النشاط</td>
              </tr>
            </tbody>
          </table>
          <div className="text-[10px] font-bold text-[#006547]">
            * يتم الاعتماد على التأثير الأعلى تقييماً وفقاً ومبدأ الأكثر تحوطاً — وإذا لم يوجد تعرض لإجراءات قضائية يُثبت الرمز (-).
          </div>
        </div>
      )}

      {loading ? <p className="text-xs text-slate-600">جارٍ تحميل مدخلات التقييم...</p> : <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DIMENSIONS.map(([key, label]) => (
            <div key={key} className="bg-[#F8F8F6] rounded-xl border border-[#E5E3DE] p-3.5 space-y-2">
              <label className="block text-xs font-bold text-[#09331F]">{label}</label>
              <select disabled={!editable} aria-label={`تقييم ${label}`} className="w-full bg-white border border-[#DCDAD5] rounded-lg p-2 text-xs font-semibold disabled:opacity-70"
                value={nfiOtherMode[key] ? 'OTHER' : (form.nfi[key]?.rating || 'PENDING')}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'OTHER') {
                    setNfiOtherMode(prev => ({ ...prev, [key]: true }));
                    return;
                  }
                  setNfiOtherMode(prev => ({ ...prev, [key]: false }));
                  setForm(p => ({ ...p, nfi: { ...p.nfi, [key]: { ...p.nfi[key], rating: val } } }));
                }}>
                <option value="PENDING">لم يُستوفَ بعد</option>
                <option value="-">لا يوجد تأثير مثبت (-)</option>
                <option value="L">منخفض</option><option value="M">متوسط</option>
                <option value="H">مرتفع</option><option value="VH">مرتفع جدًا</option><option value="C">كارثي</option>
                <option value="OTHER">أخرى</option>
              </select>
              {nfiOtherMode[key] && (
                <div className="text-[11px] bg-amber-50 border border-amber-300 rounded-lg p-2 space-y-1">
                  <div className="font-bold text-amber-900">توضيح مخصص لبعد {label} (أخرى):</div>
                  <input type="text" disabled={!editable} placeholder="اكتب التوصيف أو المبرر المخصص في خانة الدليل أدناه، واختر الدرجة المعادلة أعلاه عند الاعتماد."
                    value={form.nfi[key]?.evidence || ''}
                    onChange={e => setForm(p => ({ ...p, nfi: { ...p.nfi, [key]: { ...p.nfi[key], evidence: e.target.value } } }))}
                    className="w-full bg-white border border-[#DCDAD5] rounded p-1.5 text-xs" />
                </div>
              )}
              <textarea disabled={!editable} rows={2} value={form.nfi[key]?.evidence || ''}
                onChange={e => setForm(p => ({ ...p, nfi: { ...p.nfi, [key]: { ...p.nfi[key], evidence: e.target.value } } }))}
                placeholder="المصدر أو سبب عدم التأثر" aria-label={`دليل ${label}`}
                className="w-full bg-white border border-[#DCDAD5] rounded-lg p-2 text-xs disabled:opacity-70" />
            </div>
          ))}
        </div>
        <div className="bg-[#F8F8F6] rounded-xl border border-[#E5E3DE] p-3.5 space-y-2">
          <label className="text-xs font-bold text-[#09331F] block">تصنيف الاستدامة (ESG)</label>
          <select disabled={!editable} value={esgOtherMode ? 'OTHER' : form.esg.status} className="w-full rounded-lg p-2 bg-white border border-[#DCDAD5] text-xs font-semibold"
            onChange={e => {
              const val = e.target.value;
              if (val === 'OTHER') {
                setEsgOtherMode(true);
                return;
              }
              setEsgOtherMode(false);
              setForm(p => ({ ...p, esg: { ...p.esg, status: val, pillars: val === 'ASSESSED' ? p.esg.pillars : [], catalogue_ids: val === 'ASSESSED' ? p.esg.catalogue_ids : [], evidence: val === 'ASSESSED' ? p.esg.evidence : {} } }));
            }}>
            <option value="PENDING">لم يُحسم بعد</option>
            <option value="ASSESSED">صلة موثقة بالاستدامة</option>
            <option value="NO_DOCUMENTED_LINK">لا توجد صلة مثبتة في الأدلة</option>
            <option value="OTHER">أخرى</option>
          </select>
          {esgOtherMode && (
            <textarea disabled={!editable} rows={2} value={form.esg.justification || ''}
              onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, justification: e.target.value } }))}
              placeholder="ملاحظة أو تصنيف مخصص للاستدامة (أخرى)..."
              className="w-full rounded-lg bg-white border border-amber-300 p-2 text-xs" />
          )}
          {form.esg.status === 'ASSESSED' && <div className="flex flex-wrap gap-4">
            {(['E','S','G'] as const).map(pillar => <div key={pillar} className="space-y-1 flex-1 min-w-32">
              <label className="flex gap-2 items-center text-xs font-semibold"><input type="checkbox" disabled={!editable}
                checked={form.esg.pillars.includes(pillar)} onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, pillars: e.target.checked ? [...f.esg.pillars, pillar] : f.esg.pillars.filter(x => x !== pillar), catalogue_ids: e.target.checked ? f.esg.catalogue_ids : (f.esg.catalogue_ids || []).filter(id => catalog.find(c => c.id === id)?.pillar !== pillar) } }))} />
                {pillar === 'E' ? 'بيئي E' : pillar === 'S' ? 'اجتماعي S' : 'حوكمة G'}</label>
              {form.esg.pillars.includes(pillar) && <textarea disabled={!editable} rows={2} placeholder="الدليل المرتبط بهذا التصنيف"
                value={form.esg.evidence[pillar] || ''} onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, evidence: { ...f.esg.evidence, [pillar]: e.target.value } } }))}
                className="w-full text-xs bg-white rounded-lg border border-[#DCDAD5] p-2" />}
            </div>)}
          </div>}
          {form.esg.status === 'ASSESSED' && <div className="rounded-lg border border-[#DCDAD5] p-3 space-y-2 bg-white">
            <div className="text-xs font-bold text-[#09331F]">المطابقة مع كتالوج ESG (34 حالة مرجعية)</div>
            <div className="text-[11px] text-slate-700">تصنيف المخاطرة التشغيلي L1: <strong>{riskL1 || 'غير محدد'}</strong>. اختاري الحالة المرجعية المطابقة للسبب الفعلي للمخاطرة، وليس لمجرد التشابه في الكلمات.</div>
            {!catalog.length && <div className="text-xs text-red-700">الكتالوج غير متاح. لا يمكن اعتماد تصنيف ESG دون التحقق من المرجع.</div>}
            <div className="max-h-48 overflow-y-auto space-y-2">
              {catalog.filter(item => form.esg.pillars.includes(item.pillar)).map(item => <label key={item.id} className="flex items-start gap-2 text-xs border-b border-[#E5E3DE] pb-2">
                <input type="checkbox" disabled={!editable} checked={(form.esg.catalogue_ids || []).includes(item.id)}
                  onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, catalogue_ids: e.target.checked ? [...(f.esg.catalogue_ids || []), item.id] : (f.esg.catalogue_ids || []).filter(x => x !== item.id) } }))} />
                <span><strong>{item.pillar}-{item.id}:</strong> {item.risk_example_ar}<br/><span className="text-slate-600">L1: {item.l1_ar} | L2: {item.l2_ar}</span></span>
              </label>)}
            </div>
            <textarea disabled={!editable} value={form.esg.taxonomy_mismatch_reason || ''} rows={2}
              onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, taxonomy_mismatch_reason: e.target.value } }))}
              placeholder="تبرير اختلاف L1 عن المرجع، عند وجود اختلاف حقيقي يتطلب موافقة المراجع" className="w-full text-xs bg-[#F8F8F6] rounded-lg border border-[#DCDAD5] p-2" />
            <div className="text-[11px] text-slate-600">التصنيف يدوي ومؤيد بالأدلة؛ لا يتم استنتاج ESG تلقائيًا. أي تعارض مع L1 يلزم توثيقه ومراجعته.</div>
          </div>}
          {form.esg.status === 'NO_DOCUMENTED_LINK' && <textarea disabled={!editable} rows={2} value={form.esg.justification} placeholder="سبب عدم ثبوت صلة بالمحاور الثلاثة"
            onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, justification: e.target.value } }))}
            className="w-full rounded-lg bg-white border border-[#DCDAD5] p-2 text-xs" />}
        </div>
        <div className="bg-[#F8F8F6] rounded-xl border border-[#E5E3DE] p-3.5 space-y-2">
          <label className="text-xs font-bold text-[#09331F] block">تصنيف قبول المخاطرة — قرار المراجع</label>
          <select disabled={!editable} value={accOtherMode ? 'OTHER' : (form.acceptance_class ?? '')} className="w-full bg-white border border-[#DCDAD5] rounded-lg p-2 text-xs font-semibold"
            onChange={e => {
              const val = e.target.value;
              if (val === 'OTHER') {
                setAccOtherMode(true);
                return;
              }
              setAccOtherMode(false);
              setForm(f => ({ ...f, acceptance_class: val ? Number(val) : null, corrective_action: val === '3' || val === '4' ? f.corrective_action : '' }));
            }}>
            <option value="">لم يُحدد بعد</option>
            {CHOICES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            <option value="OTHER">أخرى</option>
          </select>
          <textarea disabled={!editable} rows={2} placeholder={accOtherMode ? 'أدخل توصيف قرار القبول المخصص (أخرى) وأساسه المنطقي...' : 'الأساس المنطقي لقرار القبول'} value={form.acceptance_rationale}
            onChange={e => setForm(f => ({ ...f, acceptance_rationale: e.target.value }))}
            className="w-full rounded-lg bg-white border border-[#DCDAD5] p-2 text-xs" />
          {(form.acceptance_class === 3 || form.acceptance_class === 4) && <textarea disabled={!editable} rows={2} placeholder="الإجراء التصحيحي المطلوب"
            value={form.corrective_action} onChange={e => setForm(f => ({ ...f, corrective_action: e.target.value }))}
            className="w-full rounded-lg bg-white border border-[#DCDAD5] p-2 text-xs" />}
        </div>
        {result && <div className="rounded-xl bg-emerald-50/70 border border-[#006547]/30 p-3 text-xs text-[#09331F] flex flex-wrap gap-4">
          <span>أعلى أثر غير مالي: <strong>{result.nfi_overall}</strong></span>
          <span>مخاطرة رئيسية (Residual/NFI ≥ H): <strong>{result.key_risk === 'YES' ? 'نعم' : result.key_risk === 'NO' ? 'لا' : 'قيد الاستيفاء'}</strong></span>
          <span>جاهزية هذه المخاطرة: <strong>{result.ready_for_export ? 'مكتملة' : 'غير مكتملة'}</strong></span>
          {result.esg_taxonomy_override_required && <span className="text-amber-800 font-bold">تعارض في مطابقة ESG مع L1؛ راجع التبرير</span>}
          {result.stale_after_risk_change && <span className="text-amber-800 font-bold">تغيّرت مدخلات المخاطرة؛ أعيدي التحقق والحفظ</span>}
        </div>}
        {message && <p role="status" className="text-xs font-bold text-[#09331F]">{message}</p>}
        {editable && <button type="button" onClick={save} disabled={saving} className="bg-[#006547] hover:bg-[#09331F] text-white rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-60 cursor-pointer shadow-2xs">{saving ? 'جارٍ الحفظ...' : 'حفظ تقييم الأثر غير المالي'}</button>}
      </>}
    </section>
  );
}
