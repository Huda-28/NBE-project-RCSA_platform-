import React, { useState } from 'react';
import { 
  Bot, 
  Cpu, 
  FileText, 
  Check, 
  Edit3, 
  X, 
  Sparkles, 
  HelpCircle,
  ExternalLink,
  Layers,
  ArrowRight
} from 'lucide-react';

export const AIAgentPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'reviews'>('reviews');

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-['Cairo']">
      {/* Page Header */}
      <div className="bg-[#ECEBE8] p-5 rounded-2xl border border-[#C6C4C1] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center shrink-0 shadow-inner">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">وكيل الذكاء الاصطناعي المصرفي (AI Agent)</h2>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300">
                المرحلة 3: قيد التفعيل
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              مساعد تحليلي لمضاهاة وثائق العمل (SOPs) مع كتالوج ESG وشجرة التصنيف L1-L3 وقاعدة الحوادث التاريخية.
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="bg-[#E2E1DE] border border-[#B8B6B2] px-3 py-1.5 rounded-xl text-xs text-slate-800 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#006547]" />
          <span>الوضع الراهن: <strong>التشغيل القطعي غير المتصل (Offline Mode)</strong></span>
        </div>
      </div>

      {/* Business Unit Selection Bar */}
      <div className="bg-[#ECEBE8] p-4 rounded-xl border border-[#C6C4C1] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#006547]" />
          <span className="text-xs font-bold text-slate-800">الوحدة التنظيمية المستهدفة للتحليل:</span>
        </div>
        <select 
          className="px-3 py-1.5 text-xs font-semibold border border-[#B8B6B2] rounded-xl bg-[#F4F3F0] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
          defaultValue="BU-POS"
        >
          <option value="BU-SYNDICATED">إدارة عمليات القروض المشتركة (SYND-OPS) - تقييم معتمد متوفر</option>
          <option value="BU-ACCOUNT">إدارة عمليات فتح الحسابات (ACCT-OPS) - تقييم معتمد متوفر</option>
          <option value="BU-POS">إدارة عمليات ماكينات نقاط البيع (POS-OPS) - تقييم معتمد متوفر</option>
          <option value="BU-TRADING">التداول (TRADING) - لم يتم إنشاء تقييم بعد (يدعم التحليل الأولي من الـ SOP)</option>
        </select>
      </div>

      {/* Preview of Individual Item Decision Engine (Accept / Edit / Reject) */}
      <div className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#CECCC9] pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#F79C1E]" />
              <span>معاينة واجهة مراجعة التوصيات الفردية (Individual Decision Cards)</span>
            </h3>
            <p className="text-[11px] text-slate-600">
              في المرحلة 3، تُعرض كل توصية كبطاقة مستقلة تلزم المستخدم باتخاذ قرار صريح (قبول / تعديل / رفض) قبل اعتماد المسودة.
            </p>
          </div>
          <span className="text-xs bg-[#E2E1DE] border border-[#C6C4C1] text-slate-700 px-2 py-1 rounded-lg font-mono">
            Pattern Preview
          </span>
        </div>

        {/* Demonstration Review Card */}
        <div className="border-2 border-[#006547]/35 bg-[#E4E7E4] rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono">
                  PROPOSED-RISK-01
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                  L3-08-03-02 (فقدان المستندات القانونية)
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                  ESG: G (حوكمة العمليات)
                </span>
              </div>
              <h4 className="text-sm font-bold text-slate-900">
                خطر فقدان أصول مستندات التحويلات المالية ورسائل السويفت الورقية
              </h4>
              <p className="text-xs text-slate-700">
                مستند إلى تقرير التفتيش الميداني لإدارة القروض المشتركة (الملاحظة الأولى، ص 1).
              </p>
            </div>

            <div className="text-left font-mono">
              <div className="text-xs text-slate-600">Inherent / Residual</div>
              <div className="text-sm font-black text-rose-700">VH (2.0M) &rarr; M (200k)</div>
            </div>
          </div>

          {/* Evidence snippet */}
          <div className="bg-[#DFDEDB] p-3 rounded-xl border border-[#C6C4C1] text-xs text-slate-800">
            <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#006547]" />
              <span>المقطع المصدري الموثق (Audit Report Chunk #1):</span>
            </div>
            <p className="italic text-slate-700">
              "أثناء جرد عينة من ملفات التحويلات المالية الخاصة بالقروض المشتركة، تبين فقدان وعدم استيفاء الأصول الورقية لنماذج طلب التحويل..."
            </p>
          </div>

          {/* Action Decision Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-[#C6C4C1]">
            <div className="text-xs text-slate-600">
              * إنشاء المسودة الرسمية لن يتم تلقائياً، بل بطلب صريح وموافقة بعد مراجعة العناصر.
            </div>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                className="px-3 py-1.5 rounded-lg bg-[#ECEBE8] border border-[#B8B6B2] text-slate-800 hover:bg-[#F0EFED] text-xs font-semibold flex items-center gap-1 shadow-sm"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                <span>تعديل المدخلات</span>
              </button>
              <button 
                type="button"
                className="px-3 py-1.5 rounded-lg bg-rose-100/80 border border-rose-300 text-rose-800 hover:bg-rose-200/80 text-xs font-semibold flex items-center gap-1 shadow-sm"
              >
                <X className="w-3.5 h-3.5 text-rose-700" />
                <span>رفض العنصر</span>
              </button>
              <button 
                type="button"
                className="px-3 py-1.5 rounded-lg bg-[#006547] text-white hover:bg-[#09331F] text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Check className="w-3.5 h-3.5 text-[#F79C1E]" />
                <span>قبول التوصية</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
