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
    <section className="m-4 bg-[#F0EFED] rounded-2xl border border-[#C6C4C1] p-4 space-y-4" aria-label="تقييم الأثر غير المالي والاستدامة">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-[#09331F]">الأثر غير المالي والاستدامة وقبول المخاطرة</h4>
        <span className="text-xs font-bold text-slate-700">{result?.status === 'COMPLETE' ? 'مكتمل' : 'يتطلب استكمالًا'}</span>
      </div>
      {loading ? <p className="text-xs">جارٍ تحميل مدخلات التقييم...</p> : <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DIMENSIONS.map(([key, label]) => (
            <div key={key} className="bg-[#ECEBE8] rounded-xl border border-[#CECCC9] p-3 space-y-2">
              <label className="block text-xs font-bold">{label}</label>
              <select disabled={!editable} aria-label={`تقييم ${label}`} className="w-full bg-[#F4F3F0] border rounded-lg p-2 text-xs disabled:opacity-70"
                value={form.nfi[key]?.rating || 'PENDING'} onChange={e => setForm(p => ({ ...p, nfi: { ...p.nfi, [key]: { ...p.nfi[key], rating: e.target.value } } }))}>
                <option value="PENDING">لم يُستوفَ بعد</option>
                <option value="-">لا يوجد تأثير مثبت (-)</option>
                <option value="L">منخفض</option><option value="M">متوسط</option>
                <option value="H">مرتفع</option><option value="VH">مرتفع جدًا</option><option value="C">كارثي</option>
              </select>
              <textarea disabled={!editable} rows={2} value={form.nfi[key]?.evidence || ''}
                onChange={e => setForm(p => ({ ...p, nfi: { ...p.nfi, [key]: { ...p.nfi[key], evidence: e.target.value } } }))}
                placeholder="المصدر أو سبب عدم التأثر" aria-label={`دليل ${label}`}
                className="w-full bg-[#F4F3F0] border rounded-lg p-2 text-xs disabled:opacity-70" />
            </div>
          ))}
        </div>
        <div className="bg-[#ECEBE8] rounded-xl border border-[#CECCC9] p-3 space-y-2">
          <label className="text-xs font-bold block">تصنيف الاستدامة (ESG)</label>
          <select disabled={!editable} value={form.esg.status} className="w-full rounded-lg p-2 bg-[#F4F3F0] border text-xs"
            onChange={e => setForm(p => ({ ...p, esg: { ...p.esg, status: e.target.value, pillars: e.target.value === 'ASSESSED' ? p.esg.pillars : [], catalogue_ids: e.target.value === 'ASSESSED' ? p.esg.catalogue_ids : [], evidence: e.target.value === 'ASSESSED' ? p.esg.evidence : {} } }))}>
            <option value="PENDING">لم يُحسم بعد</option>
            <option value="ASSESSED">صلة موثقة بالاستدامة</option>
            <option value="NO_DOCUMENTED_LINK">لا توجد صلة مثبتة في الأدلة</option>
          </select>
          {form.esg.status === 'ASSESSED' && <div className="flex flex-wrap gap-4">
            {(['E','S','G'] as const).map(pillar => <div key={pillar} className="space-y-1 flex-1 min-w-32">
              <label className="flex gap-2 items-center text-xs font-semibold"><input type="checkbox" disabled={!editable}
                checked={form.esg.pillars.includes(pillar)} onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, pillars: e.target.checked ? [...f.esg.pillars, pillar] : f.esg.pillars.filter(x => x !== pillar), catalogue_ids: e.target.checked ? f.esg.catalogue_ids : (f.esg.catalogue_ids || []).filter(id => catalog.find(c => c.id === id)?.pillar !== pillar) } }))} />
                {pillar === 'E' ? 'بيئي E' : pillar === 'S' ? 'اجتماعي S' : 'حوكمة G'}</label>
              {form.esg.pillars.includes(pillar) && <textarea disabled={!editable} rows={2} placeholder="الدليل المرتبط بهذا التصنيف"
                value={form.esg.evidence[pillar] || ''} onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, evidence: { ...f.esg.evidence, [pillar]: e.target.value } } }))}
                className="w-full text-xs bg-[#F4F3F0] rounded-lg border p-2" />}
            </div>)}
          </div>}
          {form.esg.status === 'ASSESSED' && <div className="rounded-lg border border-[#C6C4C1] p-3 space-y-2 bg-[#F4F3F0]">
            <div className="text-xs font-bold">المطابقة مع كتالوج ESG (34 حالة مرجعية)</div>
            <div className="text-[11px] text-slate-700">تصنيف المخاطرة التشغيلي L1: <strong>{riskL1 || 'غير محدد'}</strong>. اختاري الحالة المرجعية المطابقة للسبب الفعلي للمخاطرة، وليس لمجرد التشابه في الكلمات.</div>
            {!catalog.length && <div className="text-xs text-red-700">الكتالوج غير متاح. لا يمكن اعتماد تصنيف ESG دون التحقق من المرجع.</div>}
            <div className="max-h-48 overflow-y-auto space-y-2">
              {catalog.filter(item => form.esg.pillars.includes(item.pillar)).map(item => <label key={item.id} className="flex items-start gap-2 text-xs border-b border-[#DEDBD5] pb-2">
                <input type="checkbox" disabled={!editable} checked={(form.esg.catalogue_ids || []).includes(item.id)}
                  onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, catalogue_ids: e.target.checked ? [...(f.esg.catalogue_ids || []), item.id] : (f.esg.catalogue_ids || []).filter(x => x !== item.id) } }))} />
                <span><strong>{item.pillar}-{item.id}:</strong> {item.risk_example_ar}<br/><span className="text-slate-600">L1: {item.l1_ar} | L2: {item.l2_ar}</span></span>
              </label>)}
            </div>
            <textarea disabled={!editable} value={form.esg.taxonomy_mismatch_reason || ''} rows={2}
              onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, taxonomy_mismatch_reason: e.target.value } }))}
              placeholder="تبرير اختلاف L1 عن المرجع، عند وجود اختلاف حقيقي يتطلب موافقة المراجع" className="w-full text-xs bg-[#ECEBE8] rounded-lg border p-2" />
            <div className="text-[11px] text-slate-600">التصنيف يدوي ومؤيد بالأدلة؛ لا يتم استنتاج ESG تلقائيًا. أي تعارض مع L1 يلزم توثيقه ومراجعته.</div>
          </div>}
          {form.esg.status === 'NO_DOCUMENTED_LINK' && <textarea disabled={!editable} rows={2} value={form.esg.justification} placeholder="سبب عدم ثبوت صلة بالمحاور الثلاثة"
            onChange={e => setForm(f => ({ ...f, esg: { ...f.esg, justification: e.target.value } }))}
            className="w-full rounded-lg bg-[#F4F3F0] border p-2 text-xs" />}
        </div>
        <div className="bg-[#ECEBE8] rounded-xl border border-[#CECCC9] p-3 space-y-2">
          <label className="text-xs font-bold block">تصنيف قبول المخاطرة — قرار المراجع</label>
          <select disabled={!editable} value={form.acceptance_class ?? ''} className="w-full bg-[#F4F3F0] border rounded-lg p-2 text-xs"
            onChange={e => setForm(f => ({ ...f, acceptance_class: e.target.value ? Number(e.target.value) : null, corrective_action: e.target.value === '3' || e.target.value === '4' ? f.corrective_action : '' }))}>
            <option value="">لم يُحدد بعد</option>
            {CHOICES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <textarea disabled={!editable} rows={2} placeholder="الأساس المنطقي لقرار القبول" value={form.acceptance_rationale}
            onChange={e => setForm(f => ({ ...f, acceptance_rationale: e.target.value }))}
            className="w-full rounded-lg bg-[#F4F3F0] border p-2 text-xs" />
          {(form.acceptance_class === 3 || form.acceptance_class === 4) && <textarea disabled={!editable} rows={2} placeholder="الإجراء التصحيحي المطلوب"
            value={form.corrective_action} onChange={e => setForm(f => ({ ...f, corrective_action: e.target.value }))}
            className="w-full rounded-lg bg-[#F4F3F0] border p-2 text-xs" />}
        </div>
        {result && <div className="rounded-lg bg-[#E2E6E3] p-3 text-xs text-[#09331F] flex flex-wrap gap-4">
          <span>أعلى أثر غير مالي: <strong>{result.nfi_overall}</strong></span>
          <span>مخاطرة رئيسية: <strong>{result.key_risk === 'YES' ? 'نعم' : result.key_risk === 'NO' ? 'لا' : 'قيد الاستيفاء'}</strong></span>
          <span>جاهزية هذه المخاطرة: <strong>{result.ready_for_export ? 'مكتملة' : 'غير مكتملة'}</strong></span>
          {result.esg_taxonomy_override_required && <span className="text-amber-800 font-bold">تعارض في مطابقة ESG مع L1؛ راجع التبرير</span>}
          {result.stale_after_risk_change && <span className="text-amber-800 font-bold">تغيّرت مدخلات المخاطرة؛ أعيدي التحقق والحفظ</span>}
        </div>}
        {message && <p role="status" className="text-xs font-bold text-[#09331F]">{message}</p>}
        {editable && <button type="button" onClick={save} disabled={saving} className="bg-[#006547] hover:bg-[#09331F] text-white rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-60">{saving ? 'جارٍ الحفظ...' : 'حفظ تقييم الأثر غير المالي'}</button>}
      </>}
    </section>
  );
}
