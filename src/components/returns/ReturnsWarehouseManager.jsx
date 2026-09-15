import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, doc, deleteDoc, query, where, serverTimestamp, limit
} from 'firebase/firestore';
import {
  Plus,
  Search,
  Trash2,
  X,
  RotateCcw
} from 'lucide-react';
import { db } from '../../firebase/config';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { formatDate } from '../../utils/format';
import { normalizeSearch } from '../../utils/search';

export function ReturnsWarehouseManager({ appUser, setGlobalLoading }) {
  const [returns, setReturns] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newReturnItem, setNewReturnItem] = useState({
    serialNumber: '',
    name: '',
    originalInvoice: '',
    reason: '',
    condition: 'defective',
    customerName: '',
    customerPhone: '',
    returnDate: new Date().toISOString().split('T')[0],
    warehouseId: appUser.assignedWarehouseId || 'main'
  });

  // تحميل بيانات المرتجعات
  useEffect(() => {
    loadReturns();
  }, []);

  const loadReturns = async () => {
    setLoading(true);
    try {
      let q = query(collection(db, 'returnsWarehouse'), limit(500));
      
      // ✅ التحكم في البيانات حسب صلاحيات المستخدم
      if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
        q = query(q, where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
      }
      
      const snap = await getDocs(q);
      setReturns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error loading returns:", error);
      showError("فشل تحميل بيانات المرتجعات");
    }
    setLoading(false);
  };

  // إضافة منتج مرتجع جديد
  const handleAddReturn = async (e) => {
    e.preventDefault();
    
    if (!newReturnItem.serialNumber || !newReturnItem.name) {
      showError("السيريال واسم المنتج مطلوبان");
      return;
    }

    setGlobalLoading(true);
    try {
      await addDoc(collection(db, 'returnsWarehouse'), {
        ...newReturnItem,
        createdAt: serverTimestamp(),
        createdBy: appUser.name,
        warehouseId: appUser.assignedWarehouseId || 'main',
        status: 'available'
      });
      
      await logUserActivity(appUser, 'إضافة مرتجع', `إضافة منتج مرتجع: ${newReturnItem.name} (${newReturnItem.serialNumber})`);
      
      showSuccess("تم إضافة المنتج إلى مخزن المرتجعات");
      setShowAddModal(false);
      setNewReturnItem({
        serialNumber: '',
        name: '',
        originalInvoice: '',
        reason: '',
        condition: 'defective',
        customerName: '',
        customerPhone: '',
        returnDate: new Date().toISOString().split('T')[0],
        warehouseId: appUser.assignedWarehouseId || 'main'
      });
      loadReturns();
    } catch (error) {
      console.error(error);
      showError("فشل إضافة المنتج");
    }
    setGlobalLoading(false);
  };

  // حذف منتج مرتجع
  const handleDeleteReturn = async (id, name) => {
    const confirmed = await showConfirm('تأكيد الحذف', `حذف المنتج المرتجع "${name}" نهائياً؟`);
    if (!confirmed) return;

    setGlobalLoading(true);
    try {
      await deleteDoc(doc(db, 'returnsWarehouse', id));
      showSuccess("تم حذف المنتج");
      loadReturns();
    } catch (error) {
      console.error(error);
      showError("فشل الحذف");
    }
    setGlobalLoading(false);
  };

  // البحث
  const filteredReturns = returns.filter(item =>
    normalizeSearch(item.serialNumber).includes(normalizeSearch(search)) ||
    normalizeSearch(item.name).includes(normalizeSearch(search)) ||
    normalizeSearch(item.originalInvoice).includes(normalizeSearch(search))
  );

  return (
    <div className="space-y-6">
      {/* مودال إضافة مرتجع */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="font-black text-xl text-slate-800 dark:text-white">إضافة منتج مرتجع</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddReturn} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">السيريال *</label>
                  <input
                    required
                    className="w-full border p-2 rounded-lg font-mono"
                    value={newReturnItem.serialNumber}
                    onChange={e => setNewReturnItem({...newReturnItem, serialNumber: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">اسم المنتج *</label>
                  <input
                    required
                    className="w-full border p-2 rounded-lg"
                    value={newReturnItem.name}
                    onChange={e => setNewReturnItem({...newReturnItem, name: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">رقم الفاتورة الأصلية</label>
                <input
                  className="w-full border p-2 rounded-lg font-mono"
                  value={newReturnItem.originalInvoice}
                  onChange={e => setNewReturnItem({...newReturnItem, originalInvoice: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">اسم العميل</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={newReturnItem.customerName}
                    onChange={e => setNewReturnItem({...newReturnItem, customerName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">رقم العميل</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={newReturnItem.customerPhone}
                    onChange={e => setNewReturnItem({...newReturnItem, customerPhone: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">حالة المنتج</label>
                <select
                  className="w-full border p-2 rounded-lg"
                  value={newReturnItem.condition}
                  onChange={e => setNewReturnItem({...newReturnItem, condition: e.target.value})}
                >
                  <option value="defective">تالف</option>
                  <option value="good">بحالة جيدة</option>
                  <option value="repairable">قابل للإصلاح</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">سبب الإرجاع</label>
                <textarea
                  rows="2"
                  className="w-full border p-2 rounded-lg"
                  value={newReturnItem.reason}
                  onChange={e => setNewReturnItem({...newReturnItem, reason: e.target.value})}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button type="submit" className="flex-1 bg-teal-600 text-white py-2 rounded-lg font-bold">حفظ</button>
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-100 dark:bg-slate-700 py-2 rounded-lg font-bold">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* رأس الصفحة */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black flex items-center gap-2">
            <RotateCcw className="text-teal-600" size={24} />
            مخزن المنتجات المرتجعة
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
          >
            <Plus size={16} /> إضافة مرتجع
          </button>
        </div>

        {/* البحث */}
        <div className="relative mb-4">
          <Search className="absolute right-3 top-3 text-slate-400" size={16} />
          <input
            className="w-full border p-2 pr-10 rounded-lg text-sm"
            placeholder="بحث بالسيريال، اسم المنتج، أو رقم الفاتورة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* عرض البيانات */}
        {loading ? (
          <p className="text-center py-8">جاري التحميل...</p>
        ) : filteredReturns.length === 0 ? (
          <p className="text-center py-8 text-slate-400">لا توجد منتجات مرتجعة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold text-xs">
                <tr>
                  <th className="p-3">السيريال</th>
                  <th className="p-3">المنتج</th>
                  <th className="p-3">الفاتورة الأصلية</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">تاريخ الإرجاع</th>
                  <th className="p-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredReturns.map(item => (
                  <tr key={item.id}>
                    <td className="p-3 font-mono">{item.serialNumber}</td>
                    <td className="p-3 font-bold">{item.name}</td>
                    <td className="p-3 font-mono">{item.originalInvoice || '-'}</td>
                    <td className="p-3">{item.customerName || '-'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${
                        item.condition === 'defective' ? 'bg-rose-100 text-rose-700' :
                        item.condition === 'good' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.condition === 'defective' ? 'تالف' : item.condition === 'good' ? 'بحالة جيدة' : 'قابل للإصلاح'}
                      </span>
                    </td>
                    <td className="p-3">{formatDate(item.returnDate)}</td>
                    <td className="p-3">
                      <button
                        onClick={() => handleDeleteReturn(item.id, item.name)}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// 🚀 المكون الرئيسي للتطبيق (مع حل مشكلة الرفريش والتكامل الكامل)
// ==========================================================================
