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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#EAE9E6] rounded-2xl shadow-2xl border border-[#B8B6B2] overflow-hidden text-right animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#09331F] p-6 text-white text-center relative border-b-4 border-[#F79C1E]">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-white/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-[#F79C1E]" />
          </div>
          <h2 className="text-xl font-bold font-['Cairo']">إلزامية تغيير كلمة المرور</h2>
          <p className="text-xs text-emerald-200/80 mt-1">
            سياسة الأمن السيبراني للبنك الأهلي المصري تتطلب تغيير كلمة المرور المبدئية عند أول تسجيل دخول.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-amber-50/90 border border-amber-300 rounded-lg p-3 text-xs text-amber-950 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <strong>تنبيه أمني مصرفي:</strong> تم تزويد حسابك بكلمة مرور مؤقتة، يلزم استبدالها بكلمة سر شخصية قوية للمتابعة.
            </div>
          </div>

          {error && (
            <div className="bg-rose-50/90 border border-rose-300 rounded-lg p-3 text-xs text-rose-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              كلمة المرور الجديدة (8 أحرف على الأقل):
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006547] text-left"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              تأكيد كلمة المرور الجديدة:
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006547] text-left"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-[#006547] hover:bg-[#09331F] text-white font-bold rounded-lg text-sm transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? 'جارٍ التحديث والتوثيق...' : 'تحديث كلمة المرور والمتابعة'}
            <CheckCircle className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
