import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Lock, UserCheck, Shield, AlertCircle, Building2 } from 'lucide-react';

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
    <div className="min-h-screen nbe-login-surface flex flex-col justify-center items-center p-4 relative isolate overflow-hidden font-['Cairo']">
      {/* Layered NBE Brushed Silver, Ambient Lighting & Subtle Architectural Curves */}
      <div className="pointer-events-none absolute inset-0 nbe-login-brushed -z-10" />
      <div className="pointer-events-none absolute inset-0 nbe-login-grain mix-blend-multiply -z-10" />
      <div className="pointer-events-none absolute -top-40 -right-40 w-[42rem] h-[42rem] rounded-full bg-[#F0EFED]/70 blur-3xl -z-10" />
      <div className="pointer-events-none absolute -bottom-48 -left-40 w-[40rem] h-[40rem] rounded-full bg-[#AAA8A5]/35 blur-3xl -z-10" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34rem] h-[34rem] rounded-full bg-[#F0EFED]/80 blur-2xl -z-10" />
      <div className="pointer-events-none absolute -top-[28rem] -left-[18rem] w-[64rem] h-[64rem] rounded-full border border-[#F0EFED]/55 -z-10" />
      <div className="pointer-events-none absolute -bottom-[32rem] -right-[20rem] w-[68rem] h-[68rem] rounded-full border border-[#AAA8A5]/25 -z-10" />

      {/* Main Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-right">
        {/* Header with NBE Logo */}
        <div className="bg-[#09331F] p-8 text-white text-center relative border-b-4 border-[#F79C1E]">
          <div className="w-64 mx-auto mb-4">
            <img 
              src="/assets/nbe-logo-white.png" 
              alt="البنك الأهلي المصري" 
              className="w-full h-auto object-contain"
            />
          </div>
          <h2 className="text-lg font-bold">بوابة تقييم المخاطر التشغيلية والرقابة</h2>
          <p className="text-xs text-emerald-200/80 mt-1">
            منظومة RCSA المركزية وفق معايير البنك المركزي المصري
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الرقم الوظيفي المصرفي (Employee ID):
            </label>
            <input
              type="text"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006547] text-left font-mono"
              placeholder="EMP-XXXX"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              كلمة المرور:
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006547] text-left font-mono"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-[#006547] hover:bg-[#09331F] text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-emerald-950/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? 'جارٍ التحقق والمصادقة...' : 'تسجيل الدخول للمنظومة'}
            <Lock className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Accounts Selection - DEV ONLY */}
        {import.meta.env.DEV && (
          <div className="p-5 bg-slate-50 border-t border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-mono font-semibold">DEV ONLY</span>
                <span>حسابات تجريبية لاختبار الصلاحيات:</span>
              </span>
              <span className="text-[10px] text-amber-700 font-mono">NBE@2026!</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right">
              <button
                type="button"
                onClick={() => setDemoUser('EMP-1001')}
                className={`p-2 rounded-lg border text-right transition-all ${
                  employeeId === 'EMP-1001' ? 'border-[#006547] bg-emerald-50 text-emerald-900 font-bold' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="text-[11px] font-bold">أحمد محمود (Maker)</div>
                <div className="text-[9px] text-slate-500">القروض المشتركة / الحسابات / نقاط البيع</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-2002')}
                className={`p-2 rounded-lg border text-right transition-all ${
                  employeeId === 'EMP-2002' ? 'border-[#006547] bg-emerald-50 text-emerald-900 font-bold' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="text-[11px] font-bold">سارة إبراهيم (Checker)</div>
                <div className="text-[9px] text-slate-500">مراجعة واعتماد (القروض/الحسابات/POS)</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-3003')}
                className={`p-2 rounded-lg border text-right transition-all ${
                  employeeId === 'EMP-3003' ? 'border-[#006547] bg-emerald-50 text-emerald-900 font-bold' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="text-[11px] font-bold">كريم حسام (Maker)</div>
                <div className="text-[9px] text-slate-500">عمليات نقاط البيع (POS)</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-4004')}
                className={`p-2 rounded-lg border text-right transition-all ${
                  employeeId === 'EMP-4004' ? 'border-[#006547] bg-emerald-50 text-emerald-900 font-bold' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="text-[11px] font-bold">منى كمال (Checker)</div>
                <div className="text-[9px] text-slate-500">مراجعة نقاط البيع (POS)</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-9009')}
                className={`p-2 rounded-lg border text-right transition-all ${
                  employeeId === 'EMP-9009' ? 'border-[#006547] bg-emerald-50 text-emerald-900 font-bold' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="text-[11px] font-bold">طارق رضوان (Admin)</div>
                <div className="text-[9px] text-slate-500">مدير المخاطر المركزية</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser('EMP-8008')}
                className={`p-2 rounded-lg border text-right transition-all ${
                  employeeId === 'EMP-8008' ? 'border-[#006547] bg-emerald-50 text-emerald-900 font-bold' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="text-[11px] font-bold">هدى سامي (Auditor)</div>
                <div className="text-[9px] text-slate-500">التفتيش والرقابة الداخلية</div>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-slate-600 mt-6 max-w-md">
        منصة التقييم الذاتي للمخاطر التشغيلية - البنك الأهلي المصري © 2026. يخضع الدخول لسياسات الرقابة الداخلية وسجلات التدقيق المعتمدة.
      </div>
    </div>
  );
};
