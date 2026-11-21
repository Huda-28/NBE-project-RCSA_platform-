/**
 * Authoritative Arabic Date, Time, Version Naming & Workflow Label Formatting Utilities
 * (Phase 2D.1 — Historical RCSA Registry & User-Facing Language Standards)
 *
 * Rules:
 * 1. User-facing RCSA versions must be identified primarily by their actual date and time,
 *    NOT by V1, V2, V3, or internal IDs.
 * 2. Distinguish clearly between assessment date, creation date, last modification date,
 *    submission date, and approval date.
 * 3. Do not substitute approval date for original assessment date without labeling it "تاريخ الاعتماد".
 * 4. Do not present DB-initialization timestamps on seeded records as authentic historical creation dates.
 */

const ARABIC_MONTHS: string[] = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export const SEEDED_ASSESSMENT_IDS = new Set([
  'ASM-SYND-2026-V1',
  'ASM-SYND-2026-V2-DRAFT',
  'ASM-ACCT-2026-V1',
  'ASM-POS-2026-V1',
]);

/**
 * Recorded audit-log creation timestamp for the seeded draft ASM-SYND-2026-V2-DRAFT
 * in db.ts (`2026-10-01 11:20:00`).
 */
export const SEEDED_RECORDED_AUDIT_DATES: Record<string, { created_at_recorded?: string }> = {
  'ASM-SYND-2026-V2-DRAFT': {
    created_at_recorded: '2026-10-01 11:20:00',
  },
};

/**
 * Parse a SQLite / ISO timestamp string (`YYYY-MM-DD HH:MM:SS` or `YYYY-MM-DDTHH:MM:SS...`)
 * into components without browser timezone shift drift on bare SQLite timestamps.
 */
export function parseTimestampComponents(raw?: string | null): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
} | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hours: Number(match[4]),
      minutes: Number(match[5]),
    };
  }
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return {
      year: Number(dateOnly[1]),
      month: Number(dateOnly[2]),
      day: Number(dateOnly[3]),
      hours: 0,
      minutes: 0,
    };
  }
  return null;
}

/**
 * Format a timestamp into clear Arabic banking format:
 * e.g. "15 أغسطس 2026 — 10:30 صباحًا"
 */
export function formatArabicDateTime(raw?: string | null): string {
  const parts = parseTimestampComponents(raw);
  if (!parts) return 'غير مسجل بالمصدر';

  const monthName = ARABIC_MONTHS[parts.month - 1] || String(parts.month);
  const period = parts.hours < 12 ? 'صباحًا' : 'مساءً';
  const hour12 = parts.hours % 12 === 0 ? 12 : parts.hours % 12;
  const minStr = String(parts.minutes).padStart(2, '0');

  return `${parts.day} ${monthName} ${parts.year} — ${hour12}:${minStr} ${period}`;
}

/**
 * Format only the date portion in Arabic:
 * e.g. "15 أغسطس 2026"
 */
export function formatArabicDateOnly(raw?: string | null): string {
  const parts = parseTimestampComponents(raw);
  if (!parts) return 'غير مسجل بالمصدر';
  const monthName = ARABIC_MONTHS[parts.month - 1] || String(parts.month);
  return `${parts.day} ${monthName} ${parts.year}`;
}

/**
 * Map workflow status / database status to a clear Arabic banking status label.
 */
export function formatWorkflowStatusAr(status?: string | null, fallbackStatus?: string | null): string {
  switch (status || fallbackStatus) {
    case 'APPROVED':
      return 'معتمد رسميًا (مجمد)';
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return 'مرسل بانتظار اعتماد المراجع المستقل';
    case 'REJECTED':
    case 'RETURNED_FOR_CHANGES':
      return 'معاد لاستيفاء الملاحظات الرقابية';
    case 'READY_DRAFT':
      return 'مسودة مكتملة قيد المراجعة';
    case 'INCOMPLETE_DRAFT':
    case 'DRAFT':
    default:
      return 'مسودة قيد الإعداد والاستيفاء';
  }
}

