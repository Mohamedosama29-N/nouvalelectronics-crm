import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from 'firebase/firestore';
import {
  Download
} from 'lucide-react';
import { db } from '../../firebase/config';
import { showError } from '../../utils/alerts';
import { normalizeSearch } from '../../utils/search';

export function AuditLogManager() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [filterUserId, setFilterUserId] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const loadEmployees = async () => {
      const snap = await getDocs(collection(db, 'employees'));
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    loadEmployees();
  }, []);

  const loadLogs = useCallback(async (isNextPage = false) => {
    setLoading(true);
    try {
      let constraints = [orderBy('timestamp', 'desc')];

      if (filterUserId !== 'all') {
        constraints.push(where('userId', '==', filterUserId));
      }
      if (filterAction !== 'all') {
        constraints.push(where('action', '==', filterAction));
      }
      if (filterDateFrom) {
        const fromDate = new Date(filterDateFrom);
        fromDate.setHours(0, 0, 0, 0);
        constraints.push(where('timestamp', '>=', fromDate));
      }
      if (filterDateTo) {
        const toDate = new Date(filterDateTo);
        toDate.setHours(23, 59, 59, 999);
        constraints.push(where('timestamp', '<=', toDate));
      }

      if (isNextPage && lastDoc) constraints.push(startAfter(lastDoc));
      constraints.push(limit(100));

      const q = query(collection(db, 'activity_logs'), ...constraints);
      const snap = await getDocs(q);
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      setLogs(prev => isNextPage ? [...prev, ...fetched] : fetched);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 100);
    } catch (error) {
      console.error("Error loading audit log:", error);
      showError("فشل تحميل سجل التدقيق");
    }
    setLoading(false);
  }, [filterUserId, filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    setLastDoc(null);
    loadLogs(false);
  }, [filterUserId, filterAction, filterDateFrom, filterDateTo]);

  const filteredLogs = logs.filter(log => {
    if (!search) return true;
    const term = normalizeSearch(search);
    return normalizeSearch(log.userName || '').includes(term) ||
           normalizeSearch(log.action || '').includes(term) ||
           normalizeSearch(log.details || '').includes(term);
  });

  const formatLogDate = (ts) => {
    if (!ts) return '-';
    const date = ts?.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const handleExport = () => {
    const rows = [
      ['التاريخ', 'المستخدم', 'الدور', 'العملية', 'التفاصيل'],
      ...filteredLogs.map(l => [
        formatLogDate(l.timestamp), l.userName || '', l.userRole || '', l.action || '', l.details || ''
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end flex-1">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">المستخدم</label>
            <select
              className="border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900"
              value={filterUserId}
              onChange={e => setFilterUserId(e.target.value)}
            >
              <option value="all">كل المستخدمين</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name || emp.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">نوع العملية</label>
            <select
              className="border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900"
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
            >
              <option value="all">كل العمليات</option>
              <option value="تعديل سعر">تعديل سعر</option>
              <option value="تطبيق خصم">تطبيق خصم</option>
              <option value="إصدار فاتورة">إصدار فاتورة</option>
              <option value="تعديل صنف">تعديل صنف</option>
              <option value="إضافة صنف">إضافة صنف</option>
              <option value="إضافة مرتجع">إضافة مرتجع</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
            <input type="date" className="border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
            <input type="date" className="border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-bold text-slate-500 mb-1">بحث</label>
            <input
              type="text"
              placeholder="ابحث في التفاصيل أو اسم المستخدم..."
              className="w-full border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <button onClick={handleExport} className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 hover:bg-emerald-700">
          <Download size={14}/> تصدير CSV
        </button>
      </div>

      <div className="overflow-x-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="p-3 text-right">التاريخ والوقت</th>
              <th className="p-3 text-right">المستخدم</th>
              <th className="p-3 text-right">الدور</th>
              <th className="p-3 text-right">العملية</th>
              <th className="p-3 text-right">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map(log => (
              <tr key={log.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="p-3 whitespace-nowrap text-slate-500">{formatLogDate(log.timestamp)}</td>
                <td className="p-3 font-bold">{log.userName || '-'}</td>
                <td className="p-3">{log.userRole || '-'}</td>
                <td className="p-3">
                  <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-lg text-xs font-bold">
                    {log.action || '-'}
                  </span>
                </td>
                <td className="p-3 text-slate-600 dark:text-slate-300">{log.details || '-'}</td>
              </tr>
            ))}
            {!loading && filteredLogs.length === 0 && (
              <tr><td colSpan="5" className="p-8 text-center text-slate-400">لا توجد سجلات مطابقة</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => loadLogs(true)}
            disabled={loading}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'جاري التحميل...' : 'تحميل المزيد'}
          </button>
        </div>
      )}
    </div>
  );
}

// ملحوظة تنظيف: تم حذف FaultCodeManager من هنا - كان كود ميت غير
// مستخدم في أي مكان بالواجهة، وبيعتمد على تصميم قديم لأكواد الأعطال
// (مجموعة "faultCodes" بمستوى واحد) تم استبداله بنظام "mainFaultCodes"
// / "subFaultCodes" ذو المستويين المستخدم فعليًا في ProductModelManager.


// ==========================================================================
// 📊 مكون استيراد المنتجات والموديلات وأكواد الأعطال (معدل لـ 5 مستويات)
// مع تحميل قالب Excel جاهز وربط تلقائي
// ==========================================================================
