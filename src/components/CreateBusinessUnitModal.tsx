import React, { useState } from 'react';
import { Building2, Plus, Sparkles, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

export interface PresetBusinessUnit {
  code: string;
  name_ar: string;
  name_en: string;
  description: string;
}

export const NBE_PRESET_BUSINESS_UNITS: PresetBusinessUnit[] = [
  {
    code: 'TRADE-FIN',
    name_ar: 'إدارة الاعتمادات المستندية وخطابات الضمان',
    name_en: 'Trade Finance & Documentary Credits Operations',
    description:
      'إصدار وتعديل وتحصيل الاعتمادات المستندية وخطابات الضمان المحلية والخارجية وفحص مستندات الشحن التجاري ومطابقة SWIFT',
  },
  {
    code: 'TREASURY-OPS',
    name_ar: 'إدارة عمليات الخزانة وأسواق المال',
    name_en: 'Treasury & Capital Markets Operations',
    description:
      'تسوية معاملات النقد الأجنبي وأذون وسندات الخزانة، وإدارة السيولة والمشتقات المالية ومطابقة تأكيدات البنوك المراسلة',
  },
  {
    code: 'CARDS-DIG',
    name_ar: 'إدارة البطاقات الائتمانية والمدفوعات الرقمية',
    name_en: 'Credit Cards & Digital Payments Operations',
    description:
      'إصدار وإدارة البطاقات الائتمانية والمدفوعات الإلكترونية، محفظة الفون كاش، والأهلي نت، ومعالجة التسويات والاعتراضات',
  },
  {
    code: 'CORP-CREDIT',
    name_ar: 'إدارة ائتمان الشركات والقروض الكبرى',
    name_en: 'Corporate Credit & Large Exposures Administration',
    description:
      'منح ومتابعة التسهيلات الائتمانية للشركات الكبرى، مراجعة الضمانات والعقود التمويلية، ومراقبة الحدود الائتمانية والتركزات',
  },
  {
    code: 'RETAIL-CREDIT',
    name_ar: 'إدارة التجزئة المصرفية وقروض الأفراد',
    name_en: 'Retail Banking & Consumer Loans Operations',
    description:
      'فحص ومنح القروض الشخصية وقروض السيارات والتمويل العقاري للأفراد، والاستعلام الائتماني I-Score وتحصيل الأقساط',
  },
  {
    code: 'SWIFT-SETTLE',
    name_ar: 'إدارة التحويلات المركزية والتسويات وسويفت',
    name_en: 'Central Transfers, Clearing & SWIFT Operations',
    description:
      'تنفيذ التحويلات المالية المحلية والدولية عبر السويفت وغرف المقاصة ACH/RTGS وفحص قوائم الحظر والعقوبات الدولية',
  },
  {
    code: 'SME-FIN',
    name_ar: 'إدارة تمويل المشروعات الصغيرة والمتوسطة',
    name_en: 'SME Banking & Finance Operations',
    description:
      'تمويل المشروعات الصغيرة والمتوسطة ومبادرات البنك المركزي المصري، ومتابعة التدفقات النقدية والضمانات للمشروعات',
  },
  {
    code: 'IT-SEC-OPS',
    name_ar: 'إدارة أمن المعلومات ومخاطر التكنولوجيا',
    name_en: 'Information Security & IT Risk Operations',
    description:
      'إدارة صلاحيات الأنظمة المصرفية، أمن الشبكات والبيانات، استمرارية الأعمال والتعافي من الكوارث، ومراقبة التهديدات السيبرانية',
  },
  {
    code: 'AML-COMP',
    name_ar: 'إدارة الالتزام الرقابي ومكافحة غسل الأموال',
    name_en: 'Regulatory Compliance & AML Operations',
    description:
      'مراقبة العمليات المشتبه بها، تطبيق معايير اعرف عميلك KYC، فحص قوائم العقوبات، والالتزام بتعليمات البنك المركزي المصري',
  },
  {
    code: 'BRANCH-OPS',
    name_ar: 'إدارة عمليات الفروع وخدمة العملاء',
    name_en: 'Branch Operations & Customer Service',
    description:
      'إدارة العمليات المصرفية اليومية بشبكة الفروع، الخزينة والصرافين، والأجهزة الذاتية ATM، وشكاوى وطلبات العملاء',
  },
];

interface CreateBusinessUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingUnitCodes?: string[];
  onUnitCreated: (unit: {
    id: string;
    name_ar: string;
    name_en: string;
    code: string;
    description: string;
  }) => void;
}

