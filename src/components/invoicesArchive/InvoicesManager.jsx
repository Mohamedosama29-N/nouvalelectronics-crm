import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from 'firebase/firestore';
import {
  Download
} from 'lucide-react';
import { InvoiceRenderer } from '../pos/InvoiceRenderer';
import { db } from '../../firebase/config';
import { showError, showSuccess } from '../../utils/alerts';
import { exportToExcel } from '../../utils/exportUtils';
import { formatDate } from '../../utils/format';
import { normalizeSearch } from '../../utils/search';

export function InvoicesManager({ systemSettings, appUser }) {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [invoiceData, setInvoiceData] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  
  // فلاتر جديدة
  const [filterCustomerName, setFilterCustomerName] = useState('');
  const [filterInvoiceNumber, setFilterInvoiceNumber] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterPhone, setFilterPhone] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [warehouses, setWarehouses] = useState([]);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    const loadWarehouses = async () => {
      const snap = await getDocs(collection(db, 'warehouses'));
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    loadWarehouses();
  }, []);

  // 🛠️ FIX: كانت الشاشة بتجيب آخر 500 فاتورة مرة واحدة بس (من غير أي
  // تحميل إضافي)، وكل الفلاتر (اسم العميل، رقم الفاتورة، التاريخ) كانت
  // بتشتغل محليًا على الـ 500 دول بس. أي فاتورة أقدم مكانتش تظهر أبدًا
  // مهما دورت عليها. هنا: (1) فلترة التاريخ بقت Firestore query حقيقي
  // بدل التقطيع العشوائي، و(2) ضفنا تحميل صفحات إضافية (تحميل المزيد).
  const loadInvoices = useCallback(async (isNextPage = false) => {
      setLoading(true);
      try {
        let constraints = [
          where("type", "==", "sell"),
          orderBy("timestamp", "desc")
        ];

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
        
        // ✅ التحكم في البيانات حسب صلاحيات المستخدم
        // إذا كان لديه صلاحية viewAllInvoices أو هو أدمن، يرى كل الفواتير
        const canViewAllInvoices = appUser.role === 'admin' || appUser.permissions?.viewAllInvoices === true;
        
        if (!canViewAllInvoices) {
          constraints.push(where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
        }

        if (isNextPage && lastDoc) {
          constraints.push(startAfter(lastDoc));
        }
        constraints.push(limit(500));
        
        const q = query(collection(db, "transactions"), ...constraints);
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        setInvoices(prev => isNextPage ? [...prev, ...data] : data);
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 500);
      } catch(e) {
        console.error(e);
      }
      setLoading(false);
  }, [appUser, filterDateFrom, filterDateTo]);

  useEffect(() => {
    setLastDoc(null);
    loadInvoices(false);
  }, [appUser, filterDateFrom, filterDateTo]);

  const filtered = invoices.filter(inv => {
    const matchesGlobalSearch = !search || 
      normalizeSearch(inv.invoiceNumber).includes(normalizeSearch(search)) ||
      normalizeSearch(inv.customerName).includes(normalizeSearch(search)) ||
      normalizeSearch(inv.serialNumber).includes(normalizeSearch(search)) ||
      normalizeSearch(inv.phone).includes(normalizeSearch(search));
    
    const matchesCustomerName = !filterCustomerName || 
      normalizeSearch(inv.customerName).includes(normalizeSearch(filterCustomerName));
    
    const matchesInvoiceNumber = !filterInvoiceNumber || 
      normalizeSearch(inv.invoiceNumber).includes(normalizeSearch(filterInvoiceNumber));
    
    const matchesPhone = !filterPhone || 
      normalizeSearch(inv.phone).includes(normalizeSearch(filterPhone));
    
    const matchesWarehouse = filterWarehouse === 'all' || inv.warehouseId === filterWarehouse;
    
    return matchesGlobalSearch && matchesCustomerName && matchesInvoiceNumber && 
           matchesPhone && matchesWarehouse;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'date') {
      const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
      const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
      comparison = dateA - dateB;
    } else if (sortBy === 'total') {
      comparison = (a.finalTotal || 0) - (b.finalTotal || 0);
    } else if (sortBy === 'customer') {
      comparison = (a.customerName || '').localeCompare(b.customerName || '');
    }
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  if (invoiceData) {
    return (
      <InvoiceRenderer
        data={invoiceData}
        systemSettings={systemSettings}
        onBack={() => setInvoiceData(null)}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-black">أرشيف الفواتير</h2>

      {/* فلاتر متقدمة */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl border">
        <div>
          <label className="text-xs font-bold block mb-1">بحث عام</label>
          <input
            className="w-full border p-2 rounded-lg text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث شامل..."
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">اسم العميل</label>
          <input
            className="w-full border p-2 rounded-lg text-sm"
            value={filterCustomerName}
            onChange={e => setFilterCustomerName(e.target.value)}
            placeholder="اسم العميل"
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">رقم الفاتورة</label>
          <input
            className="w-full border p-2 rounded-lg text-sm font-mono"
            value={filterInvoiceNumber}
            onChange={e => setFilterInvoiceNumber(e.target.value)}
            placeholder="INV-..."
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">رقم الموبايل</label>
          <input
            className="w-full border p-2 rounded-lg text-sm font-mono"
            value={filterPhone}
            onChange={e => setFilterPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">من تاريخ</label>
          <input
            type="date"
            className="w-full border p-2 rounded-lg text-sm"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">إلى تاريخ</label>
          <input
            type="date"
            className="w-full border p-2 rounded-lg text-sm"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">الفرع / المركز</label>
          <select
            className="w-full border p-2 rounded-lg text-sm"
            value={filterWarehouse}
            onChange={e => setFilterWarehouse(e.target.value)}
          >
            <option value="all">كل الفروع</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">ترتيب حسب</label>
          <div className="flex gap-2">
            <select
              className="flex-1 border p-2 rounded-lg text-sm"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="date">التاريخ</option>
              <option value="total">المبلغ</option>
              <option value="customer">العميل</option>
            </select>
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-slate-500">{filtered.length} فاتورة</span>
        <button
          onClick={() => {
            const exportData = filtered.map(inv => ({
              'رقم الفاتورة': inv.invoiceNumber || '-',
              'التاريخ': formatDate(inv.timestamp),
              'العميل': inv.customerName || '-',
              'الهاتف': inv.phone || '-',
              'الصنف': inv.itemName || '-',
              'السيريال': inv.serialNumber || '-',
              'الصافي': inv.finalTotal || inv.total || 0,
              'البائع': inv.operator || '-',
              'المخزن': inv.warehouseId || '-'
            }));
            if (exportToExcel(exportData, `Invoices_${new Date().toISOString().split('T')[0]}`, 'الفواتير')) {
              showSuccess("تم تصدير ملف Excel بنجاح");
            } else {
              showError("لا توجد بيانات للتصدير");
            }
          }}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-emerald-700"
        >
          <Download size={14}/> تصدير Excel
        </button>
        <button
          onClick={() => {
            setSearch('');
            setFilterCustomerName('');
            setFilterInvoiceNumber('');
            setFilterPhone('');
            setFilterDateFrom('');
            setFilterDateTo('');
            setFilterWarehouse('all');
          }}
          className="text-xs text-teal-600 hover:underline"
        >
          مسح الفلاتر
        </button>
      </div>

      {loading && <p className="text-center py-8">جاري التحميل...</p>}

      {!loading && (
        <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className="p-3">رقم الفاتورة</th>
                <th className="p-3">العميل</th>
                <th className="p-3">الهاتف</th>
                <th className="p-3">الإجمالي</th>
                <th className="p-3">الخصم</th>
                <th className="p-3">طريقة الدفع</th>
                <th className="p-3">الفرع</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">عرض</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                  <td className="p-3 font-bold font-mono text-teal-600 dark:text-teal-400">
                    {inv.invoiceNumber || inv.id.slice(0,8)}
                    {inv.ticketNumber && (
                      <span className="mr-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[9px] font-bold" title="مرتبطة بتذكرة صيانة">
                        🎫 #{inv.ticketNumber}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-bold">{inv.customerName}</td>
                  <td className="p-3 font-mono" dir="ltr">{inv.phone || '-'}</td>
                  <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">
                    {(inv.finalTotal || 0).toLocaleString()} ج
                  </td>
                  <td className="p-3 text-rose-500">
                    {inv.discountAmount > 0 ? `${inv.discountAmount.toLocaleString()} ج` : '-'}
                  </td>
                  <td className="p-3">
                    {inv.paymentMethod === 'cash' ? 'نقداً' :
                     inv.paymentMethod === 'card' ? 'بطاقة' :
                     inv.paymentMethod === 'transfer' ? 'تحويل' : '-'}
                  </td>
                  <td className="p-3 text-xs">{inv.warehouseId || '-'}</td>
                  <td className="p-3 text-xs">{formatDate(inv.timestamp)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => setInvoiceData(inv)}
                      className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-teal-700"
                    >
                      فتح
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400">لا توجد فواتير مطابقة</td>
                </tr>
              )}
            </tbody>
          </table>
          {hasMore && (
            <div className="flex justify-center p-4">
              <button
                onClick={() => loadInvoices(true)}
                disabled={loading}
                className="bg-teal-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? 'جاري التحميل...' : 'تحميل المزيد'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
