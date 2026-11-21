import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { LogOut, User as UserIcon, Shield } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  const roleOrder = ['RISK_ADMIN', 'AUDITOR', 'CHECKER', 'BU_CHECKER', 'MAKER', 'BU_MAKER'];
  const primaryRole = user?.roles.map(r => r.role).sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))[0];
  const roleLabel: Record<string, string> = {
    RISK_ADMIN: 'مدير النظام', AUDITOR: 'مدقق', CHECKER: 'مراجع', BU_CHECKER: 'مراجع', MAKER: 'مُعد التقييم', BU_MAKER: 'مُعد التقييم'
  };
  return (
    <header className="bg-[#09331F] text-white border-b-2 border-[#F79C1E] sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Right side in RTL: Brand Logo & Title */}
        <div className="flex items-center gap-4">
          <div className="h-12 flex items-center">
            <img 
              src="/assets/nbe-logo-white.png" 
              alt="البنك الأهلي المصري - National Bank of Egypt" 
              className="h-10 w-auto object-contain max-w-[200px]"
            />
          </div>
          <div className="hidden md:block border-r border-white/20 pr-4">
            <h1 className="text-sm font-bold tracking-tight text-white font-['Cairo']">
              منصة التقييم الذاتي للمخاطر والضوابط الرقابية (RCSA)
            </h1>
            <p className="text-[11px] text-emerald-300/80">
              قطاع إدارة المخاطر التشغيلية والالتزام الرقابي
            </p>
          </div>
        </div>

        {/* Left side in RTL: User info, AI status badge, Logout */}
        <div className="flex items-center gap-3">

          {user && (
            <div className="flex items-center gap-3 bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
              <div className="w-8 h-8 rounded-lg bg-[#006547] border border-[#F79C1E]/50 flex items-center justify-center text-white font-bold text-xs">
                {primaryRole === 'RISK_ADMIN' ? 'أ' : primaryRole === 'AUDITOR' ? 'ت' : primaryRole === 'CHECKER' ? 'م' : 'ع'}
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold leading-tight">{user.full_name}</div>
                <div className="text-[10px] text-emerald-200/90 flex items-center gap-1">
                  <span>{user.employee_id}</span>
                  <span>•</span>
                  <span className="font-semibold text-[#F79C1E]">{roleLabel[primaryRole || ''] || 'موظف'}</span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            title="تسجيل الخروج"
            className="p-2 rounded-lg bg-white/5 hover:bg-rose-900/60 text-slate-200 hover:text-white border border-white/10 transition-colors flex items-center gap-1 text-xs"
          >
            <LogOut className="w-4 h-4 text-rose-300" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </div>
    </header>
  );
};