export interface AssessmentTimestampDetails {
  /** Primary user-facing label identifying this assessment version by reliable date/time & status */
  primary_version_label_ar: string;
  /** Short date/time badge with accurate date-type prefix (e.g. "تاريخ الاعتماد: 15 أغسطس 2026 — 10:30 صباحًا") */
  primary_date_badge_ar: string;
  /** Arabic workflow status label */
  workflow_status_ar: string;
  /** Original assessment date (if recorded separately from creation/approval) */
  original_assessment_date_ar: string;
  /** Creation date and time (or explicit explanation if seeded without original creation timestamp) */
  created_at_ar: string;
  /** Last modification date and time */
  updated_at_ar: string;
  /** Submission date and time */
  submitted_at_ar: string;
  /** Approval date and time */
  approved_at_ar: string;
  /** Whether this assessment was part of the initial seeded reference baseline */
  is_seeded_record: boolean;
  /** Provenance note explaining the timestamp source */
  provenance_note_ar: string;
}

/**
 * Extract accurate, non-deceptive timestamp labels for an assessment record.
 * - Never substitutes approval date for original assessment date without labeling it "تاريخ الاعتماد".
 * - Never presents DB-initialization `created_at` on seeded records as an authentic historical date.
 */
export function getAssessmentTimestampDetails(assessment: {
  id: string;
  status?: string;
  workflow_status?: string;
  cycle_year?: number;
  title_ar?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  last_saved_at?: string | null;
  revision?: number;
  has_recorded_edits?: boolean;
}): AssessmentTimestampDetails {
  const isSeeded = SEEDED_ASSESSMENT_IDS.has(assessment.id);
  const wfStatus = assessment.workflow_status || assessment.status || 'DRAFT';
  const statusAr = formatWorkflowStatusAr(wfStatus);

  // Check if a seeded draft has been genuinely modified after initial DB seed (revision > 1 or has_recorded_edits)
  const hasRealModification =
    !isSeeded ||
    Boolean(assessment.has_recorded_edits) ||
    (typeof assessment.revision === 'number' && assessment.revision > 1) ||
    (assessment.created_at &&
      assessment.updated_at &&
      assessment.created_at !== assessment.updated_at);

  const recordedAuditCreation = SEEDED_RECORDED_AUDIT_DATES[assessment.id]?.created_at_recorded;

  // 1. Original Assessment Date
  const originalAssessmentDateAr = assessment.cycle_year
    ? `دورة التقييم السنوية ${assessment.cycle_year} (التاريخ الأصلي التفصيلي غير مسجل بشكل منفصل بالمصدر)`
    : 'غير مسجل بالمصدر';

  // 2. Creation Date
  let createdAtAr = 'غير مسجل في السجل التاريخي الأصلي';
  if (!isSeeded && assessment.created_at) {
    createdAtAr = formatArabicDateTime(assessment.created_at);
  } else if (recordedAuditCreation) {
    createdAtAr = `${formatArabicDateTime(recordedAuditCreation)} (موثق بسجل التدقيق)`;
  }

  // 3. Last Modification Date
  let updatedAtAr = 'لا توجد تعديلات مسجلة بعد الإصدار المرجعي';
  const effectiveUpdatedRaw = assessment.last_saved_at || assessment.updated_at;
  if (hasRealModification && effectiveUpdatedRaw) {
    updatedAtAr = formatArabicDateTime(effectiveUpdatedRaw);
  } else if (recordedAuditCreation) {
    updatedAtAr = formatArabicDateTime(recordedAuditCreation);
  } else if (assessment.approved_at) {
    updatedAtAr = `لم يُعدّل منذ الاعتماد (${formatArabicDateTime(assessment.approved_at)})`;
  }

  // 4. Submission Date
  const submittedAtAr = assessment.submitted_at
    ? formatArabicDateTime(assessment.submitted_at)
    : 'غير مسجل بالمصدر';

  // 5. Approval Date
  const approvedAtAr = assessment.approved_at
    ? formatArabicDateTime(assessment.approved_at)
    : wfStatus === 'APPROVED'
      ? 'معتمد (التاريخ غير مسجل)'
      : 'غير معتمد بعد';

  // 6. Primary User-Facing Version Identifier (Strictly by actual reliable date/time, never V1/V2/V3)
  let primaryDateBadgeAr: string;
  if (wfStatus === 'APPROVED' && assessment.approved_at) {
    primaryDateBadgeAr = `تاريخ الاعتماد: ${formatArabicDateTime(assessment.approved_at)}`;
  } else if (wfStatus === 'IN_REVIEW' || wfStatus === 'SUBMITTED') {
    if (assessment.submitted_at) {
      primaryDateBadgeAr = `تاريخ الإرسال للمراجعة: ${formatArabicDateTime(assessment.submitted_at)}`;
    } else if (hasRealModification && effectiveUpdatedRaw) {
      primaryDateBadgeAr = `آخر تعديل: ${formatArabicDateTime(effectiveUpdatedRaw)}`;
    } else {
      primaryDateBadgeAr = `مرسل للمراجعة — دورة ${assessment.cycle_year || 2026}`;
    }
  } else if (hasRealModification && effectiveUpdatedRaw) {
    primaryDateBadgeAr = `آخر تعديل: ${formatArabicDateTime(effectiveUpdatedRaw)}`;
  } else if (recordedAuditCreation) {
    primaryDateBadgeAr = `تاريخ الإنشاء المسجل: ${formatArabicDateTime(recordedAuditCreation)}`;
  } else if (!isSeeded && assessment.created_at) {
    primaryDateBadgeAr = `تاريخ الإنشاء: ${formatArabicDateTime(assessment.created_at)}`;
  } else {
    primaryDateBadgeAr = `سجل مرجعي لدورة عام ${assessment.cycle_year || 2026}`;
  }

  const primaryVersionLabelAr = `${primaryDateBadgeAr} — [${statusAr}]`;
  const provenanceNoteAr = isSeeded
    ? 'سجل مرجعي أولي (تاريخ تهيئة قاعدة البيانات مستبعد من العرض التاريخي)'
    : 'سجل منشأ وموثق مباشرة في قاعدة البيانات';

  return {
    primary_version_label_ar: primaryVersionLabelAr,
    primary_date_badge_ar: primaryDateBadgeAr,
    workflow_status_ar: statusAr,
    original_assessment_date_ar: originalAssessmentDateAr,
    created_at_ar: createdAtAr,
    updated_at_ar: updatedAtAr,
    submitted_at_ar: submittedAtAr,
    approved_at_ar: approvedAtAr,
    is_seeded_record: isSeeded,
    provenance_note_ar: provenanceNoteAr,
  };
}

