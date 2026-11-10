// src/modules/reports/AdvancedReports.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { useSystem } from '../../contexts/SystemContext'
import { 
  DocumentArrowDownIcon, 
  PrinterIcon, 
  
  
  
  
  
  
  
} from '@heroicons/react/24/outline'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

const AdvancedReports = () => {
  const { hasPermission } = useAuth()
  const { systemSettings } = useSystem()
  const [loading, setLoading] = useState(false)
  const [reportType, setReportType] = useState('sales')
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  const [reportData, setReportData] = useState(null)
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [branches, setBranches] = useState([])

  useEffect(() => {
    loadBranches()
  }, [])

  useEffect(() => {
    generateReport()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- الجلب بيتعمل عمداً لما الفلاتر دي تتغير بس
  }, [reportType, dateRange, selectedBranch])

  const loadBranches = async () => {
    try {
      const snapshot = await getLiveSnapshot('branches')
      setBranches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      logger.error('Error loading branches:', error)
    }
  }

  const generateReport = async () => {
    setLoading(true)
    try {
      const startDate = new Date(dateRange.start)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(dateRange.end)
      endDate.setHours(23, 59, 59, 999)

      const startTimestamp = Timestamp.fromDate(startDate)
      const endTimestamp = Timestamp.fromDate(endDate)

      let invoicesQuery = query(
        collection(db, 'invoices'),
        where('timestamp', '>=', startTimestamp),
        where('timestamp', '<=', endTimestamp),
        orderBy('timestamp', 'desc')
      )

      const invoicesSnapshot = await getDocs(invoicesQuery)
      // استبعاد الفواتير الملغاة/المسترجعة من كل التقارير (زي التقارير العادية والداشبورد)
      const invoices = invoicesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(inv => inv.status !== 'voided' && inv.status !== 'refunded')

      switch (reportType) {
        case 'sales':
          await generateSalesReport(invoices)
          break
        case 'profit':
          await generateProfitReport(invoices)
          break
        case 'products':
          await generateProductsReport(invoices)
          break
        case 'customers':
          await generateCustomersReport()
          break
        case 'inventory':
          await generateInventoryReport()
          break
        case 'employees':
          await generateEmployeesReport()
          break
        default:
          await generateSalesReport(invoices)
      }
    } catch (error) {
      logger.error('Error generating report:', error)
      toast.error('فشل إنشاء التقرير')
    } finally {
      setLoading(false)
    }
  }


  const generateSalesReport = async (invoices) => {
    // تحليل المبيعات حسب اليوم
    const dailySales = {}
    const paymentMethods = { cash: 0, card: 0, vodafone_cash: 0, bank_transfer: 0 }
    let totalSales = 0
    let totalTax = 0
    let totalDiscount = 0

    invoices.forEach(invoice => {
      const date = invoice.timestamp?.toDate().toLocaleDateString('ar-EG')
      if (date) {
        dailySales[date] = (dailySales[date] || 0) + (invoice.total || 0)
      }
      totalSales += invoice.total || 0
      totalTax += invoice.tax || 0
      totalDiscount += invoice.discount?.amount || 0
      if (invoice.paymentMethod) {
        paymentMethods[invoice.paymentMethod] = (paymentMethods[invoice.paymentMethod] || 0) + (invoice.total || 0)
      }
    })

    const chartData = {
      labels: Object.keys(dailySales),
      datasets: [{
        label: 'المبيعات',
        data: Object.values(dailySales),
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    }

    const pieData = {
      labels: ['كاش', 'بطاقة', 'فودافون كاش', 'تحويل بنكي'],
      datasets: [{
        data: [paymentMethods.cash, paymentMethods.card, paymentMethods.vodafone_cash, paymentMethods.bank_transfer],
        backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6']
      }]
    }

    setReportData({
      type: 'sales',
      title: 'تقرير المبيعات',
      totalSales,
      totalTax,
      totalDiscount,
      netSales: totalSales - totalTax,
      invoicesCount: invoices.length,
      averageOrder: invoices.length > 0 ? totalSales / invoices.length : 0,
      chartData,
      pieData,
      dailyData: Object.entries(dailySales).map(([date, amount]) => ({ date, amount })),
      paymentMethods
    })
  }

  const generateProfitReport = async (invoices) => {
    let totalRevenue = 0
    let totalCost = 0

    for (const invoice of invoices) {
      totalRevenue += invoice.total || 0
      if (invoice.items) {
        for (const item of invoice.items) {
          // تقدير التكلفة بنسبة 60% من السعر (مثال)
          totalCost += (item.price * 0.6) * item.quantity
        }
      }
    }

    const grossProfit = totalRevenue - totalCost
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

    // بيانات الأرباح الشهرية
    const monthlyProfit = {}
    invoices.forEach(invoice => {
      const month = invoice.timestamp?.toDate().toLocaleString('ar-EG', { month: 'long' })
      if (month) {
        monthlyProfit[month] = (monthlyProfit[month] || 0) + (invoice.total || 0)
      }
    })

    const chartData = {
      labels: Object.keys(monthlyProfit),
      datasets: [
        { label: 'الإيرادات', data: Object.values(monthlyProfit), backgroundColor: 'rgba(54, 162, 235, 0.5)' },
        { label: 'الأرباح', data: Object.values(monthlyProfit).map(v => v * 0.4), backgroundColor: 'rgba(75, 192, 192, 0.5)' }
      ]
    }

    setReportData({
      type: 'profit',
      title: 'تقرير الأرباح',
      totalRevenue,
      totalCost,
      grossProfit,
      profitMargin: profitMargin.toFixed(2),
      chartData,
      monthlyData: Object.entries(monthlyProfit).map(([month, amount]) => ({ month, amount }))
    })
  }

  const generateProductsReport = async (invoices) => {
    const productSales = {}

    invoices.forEach(invoice => {
      if (invoice.items) {
        invoice.items.forEach(item => {
          if (!productSales[item.name]) {
            productSales[item.name] = { name: item.name, quantity: 0, revenue: 0, orders: 0 }
          }
          productSales[item.name].quantity += item.quantity
          productSales[item.name].revenue += item.total
          productSales[item.name].orders += 1
        })
      }
    })

    const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    const lowProducts = Object.values(productSales).sort((a, b) => a.revenue - b.revenue).slice(0, 5)

    const chartData = {
      labels: topProducts.map(p => p.name),
      datasets: [
        { label: 'الكمية المباعة', data: topProducts.map(p => p.quantity), backgroundColor: 'rgba(54, 162, 235, 0.5)' },
        { label: 'الإيرادات', data: topProducts.map(p => p.revenue), backgroundColor: 'rgba(255, 99, 132, 0.5)' }
      ]
    }

    setReportData({
      type: 'products',
      title: 'تقرير المنتجات',
      totalProducts: Object.keys(productSales).length,
      totalItemsSold: Object.values(productSales).reduce((sum, p) => sum + p.quantity, 0),
      totalRevenue: Object.values(productSales).reduce((sum, p) => sum + p.revenue, 0),
      topProducts,
      lowProducts,
      chartData
    })
  }

  const generateCustomersReport = async () => {
    const customersSnapshot = await getLiveSnapshot('customers')
    const customers = customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    const topCustomers = [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 10)
    const totalPoints = customers.reduce((sum, c) => sum + (c.points || 0), 0)
    const totalSpent = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0)

    const chartData = {
      labels: topCustomers.map(c => c.name),
      datasets: [{
        label: 'إجمالي المشتريات',
        data: topCustomers.map(c => c.totalSpent || 0),
        backgroundColor: 'rgba(75, 192, 192, 0.5)'
      }]
    }

    setReportData({
      type: 'customers',
      title: 'تقرير العملاء',
      totalCustomers: customers.length,
      totalPoints,
      totalSpent,
      averageSpent: customers.length > 0 ? totalSpent / customers.length : 0,
      topCustomers,
      chartData
    })
  }

  const generateInventoryReport = async () => {
    const productsSnapshot = await getLiveSnapshot('products')
    const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    const lowStock = products.filter(p => p.quantity <= (p.lowStockThreshold || 10))
    const outOfStock = products.filter(p => (Number(p.quantity) || 0) <= 0)
    const totalValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0)

    const chartData = {
      labels: products.slice(0, 10).map(p => p.name),
      datasets: [{
        label: 'الكمية',
        data: products.slice(0, 10).map(p => p.quantity || 0),
        backgroundColor: 'rgba(255, 159, 64, 0.5)'
      }]
    }

    setReportData({
      type: 'inventory',
      title: 'تقرير المخزون',
      totalProducts: products.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      totalValue,
      lowStockProducts: lowStock,
      outOfStockProducts: outOfStock,
      chartData
    })
  }

  const generateEmployeesReport = async () => {
    const employeesSnapshot = await getLiveSnapshot('employees')
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    const totalSalaries = employees.reduce((sum, e) => sum + (e.salary || 0), 0)
    const activeEmployees = employees.filter(e => e.isActive !== false).length

    const attendanceSnapshot = await getDocs(collection(db, 'attendance'))
    const attendance = attendanceSnapshot.docs.map(doc => doc.data())
    const today = new Date().toISOString().split('T')[0]
    const todayAttendance = attendance.filter(a => a.date === today)

    setReportData({
      type: 'employees',
      title: 'تقرير الموظفين',
      totalEmployees: employees.length,
      activeEmployees,
      totalSalaries,
      todayPresent: todayAttendance.filter(a => a.status === 'present').length,
      todayLate: todayAttendance.filter(a => a.status === 'late').length,
      todayAbsent: todayAttendance.filter(a => a.status === 'absent').length,
      employees
    })
  }

  const exportToExcel = () => {
    if (!reportData) return

    let worksheetData = []
    switch (reportData.type) {
      case 'sales':
        worksheetData = reportData.dailyData.map(d => ({ التاريخ: d.date, المبيعات: d.amount }))
        break
      case 'profit':
        worksheetData = reportData.monthlyData.map(d => ({ الشهر: d.month, الإيرادات: d.amount }))
        break
      case 'products':
        worksheetData = reportData.topProducts.map(p => ({ المنتج: p.name, الكمية: p.quantity, الإيرادات: p.revenue }))
        break
      case 'customers':
        worksheetData = reportData.topCustomers.map(c => ({ العميل: c.name, المشتريات: c.totalSpent, النقاط: c.points }))
        break
      case 'inventory':
        worksheetData = reportData.lowStockProducts.map(p => ({ المنتج: p.name, الكمية: p.quantity, السعر: p.price }))
        break
      case 'employees':
        worksheetData = reportData.employees.map(e => ({ الاسم: e.name, الوظيفة: e.position, الراتب: e.salary }))
        break
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

  if (!hasPermission('reports_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl" id="report-content">
      <div className="flex justify-between items-center mb-6 no-print">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">📊 التقارير المتقدمة</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">تحليلات متقدمة وإحصائيات دقيقة</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportToExcel} disabled={!reportData} className="bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
            <DocumentArrowDownIcon className="w-5 h-5" /> تصدير Excel
          </button>
          <button onClick={printReport} className="bg-gray-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <PrinterIcon className="w-5 h-5" /> طباعة
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 no-print">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-white">نوع التقرير</label>
            <select className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="sales">📈 المبيعات</option>
              <option value="profit">💰 الأرباح</option>
              <option value="products">📦 المنتجات</option>
              <option value="customers">👥 العملاء</option>
              <option value="inventory">📊 المخزون</option>
              <option value="employees">👨‍💼 الموظفين</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-white">من تاريخ</label>
            <input type="date" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-white">إلى تاريخ</label>
            <input type="date" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} />
          </div>
          {branches.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-white">الفرع</label>
              <select className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                <option value="all">جميع الفروع</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Report Content */}
      {!loading && reportData && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {reportData.type === 'sales' && (
              <>
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">إجمالي المبيعات</p>
                  <p className="text-2xl font-bold">{reportData.totalSales.toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                </div>
                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">عدد الفواتير</p>
                  <p className="text-2xl font-bold">{reportData.invoicesCount}</p>
                </div>
                <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">متوسط الفاتورة</p>
                  <p className="text-2xl font-bold">{reportData.averageOrder.toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                </div>
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">صافي المبيعات</p>
                  <p className="text-2xl font-bold">{reportData.netSales.toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                </div>
              </>
            )}

            {reportData.type === 'profit' && (
              <>
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">إجمالي الإيرادات</p>
                  <p className="text-2xl font-bold">{reportData.totalRevenue.toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                </div>
                <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">إجمالي التكاليف</p>
                  <p className="text-2xl font-bold">{reportData.totalCost.toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                </div>
                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">صافي الربح</p>
                  <p className="text-2xl font-bold">{reportData.grossProfit.toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                </div>
                <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">هامش الربح</p>
                  <p className="text-2xl font-bold">{reportData.profitMargin}%</p>
                </div>
              </>
            )}

            {reportData.type === 'products' && (
              <>
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">المنتجات المباعة</p>
                  <p className="text-2xl font-bold">{reportData.totalProducts}</p>
                </div>
                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">الوحدات المباعة</p>
                  <p className="text-2xl font-bold">{reportData.totalItemsSold}</p>
                </div>
                <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">إجمالي الإيرادات</p>
                  <p className="text-2xl font-bold">{reportData.totalRevenue.toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                </div>
              </>
            )}

            {reportData.type === 'customers' && (
              <>
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">إجمالي العملاء</p>
                  <p className="text-2xl font-bold">{reportData.totalCustomers}</p>
                </div>
                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">إجمالي النقاط</p>
                  <p className="text-2xl font-bold">{reportData.totalPoints}</p>
                </div>
                <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">إجمالي المشتريات</p>
                  <p className="text-2xl font-bold">{reportData.totalSpent.toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                </div>
              </>
            )}

            {reportData.type === 'inventory' && (
              <>
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">إجمالي المنتجات</p>
                  <p className="text-2xl font-bold">{reportData.totalProducts}</p>
                </div>
                <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">منتجات منخفضة</p>
                  <p className="text-2xl font-bold">{reportData.lowStockCount}</p>
                </div>
                <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">منتجات نفدت</p>
                  <p className="text-2xl font-bold">{reportData.outOfStockCount}</p>
                </div>
                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90">قيمة المخزون</p>
                  <p className="text-2xl font-bold">{reportData.totalValue.toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                </div>
              </>
            )}
          </div>

          {/* Charts */}
          {reportData.chartData && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold mb-4 dark:text-white">الرسم البياني</h3>
              <div className="h-80">
                {reportData.type === 'sales' && <Bar data={reportData.chartData} options={{ responsive: true, maintainAspectRatio: false }} />}
                {reportData.type === 'profit' && <Bar data={reportData.chartData} options={{ responsive: true, maintainAspectRatio: false }} />}
                {reportData.type === 'products' && <Bar data={reportData.chartData} options={{ responsive: true, maintainAspectRatio: false }} />}
                {reportData.type === 'customers' && <Bar data={reportData.chartData} options={{ responsive: true, maintainAspectRatio: false }} />}
                {reportData.type === 'inventory' && <Bar data={reportData.chartData} options={{ responsive: true, maintainAspectRatio: false }} />}
              </div>
            </div>
          )}

          {reportData.pieData && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold mb-4 dark:text-white">طرق الدفع</h3>
              <div className="h-64 max-w-md mx-auto">
                <Pie data={reportData.pieData} options={{ responsive: true, maintainAspectRatio: false }} />
              </div>
            </div>
          )}

          {/* Data Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 border-b dark:border-gray-700">
              <h3 className="text-lg font-bold dark:text-white">تفاصيل البيانات</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {reportData.type === 'sales' && <><th className="px-6 py-3 text-right">التاريخ</th><th className="px-6 py-3 text-right">المبيعات</th></>}
                    {reportData.type === 'profit' && <><th className="px-6 py-3 text-right">الشهر</th><th className="px-6 py-3 text-right">الإيرادات</th></>}
                    {reportData.type === 'products' && <><th className="px-6 py-3 text-right">المنتج</th><th className="px-6 py-3 text-right">الكمية</th><th className="px-6 py-3 text-right">الإيرادات</th></>}
                    {reportData.type === 'customers' && <><th className="px-6 py-3 text-right">العميل</th><th className="px-6 py-3 text-right">المشتريات</th><th className="px-6 py-3 text-right">النقاط</th></>}
                    {reportData.type === 'inventory' && <><th className="px-6 py-3 text-right">المنتج</th><th className="px-6 py-3 text-right">الكمية</th><th className="px-6 py-3 text-right">السعر</th></>}
                  </tr>
                </thead>
                <tbody>
                  {reportData.type === 'sales' && reportData.dailyData?.map((item, idx) => (
                    <tr key={idx} className="border-t"><td className="px-6 py-4">{item.date}</td><td className="px-6 py-4">{item.amount.toFixed(2)} {systemSettings?.currency || 'ج.م'}</td></tr>
                  ))}
                  {reportData.type === 'profit' && reportData.monthlyData?.map((item, idx) => (
                    <tr key={idx} className="border-t"><td className="px-6 py-4">{item.month}</td><td className="px-6 py-4">{item.amount.toFixed(2)} {systemSettings?.currency || 'ج.م'}</td></tr>
                  ))}
                  {reportData.type === 'products' && reportData.topProducts?.map((item, idx) => (
                    <tr key={idx} className="border-t"><td className="px-6 py-4">{item.name}</td><td className="px-6 py-4">{item.quantity}</td><td className="px-6 py-4">{item.revenue.toFixed(2)} {systemSettings?.currency || 'ج.م'}</td></tr>
                  ))}
                  {reportData.type === 'customers' && reportData.topCustomers?.map((item, idx) => (
                    <tr key={idx} className="border-t"><td className="px-6 py-4">{item.name}</td><td className="px-6 py-4">{item.totalSpent?.toFixed(2)} {systemSettings?.currency || 'ج.م'}</td><td className="px-6 py-4">{item.points || 0}</td></tr>
                  ))}
                  {reportData.type === 'inventory' &&
  reportData.lowStockProducts?.map((item, idx) => (
    <tr key={idx} className="border-t">
      <td className="px-6 py-4">{item.name}</td>

      <td
        className={`px-6 py-4 font-bold ${
          (Number(item.quantity) || 0) <= 0
            ? 'text-red-600'
            : 'text-yellow-600'
        }`}
      >
        {item.quantity}
      </td>

      <td className="px-6 py-4">
        {item.price} {systemSettings?.currency || 'ج.م'}
      </td>
    </tr>
  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdvancedReports