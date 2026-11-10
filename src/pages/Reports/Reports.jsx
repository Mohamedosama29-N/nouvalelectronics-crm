// src/pages/Reports/Reports.jsx
import { useState, useEffect } from 'react'
import { DocumentArrowDownIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { db } from '../../services/firebase'
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { useSystem } from '../../contexts/SystemContext'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

const Reports = () => {
  const { systemSettings } = useSystem()
  const [reportType, setReportType] = useState('sales')
  const [groupBy, setGroupBy] = useState('day') // day | month | year - لتقرير المبيعات بس
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })

  // اختصارات سريعة لفترات شائعة (اليوم / الشهر ده / السنة دي / من البداية)
  const applyQuickRange = (preset) => {
    const now = new Date()
    let start
    if (preset === 'today') {
      start = new Date()
    } else if (preset === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (preset === 'year') {
      start = new Date(now.getFullYear(), 0, 1)
    } else {
      start = new Date(2000, 0, 1) // كل الوقت تقريباً
    }
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0]
    })
    if (preset === 'year' || preset === 'all') setGroupBy('month')
    else if (preset === 'today') setGroupBy('day')
  }


  const exportInventoryToExcel = (products) => {
  const exportData = products.map(p => ({
    'المنتج': p.name,
    'السعر': p.price,
    'الكمية': p.quantity,
    'حد التنبيه': p.lowStockThreshold || 10,
    'الحالة': (Number(p.quantity) || 0) <= 0 ? 'نفد' : p.quantity <= (p.lowStockThreshold || 10) ? 'منخفض' : 'جيد'
  }))
  
  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'المخزون')
  XLSX.writeFile(wb, `المخزون_${new Date().toISOString().split('T')[0]}.xlsx`)
  toast.success('تم تصدير المخزون بنجاح')
}


  // جلب البيانات عند تغيير نوع التقرير أو التاريخ أو طريقة التجميع
  useEffect(() => {
    loadReportData()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- الجلب بيتعمل عمداً لما نوع التقرير أو الفترة أو التجميع يتغيروا بس
  }, [reportType, dateRange, groupBy])

  const loadReportData = async () => {
    setLoading(true)
    try {
      const startDate = new Date(dateRange.start)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(dateRange.end)
      endDate.setHours(23, 59, 59, 999)

      const startTimestamp = Timestamp.fromDate(startDate)
      const endTimestamp = Timestamp.fromDate(endDate)

      if (reportType === 'sales') {
        await loadSalesReport(startTimestamp, endTimestamp)
      } else if (reportType === 'profit') {
        await loadProfitReport(startTimestamp, endTimestamp)
      } else if (reportType === 'inventory') {
        await loadInventoryReport()
      } else if (reportType === 'products') {
        await loadProductsReport(startTimestamp, endTimestamp)
      }
    } catch (error) {
      logger.error('Error loading report:', error)
      toast.error('فشل تحميل التقرير')
    } finally {
      setLoading(false)
    }
  }


  // مفتاح ولابل التجميع حسب groupBy - بيرجع { key, label } لكل فاتورة
  const groupKeyForDate = (date) => {
    if (groupBy === 'year') {
      const y = date.getFullYear()
      return { key: `${y}`, label: `سنة ${y}` }
    }
    if (groupBy === 'month') {
      const y = date.getFullYear()
      const m = date.getMonth() + 1
      const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
      return { key: `${y}-${String(m).padStart(2, '0')}`, label: `${monthNames[m - 1]} ${y}` }
    }
    // day (افتراضي) - المفتاح ISO (yyyy-mm-dd) عشان الترتيب الزمني يطلع صح،
    // واللابل بالتنسيق المحلي العربي للعرض بس
    const isoKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { key: isoKey, label: date.toLocaleDateString('ar-EG') }
  }

  const loadSalesReport = async (startDate, endDate) => {
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate)
    )
    
    const snapshot = await getDocs(invoicesQuery)
    const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(inv => inv.status !== 'voided')
    
    // تجميع المبيعات حسب اليوم/الشهر/السنة (حسب groupBy المختار)
    const grouped = {} // key -> { label, amount, count }
    let totalSales = 0
    let totalInvoices = invoices.length
    
    invoices.forEach(invoice => {
      const date = invoice.timestamp?.toDate()
      if (date) {
        const { key, label } = groupKeyForDate(date)
        if (!grouped[key]) grouped[key] = { label, amount: 0, count: 0 }
        grouped[key].amount += invoice.total || 0
        grouped[key].count += 1
        totalSales += invoice.total || 0
      }
    })
    
    // ترتيب زمني تصاعدي حسب المفتاح (بيشتغل صح لأن المفاتيح كلها بصيغة قابلة للترتيب نصياً: yyyy أو yyyy-mm أو تاريخ محلي)
    const chartData = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ date: v.label, amount: v.amount, count: v.count }))
    
    setReportData({
      title: 'تقرير المبيعات',
      totalSales,
      totalInvoices,
      averageOrder: totalInvoices > 0 ? totalSales / totalInvoices : 0,
      data: chartData,
      chartData: {
        labels: chartData.map(d => d.date),
        datasets: [{
          label: 'المبيعات',
          data: chartData.map(d => d.amount),
          backgroundColor: 'rgba(54, 162, 235, 0.5)'
        }]
      }
    })
  }

  const loadProfitReport = async (startDate, endDate) => {
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate)
    )
    
    const snapshot = await getDocs(invoicesQuery)
    const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(inv => inv.status !== 'voided')
    
    let totalRevenue = 0
    let totalCost = 0
    
    for (const invoice of invoices) {
      totalRevenue += invoice.total || 0
      // حساب التكلفة من المنتجات
      if (invoice.items) {
        for (const item of invoice.items) {
          // هنا يمكن جلب تكلفة المنتج من الـ products collection
          totalCost += (item.cost || (item.price * 0.6)) * item.quantity
        }
      }
    }
    
    setReportData({
      title: 'تقرير الأرباح',
      totalRevenue,
      totalCost,
      totalProfit: totalRevenue - totalCost,
      profitMargin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(2) : 0,
      data: []
    })
  }

  const loadInventoryReport = async () => {
    const productsSnapshot = await getLiveSnapshot('products')
    const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    
    const lowStock = products.filter(p => p.quantity <= (p.lowStockThreshold || 10))
    const outOfStock = products.filter(p => (Number(p.quantity) || 0) <= 0)
    
    setReportData({
      title: 'تقرير المخزون',
      totalProducts: products.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      totalValue: products.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0),
      data: products
    })
  }

  const loadProductsReport = async (startDate, endDate) => {
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate)
    )
    
    const snapshot = await getDocs(invoicesQuery)
    const invoices = snapshot.docs.map(doc => doc.data()).filter(inv => inv.status !== 'voided')
    
    const productSales = {}
    
    invoices.forEach(invoice => {
      if (invoice.items) {
        invoice.items.forEach(item => {
          if (!productSales[item.name]) {
            productSales[item.name] = { name: item.name, quantity: 0, revenue: 0 }
          }
          productSales[item.name].quantity += item.quantity
          productSales[item.name].revenue += item.total
        })
      }
    })
    
    // ما بنحطش سقف صغير - بنجيب كل المنتجات مرتبة، والواجهة تتولى العرض
    const topProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity).slice(0, 100)
    
    setReportData({
      title: 'تقرير أفضل المنتجات',
      topProducts,
      totalItemsSold: Object.values(productSales).reduce((sum, p) => sum + p.quantity, 0),
      data: topProducts
    })
  }

  const exportToExcel = () => {
    if (!reportData) return
    
    let worksheetData = []
    
    if (reportType === 'sales') {
      worksheetData = reportData.data.map(d => ({ الفترة: d.date, 'عدد الفواتير': d.count, المبيعات: d.amount }))
    } else if (reportType === 'inventory') {
      worksheetData = reportData.data.map(p => ({ 
        المنتج: p.name, 
        السعر: p.price, 
        الكمية: p.quantity,
        'حد التنبيه': p.lowStockThreshold || 10
      }))
    } else if (reportType === 'products') {
      worksheetData = reportData.topProducts.map(p => ({
        المنتج: p.name,
        'الكمية المباعة': p.quantity,
        'الإيرادات': p.revenue
      }))
    }
    
    const ws = XLSX.utils.json_to_sheet(worksheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, reportData.title)
    XLSX.writeFile(wb, `${reportData.title}_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success('تم تصدير التقرير بنجاح')
  }

  const printReport = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="p-6 rtl" id="report-content">
      <div className="flex justify-between items-center mb-6 no-print">
        <h1 className="text-3xl font-bold dark:text-white">📊 التقارير</h1>
        <div className="flex gap-3">
          <button
            onClick={exportToExcel}
            disabled={!reportData}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            <DocumentArrowDownIcon className="w-5 h-5" />
            تصدير Excel
          </button>
          <button
            onClick={printReport}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <PrinterIcon className="w-5 h-5" />
            طباعة
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 no-print">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-white">نوع التقرير</label>
            <select
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="sales">تقرير المبيعات</option>
              <option value="profit">تقرير الأرباح</option>
              <option value="inventory">تقرير المخزون</option>
              <option value="products">تقرير أفضل المنتجات</option>
            </select>
          </div>
          {reportType !== 'inventory' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">من تاريخ</label>
                <input
                  type="date"
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">إلى تاريخ</label>
                <input
                  type="date"
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                />
              </div>
              {reportType === 'sales' && (
                <div>
                  <label className="block text-sm font-medium mb-2 dark:text-white">تجميع حسب</label>
                  <select
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value)}
                  >
                    <option value="day">يومي</option>
                    <option value="month">شهري</option>
                    <option value="year">سنوي</option>
                  </select>
                </div>
              )}
            </>
          )}
        </div>
        {reportType === 'sales' && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={() => applyQuickRange('today')} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-200 rounded-lg">اليوم</button>
            <button onClick={() => applyQuickRange('month')} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-200 rounded-lg">الشهر ده</button>
            <button onClick={() => applyQuickRange('year')} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-200 rounded-lg">السنة دي (تجميع شهري)</button>
            <button onClick={() => applyQuickRange('all')} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-200 rounded-lg">من البداية (تجميع شهري)</button>
          </div>
        )}
      </div>

      {/* Report Content */}
      {reportData && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b dark:border-gray-700">
            <h2 className="text-2xl font-bold dark:text-white">{reportData.title}</h2>
            {reportType !== 'inventory' && (
              <p className="text-gray-500 dark:text-gray-400">
                الفترة: {dateRange.start} إلى {dateRange.end}
              </p>
            )}
          </div>

          {/* Summary Cards */}
          {reportType === 'sales' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">إجمالي المبيعات</p>
                <p className="text-2xl font-bold text-blue-600">{reportData.totalSales?.toFixed(2)} {systemSettings.currency || 'ج.م'}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">عدد الفواتير</p>
                <p className="text-2xl font-bold text-green-600">{reportData.totalInvoices}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">متوسط الفاتورة</p>
                <p className="text-2xl font-bold text-purple-600">{reportData.averageOrder?.toFixed(2)} {systemSettings.currency || 'ج.م'}</p>
              </div>
            </div>
          )}

          {reportType === 'profit' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">الإيرادات</p>
                <p className="text-2xl font-bold text-blue-600">{reportData.totalRevenue?.toFixed(2)} {systemSettings.currency || 'ج.م'}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">التكاليف</p>
                <p className="text-2xl font-bold text-red-600">{reportData.totalCost?.toFixed(2)} {systemSettings.currency || 'ج.م'}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">صافي الربح</p>
                <p className="text-2xl font-bold text-green-600">{reportData.totalProfit?.toFixed(2)} {systemSettings.currency || 'ج.م'}</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">هامش الربح</p>
                <p className="text-2xl font-bold text-yellow-600">{reportData.profitMargin}%</p>
              </div>
            </div>
          )}

          {reportType === 'inventory' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">إجمالي المنتجات</p>
                <p className="text-2xl font-bold text-blue-600">{reportData.totalProducts}</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">منتجات منخفضة</p>
                <p className="text-2xl font-bold text-yellow-600">{reportData.lowStockCount}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">منتجات نفدت</p>
                <p className="text-2xl font-bold text-red-600">{reportData.outOfStockCount}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">قيمة المخزون</p>
                <p className="text-2xl font-bold text-green-600">{reportData.totalValue?.toFixed(2)} {systemSettings.currency || 'ج.م'}</p>
              </div>
            </div>
          )}


          {reportType === 'inventory' && (
  <button onClick={() => exportInventoryToExcel(reportData.data)} className="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm">
    تصدير المخزون
  </button>
)}

          {reportType === 'products' && (
            <div className="grid grid-cols-2 gap-4 p-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">إجمالي الوحدات المباعة</p>
                <p className="text-2xl font-bold text-blue-600">{reportData.totalItemsSold}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-gray-600 dark:text-gray-400">عدد المنتجات المباعة</p>
                <p className="text-2xl font-bold text-green-600">{reportData.topProducts?.length}</p>
              </div>
            </div>
          )}

          {/* Data Table */}
          <div className="overflow-x-auto p-6 pt-0">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {reportType === 'sales' && (
                    <>
                      <th className="px-6 py-3 text-right">الفترة</th>
                      <th className="px-6 py-3 text-right">عدد الفواتير</th>
                      <th className="px-6 py-3 text-right">المبيعات</th>
                    </>
                  )}
                  {reportType === 'inventory' && (
                    <>
                      <th className="px-6 py-3 text-right">المنتج</th>
                      <th className="px-6 py-3 text-right">السعر</th>
                      <th className="px-6 py-3 text-right">الكمية</th>
                      <th className="px-6 py-3 text-right">الحالة</th>
                    </>
                  )}
                  {reportType === 'products' && (
                    <>
                      <th className="px-6 py-3 text-right">المنتج</th>
                      <th className="px-6 py-3 text-right">الكمية المباعة</th>
                      <th className="px-6 py-3 text-right">الإيرادات</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {reportType === 'sales' && reportData.data?.map((item, idx) => (
                  <tr key={idx} className="border-t dark:border-gray-700">
                    <td className="px-6 py-4 font-medium dark:text-white">{item.date}</td>
                    <td className="px-6 py-4 dark:text-gray-300">{item.count}</td>
                    <td className="px-6 py-4 font-bold text-blue-600">{item.amount.toFixed(2)} {systemSettings.currency || 'ج.م'}</td>
                  </tr>
                ))}
                
                {reportType === 'inventory' && reportData.data?.map((product, idx) => (
                  <tr key={idx} className="border-t dark:border-gray-700">
                    <td className="px-6 py-4 font-medium">{product.name}</td>
                    <td className="px-6 py-4">{product.price} {systemSettings.currency || 'ج.م'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded ${(Number(product.quantity) || 0) <= 0 ? 'bg-red-100 text-red-800' : product.quantity <= (product.lowStockThreshold || 10) ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                        {(Number(product.quantity) || 0) <= 0 ? 'نفد' : product.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {(Number(product.quantity) || 0) <= 0 ? '❌ نفد' : product.quantity <= (product.lowStockThreshold || 10) ? '⚠️ منخفض' : '✅ جيد'}
                    </td>
                  </tr>
                ))}
                
                {reportType === 'products' && reportData.topProducts?.map((product, idx) => (
                  <tr key={idx} className="border-t dark:border-gray-700">
                    <td className="px-6 py-4 font-medium">
                      {idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : ''}
                      {product.name}
                    </td>
                    <td className="px-6 py-4">{product.quantity}</td>
                    <td className="px-6 py-4 text-green-600">{product.revenue} {systemSettings.currency || 'ج.م'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {reportType === 'sales' && reportData.data?.length === 0 && (
              <div className="text-center py-8 text-gray-500">لا توجد مبيعات في هذه الفترة</div>
            )}
            {reportType === 'inventory' && reportData.data?.length === 0 && (
              <div className="text-center py-8 text-gray-500">لا توجد منتجات. أضف منتجك الأول!</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Reports