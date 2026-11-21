import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { PageId } from './Sidebar.js';
import { LogOut, ChevronLeft, Menu, X } from 'lucide-react';

interface HeaderProps {
  currentPage?: PageId;
  onSelectPage?: (page: PageId) => void;
  onToggleMobileNav?: () => void;
  isMobileNavOpen?: boolean;
}

const PAGE_LABELS_AR: Record<PageId, string> = {
  dashboard: 'لوحة المعلومات التنفيذية',
  agent: 'وكيل الذكاء الاصطناعي وقاعدة المعرفة (RAG)',
  'backend-rcsa': 'إعداد تقييم مخاطر موجه',
  'business-units': 'الوحدات التنظيمية وسجل التقييمات',
  'rcsa-table': 'مصفوفة تقييم المخاطر والضوابط (29 عموداً)',
  reviews: 'المراجعة المستقلة والاعتماد',
  audit: 'سجل التدقيق والتعديلات',
  admin: 'إدارة المستخدمين والصلاحيات',
};

export const Header: React.FC<HeaderProps> = ({
  currentPage = 'dashboard',
  onSelectPage,
  onToggleMobileNav,
  isMobileNavOpen = false,
}) => {
  const { user, logout } = useAuth();

  const roleOrder = ['RISK_ADMIN', 'AUDITOR', 'CHECKER', 'BU_CHECKER', 'MAKER', 'BU_MAKER'];
  const primaryRole = user?.roles
    .map((r) => r.role)
    .sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))[0];
  const roleLabel: Record<string, string> = {
    RISK_ADMIN: 'مدير المخاطر المركزية',
    AUDITOR: 'مدقق داخلي',
    CHECKER: 'مراجع مستقل',
    BU_CHECKER: 'مراجع وحدة العمل',
    MAKER: 'مُعد التقييم',
    BU_MAKER: 'مُعد وحدة العمل',
  };

  return (
    <header className="bg-[#09331F] text-white border-b-2 border-[#F79C1E] sticky top-0 z-40 shadow-sm">
      <div className="w-full max-w-[1680px] mx-auto px-3.5 sm:px-6 h-15 sm:h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Mobile Menu Trigger + NBE Brand Lockup & Contextual Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          {onToggleMobileNav && (
            <button
              type="button"
              onClick={onToggleMobileNav}
              aria-label={isMobileNavOpen ? 'إغلاق القائمة الرئيسية' : 'فتح القائمة الرئيسية'}
              aria-expanded={isMobileNavOpen}
              data-testid="mobile-menu-toggle-btn"
              className="lg:hidden w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center text-white transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F79C1E]"
            >
              {isMobileNavOpen ? (
                <X className="w-5 h-5 text-[#F79C1E]" />
              ) : (
                <Menu className="w-5 h-5 text-[#F79C1E]" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => onSelectPage?.('dashboard')}
            className="h-10 flex items-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F79C1E] rounded-lg group"
            title="العودة إلى لوحة المعلومات التنفيذية"
          >
            <img
              src="/assets/nbe-logo-white.png"
              alt="البنك الأهلي المصري - National Bank of Egypt"
              referrerPolicy="no-referrer"
              className="h-8 sm:h-9 w-auto object-contain max-w-[140px] sm:max-w-[175px] transition-transform duration-150 group-hover:scale-[1.01]"
            />
          </button>

          <div className="hidden md:flex flex-col border-r border-white/15 pr-4 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-white font-['Cairo'] truncate">
              منصة التقييم الذاتي للمخاطر والضوابط الرقابية (RCSA)
            </h1>

            {/* Contextual Breadcrumb Trail */}
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-200/85 mt-0.5 truncate">
              <button
                type="button"
                onClick={() => onSelectPage?.('dashboard')}
                className="hover:text-[#F79C1E] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                قطاع المخاطر التشغيلية
              </button>
              <ChevronLeft className="w-3 h-3 text-[#F79C1E] shrink-0" />
              <span className="font-bold text-white truncate">
                {PAGE_LABELS_AR[currentPage] || 'لوحة المعلومات'}
              </span>
            </div>
          </div>
        </div>

        {/* Intermediate Tablet current page title (visible on sm..md screens) */}
        <div className="hidden sm:block md:hidden flex-1 min-w-0 text-right">
          <div className="text-xs font-bold text-white truncate">
            {PAGE_LABELS_AR[currentPage] || 'لوحة المعلومات'}
          </div>
          <div className="text-[10px] text-emerald-200/80 truncate">
            قطاع المخاطر التشغيلية · RCSA
          </div>
        </div>

        {/* Zone 3: User Profile & Logout Action */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {user && (
            <div className="flex items-center gap-2.5 bg-[#062315]/75 px-2.5 sm:px-3 py-1.5 rounded-xl border border-white/15">
              <div className="w-8 h-8 rounded-lg bg-[#006547] border border-[#F79C1E]/60 flex items-center justify-center text-white font-bold text-xs shrink-0">
                {primaryRole === 'RISK_ADMIN'
                  ? 'أ'
                  : primaryRole === 'AUDITOR'
                    ? 'ت'
                    : primaryRole === 'CHECKER'
                      ? 'م'
                      : 'ع'}
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold leading-tight text-white whitespace-nowrap">
                  {user.full_name}
                </div>
                <div className="text-[10px] text-emerald-200/90 flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
                  <span className="font-mono tabular-nums text-emerald-100">{user.employee_id}</span>
                  <span aria-hidden="true" className="text-white/40">·</span>
                  <span className="font-semibold text-[#F79C1E]">
                    {roleLabel[primaryRole || ''] || 'موظف مصرفي'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={logout}
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
            className="min-h-10 px-3 py-2 rounded-xl bg-white/10 hover:bg-rose-900/80 text-slate-100 hover:text-white border border-white/15 transition-colors duration-150 flex items-center gap-1.5 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F79C1E]"
          >
            <LogOut className="w-4 h-4 text-rose-300 shrink-0" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </div>
    </header>
  );
};

