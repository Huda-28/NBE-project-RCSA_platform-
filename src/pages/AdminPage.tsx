import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { User } from '../types/index.js';
import { UserCog, ShieldCheck, Key, Building2, UserPlus, Shield } from 'lucide-react';

export const AdminPage: React.FC = () => {
  const { token, user } = useAuth();
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
    const response = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
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
      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedEmployee)}/roles`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_id: selectedUnit, role: newRole }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر منح الصلاحية.');
      await reloadDirectory();
      setRoleMessage('تم حفظ الصلاحية وتسجيلها في سجل التعديلات.');
    } catch (error: any) { setRoleMessage(error.message); }
    finally { setGrantingRole(false); }
  };


  useEffect(() => {
    fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setUsers(data.users || []))
      .catch(err => console.error(err))
      .finally(() => setIsLoading(false));
    fetch('/api/business-units', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json()).then(data => setUnits(data.business_units || []))
      .catch(() => {});
  }, [token]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 font-['Cairo']">
        <div className="w-8 h-8 border-4 border-[#006547] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div>جارٍ تحميل دليل المستخدمين والصلاحيات...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-['Cairo']">
      {/* Header */}
      <div className="bg-[#ECEBE8] p-5 rounded-2xl border border-[#C6C4C1] shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">إدارة المستخدمين والصلاحيات</h2>
          <p className="text-xs text-slate-600 mt-1">
            عرض الحسابات وتحديد صلاحيات الموظفين لكل وحدة تنظيمية.
          </p>
        </div>
        <div className="px-3 py-1 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1] text-xs font-mono font-bold text-slate-800">
          المستخدمين: {users.length}
        </div>
      </div>

      <form onSubmit={submitRole} className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] shadow-sm p-5 space-y-3">
        <h3 className="font-bold text-[#09331F]">تخصيص صلاحية لموظف</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs font-semibold">الموظف
            <select required value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} className="block w-full mt-1 rounded-lg p-2 bg-[#F4F3F0] border border-[#B8B6B2]">
              <option value="">اختر موظفًا</option>
              {users.map(u => <option key={u.employee_id} value={u.employee_id}>{u.full_name} — {u.employee_id}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">الوحدة التنظيمية
            <select required value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} className="block w-full mt-1 rounded-lg p-2 bg-[#F4F3F0] border border-[#B8B6B2]">
              <option value="">اختر الوحدة</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name_ar}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">الصلاحية
            <select value={newRole} onChange={e => setNewRole(e.target.value)} className="block w-full mt-1 rounded-lg p-2 bg-[#F4F3F0] border border-[#B8B6B2]">
              <option value="MAKER">مُعد التقييم</option>
              <option value="CHECKER">المراجع المستقل</option>
              <option value="AUDITOR">مدقق (قراءة فقط)</option>
            </select>
          </label>
        </div>
        <button disabled={grantingRole || !selectedEmployee || !selectedUnit} type="submit" className="bg-[#006547] text-white rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-60">{grantingRole ? 'جارٍ الحفظ...' : 'إضافة الصلاحية'}</button>
        {roleMessage && <p role="status" className="text-xs font-semibold text-slate-800">{roleMessage}</p>}
      </form>

      {/* Users Table */}
      <div className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#09331F] text-white">
              <tr>
                <th className="p-3.5 font-bold">الرقم الوظيفي</th>
                <th className="p-3.5 font-bold">الاسم الكامل</th>
                <th className="p-3.5 font-bold">البريد الإلكتروني</th>
                <th className="p-3.5 font-bold">الصلاحيات والوحدات المخصصة</th>
                <th className="p-3.5 font-bold">إلزامية تغيير كلمة المرور</th>
                <th className="p-3.5 font-bold">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CECCC9]">
              {users.map((u) => (
                <tr key={u.employee_id} className="hover:bg-[#E2E1DE] transition-colors">
                  <td className="p-3.5 font-mono font-bold text-slate-900">{u.employee_id}</td>
                  <td className="p-3.5 font-bold text-slate-900">{u.full_name}</td>
                  <td className="p-3.5 font-mono text-slate-700" dir="ltr">{u.email}</td>
                  <td className="p-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {u.roles?.map(r => (
                        <span 
                          key={r.id} 
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E2E6E3] text-[#09331F] border border-[#006547]/35 flex items-center gap-1"
                        >
                          <span className="font-semibold">{r.unit_name_ar}:</span>
                          <span className="text-[#006547]">{r.role}</span>
                        </span>
                      ))}
                      {(!u.roles || u.roles.length === 0) && (
                        <span className="text-slate-600 italic">بدون وحدات</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3.5">
                    {u.must_reset_password ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        نعم (مؤقتة)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        تم التعيين
                      </span>
                    )}
                  </td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      نشط
                    </span>
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
