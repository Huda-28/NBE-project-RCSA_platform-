import React, { useState } from 'react';
import {
  LayoutDashboard,
  Bot,
  FileUp,
  Building2,
  TableProperties,
  FileCheck2,
  History,
  UserCog,
  ShieldCheck,
  ChevronLeft,
  PanelRightClose,
  PanelRightOpen,
  Presentation,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { HoverTooltip } from './HoverTooltip.js';

export type PageId =
  | 'dashboard'
  | 'agent'
  | 'backend-rcsa'
  | 'business-units'
  | 'rcsa-table'
  | 'reviews'
  | 'audit'
  | 'admin'
  | 'demo';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    {
      id: 'dashboard' as PageId,
      label: 'لوحة المعلومات',
      tooltip: 'عرض مؤشرات الأداء المركزية، خريطة المخاطر 5×5، ومقارنة الوحدات التنظيمية.',
      icon: LayoutDashboard,
      group: 'core',
    },
    {
      id: 'agent' as PageId,
      label: 'وكيل الذكاء الاصطناعي',
      tooltip: 'استخلاص المخاطر والضوابط من مستندات السياسات والحوادث عبر RAG وتوليد التوصيات.',
      icon: Bot,
      badge: 'RAG',
      group: 'core',
    },
    {
      id: 'backend-rcsa' as PageId,
      label: 'إعداد تقييم جديد',
      tooltip: 'بدء جلسة تقييم موجهة خطوة بخطوة: مستندات جديدة، بيانات سابقة، أو مصدر مزدوج.',
      icon: FileUp,
      requiresRole: ['MAKER', 'BU_MAKER', 'RISK_ADMIN'],
      group: 'core',
    },
    {
      id: 'rcsa-table' as PageId,
      label: 'مصفوفة تقييم المخاطر',
      tooltip: 'مراجعة وتعديل سجل المخاطر والضوابط (29 عموداً)، الأثر غير المالي، وتصدير PDF/Excel.',
      icon: TableProperties,
      group: 'core',
    },
    {
      id: 'business-units' as PageId,
      label: 'الوحدات التنظيمية',
      tooltip: 'استعراض الإدارات المصرفية، النسخ المعتمدة، والمقارنة التاريخية بين الدورات.',
      icon: Building2,
      group: 'governance',
    },
    {
      id: 'reviews' as PageId,
      label: 'المراجعة والاعتماد',
      tooltip: 'صندوق المراجع المستقل (Checker) لفحص المسودات المرسلة والاعتماد أو الإعادة للتعديل.',
      icon: FileCheck2,
      requiresRole: ['MAKER', 'BU_MAKER', 'CHECKER', 'BU_CHECKER', 'RISK_ADMIN'],
      group: 'governance',
    },
    {
      id: 'audit' as PageId,
      label: 'سجل التعديلات',
      requiresRole: ['RISK_ADMIN', 'AUDITOR'],
      tooltip: 'تتبع كافة عمليات الإنشاء، التعديل، والاعتماد مع الطوابع الزمنية والمستخدمين.',
      icon: History,
      group: 'governance',
    },
    {
      id: 'admin' as PageId,
      label: 'إدارة المستخدمين',
      tooltip: 'تعيين الصلاحيات والأدوار (Maker / Checker / Auditor / Admin) على الوحدات.',
      icon: UserCog,
      requiresRole: ['RISK_ADMIN'],
      group: 'governance',
    },
    {
      id: 'demo' as PageId,
      label: 'العرض التقديمي',
      tooltip: 'يضم عرضين: العرض التنفيذي (13 شريحة) وعرض المنهجية والنماذج بالإنجليزية والمصادر (13 شريحة) مع PDF.',
      icon: Presentation,
      badge: '2',
      group: 'governance',
    },
  ];

  const visibleItems = navItems.filter((item) => {
    if (item.requiresRole && user) {
      return user.roles.some((r) => item.requiresRole!.includes(r.role));
    }
    return true;
  });

  const coreItems = visibleItems.filter((i) => i.group === 'core');
  const governanceItems = visibleItems.filter((i) => i.group === 'governance');

  const renderNavItem = (item: (typeof navItems)[number], collapsedMode = false) => {
    const isActive = currentPage === item.id;
    const Icon = item.icon;

    return (
      <HoverTooltip
        key={item.id}
        title={item.label}
        description={item.tooltip}
        side="left"
        className="block w-full"
      >
        <button
          type="button"
          onClick={() => {
            onSelectPage(item.id);
            onCloseMobile?.();
          }}
          aria-label={item.label}
          aria-current={isActive ? 'page' : undefined}
          className={`w-full min-h-11 flex items-center ${
            collapsedMode ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2.5'
          } rounded-xl text-xs font-bold transition-all group relative cursor-pointer whitespace-nowrap ${
            isActive
              ? 'bg-[#006547] text-white shadow-xs'
              : 'text-slate-700 hover:bg-[#EFECE6] hover:text-[#09331F]'
          }`}
        >
          <div className={`flex items-center ${collapsedMode ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
            <Icon
              className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 ${
                isActive ? 'text-[#F79C1E]' : 'text-[#006547] group-hover:text-[#09331F]'
              }`}
            />
            {!collapsedMode && <span className="truncate">{item.label}</span>}
          </div>

          {!collapsedMode ? (
            <div className="flex items-center gap-1.5 shrink-0">
              {item.badge && (
                <span
                  className={`text-[10px] font-mono font-bold tracking-wider ${
                    isActive ? 'text-[#F79C1E]' : 'text-[#006547]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
              {isActive && <ChevronLeft className="w-3.5 h-3.5 text-[#F79C1E]" />}
            </div>
          ) : (
            isActive && (
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-xs bg-[#F79C1E] absolute left-1.5 top-1/2 -translate-y-1/2"
              />
            )
          )}
        </button>
      </HoverTooltip>
    );
  };

  return (
    <>
      {/* Desktop Collapsible Sidebar Rail */}
      <aside
        aria-label="القائمة الجانبية"
        className={`hidden lg:flex ${
          isCollapsed ? 'w-18' : 'w-60'
        } nbe-sidebar-surface relative isolate border-l border-[#DCDAD5] flex-col shrink-0 min-h-[calc(100vh-3.75rem)] transition-all duration-300 ease-in-out select-none`}
      >
        <div
          className={`px-3.5 pt-3.5 pb-3 border-b border-[#E5E3DEC0] flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!isCollapsed && (
            <span className="text-[11px] font-extrabold text-[#09331F] tracking-tight pr-1">
              القائمة الرئيسية
            </span>
          )}
          <HoverTooltip
            description={isCollapsed ? 'توسيع القائمة الجانبية لعرض مسميات الصفحات' : 'طي القائمة الجانبية لتوسيع مساحة العمل'}
            side="left"
          >
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-label={isCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
              aria-expanded={!isCollapsed}
              className="w-8 h-8 rounded-lg bg-[#F3F2EE] hover:bg-[#E7E5DF] text-[#09331F] hover:text-[#006547] border border-[#D5D3CD] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006547] cursor-pointer flex items-center justify-center"
            >
              {isCollapsed ? (
                <PanelRightOpen className="w-4 h-4 text-[#006547]" />
              ) : (
                <PanelRightClose className="w-4 h-4 text-[#006547]" />
              )}
            </button>
          </HoverTooltip>
        </div>

        <nav className="p-3 space-y-4 flex-1">
          <div className="space-y-1">
            {!isCollapsed && (
              <div className="px-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                التقييم والذكاء الاصطناعي
              </div>
            )}
            {coreItems.map((item) => renderNavItem(item, isCollapsed))}
          </div>

          {governanceItems.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-[#E5E3DE]">
              {!isCollapsed && (
                <div className="px-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  الحوكمة والرقابة والتدقيق
                </div>
              )}
              {governanceItems.map((item) => renderNavItem(item, isCollapsed))}
            </div>
          )}
        </nav>

        {!isCollapsed && (
          <div className="px-4 py-3 border-t border-[#E5E3DE] text-[11px] text-slate-500 flex items-center justify-between">
            <HoverTooltip
              title="إطار الحوكمة المعتمد"
              description="مصفوفة 29 عموداً معتمدة وفق محرك الاحتساب الحتمي وضوابط البنك المركزي المصري."
              side="top"
            >
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#09331F] cursor-help">
                <ShieldCheck className="w-3.5 h-3.5 text-[#006547] shrink-0" />
                <span>منهجية RCSA · 29 عموداً</span>
              </span>
            </HoverTooltip>
          </div>
        )}
      </aside>

      {/* Mobile Slide-Out RTL Navigation Drawer */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="القائمة الجانبية للجوال"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* RTL Right Drawer Panel */}
          <aside className="relative z-10 w-72 max-w-[85vw] h-full nbe-sidebar-surface border-l border-[#DCDAD5] shadow-2xl flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="px-4 py-3.5 border-b border-[#DCDAD5] bg-[#09331F] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#F79C1E]" />
                  <span className="text-xs font-extrabold tracking-tight">القائمة الرئيسية للمنظومة</span>
                </div>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  data-testid="mobile-drawer-close-btn"
                  aria-label="إغلاق القائمة"
                  className="w-9 h-9 rounded-lg bg-[#0d4229] hover:bg-[#006547] text-white border border-emerald-700/60 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4 text-[#F79C1E]" />
                </button>
              </div>

              <nav className="p-3.5 space-y-4">
                <div className="space-y-1">
                  <div className="px-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    التقييم والذكاء الاصطناعي
                  </div>
                  {coreItems.map((item) => renderNavItem(item, false))}
                </div>

                {governanceItems.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-[#E5E3DE]">
                    <div className="px-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      الحوكمة والرقابة والتدقيق
                    </div>
                    {governanceItems.map((item) => renderNavItem(item, false))}
                  </div>
                )}
              </nav>
            </div>

            <div className="p-3.5 m-3.5 rounded-xl bg-[#F4F5F3] border border-[#DCDAD5] space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#09331F]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#006547] shrink-0" />
                <span>حوكمة المخاطر التشغيلية</span>
              </div>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                مصفوفة 29 عموداً معتمدة وفق محرك الاحتساب الحتمي وضوابط البنك المركزي المصري.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
