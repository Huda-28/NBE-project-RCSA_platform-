import React, { useEffect, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Printer,
  X,
  Palette,
  Columns3,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { OfficialRcsaReportModel } from '../utils/officialReportBuilder.js';

interface OfficialRcsaReportModalProps {
  assessmentId: string;
  unitId: string;
  token: string | null;
  isOpen: boolean;
  onClose: () => void;
  onExportExcel?: () => Promise<void> | void;
}

function getToneBgClass(tone: 'green' | 'yellow' | 'orange' | 'neutral'): string {
  if (tone === 'green') return 'bg-[#99FF99] text-black font-bold';
  if (tone === 'yellow') return 'bg-[#FFFF00] text-black font-bold';
  if (tone === 'orange') return 'bg-[#F79646] text-black font-bold';
  return 'bg-white text-black';
}

export const OfficialRcsaReportModal: React.FC<OfficialRcsaReportModalProps> = ({
  assessmentId,
  unitId,
  token,
  isOpen,
  onClose,
  onExportExcel,
}) => {
  const [loading, setLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [reportModel, setReportModel] = useState<OfficialRcsaReportModel | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string>('');
  const [theme, setTheme] = useState<'reference_burgundy' | 'nbe_emerald'>('reference_burgundy');
  const [includeExtendedColumns, setIncludeExtendedColumns] = useState<boolean>(false);
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!isOpen || !assessmentId || !token) return;
    let active = true;
    setLoading(true);
    setErrorMsg(null);

    const q = new URLSearchParams({
      theme,
      extended: includeExtendedColumns ? '1' : '0',
    });

    fetch(
      `/api/hitl/assessments/${encodeURIComponent(assessmentId)}/export-report-model?${q.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || 'تعذر تحميل بيانات التقرير الرسمي.');
        }
        return body;
      })
      .then((data) => {
        if (!active) return;
        setReportModel(data.report_model || null);
        setHtmlPreview(data.html_preview || '');
      })
      .catch((err: any) => {
        if (!active) return;
        setErrorMsg(err.message || 'حدث خطأ أثناء تجهيز معاينة التقرير.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, assessmentId, token, theme, includeExtendedColumns]);

  if (!isOpen) return null;

  const handleDownloadPdf = async () => {
    if (!assessmentId || !token) return;
    setDownloadingPdf(true);
    setErrorMsg(null);
    setStatusToast(null);
    try {
      const q = new URLSearchParams({
        theme,
        extended: includeExtendedColumns ? '1' : '0',
      });
      const response = await fetch(
        `/api/hitl/assessments/${encodeURIComponent(assessmentId)}/export-pdf?${q.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'تعذر إنشاء تقرير PDF الرسمي.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const disposition = response.headers.get('Content-Disposition') || '';
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;\s]+)/i);
      const plainMatch = disposition.match(/filename="([^"]+)"/i);
      let filename = plainMatch?.[1] || `RCSA_${unitId}_Official_Report.pdf`;
      if (utf8Match?.[1]) {
        try {
          filename = decodeURIComponent(utf8Match[1]);
        } catch {
          // keep fallback
        }
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatusToast(`تم تنزيل تقرير PDF الرسمي بنجاح (${filename})`);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء تنزيل ملف PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (onExportExcel) {
      setDownloadingXlsx(true);
      try {
        await onExportExcel();
        setStatusToast('تم تنزيل ملف Excel الرسمي بنجاح');
      } finally {
        setDownloadingXlsx(false);
      }
      return;
    }
    if (!assessmentId || !token) return;
    setDownloadingXlsx(true);
    setErrorMsg(null);
    try {
      const response = await fetch(
        `/api/hitl/assessments/${encodeURIComponent(assessmentId)}/export-xlsx`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'تعذر تصدير ملف Excel الرسمي.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const disposition = response.headers.get('Content-Disposition') || '';
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;\s]+)/i);
      const plainMatch = disposition.match(/filename="([^"]+)"/i);
      let filename = plainMatch?.[1] || `RCSA_${unitId}.xlsx`;
      if (utf8Match?.[1]) {
        try {
          filename = decodeURIComponent(utf8Match[1]);
        } catch {
          // keep fallback
        }
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatusToast(`تم تنزيل ملف Excel الرسمي بنجاح (${filename})`);
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تصدير ملف Excel.');
    } finally {
      setDownloadingXlsx(false);
    }
  };

  const handlePrintInIframe = () => {
    if (!htmlPreview || !printIframeRef.current) return;
    const iframe = printIframeRef.current;
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(htmlPreview);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 250);
  };

  const headerBgHex = theme === 'nbe_emerald' ? 'bg-[#09331F]' : 'bg-[#963634]';
  const subHeaderBgHex = theme === 'nbe_emerald' ? 'bg-[#006547]' : 'bg-[#963634]';
  const titleTextColor = theme === 'nbe_emerald' ? 'text-[#09331F]' : 'text-[#C00000]';
  const chromeBarBg = theme === 'nbe_emerald' ? 'bg-[#09331F]' : 'bg-[#963634]';
  const chromeBorderColor = theme === 'nbe_emerald' ? 'border-[#09331F]' : 'border-[#963634]';
  const chromeSubColor = theme === 'nbe_emerald' ? 'text-emerald-200/90' : 'text-rose-100';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="معاينة وتصدير تقرير RCSA الرسمي للبنك"
      data-testid="official-report-preview-modal"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      {/* Hidden iframe for native print without window.open */}
      <iframe
        ref={printIframeRef}
        title="طباعة تقرير RCSA الرسمي"
        className="hidden"
      />

      <div className={`bg-white w-full max-w-[1620px] max-h-[94vh] rounded-2xl border-2 ${chromeBorderColor} shadow-2xl flex flex-col overflow-hidden`}>
        {/* Top Modal Control Bar */}
        <div className={`${chromeBarBg} text-white px-5 py-3.5 border-b-3 border-[#F79646] flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0`}>
          <div className="flex items-center gap-3">
            <img
              src="/assets/nbe-logo-white.png"
              alt="البنك الأهلي المصري"
              referrerPolicy="no-referrer"
              className="h-9 w-auto object-contain"
            />
            <div className="border-r border-white/20 pr-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  معاينة وتصدير تقرير RCSA الرسمي المعتمد (PDF / Excel)
                </h3>
                <span className="px-2 py-0.5 rounded bg-white text-[#963634] border border-[#F79646]/60 text-[10px] font-extrabold">
                  مطابق للقالب الرسمي للبنك
                </span>
              </div>
              <p className={`text-[11px] ${chromeSubColor} mt-0.5`}>
                يتضمن ترويسة الأهداف الاستراتيجية، دمج صفوف الضوابط المتعددة لكل مخاطرة، والتلوين الرقابي التلقائي لفاعلية الضوابط وقرار القبول.
              </p>
            </div>
          </div>

          {/* Export & Theme Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Theme Switcher */}
            <div className="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-xl border border-white/15 text-[11px]">
              <Palette className="w-3.5 h-3.5 text-[#F79646]" />
              <button
                type="button"
                onClick={() => setTheme('reference_burgundy')}
                className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                  theme === 'reference_burgundy'
                    ? 'bg-white text-[#963634] border border-white'
                    : 'text-white/85 hover:text-white'
                }`}
              >
                القالب الرسمي المرجعي (الافتراضي)
              </button>
              <button
                type="button"
                onClick={() => setTheme('nbe_emerald')}
                className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                  theme === 'nbe_emerald'
                    ? 'bg-[#006547] text-[#F79C1E] border border-[#F79C1E]/50'
                    : 'text-white/85 hover:text-white'
                }`}
              >
                النسق الأخضر (اختياري)
              </button>
            </div>

            {/* Extended Columns Toggle */}
            <button
              type="button"
              onClick={() => setIncludeExtendedColumns((prev) => !prev)}
              data-testid="toggle-extended-report-cols-btn"
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                includeExtendedColumns
                  ? 'bg-[#F79C1E] text-[#09331F] border-[#F79C1E]'
                  : 'bg-white/10 text-white border-white/20 hover:bg-white/15'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>
                {includeExtendedColumns
                  ? 'عرض الأعمدة القياسية (18 عموداً)'
                  : 'إظهار كافة الأعمدة (29 عموداً + ESG)'}
              </span>
            </button>

            {/* Download Official PDF Button */}
            <button
              type="button"
              disabled={downloadingPdf || loading}
              onClick={handleDownloadPdf}
              data-testid="modal-download-pdf-btn"
              className="px-3.5 py-1.5 rounded-xl bg-[#F79C1E] hover:bg-amber-400 text-[#09331F] text-xs font-extrabold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[#09331F]" />
              <span>{downloadingPdf ? 'جارٍ توليد PDF...' : 'تنزيل تقرير PDF الرسمي (.pdf)'}</span>
            </button>

            {/* Download Official Excel Button */}
            <button
              type="button"
              disabled={downloadingXlsx || loading}
              onClick={handleDownloadExcel}
              data-testid="modal-download-xlsx-btn"
              className="px-3.5 py-1.5 rounded-xl bg-[#006547] hover:bg-[#007a56] text-white border border-emerald-400/40 text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#F79C1E]" />
              <span>{downloadingXlsx ? 'جارٍ تصدير Excel...' : 'تنزيل ملف Excel الرسمي (.xlsx)'}</span>
            </button>

            {/* Print A3 Landscape Button */}
            <button
              type="button"
              disabled={loading || !htmlPreview}
              onClick={handlePrintInIframe}
              data-testid="modal-print-report-btn"
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#F79C1E]" />
              <span>طباعة (A3 Landscape)</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق معاينة التقرير"
              data-testid="close-official-report-modal-btn"
              className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-800 text-white border border-white/15 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status / Error Banner */}
        {(errorMsg || statusToast) && (
          <div
            className={`px-5 py-2.5 text-xs font-bold flex items-center justify-between border-b ${
              errorMsg
                ? 'bg-rose-50 text-rose-900 border-rose-200'
                : 'bg-emerald-50 text-[#09331F] border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {errorMsg ? (
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[#006547] shrink-0" />
              )}
              <span>{errorMsg || statusToast}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setStatusToast(null);
              }}
              className="text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Scrollable Report Sheet Canvas */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-[#E5E7EB]">
          {loading ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-[#DCDAD5] space-y-3">
              <div className="w-9 h-9 border-4 border-[#006547] border-t-[#F79C1E] rounded-full animate-spin mx-auto" />
              <div className="text-sm font-bold text-[#09331F]">
                جارٍ بناء نموذج المخاطر الافتراضي ومطابقة الضوابط والأثر المالي وغير المالي...
              </div>
            </div>
          ) : reportModel ? (
            <div
              data-testid="official-rcsa-paper-sheet"
              className="bg-white p-4 sm:p-5 rounded-xl shadow-lg border border-slate-300 space-y-3.5 w-full text-black font-['Sakkal_Majalla','Calibri','Arial','Noto_Naskh_Arabic','Noto_Sans_Arabic',sans-serif]"
            >
              {/* 1. Official NBE Branding Header Bar */}
              <div className={`flex items-center justify-between ${chromeBarBg} text-white px-5 py-3 rounded-lg border-b-3 border-[#F79646]`}>
                <div className="flex items-center gap-3.5">
                  <img
                    src="/assets/nbe-logo-white.png"
                    alt="البنك الأهلي المصري"
                    className="h-9 w-auto object-contain"
                  />
                  <div className="border-r border-white/20 pr-3">
                    <div className="text-sm font-extrabold text-white">
                      البنك الأهلي المصري — قطاع المخاطر التشغيلية والالتزام الرقابي
                    </div>
                    <div className={`text-[11px] ${chromeSubColor}`}>
                      التقرير الرسمي لمصفوفة التقييم الذاتي للمخاطر والضوابط الرقابية (RCSA)
                    </div>
                  </div>
                </div>
                <div className="text-left text-[11px] space-y-1">
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded font-bold border ${
                      theme === 'nbe_emerald'
                        ? 'bg-[#006547] border-[#F79C1E]/60 text-[#F79C1E]'
                        : 'bg-white border-[#C00000]/40 text-[#963634]'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{reportModel.status_badge_ar}</span>
                  </div>
                  <div className="text-white/90 font-['Calibri','Arial',sans-serif] tabular-nums">
                    الوحدة: {reportModel.unit_code} | التاريخ: {reportModel.date_label_ar}
                  </div>
                </div>
              </div>

              {/* 2. Official Reference Title Box (Exact Match to Page 1 of User's Attached PDF) */}
              <div className="border-2 border-black bg-white">
                <div
                  data-testid="official-report-title-banner"
                  className={`py-4 px-4 text-center text-lg sm:text-xl font-extrabold border-b border-black ${titleTextColor}`}
                >
                  {reportModel.title_ar}
                </div>
                <div className="flex items-stretch min-h-[34px]">
                  <div
                    className={`w-44 ${headerBgHex} text-white text-xs font-bold flex items-center justify-center px-3 py-1.5 border-l border-black shrink-0`}
                  >
                    الأهداف الاستراتيجية
                  </div>
                  <div className="flex-1 px-4 py-1.5 text-xs sm:text-sm font-bold text-black flex items-center">
                    {reportModel.strategic_objective_ar}
                  </div>
                </div>
              </div>

              {/* 3. Official RCSA Matrix Table (Exact Match to Pages 2-5 of User's Attached PDF) */}
              <div className="overflow-x-auto">
                <table
                  data-testid="official-rcsa-matrix-table"
                  className="w-full border-collapse border-2 border-black text-[10px] leading-snug text-black"
                >
                  <thead>
                    <tr className={`${headerBgHex} text-white font-bold text-center`}>
                      <th rowSpan={2} className="border border-black p-1 w-7">
                        المرجع
                      </th>
                      {includeExtendedColumns && (
                        <>
                          <th rowSpan={2} className="border border-black p-1.5 w-20">
                            الأنشطة
                            <div className="text-[8px] font-normal opacity-90">Process</div>
                          </th>
                          <th rowSpan={2} className="border border-black p-1.5 w-20">
                            الأهداف الاستراتيجية
                          </th>
                          <th rowSpan={2} className="border border-black p-1.5 w-24">
                            مكتبة المخاطر
                          </th>
                        </>
                      )}
                      <th rowSpan={2} className="border border-black p-1.5 w-28">
                        المخاطر
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-10">
                        المخاطر الرئيسية
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-14">
                        عدد مرات حدوث المخاطرة
                      </th>
                      <th colSpan={3} className="border border-black p-1.5">
                        <div>تقييم المخاطرة في ظل عدم تطبيق الضوابط الرقابية</div>
                        <div className="text-[9px] font-mono">Inherent risk</div>
                      </th>
                      <th colSpan={2} className="border border-black p-1.5">
                        الضوابط الرقابية المطبقة
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-16">
                        آلية تطبيق الضابط الرقابي
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-20">
                        فاعلية الضوابط الرقابية المطبقة
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-14">
                        دورية الضوابط الرقابية
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-16">
                        تصنيف الضوابط الرقابية
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-16">
                        نوع / طريقة تطبيق الضابط الرقابي
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-20">
                        <div>التقييم النهائي للمخاطرة في ظل تطبيق الضوابط الرقابية</div>
                        <div className="text-[9px] font-mono">Residual risk</div>
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-10">
                        التأثير المالي
                      </th>
                      <th colSpan={5} className="border border-black p-1.5">
                        التأثير غير المالي
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-24">
                        التقدير النهائي للمخاطرة ومدى فاعلية الإجراءات الرقابية المطبقة ككل
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-20">
                        إجراءات تصحيحية (إن وجدت)
                      </th>
                      <th rowSpan={2} className="border border-black p-1.5 w-36">
                        الأساس المنطقي للتقدير
                      </th>
                      <th rowSpan={2} className="border border-black p-1 w-20">
                        <div>تصنيف المخاطر المستوى الأول</div>
                        <div className="text-[9px] font-mono">Level 1</div>
                      </th>
                      {includeExtendedColumns && (
                        <th rowSpan={2} className="border border-black p-1 w-16">
                          ESG
                        </th>
                      )}
                    </tr>
                    <tr className={`${subHeaderBgHex} text-white font-bold text-[9px] text-center`}>
                      <th className="border border-black p-1 w-16">التأثير المالي</th>
                      <th className="border border-black p-1 w-20">الخسارة المتوقعة خلال سنة</th>
                      <th className="border border-black p-1 w-11">التأثير المالي للمخاطرة</th>
                      <th className="border border-black p-1 w-40">الضوابط الرقابية</th>
                      <th className="border border-black p-1 w-16">
                        المسئول عن تطبيق الضوابط الرقابية
                      </th>
                      <th className="border border-black p-1 w-9">التأثير على تقديم الخدمة</th>
                      <th className="border border-black p-1 w-9">التأثير على السمعة والعملاء</th>
                      <th className="border border-black p-1 w-10">
                        التعرض لملاحظات الجهات الرقابية
                      </th>
                      <th className="border border-black p-1 w-9">التعرض لإجراءات قضائية</th>
                      <th className="border border-black p-1 w-9">التأثير غير المالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportModel.risks.map((risk) => {
                      const span = Math.max(1, risk.controls.length);
                      const accToneClass = getToneBgClass(risk.final_acceptance_color_tone);

                      return risk.controls.map((ctrl, ctrlIdx) => {
                        const isFirst = ctrlIdx === 0;
                        const effToneClass = getToneBgClass(ctrl.effectiveness_color_tone);

                        return (
                          <tr
                            key={`${risk.risk_id}-ctrl-${ctrlIdx}`}
                            className="bg-white hover:bg-slate-50/60 align-top"
                          >
                            {isFirst && (
                              <>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1.5 text-center font-mono font-bold tabular-nums whitespace-nowrap"
                                >
                                  {risk.ref_number}
                                </td>
                                {includeExtendedColumns && (
                                  <>
                                    <td rowSpan={span} className="border border-black p-1.5">
                                      {risk.process_name_ar}
                                    </td>
                                    <td rowSpan={span} className="border border-black p-1.5">
                                      {risk.strategic_objective_ar}
                                    </td>
                                    <td rowSpan={span} className="border border-black p-1.5">
                                      {risk.risk_library_ar}
                                    </td>
                                  </>
                                )}
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1.5 font-bold text-right"
                                >
                                  {risk.risk_description_ar}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1 text-center font-mono font-bold whitespace-nowrap"
                                >
                                  {risk.key_risk_badge}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1.5 text-center font-semibold"
                                >
                                  {risk.expected_frequency_ar}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1.5 text-center font-mono font-bold tabular-nums whitespace-nowrap"
                                >
                                  {risk.individual_impact_egp}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1.5 text-center font-mono font-bold tabular-nums whitespace-nowrap"
                                >
                                  {risk.expected_annual_loss_egp}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1 text-center font-mono font-extrabold text-[11px] whitespace-nowrap"
                                >
                                  {risk.inherent_rating}
                                </td>
                              </>
                            )}

                            {/* Per-control columns M, N, O, P, Q, R */}
                            <td className="border border-black p-1.5 text-right">
                              {ctrl.control_description_ar}
                            </td>
                            <td className="border border-black p-1.5 text-center font-semibold">
                              {ctrl.control_owner_ar}
                            </td>
                            <td
                              dir="ltr"
                              className="border border-black p-1 text-center font-mono text-[9px] font-semibold"
                            >
                              {ctrl.control_method_label}
                            </td>
                            <td
                              className={`border border-black p-1.5 text-center ${effToneClass}`}
                            >
                              {ctrl.effectiveness_label_ar}
                            </td>
                            <td className="border border-black p-1 text-center whitespace-pre-line font-semibold">
                              {ctrl.frequency_label}
                            </td>
                            <td className="border border-black p-1 text-center whitespace-pre-line font-semibold">
                              {ctrl.control_type_label}
                            </td>

                            {isFirst && (
                              <>
                                <td
                                  rowSpan={span}
                                  dir="ltr"
                                  className="border border-black p-1 text-center font-mono text-[9px] font-bold"
                                >
                                  {risk.selected_rrf_label}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1.5 text-center font-mono font-bold tabular-nums whitespace-nowrap"
                                >
                                  {risk.residual_loss_formatted}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1 text-center font-mono font-extrabold text-[11px] whitespace-nowrap"
                                >
                                  {risk.residual_rating}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1 text-center font-mono font-bold whitespace-nowrap"
                                >
                                  {risk.nfi_service}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1 text-center font-mono font-bold whitespace-nowrap"
                                >
                                  {risk.nfi_reputation}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1 text-center font-mono font-bold whitespace-nowrap"
                                >
                                  {risk.nfi_regulatory}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1 text-center font-mono font-bold whitespace-nowrap"
                                >
                                  {risk.nfi_legal}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1 text-center font-mono font-extrabold whitespace-nowrap"
                                >
                                  {risk.nfi_overall}
                                </td>
                                <td
                                  rowSpan={span}
                                  className={`border border-black p-1.5 text-center ${accToneClass}`}
                                >
                                  {risk.final_acceptance_label_ar}
                                </td>
                                <td rowSpan={span} className="border border-black p-1.5 text-right">
                                  {risk.corrective_action_ar}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1.5 text-right leading-relaxed"
                                >
                                  {risk.assessment_rationale_ar}
                                </td>
                                <td
                                  rowSpan={span}
                                  className="border border-black p-1.5 text-center font-bold"
                                >
                                  {includeExtendedColumns
                                    ? risk.full_taxonomy_path_ar
                                    : risk.level1_category_ar}
                                </td>
                                {includeExtendedColumns && (
                                  <td
                                    rowSpan={span}
                                    className="border border-black p-1.5 text-center font-semibold"
                                  >
                                    {risk.esg_classification_ar}
                                  </td>
                                )}
                              </>
                            )}
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