export const CreateBusinessUnitModal: React.FC<CreateBusinessUnitModalProps> = ({
  isOpen,
  onClose,
  existingUnitCodes = [],
  onUnitCreated,
}) => {
  const { token, refreshUser } = useAuth();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const existingSet = new Set(existingUnitCodes.map((c) => String(c || '').toUpperCase()));

  const handleSelectPreset = (preset: PresetBusinessUnit) => {
    setNameAr(preset.name_ar);
    setNameEn(preset.name_en);
    setCode(preset.code);
    setDescription(preset.description);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const cleanAr = nameAr.trim();
    if (!cleanAr) {
      setErrorMsg('يرجى إدخال اسم الوحدة التنظيمية بالعربية أو اختيار وحدة من الدليل.');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/business-units', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name_ar: cleanAr,
          name_en: nameEn.trim() || undefined,
          code: code.trim().toUpperCase() || undefined,
          description: description.trim() || undefined,
          allow_existing: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'تعذر إضافة أو تفعيل الوحدة التنظيمية.');
      }

      // Refresh user roles so frontend RBAC immediately recognizes MAKER permission on the new unit
      await refreshUser();

      const createdUnit = data.business_unit;
      setNameAr('');
      setNameEn('');
      setCode('');
      setDescription('');
      onUnitCreated(createdUnit);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ الوحدة التنظيمية.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="إضافة أو اختيار وحدة تنظيمية جديدة"
      data-testid="create-business-unit-modal"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-['Cairo']"
      dir="rtl"
    >
      <div className="bg-white w-full max-w-3xl rounded-2xl border-2 border-[#09331F] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#09331F] text-white px-5 py-4 border-b-3 border-[#F79C1E] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#006547] border border-[#F79C1E]/50 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-[#F79C1E]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                إضافة أو تفعيل وحدة تنظيمية للعمل عليها (RCSA)
              </h3>
              <p className="text-[11px] text-emerald-200 mt-0.5">
                اختر من دليل إدارات البنك الأهلي المصري أو أدخل اسم أي وحدة عمل جديدة لبدء استخراج المخاطر وتوليد مصفوفة RCSA لها فوراً.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-800 text-white border border-white/15 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 bg-[#F8F8F6]">
          {/* Section 1: Quick Select from NBE Units Catalog */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#09331F]">
                <Sparkles className="w-4 h-4 text-[#006547]" />
                <span>اختيار سريع من دليل إدارات ووحدات البنك الأهلي المصري:</span>
              </div>
              <span className="text-[10px] text-slate-500 font-semibold">
                اضغط على أي وحدة لملء بياناتها تلقائياً
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {NBE_PRESET_BUSINESS_UNITS.map((preset) => {
                const isSelected = code.toUpperCase() === preset.code || nameAr === preset.name_ar;
                const isAlreadyActive = existingSet.has(preset.code);
                return (
                  <button
                    key={preset.code}
                    type="button"
                    data-testid={`preset-unit-${preset.code}`}
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'bg-emerald-50 border-[#006547] ring-2 ring-[#006547]/30'
                        : 'bg-white border-[#DCDAD5] hover:border-[#006547]/60 hover:bg-emerald-50/30'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#09331F] truncate">
                        {preset.name_ar}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        {preset.description}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="px-2 py-0.5 rounded bg-[#09331F]/10 text-[#09331F] font-mono text-[10px] font-bold">
                        {preset.code}
                      </span>
                      {isAlreadyActive && (
                        <span className="text-[9px] text-[#006547] font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> مفعّلة
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Custom Unit Form */}
          <form onSubmit={handleSubmit} className="bg-white p-4 rounded-2xl border border-[#DCDAD5] space-y-4">
            <div className="text-xs font-extrabold text-[#09331F] border-b border-[#E5E3DE] pb-2">
              بيانات الوحدة التنظيمية (يمكنك تعديلها أو كتابة أي وحدة مخصصة جديدة):
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-bold text-slate-800 sm:col-span-2">
                <span>
                  اسم الوحدة التنظيمية بالعربية <span className="text-rose-600">*</span>
                </span>
                <input
                  type="text"
                  required
                  data-testid="new-unit-name-ar-input"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="مثال: إدارة الاعتمادات المستندية وخطابات الضمان / إدارة التمويل العقاري..."
                  className="w-full rounded-xl border border-[#DCDAD5] bg-[#F8F8F6] px-3.5 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#006547] outline-none"
                />
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-800">
                <span>رمز الوحدة المختصر (Code - اختياري يُولّد تلقائياً)</span>
                <input
                  type="text"
                  dir="ltr"
                  data-testid="new-unit-code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="مثال: TRADE-FIN أو MORTGAGE"
                  className="w-full rounded-xl border border-[#DCDAD5] bg-[#F8F8F6] px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#006547] outline-none"
                />
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-800">
                <span>الاسم بالإنجليزية (اختياري)</span>
                <input
                  type="text"
                  dir="ltr"
                  data-testid="new-unit-name-en-input"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="e.g. Trade Finance Operations"
                  className="w-full rounded-xl border border-[#DCDAD5] bg-[#F8F8F6] px-3.5 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#006547] outline-none"
                />
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-800 sm:col-span-2">
                <span>وصف الأنشطة والعمليات الرئيسية للوحدة (اختياري)</span>
                <textarea
                  rows={2}
                  data-testid="new-unit-desc-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف مختصر لأنشطة الوحدة ليستخدمه الوكيل الذكي في فهم سياق المخاطر والضوابط..."
                  className="w-full rounded-xl border border-[#DCDAD5] bg-[#F8F8F6] px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#006547] outline-none"
                />
              </label>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5E3DE]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-[#DCDAD5] bg-[#F8F8F6] hover:bg-[#EFECE6] text-xs font-bold text-slate-700 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={busy}
                data-testid="confirm-create-unit-btn"
                className="px-5 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#F79C1E]" />
                <span>{busy ? 'جارٍ التفعيل والحفظ...' : 'تفعيل وفتح الوحدة للعمل عليها الآن'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
