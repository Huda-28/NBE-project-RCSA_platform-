import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Lock, AlertCircle, ShieldCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [employeeId, setEmployeeId] = useState('EMP-1001');
  const [password, setPassword] = useState('NBE@2026!');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const result = await login(employeeId, password);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'فشل تسجيل الدخول. تحقق من الرقم الوظيفي وكلمة المرور.');
    }
  };

  const setDemoUser = (id: string) => {
    setEmployeeId(id);
    setPassword('NBE@2026!');
    setError(null);
  };

  return (
    <div className="min-h-screen nbe-login-surface flex flex-col justify-center items-center p-3.5 sm:p-5 relative isolate overflow-hidden font-['Cairo']">
      {/* Layered NBE Ambient Lighting & Subtle Architectural Curves */}
      <div className="pointer-events-none absolute inset-0 nbe-login-brushed -z-10" />
      <div className="pointer-events-none absolute inset-0 nbe-login-grain mix-blend-multiply -z-10" />
      <div className="pointer-events-none absolute -top-40 -right-40 w-[36rem] h-[36rem] rounded-full bg-white/80 blur-3xl -z-10" />
      <div className="pointer-events-none absolute -bottom-48 -left-40 w-[36rem] h-[36rem] rounded-full bg-[#006547]/10 blur-3xl -z-10" />

      {/* Main Executive Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-[#DCDAD5] overflow-hidden text-right">
        {/* Header with NBE Logo */}
        <div className="bg-[#09331F] px-5 py-6 sm:p-7 text-white text-center relative border-b-2 border-[#F79C1E]">
          <div className="w-48 sm:w-56 mx-auto mb-3">
            <img
              src="/assets/nbe-logo-white.png"
              alt="البنك الأهلي المصري"
              referrerPolicy="no-referrer"
              className="w-full h-auto object-contain"
            />
          </div>
          <h1 className="text-base sm:text-lg font-extrabold tracking-tight">
            بوابة تقييم المخاطر التشغيلية والرقابة
          </h1>
          <p className="text-[11px] sm:text-xs text-emerald-200/90 mt-1 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#F79C1E] shrink-0" />
            <span>منظومة RCSA المركزية وفق معايير البنك المركزي المصري</span>
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#09331F] mb-1.5">
              الرقم الوظيفي المصرفي (Employee ID):
            </label>
            <input
              type="text"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full min-h-11 px-3.5 py-2.5 text-sm bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#006547] text-left font-mono tabular-nums text-slate-900"
              placeholder="EMP-XXXX"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#09331F] mb-1.5">
              كلمة المرور:
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-11 px-3.5 py-2.5 text-sm bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#006547] text-left font-mono text-slate-900"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full min-h-11 py-2.5 px-4 bg-[#006547] hover:bg-[#09331F] text-white font-bold rounded-xl text-sm transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? 'جارٍ التحقق والمصادقة...' : 'تسجيل الدخول للمنظومة'}
            <Lock className="w-4 h-4 text-[#F79C1E]" />
          </button>
        </form>

        {/* Quick Demo Accounts Selection - DEV ONLY */}
        {import.meta.env.DEV && (
          <div className="p-4 sm:p-5 bg-[#F8F8F6] border-t border-[#E5E3DE]">
            <div className="text-[11px] font-bold text-slate-600 mb-2.5 flex items-center justify-between gap-2">
              <span className="text-[#09331F]">
                حسابات تجريبية لاختبار الصلاحيات <span className="text-slate-400">·</span>{' '}
                <span className="font-mono text-[10px] text-amber-800">DEV</span>
              </span>
              <span className="text-[10px] text-[#006547] font-mono font-bold tabular-nums">
                NBE@2026!
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-right">
              <button
                type="button"
                onClick={() => setDemoUser('EMP-1001')}
                className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                  employeeId === 'EMP-1001'
                    ? 'border-[#006547] bg-emerald-50/80 text-[#09331F] font-bold ring-1 ring-[#006547]/30'
                    : 'border-[#DCDAD5] bg-white text-slate-700 hover:border-[#006547]/50'
                }`}
              >
                <div className="text-[11px] font-bold">أحمد محمود · Maker</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  القروض المشتركة / الحسابات / نقاط البيع
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-2002')}
                className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                  employeeId === 'EMP-2002'
                    ? 'border-[#006547] bg-emerald-50/80 text-[#09331F] font-bold ring-1 ring-[#006547]/30'
                    : 'border-[#DCDAD5] bg-white text-slate-700 hover:border-[#006547]/50'
                }`}
              >
                <div className="text-[11px] font-bold">سارة إبراهيم · Checker</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  مراجعة واعتماد (القروض/الحسابات/POS)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-3003')}
                className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                  employeeId === 'EMP-3003'
                    ? 'border-[#006547] bg-emerald-50/80 text-[#09331F] font-bold ring-1 ring-[#006547]/30'
                    : 'border-[#DCDAD5] bg-white text-slate-700 hover:border-[#006547]/50'
                }`}
              >
                <div className="text-[11px] font-bold">كريم حسام · Maker</div>
                <div className="text-[10px] text-slate-500 mt-0.5">عمليات نقاط البيع (POS)</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-4004')}
                className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                  employeeId === 'EMP-4004'
                    ? 'border-[#006547] bg-emerald-50/80 text-[#09331F] font-bold ring-1 ring-[#006547]/30'
                    : 'border-[#DCDAD5] bg-white text-slate-700 hover:border-[#006547]/50'
                }`}
              >
                <div className="text-[11px] font-bold">منى كمال · Checker</div>
                <div className="text-[10px] text-slate-500 mt-0.5">مراجعة نقاط البيع (POS)</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-9009')}
                className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                  employeeId === 'EMP-9009'
                    ? 'border-[#006547] bg-emerald-50/80 text-[#09331F] font-bold ring-1 ring-[#006547]/30'
                    : 'border-[#DCDAD5] bg-white text-slate-700 hover:border-[#006547]/50'
                }`}
              >
                <div className="text-[11px] font-bold">طارق رضوان · Admin</div>
                <div className="text-[10px] text-slate-500 mt-0.5">مدير المخاطر المركزية</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-8008')}
                className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                  employeeId === 'EMP-8008'
                    ? 'border-[#006547] bg-emerald-50/80 text-[#09331F] font-bold ring-1 ring-[#006547]/30'
                    : 'border-[#DCDAD5] bg-white text-slate-700 hover:border-[#006547]/50'
                }`}
              >
                <div className="text-[11px] font-bold">هدى سامي · Auditor</div>
                <div className="text-[10px] text-slate-500 mt-0.5">التفتيش والرقابة الداخلية</div>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-slate-600 mt-4 max-w-md font-medium px-2">
        منصة التقييم الذاتي للمخاطر التشغيلية - البنك الأهلي المصري © 2026. يخضع الدخول لسياسات الرقابة الداخلية وسجلات التدقيق المعتمدة.
      </div>
    </div>
  );
};