/**
 * Strip internal "(الإصدار X)" or "V1/V2" suffixes from assessment titles when displaying to bank users.
 */
export function cleanAssessmentTitleAr(rawTitle?: string | null): string {
  if (!rawTitle) return 'تقييم المخاطر والضوابط الرقابية';
  return rawTitle
    .replace(/\s*\(الإصدار\s*\d+\)/g, '')
    .replace(/\s*\([vV]\d+(?:-DRAFT)?\)/g, '')
    .replace(/\s*-\s*الإصدار المعتمد الأول/g, '')
    .replace(/\s*-\s*[vV]\d+(?:-DRAFT)?$/g, '')
    .replace(/\s+[vV]\d+(?:-DRAFT)?$/g, '')
    .trim();
}

/**
 * Map internal audit action codes to clear, professional Arabic banking descriptions.
 */
export function formatAuditActionAr(action?: string | null): {
  label_ar: string;
  category_ar: string;
  badge_cls: string;
} {
  switch (action) {
    case 'LOGIN':
      return {
        label_ar: 'تسجيل دخول للنظام',
        category_ar: 'أمن الجلسات',
        badge_cls: 'bg-sky-100 text-sky-900 border-sky-300',
      };
    case 'RESET_PASSWORD':
      return {
        label_ar: 'تعيين / تحديث كلمة المرور',
        category_ar: 'أمن الجلسات',
        badge_cls: 'bg-sky-100 text-sky-900 border-sky-300',
      };
    case 'CREATE':
    case 'CREATE_DRAFT':
    case 'CREATE_MANUAL_DRAFT':
      return {
        label_ar: 'إنشاء مسودة تقييم جديدة',
        category_ar: 'إدارة المسودات',
        badge_cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      };
    case 'CREATE_DRAFT_FROM_APPROVED':
      return {
        label_ar: 'اشتقاق مسودة جديدة من تقييم معتمد',
        category_ar: 'إدارة المسودات',
        badge_cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      };
    case 'SAVE_DRAFT':
      return {
        label_ar: 'حفظ المسودة في قاعدة البيانات',
        category_ar: 'إدارة المسودات',
        badge_cls: 'bg-slate-200 text-slate-800 border-slate-300',
      };
    case 'UPDATE_AND_RECALCULATE_RISK':
    case 'EDIT_RISK_AND_RECALCULATE':
    case 'EDIT_CONTROL_AND_RECALCULATE':
    case 'RECALCULATE_SINGLE_RISK':
      return {
        label_ar: 'تعديل مدخلات وإعادة احتساب المخاطرة',
        category_ar: 'تعديل وإعادة احتساب',
        badge_cls: 'bg-amber-100 text-amber-900 border-amber-300',
      };
    case 'SUGGESTION_ACCEPT':
      return {
        label_ar: 'قبول مقترح الصياغة الرقابية',
        category_ar: 'قرارات المقترحات',
        badge_cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      };
    case 'SUGGESTION_MODIFY':
      return {
        label_ar: 'تعديل واعتماد مقترح الصياغة الرقابية',
        category_ar: 'قرارات المقترحات',
        badge_cls: 'bg-sky-100 text-sky-900 border-sky-300',
      };
    case 'SUGGESTION_REJECT':
      return {
        label_ar: 'رفض المقترح والاحتفاظ بالنص الأصلي',
        category_ar: 'قرارات المقترحات',
        badge_cls: 'bg-rose-100 text-rose-900 border-rose-300',
      };
    case 'MARK_RISK_REVIEWED':
      return {
        label_ar: 'تحديث حالة مراجعة المخاطرة',
        category_ar: 'مراجعة المخاطر',
        badge_cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      };
    case 'SUBMIT':
    case 'SUBMIT_FOR_REVIEW':
      return {
        label_ar: 'إرسال التقييم لمراجعة المراجع المستقل',
        category_ar: 'الرقابة الثنائية (Maker-Checker)',
        badge_cls: 'bg-amber-100 text-amber-900 border-amber-300',
      };
    case 'APPROVE':
    case 'CHECKER_APPROVE':
      return {
        label_ar: 'اعتماد نهائي وتجميد التقييم',
        category_ar: 'الرقابة الثنائية (Maker-Checker)',
        badge_cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      };
    case 'REJECT':
    case 'CHECKER_RETURN':
      return {
        label_ar: 'إعادة التقييم للتعديل مع ملاحظات رقابية',
        category_ar: 'الرقابة الثنائية (Maker-Checker)',
        badge_cls: 'bg-rose-100 text-rose-900 border-rose-300',
      };
    case 'UPLOAD_DOCUMENT':
      return {
        label_ar: 'رفع وإرفاق مستند مؤيد للوحدة',
        category_ar: 'المستندات والأدلة',
        badge_cls: 'bg-sky-100 text-sky-900 border-sky-300',
      };
    case 'SECURITY_VIOLATION_SELF_APPROVAL':
    case 'SELF_APPROVAL_BLOCKED':
      return {
        label_ar: 'منع محاولة اعتماد ذاتي (مخالفة رقابة ثنائية)',
        category_ar: 'الرقابة الأمنية والحوكمة',
        badge_cls: 'bg-rose-200 text-rose-950 border-rose-400',
      };
    case 'SECURITY_VIOLATION_IMMUTABLE_EDIT':
      return {
        label_ar: 'منع محاولة تعديل تقييم معتمد مجمد',
        category_ar: 'الرقابة الأمنية والحوكمة',
        badge_cls: 'bg-rose-200 text-rose-950 border-rose-400',
      };
    case 'UNAUTHORIZED_ACCESS_BLOCKED':
      return {
        label_ar: 'منع محاولة وصول غير مصرح به لوحدة تنظيمية',
        category_ar: 'الرقابة الأمنية والحوكمة',
        badge_cls: 'bg-rose-200 text-rose-950 border-rose-400',
      };
    default:
      return {
        label_ar: action || 'عملية مسجلة',
        category_ar: 'سجل عام',
        badge_cls: 'bg-[#DFDEDB] text-slate-800 border-[#C6C4C1]',
      };
  }
}
