import React, { useCallback, useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, Timestamp, where
} from 'firebase/firestore';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Loader2,
  Download,
  DollarSign
} from 'lucide-react';
import { AdvancedCharts } from '../common/AdvancedCharts';
import { db } from '../../firebase/config';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { exportToCSV } from '../../utils/exportUtils';
import { formatDate } from '../../utils/format';

const EXPENSE_CATEGORIES = [
  'إيجار', 'رواتب', 'كهرباء ومرافق', 'صيانة', 'نقل وشحن', 'تسويق', 'أخرى'
];

const RANGE_OPTIONS = [
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'آخر 7 أيام' },
  { key: 'month', label: 'آخر 30 يوم' },
  { key: 'year', label: 'آخر سنة' },
];

function getRangeStart(rangeKey) {
  const now = new Date();
  switch (rangeKey) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'year':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case 'month':
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export function FinanceManager({ appUser }) {
  const [range, setRange] = useState('month');
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState(0);
  const [refunds, setRefunds] = useState(0);
  const [expenses, setExpenses] = useState([]);
  const [dailyRevenue, setDailyRevenue] = useState([]);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: EXPENSE_CATEGORIES[0], amount: '', description: '' });
  const [saving, setSaving] = useState(false);

  const canManage = appUser?.role === 'admin' || appUser?.permissions?.manageFinance;

  const loadFinanceData = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = getRangeStart(range);
      const startTs = Timestamp.fromDate(startDate);

      // الإيرادات: كل معاملات البيع في الفترة المحددة
      let salesQuery = query(
        collection(db, 'transactions'),
        where('type', '==', 'sell'),
        where('timestamp', '>=', startTs)
      );
      if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
        salesQuery = query(salesQuery, where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
      }
      const salesSnap = await getDocs(salesQuery);

      let totalRevenue = 0;
      const dailyTotals = {};
      salesSnap.docs.forEach((d) => {
        const data = d.data();
        const amount = Number(data.finalTotal || data.total || 0);
        totalRevenue += amount;
        const date = data.timestamp?.toDate?.() || new Date(data.timestamp);
        const dateStr = date.toISOString().split('T')[0];
        dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + amount;
      });
      setRevenue(totalRevenue);
      setDailyRevenue(
        Object.entries(dailyTotals)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ name: date, value }))
      );

      // المرتجعات الموافق عليها (بتتخصم من صافي الإيرادات لأنها مش بتتسجل
      // كمعاملة سالبة في 'transactions' - راجعنا الكود اتأكدنا من كده)
      let returnsQuery = query(
        collection(db, 'returns'),
        where('status', '==', 'approved'),
        where('createdAt', '>=', startTs)
      );
      const returnsSnap = await getDocs(returnsQuery);
      let totalRefunds = 0;
      returnsSnap.docs.forEach((d) => {
        const data = d.data();
        totalRefunds += Number(data.price || 0) * Number(data.quantity || 1);
      });
      setRefunds(totalRefunds);

      // المصروفات
      let expensesQuery = query(
        collection(db, 'expenses'),
        where('date', '>=', startTs),
        orderBy('date', 'desc')
      );
      const expensesSnap = await getDocs(expensesQuery);
      setExpenses(expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error(error);
      showError('حصل خطأ أثناء تحميل البيانات المالية');
    } finally {
      setLoading(false);
    }
  }, [range, appUser]);

  useEffect(() => {
    loadFinanceData();
  }, [loadFinanceData]);

  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfit = revenue - refunds - totalExpenses;

  const expensesByCategory = EXPENSE_CATEGORIES.map((cat) => ({
    name: cat,
    value: expenses.filter((e) => e.category === cat).reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
  })).filter((c) => c.value > 0);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.amount || Number(newExpense.amount) <= 0) {
      showError('أدخل مبلغاً صحيحاً');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'expenses'), {
        category: newExpense.category,
        amount: Number(newExpense.amount),
        description: newExpense.description || '',
        date: serverTimestamp(),
        createdBy: appUser.name || appUser.email,
        createdById: appUser.id,
        warehouseId: appUser.assignedWarehouseId || 'main',
      });
      showSuccess('تم إضافة المصروف بنجاح');
      setNewExpense({ category: EXPENSE_CATEGORIES[0], amount: '', description: '' });
      setShowAddExpense(false);
      loadFinanceData();
    } catch {
      showError('فشل إضافة المصروف');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = (expenseId) => {
    showConfirm('هل تريد حذف هذا المصروف؟', async () => {
      try {
        await deleteDoc(doc(db, 'expenses', expenseId));
        showSuccess('تم الحذف');
        loadFinanceData();
      } catch {
        showError('فشل الحذف');
      }
    });
  };

  if (!appUser?.permissions?.viewFinance && appUser?.role !== 'admin') {
    return (
      <div className="text-center py-20 text-slate-400 dark:text-slate-500">
        ليس لديك صلاحية عرض الملف المالي
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
          <Wallet className="text-indigo-600" /> الملف المالي
        </h2>
        <div className="flex gap-2 items-center">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900 dark:text-white"
          >
            {RANGE_OPTIONS.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={() => exportToCSV(expenses.map((ex) => ({
              'التاريخ': formatDate(ex.date),
              'الفئة': ex.category,
              'المبلغ': ex.amount,
              'الوصف': ex.description || '-',
              'بواسطة': ex.createdBy || '-',
            })), 'المصروفات')}
            disabled={expenses.length === 0}
            className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50"
          >
            <Download size={14}/> تصدير المصروفات
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-600" size={32}/></div>
      ) : (
        <>
          {/* بطاقات الملخص */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2 text-emerald-600 mb-2"><TrendingUp size={18}/> <span className="text-xs font-bold">الإيرادات</span></div>
              <p className="text-2xl font-black text-slate-800 dark:text-white">{revenue.toLocaleString()} ج</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2 text-amber-600 mb-2"><TrendingDown size={18}/> <span className="text-xs font-bold">المرتجعات</span></div>
              <p className="text-2xl font-black text-slate-800 dark:text-white">{refunds.toLocaleString()} ج</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2 text-rose-600 mb-2"><DollarSign size={18}/> <span className="text-xs font-bold">المصروفات</span></div>
              <p className="text-2xl font-black text-slate-800 dark:text-white">{totalExpenses.toLocaleString()} ج</p>
            </div>
            <div className={`p-5 rounded-2xl border ${netProfit >= 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800' : 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800'}`}>
              <div className={`flex items-center gap-2 mb-2 ${netProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}><Wallet size={18}/> <span className="text-xs font-bold">صافي الربح</span></div>
              <p className="text-2xl font-black text-slate-800 dark:text-white">{netProfit.toLocaleString()} ج</p>
            </div>
          </div>

          {/* الرسم البياني */}
          {dailyRevenue.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
              <AdvancedCharts data={dailyRevenue} type="line" title="الإيرادات اليومية" />
            </div>
          )}
          {expensesByCategory.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
              <AdvancedCharts data={expensesByCategory} type="bar" title="المصروفات حسب الفئة" />
            </div>
          )}

          {/* المصروفات */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 dark:text-white">المصروفات</h3>
              {canManage && (
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-700"
                >
                  <Plus size={14}/> إضافة مصروف
                </button>
              )}
            </div>

            {expenses.length === 0 ? (
              <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">لا توجد مصروفات مسجلة في هذه الفترة</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-xs font-bold">
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">الفئة</th>
                      <th className="p-3">الوصف</th>
                      <th className="p-3">المبلغ</th>
                      <th className="p-3">بواسطة</th>
                      {canManage && <th className="p-3"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((ex) => (
                      <tr key={ex.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="p-3 text-slate-500 dark:text-slate-400">{formatDate(ex.date)}</td>
                        <td className="p-3 font-bold text-slate-800 dark:text-white">{ex.category}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">{ex.description || '-'}</td>
                        <td className="p-3 font-bold text-rose-600">{Number(ex.amount).toLocaleString()} ج</td>
                        <td className="p-3 text-slate-500 dark:text-slate-400">{ex.createdBy || '-'}</td>
                        {canManage && (
                          <td className="p-3">
                            <button onClick={() => handleDeleteExpense(ex.id)} className="text-rose-500 hover:text-rose-700">
                              <Trash2 size={16}/>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {showAddExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddExpense} className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-lg text-slate-800 dark:text-white mb-4">إضافة مصروف</h3>
            <select
              value={newExpense.category}
              onChange={(e) => setNewExpense((p) => ({ ...p, category: e.target.value }))}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white p-3 rounded-xl text-sm mb-3"
            >
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={newExpense.amount}
              onChange={(e) => setNewExpense((p) => ({ ...p, amount: e.target.value }))}
              placeholder="المبلغ (ج)"
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white p-3 rounded-xl text-sm mb-3"
            />
            <input
              type="text"
              value={newExpense.description}
              onChange={(e) => setNewExpense((p) => ({ ...p, description: e.target.value }))}
              placeholder="وصف (اختياري)"
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white p-3 rounded-xl text-sm mb-5"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAddExpense(false)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white py-2.5 rounded-xl font-bold text-sm">
                إلغاء
              </button>
              <button type="submit" disabled={saving} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin"/> : null} حفظ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
