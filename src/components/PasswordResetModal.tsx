import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Lock, ShieldAlert, CheckCircle, AlertCircle } from 'lucide-react';

export const PasswordResetModal: React.FC = () => {
  const { user, resetPassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user || !user.must_reset_password) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('كلمة المرور يجب أن لا تقل عن 8 أحرف طبقاً للضوابط الأمنية لمصرفنا.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsSubmitting(true);
    const result = await resetPassword(newPassword);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || 'فشل تحديث كلمة المرور.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#DCDAD5] overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#09331F] p-6 text-white text-center relative border-b-2 border-[#F79C1E]">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-[#F79C1E]" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold font-['Cairo']">إلزامية تغيير كلمة المرور</h2>
          <p className="text-xs text-emerald-200/80 mt-1">
            سياسة الأمن السيبراني للبنك الأهلي المصري تتطلب تغيير كلمة المرور المبدئية عند أول تسجيل دخول.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <strong>تنبيه أمني مصرفي:</strong> تم تزويد حسابك بكلمة مرور مؤقتة، يلزم استبدالها بكلمة سر شخصية قوية للمتابعة.
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#09331F] mb-1.5">
              كلمة المرور الجديدة (8 أحرف على الأقل):
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full min-h-11 px-3.5 py-2 text-sm bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#006547] text-left"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#09331F] mb-1.5">
              تأكيد كلمة المرور الجديدة:
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full min-h-11 px-3.5 py-2 text-sm bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#006547] text-left"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-11 py-2.5 px-4 bg-[#006547] hover:bg-[#09331F] text-white font-bold rounded-xl text-sm transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? 'جارٍ التحديث والتوثيق...' : 'تحديث كلمة المرور والمتابعة'}
            <CheckCircle className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
