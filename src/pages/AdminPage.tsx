import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { User } from '../types/index.js';

export const AdminPage: React.FC = () => {
  const { token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [newRole, setNewRole] = useState('MAKER');
  const [roleMessage, setRoleMessage] = useState('');
  const [grantingRole, setGrantingRole] = useState(false);

  const reloadDirectory = async () => {
    if (!token) return;
    const response = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('تعذر تحميل بيانات المستخدمين.');
    const data = await response.json();
    setUsers(data.users || []);
  };

  const submitRole = async (event: React.FormEvent) => {
    event.preventDefault();
    setRoleMessage('');
    if (!selectedEmployee || !selectedUnit || !token) return;
    setGrantingRole(true);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(selectedEmployee)}/roles`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ unit_id: selectedUnit, role: newRole }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر منح الصلاحية.');
      await reloadDirectory();
      setRoleMessage('تم حفظ الصلاحية وتسجيلها في سجل التعديلات.');
    } catch (error: any) {
      setRoleMessage(error.message);
    } finally {
      setGrantingRole(false);
    }
  };

  useEffect(() => {
    fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setUsers(data.users || []))
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));

    fetch('/api/business-units', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setUnits(data.business_units || []))
      .catch(() => {});
  }, [token]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-600 font-['Cairo'] bg-white rounded-2xl border border-[#DCDAD5]">
        <div className="w-8 h-8 border-4 border-[#006547] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div>جارٍ تحميل دليل المستخدمين والصلاحيات...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300 font-['Cairo']">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-[#09331F]">
            إدارة المستخدمين والصلاحيات
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            عرض الحسابات وتحديد صلاحيات الموظفين لكل وحدة تنظيمية.
          </p>
        </div>
        <div className="text-xs font-mono font-bold text-[#09331F] tabular-nums">
          المستخدمين: {users.length}
        </div>
      </div>

      <form
        onSubmit={submitRole}
        className="bg-white rounded-2xl border border-[#DCDAD5] shadow-xs p-4 sm:p-5 space-y-4"
      >
        <h3 className="text-sm font-extrabold text-[#09331F]">تخصيص صلاحية لموظف</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <label className="text-xs font-bold text-slate-800">
            الموظف
            <select
              required
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value === 'OTHER' ? (users[0]?.employee_id || '') : e.target.value)}
              className="block w-full min-h-10 mt-1.5 rounded-xl px-3 py-2 bg-[#F8F8F6] border border-[#DCDAD5] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
            >
              <option value="">اختر موظفًا</option>
              {users.map((u) => (
                <option key={u.employee_id} value={u.employee_id}>
                  {u.full_name} — {u.employee_id}
                </option>
              ))}
              <option value="OTHER">أخرى</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-800">
            الوحدة التنظيمية
            <select
              required
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value === 'OTHER' ? (units[0]?.id || '') : e.target.value)}
              className="block w-full min-h-10 mt-1.5 rounded-xl px-3 py-2 bg-[#F8F8F6] border border-[#DCDAD5] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
            >
              <option value="">اختر الوحدة</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name_ar}
                </option>
              ))}
              <option value="OTHER">أخرى</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-800">
            الصلاحية
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value === 'OTHER' ? 'AUDITOR' : e.target.value)}
              className="block w-full min-h-10 mt-1.5 rounded-xl px-3 py-2 bg-[#F8F8F6] border border-[#DCDAD5] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
            >
              <option value="MAKER">مُعد التقييم</option>
              <option value="CHECKER">المراجع المستقل</option>
              <option value="AUDITOR">مدقق (قراءة فقط)</option>
              <option value="OTHER">أخرى</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={grantingRole || !selectedEmployee || !selectedUnit}
            type="submit"
            className="min-h-10 bg-[#006547] hover:bg-[#09331F] text-white rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-60 transition-colors cursor-pointer"
          >
            {grantingRole ? 'جارٍ الحفظ...' : 'إضافة الصلاحية'}
          </button>
          {roleMessage && (
            <p role="status" className="text-xs font-bold text-[#006547]">
              {roleMessage}
            </p>
          )}
        </div>
      </form>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-[#DCDAD5] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#09331F] text-white">
              <tr>
                <th className="p-3.5 font-bold whitespace-nowrap">الرقم الوظيفي</th>
                <th className="p-3.5 font-bold whitespace-nowrap">الاسم الكامل</th>
                <th className="p-3.5 font-bold whitespace-nowrap">البريد الإلكتروني</th>
                <th className="p-3.5 font-bold whitespace-nowrap">الصلاحيات والوحدات المخصصة</th>
                <th className="p-3.5 font-bold whitespace-nowrap">إلزامية تغيير كلمة المرور</th>
                <th className="p-3.5 font-bold whitespace-nowrap">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E3DE]">
              {users.map((u) => (
                <tr key={u.employee_id} className="hover:bg-[#F8F8F6] transition-colors">
                  <td className="p-3.5 font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                    {u.employee_id}
                  </td>
                  <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">{u.full_name}</td>
                  <td className="p-3.5 font-mono text-slate-700 whitespace-nowrap" dir="ltr">
                    {u.email}
                  </td>
                  <td className="p-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {u.roles?.map((r) => (
                        <span
                          key={r.id}
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F8F8F6] text-[#09331F] border border-[#DCDAD5] flex items-center gap-1 whitespace-nowrap"
                        >
                          <span className="font-semibold">{r.unit_name_ar}:</span>
                          <span className="text-[#006547] font-mono">{r.role}</span>
                        </span>
                      ))}
                      {(!u.roles || u.roles.length === 0) && (
                        <span className="text-slate-500 italic">بدون وحدات</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3.5 whitespace-nowrap">
                    {u.must_reset_password ? (
                      <span className="text-[11px] font-bold text-amber-800">نعم (مؤقتة)</span>
                    ) : (
                      <span className="text-[11px] font-bold text-[#006547]">تم التعيين</span>
                    )}
                  </td>
                  <td className="p-3.5 whitespace-nowrap">
                    <span className="text-[11px] font-bold text-[#006547]">نشط</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
