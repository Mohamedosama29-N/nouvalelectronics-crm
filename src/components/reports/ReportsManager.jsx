import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter
} from 'firebase/firestore';
import {
  AlertTriangle,
  Download,
  Printer,
  History,
  Loader2,
  ChevronDown,
  RefreshCcw,
  FileSpreadsheet as FileSpreadsheetIcon
} from 'lucide-react';
import { AdvancedCharts } from '../common/AdvancedCharts';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { USER_ROLES } from '../../constants/roles';
import { TICKET_STATUSES } from '../../constants/tickets';
import { db } from '../../firebase/config';
import { showError, showSuccess } from '../../utils/alerts';
import { exportToCSV, exportToExcel } from '../../utils/exportUtils';
import { formatDate } from '../../utils/format';
import { exportToPDF } from '../../utils/pdfExport';

export function ReportsManager({ appUser }) {
  // 🆕 مركز التصدير الشامل: تصدير Excel لأي مصدر بيانات في السيستم، مش
  // بس المبيعات (اللي كانت الصفحة دي مقتصرة عليها قبل كده)
  const [exportSource, setExportSource] = useState('transactions');
  const [exportingCenter, setExportingCenter] = useState(false);

  const EXPORT_SOURCES = [
    { id: 'transactions', label: 'المبيعات والمعاملات', collection: 'transactions', permission: 'exportTransactions' },
    { id: 'inventory', label: 'المخزون', collection: 'inventory', permission: 'exportInventoryCSV' },
    { id: 'customers', label: 'العملاء', collection: 'customers', permission: 'exportCustomersCSV' },
    { id: 'tickets', label: 'تذاكر الصيانة', collection: 'tickets', permission: 'manageTickets' },
    { id: 'transfers', label: 'التحويلات المخزنية', collection: 'transfers', permission: 'viewTransfers' },
    { id: 'invoices', label: 'الفواتير', collection: 'invoices', permission: 'viewInvoices' },
    { id: 'users', label: 'المستخدمين', collection: 'employees', permission: 'viewUsers' }
  ];

  const availableExportSources = EXPORT_SOURCES.filter(s =>
    appUser?.role === 'admin' || appUser?.permissions?.[s.permission]
  );

  // كل مصدر له تحويل أعمدة مناسب لقراءة أسهل في Excel، بدل تصدير الحقول
  // الخام زي ما هي (IDs, timestamps خام...)
  const mapRowForExport = (source, data) => {
    switch (source) {
      case 'inventory':
        return { 'الاسم': data.name || '-', 'السيريال': data.serialNumber || '-', 'الفئة': data.category || '-', 'الكمية': data.quantity ?? 0, 'السعر': data.price ?? 0, 'الحد الأدنى': data.minStock ?? 0, 'المخزن': data.warehouseId || '-' };
      case 'customers':
        return { 'الاسم': data.name || '-', 'الهاتف': data.phone || '-', 'البريد الإلكتروني': data.email || '', 'المحافظة': data.governorate || '', 'المدينة': data.city || '', 'عدد المشتريات': data.totalPurchases || 0 };
      case 'tickets':
        return {
          'رقم التذكرة': data.ticketNumber || '-', 'اسم العميل': data.customerName || '-', 'الهاتف': data.customerPhone || '-',
          'المحافظة': data.governorate || '-', 'المدينة': data.city || '-', 'العنوان': data.customerAddress || '-',
          'الجهاز': data.device || data.deviceType || '-', 'الموديل': data.deviceModel || '-', 'السيريال': data.deviceSerial || '-',
          'وصف العطل الرئيسي': data.mainFaultDescription || '-', 'وصف المشكلة': data.issue || '-',
          'الحالة': TICKET_STATUSES.find(s => s.value === data.status)?.label || data.status,
          'الأولوية': data.priority === 'high' ? 'عالية' : data.priority === 'medium' ? 'متوسطة' : data.priority === 'low' ? 'منخفضة' : (data.priority || '-'),
          'نوع التذكرة': data.ticketType || '-', 'المصدر': data.source || '-', 'حالة الضمان': data.warrantyStatus || '-',
          'الفني المسؤول': data.assignedTechnician || '-', 'مركز الصيانة': data.assignedMaintenanceCenter || '-',
          'التكلفة التقديرية': data.estimatedCost || 0, 'تاريخ التسليم': data.deliveryDate || '-',
          'تاريخ الإنشاء': formatDate(data.createdAt), 'آخر تحديث': formatDate(data.updatedAt), 'ملاحظات': data.notes || '-'
        };
      case 'transfers':
        return { 'من مخزن': data.fromWarehouseId || '-', 'إلى مخزن': data.toWarehouseId || '-', 'الحالة': data.status || '-', 'عدد الأصناف': (data.items || []).length, 'تاريخ الطلب': formatDate(data.createdAt) };
      case 'invoices':
        return { 'رقم الفاتورة': data.invoiceNumber || '-', 'العميل': data.customerName || '-', 'الإجمالي': data.finalTotal || data.total || 0, 'التاريخ': formatDate(data.timestamp || data.createdAt) };
      case 'users':
        return { 'الاسم': data.name || '-', 'البريد الإلكتروني': data.email || '-', 'الدور الوظيفي': USER_ROLES.find(r => r.key === data.role)?.label || data.role, 'الفرع': data.assignedWarehouseId || '-' };
      case 'transactions':
      default:
        return {
          'رقم الفاتورة': data.invoiceNumber || '-', 'التاريخ': formatDate(data.timestamp), 'نوع العملية': data.type === 'sell' ? 'بيع' : data.type === 'return' ? 'مرتجع' : data.type,
          'الصنف': data.itemName || '-', 'العميل': data.customerName || '-', 'الصافي': data.finalTotal || data.total || 0, 'البائع': data.operator || '-'
        };
    }
  };

  const handleExportCenter = async () => {
    const sourceDef = EXPORT_SOURCES.find(s => s.id === exportSource);
    if (!sourceDef) return;
    setExportingCenter(true);
    try {
      const snap = await getDocs(collection(db, sourceDef.collection));
      const rows = snap.docs.map(d => mapRowForExport(exportSource, { id: d.id, ...d.data() }));
      if (rows.length === 0) {
        showError("لا توجد بيانات في هذا القسم للتصدير");
      } else if (exportToExcel(rows, `${sourceDef.label}_${new Date().toISOString().split('T')[0]}`, sourceDef.label)) {
        showSuccess(`تم تصدير "${sourceDef.label}" بنجاح (${rows.length} سجل)`);
      } else {
        showError("حدث خطأ أثناء التصدير");
      }
    } catch (e) {
      console.error("Export center error:", e);
      if (e.code === 'permission-denied') {
        showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
      } else {
        showError("حدث خطأ أثناء تصدير البيانات");
      }
    }
    setExportingCenter(false);
  };

  const [transactions, setTransactions] = useState([]);
  const transactionsRef = useRef([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [reportType, setReportType] = useState('all');
  const [warehouse, setWarehouse] = useState('all');
  const [exportFormat, setExportFormat] = useState('csv');
  const [summary, setSummary] = useState({ total: 0, count: 0, avg: 0, min: 0, max: 0 });
  const [chartData, setChartData] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    const loadWarehouses = async () => {
      const snap = await getDocs(collection(db, 'warehouses'));
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    loadWarehouses();
  }, []);

  const loadReports = useCallback(async (isNextPage = false) => {
    setLoading(true);
    setError(null);
    try {
        let q = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'));
        
        if (dateRange.from) {
          const fromDate = new Date(dateRange.from);
          fromDate.setHours(0,0,0,0);
          q = query(q, where('timestamp', '>=', fromDate));
        }
        
        if (dateRange.to) {
          const toDate = new Date(dateRange.to);
          toDate.setHours(23,59,59,999);
          q = query(q, where('timestamp', '<=', toDate));
        }
        
        if (reportType !== 'all') {
          q = query(q, where('type', '==', reportType));
        }

        if (warehouse !== 'all') {
          q = query(q, where('warehouseId', '==', warehouse));
        }

        if (isNextPage && lastDoc) {
           q = query(q, startAfter(lastDoc));
        }
        q = query(q, limit(50));
        
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 🛠️ FIX: الإجمالي/المتوسط/الأعلى/الأقل والرسم البياني كانوا بيتحسبوا
        // بس من الصفحة اللي اتحمّلت حديثًا (50 عنصر)، فلو المستخدم دوس
        // "تحميل المزيد"، الأرقام كانت بتتصفّر وتتحسب من الصفحة الجديدة
        // بس بدل كل البيانات الظاهرة فعليًا في الجدول. دلوقتي بنجمعهم على
        // كل البيانات المتراكمة (القديمة + الجديدة).
        let allForStats = fetched;
        if (isNextPage) {
           allForStats = [...transactionsRef.current, ...fetched];
        }
        transactionsRef.current = allForStats;
        setTransactions(allForStats);
        
        let total = 0;
        let values = [];
        allForStats.forEach(t => {
          const val = Number(t.finalTotal || t.total || 0);
          total += val;
          values.push(val);
        });
        
        setSummary({
          total: total,
          count: allForStats.length,
          avg: allForStats.length > 0 ? total / allForStats.length : 0,
          min: values.length > 0 ? Math.min(...values) : 0,
          max: values.length > 0 ? Math.max(...values) : 0
        });

        const dailyTotals = {};
        allForStats.forEach(t => {
          const date = formatDate(t.timestamp).split(' ')[0];
          dailyTotals[date] = (dailyTotals[date] || 0) + Number(t.finalTotal || t.total || 0);
        });
        
        setChartData(Object.entries(dailyTotals).map(([date, total]) => ({
          date,
          total
        })).slice(0, 20));

        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 50);
    } catch (e) {
        console.error("Error loading reports:", e);
        setError(e.message);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ أثناء تحميل التقارير");
        }
    }
    setLoading(false);
  }, [lastDoc, dateRange, reportType, warehouse]);

  useEffect(() => {
    setLastDoc(null);
    loadReports(false);
  }, [dateRange, reportType, warehouse]);

  const handleExport = async () => {
    if (!transactions || transactions.length === 0) {
      showError("لا توجد بيانات للتصدير");
      return;
    }
    
    try {
      const exportData = transactions.map(t => ({
        'رقم الفاتورة': t.invoiceNumber || '-',
        'التاريخ': formatDate(t.timestamp),
        'نوع العملية': t.type === 'sell' ? 'بيع' : t.type === 'return' ? 'مرتجع' : t.type,
        'الصنف': t.itemName || '-',
        'السيريال': t.serialNumber || '-',
        'العميل': t.customerName || '-',
        'الفني المختص': t.technicianName || '-',
        'الخصم': t.discountAmount || 0,
        'الضريبة': t.taxAmount || 0,
        'الصافي': t.finalTotal || t.total || 0,
        'البائع': t.operator || '-',
        'المخزن': t.warehouseId || '-'
      }));

      if (exportFormat === 'csv') {
        exportToCSV(exportData, `Sales_Report_${new Date().toISOString().split('T')[0]}`);
        showSuccess("تم تصدير الملف بنجاح");
      } else if (exportFormat === 'xlsx') {
        exportToExcel(exportData, `Sales_Report_${new Date().toISOString().split('T')[0]}`, 'المبيعات');
        showSuccess("تم تصدير ملف Excel بنجاح");
      } else if (exportFormat === 'pdf') {
        await exportToPDF(
          exportData,
          'تقرير المبيعات',
          ['رقم الفاتورة', 'التاريخ', 'نوع العملية', 'الصنف', 'العميل', 'الصافي', 'البائع']
        );
        showSuccess("تم تصدير PDF بنجاح");
      }
    } catch (err) {
      console.error("Export error:", err);
      showError("حدث خطأ أثناء التصدير");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleResetFilters = () => {
    setDateRange({ from: '', to: '' });
    setReportType('all');
    setWarehouse('all');
  };

  const exportCenterPanel = (
    <div className="bg-teal-600 rounded-2xl shadow-sm p-5 text-white mb-6">
      <h2 className="text-lg font-black flex items-center gap-2 mb-1">
        <FileSpreadsheetIcon size={20}/> مركز التصدير
      </h2>
      <p className="text-xs text-white/80 mb-4">صدّر أي قسم من أقسام السيستم كملف Excel كامل بضغطة واحدة</p>
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="border-0 p-2.5 rounded-lg text-sm font-bold bg-white/95 text-slate-800"
          value={exportSource}
          onChange={e => setExportSource(e.target.value)}
        >
          {availableExportSources.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <button
          onClick={handleExportCenter}
          disabled={exportingCenter || availableExportSources.length === 0}
          className="bg-white text-teal-700 px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-teal-50 disabled:opacity-50 flex items-center gap-2"
        >
          {exportingCenter ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}
          {exportingCenter ? 'جاري التصدير...' : 'تصدير Excel'}
        </button>
      </div>
    </div>
  );

  if (loading && transactions.length === 0) {
    return (
      <>
        {exportCenterPanel}
        <LoadingSkeleton type="table" count={5} />
      </>
    );
  }

  return (
    <>
    {exportCenterPanel}
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden text-right" dir="rtl">
       <div className="p-5 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 dark:bg-slate-900/50">
         <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
           <History className="text-teal-600" size={20}/> سجل المبيعات والتقارير
         </h2>
         <div className="flex flex-wrap items-center gap-3">
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={reportType}
               onChange={e => setReportType(e.target.value)}
             >
               <option value="all">كل المعاملات</option>
               <option value="sell">مبيعات</option>
               <option value="return">مرتجعات</option>
             </select>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={warehouse}
               onChange={e => setWarehouse(e.target.value)}
             >
               <option value="all">كل المخازن</option>
               {warehouses.map(w => (
                 <option key={w.id} value={w.id}>{w.name}</option>
               ))}
             </select>
             
             <input
               type="date"
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={dateRange.from}
               onChange={e => setDateRange({...dateRange, from: e.target.value})}
               placeholder="من تاريخ"
             />
             <input
               type="date"
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={dateRange.to}
               onChange={e => setDateRange({...dateRange, to: e.target.value})}
               placeholder="إلى تاريخ"
             />
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={exportFormat}
               onChange={e => setExportFormat(e.target.value)}
             >
               <option value="csv">CSV</option>
               <option value="xlsx">Excel (xlsx)</option>
               <option value="pdf">PDF</option>
             </select>
             
             <button 
               onClick={handleResetFilters}
               className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
               title="إعادة تعيين"
             >
               <RefreshCcw size={14} />
             </button>
             
             <button 
               onClick={handleExport} 
               disabled={transactions.length === 0}
               className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
             >
                 <Download size={14} /> تصدير
             </button>
             
             <button 
               onClick={handlePrint} 
               disabled={transactions.length === 0}
               className="flex items-center gap-2 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
             >
                 <Printer size={14} /> طباعة
             </button>
         </div>
       </div>
       
       {error && (
         <div className="p-4 bg-rose-50 dark:bg-rose-900/30 border-b border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm font-bold flex items-center gap-2">
           <AlertTriangle size={16} />
           خطأ في تحميل البيانات: {error}
         </div>
       )}
       
       {transactions.length > 0 && (
         <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-gradient-to-l bg-teal-50 dark:bg-teal-900/30 border-b">
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">إجمالي المبيعات</p>
             <p className="text-lg font-black text-teal-600 dark:text-teal-400">{summary.total.toLocaleString()} ج</p>
           </div>
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">عدد المعاملات</p>
             <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{summary.count}</p>
           </div>
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">متوسط المعاملة</p>
             <p className="text-lg font-black text-purple-600 dark:text-purple-400">{summary.avg.toLocaleString()} ج</p>
           </div>
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">أعلى معاملة</p>
             <p className="text-lg font-black text-amber-600 dark:text-amber-400">{summary.max.toLocaleString()} ج</p>
           </div>
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">أقل معاملة</p>
             <p className="text-lg font-black text-slate-600 dark:text-slate-400">{summary.min.toLocaleString()} ج</p>
           </div>
         </div>
       )}
       
       {chartData.length > 0 && (
         <div className="p-4 border-b">
           <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3">تحليل المبيعات</h3>
           <AdvancedCharts 
             data={chartData.map(d => ({ name: d.date, value: d.total }))}
             type="line"
             height={200}
           />
         </div>
       )}
       
       <div className="overflow-x-auto max-h-[70vh] custom-scrollbar">
          <table className="w-full text-right text-xs">
            <thead className="bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold border-b sticky top-0">
              <tr>
                <th className="p-4">الفاتورة</th>
                <th className="p-4">النوع</th>
                <th className="p-4">المنتجات</th>
                <th className="p-4 text-center">العميل</th>
                <th className="p-4 text-center">الصافي</th>
                <th className="p-4">التاريخ</th>
                <th className="p-4">المخزن</th>
                <th className="p-4">البائع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700 font-medium">
              {transactions.length === 0 && !loading ? 
                <tr><td colSpan="8" className="p-8 text-center text-slate-400">لا توجد حركات</td></tr> :
                transactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="p-4 font-mono font-bold text-teal-600 dark:text-teal-400">{t.invoiceNumber || t.id.slice(0,6)}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${
                        t.type === 'sell' 
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' 
                          : t.type === 'return' 
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' 
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                        {t.type === 'sell' ? 'بيع' : t.type === 'return' ? 'مرتجع' : t.type}
                      </span>
                    </td>
                    <td className="p-4 max-w-xs leading-relaxed">
                      <p className="font-bold text-slate-800 dark:text-white">{t.itemName}</p>
                      {t.serialNumber && <p className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-1">{t.serialNumber}</p>}
                    </td>
                    <td className="p-4 text-center">
                       <p className="font-bold text-slate-700 dark:text-slate-300">{t.customerName}</p>
                       {t.technicianName && <p className="text-[9px] text-teal-500 dark:text-teal-400 mt-1">م: {t.technicianName}</p>}
                    </td>
                    <td className="p-4 text-center font-black text-emerald-600 dark:text-emerald-400">{Number(t.finalTotal || t.total || 0).toLocaleString()} ج</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 text-[10px]">{formatDate(t.timestamp)}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 text-[10px]">{t.warehouseId || '-'}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 text-[10px]">{t.operator}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          {hasMore && !loading && transactions.length >= 50 && (
             <div className="p-4 text-center bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
                <button 
                  onClick={() => loadReports(true)} 
                  className="text-teal-600 dark:text-teal-400 font-bold text-xs hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                   تحميل المزيد <ChevronDown size={14}/>
                </button>
             </div>
          )}
       </div>
    </div>
    </>
  );
}

// ==========================================================================
// 📦 مدير التحويلات المحسن - مع نظام الموافقة والرفض الكامل
// ==========================================================================
