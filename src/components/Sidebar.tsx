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
  PanelRightOpen
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

export type PageId = 
  | 'dashboard' 
  | 'agent' 
  | 'backend-rcsa' 
  | 'business-units' 
  | 'rcsa-table' 
  | 'reviews' 
  | 'audit' 
  | 'admin';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onSelectPage }) => {
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    {
      id: 'dashboard' as PageId,
      label: 'لوحة المعلومات',
      icon: LayoutDashboard,
      badge: undefined,
      badgeColor: 'bg-emerald-100/90 text-emerald-900 border border-emerald-300/60',
    },
    {
      id: 'agent' as PageId,
      label: 'وكيل الذكاء الاصطناعي',
      icon: Bot,
      badge: 'قريباً',
      badgeColor: 'bg-amber-100/90 text-amber-900 border border-amber-300/60',
    },
    {
      id: 'backend-rcsa' as PageId,
      label: 'إعداد تقييم جديد',
      icon: FileUp,
      requiresRole: ['MAKER', 'BU_MAKER', 'RISK_ADMIN'],
      badge: undefined,
      badgeColor: 'bg-sky-100/90 text-sky-900 border border-sky-300/60',
    },
    {
      id: 'business-units' as PageId,
      label: 'الوحدات التنظيمية',
      icon: Building2,
    },
    {
      id: 'rcsa-table' as PageId,
      label: 'مصفوفة تقييم المخاطر',
      icon: TableProperties,
    },
    {
      id: 'reviews' as PageId,
      label: 'المراجعة والاعتماد',
      icon: FileCheck2,
      requiresRole: ['MAKER', 'BU_MAKER', 'CHECKER', 'BU_CHECKER', 'RISK_ADMIN'],
      badge: undefined,
      badgeColor: 'bg-rose-100/90 text-rose-900 border border-rose-300/60',
    },
    {
      id: 'audit' as PageId,
      label: 'سجل التعديلات',
      requiresRole: ['RISK_ADMIN', 'AUDITOR'],
      icon: History,
    },
    {
      id: 'admin' as PageId,
      label: 'إدارة المستخدمين',
      icon: UserCog,
      requiresRole: ['RISK_ADMIN'],
    },
  ];

  return (
    <aside
      aria-label="القائمة الجانبية"
      className={`${
        isCollapsed ? 'w-20' : 'w-68'
      } nbe-sidebar-surface relative isolate overflow-hidden border-l border-[#B5B3AF] flex flex-col shrink-0 min-h-[calc(100vh-4.5rem)] shadow-sm transition-all duration-300 ease-in-out select-none`}
    >
      {/* Layered NBE Brushed Silver, Grain & Soft Ambient Highlights matching Login Page */}
      <div className="pointer-events-none absolute inset-0 nbe-login-brushed -z-10" />
      <div className="pointer-events-none absolute inset-0 nbe-login-grain mix-blend-multiply -z-10" />
      <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#F0EFED]/65 blur-2xl -z-10" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-[#AAA8A5]/30 blur-2xl -z-10" />

      {/* Sidebar Collapse / Expand Toggle Header */}
      <div
        className={`px-3 pt-3 pb-2.5 border-b border-[#B8B6B2]/70 flex items-center ${
          isCollapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {!isCollapsed && (
          <span className="text-[11px] font-bold text-[#09331F] tracking-tight pr-1">
            القائمة الرئيسية
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
          aria-label={isCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
          aria-expanded={!isCollapsed}
          className="p-2 rounded-xl bg-[#EAE9E6] hover:bg-[#F0EFED] text-[#09331F] hover:text-[#006547] border border-[#B8B6B2] shadow-2xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006547] cursor-pointer flex items-center justify-center"
        >
          {isCollapsed ? (
            <PanelRightOpen className="w-4 h-4 text-[#006547]" />
          ) : (
            <PanelRightClose className="w-4 h-4 text-[#006547]" />
          )}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="p-2.5 space-y-1.5 flex-1">
        {navItems.map((item) => {
          if (item.requiresRole && user) {
            const hasAccess = user.roles.some((r) => item.requiresRole!.includes(r.role));
            if (!hasAccess) return null;
          }

          const isActive = currentPage === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectPage(item.id)}
              title={isCollapsed ? item.label : undefined}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-2 py-3' : 'justify-between px-3 py-2.5'
              } rounded-xl text-xs font-semibold transition-all group relative cursor-pointer ${
                isActive
                  ? 'bg-[#006547] text-white shadow-md shadow-emerald-950/20 ring-1 ring-[#09331F]/30'
                  : 'text-slate-800 hover:bg-[#EAE9E6]/90 hover:text-[#09331F]'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-[#F79C1E]' : 'text-[#09331F]/80 group-hover:text-[#006547]'
                  }`}
                />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!isCollapsed ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        isActive ? 'bg-white/20 text-white' : item.badgeColor
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
                    className="w-1.5 h-1.5 rounded-full bg-[#F79C1E] absolute left-1.5 top-1/2 -translate-y-1/2"
                  />
                )
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

