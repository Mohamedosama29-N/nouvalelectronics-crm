// src/pages/Dashboard/Dashboard.jsx
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { 
  CurrencyDollarIcon, 
  UserGroupIcon, 
  DocumentTextIcon, 
  BanknotesIcon,
  ExclamationTriangleIcon,
  BellIcon,
  FireIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XCircleIcon,
  ArrowTrendingDownIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline'
import { db } from '../../services/firebase'
import { collection, getDocs, Timestamp, query, where } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { useLateKitchenOrders } from '../../hooks/useLateKitchenOrders'
import { getInvoiceDisplayRef } from '../../services/invoiceNumberService'
import { getLiveSnapshot, subscribeLive } from '../../services/liveCollections'

const Dashboard = () => {
  const { userData } = useAuth()
  const [stats, setStats] = useState({
    todaySales: 0,
    monthSales: 0,
    netProfit: 0,
    customersCount: 0,
    totalCustomers: 0,
    invoicesCount: 0,
    cashBalance: 0
  })
  const [lowStockProducts, setLowStockProducts] = useState([])
  const [criticalStockProducts, setCriticalStockProducts] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAlerts, setShowAlerts] = useState(true)
  const lateOrders = useLateKitchenOrders()
  const alertedLateOrderIds = useRef(new Set())
  const [showAllLateOrders, setShowAllLateOrders] = useState(false)
  const [stockTab, setStockTab] = useState('critical') // 'critical' | 'low'
  const [showAllTopProducts, setShowAllTopProducts] = useState(false)
  // إخفاء/إظهار الأرقام الحساسة في الداشبورد (زي العين في تطبيقات البنوك) -
  // بيفضل محفوظ للمستخدم حتى بعد ما يقفل المتصفح.
  const [showAmounts, setShowAmounts] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard_show_amounts')
      return saved === null ? true : saved === 'true'
    } catch {
      return true
    }
  })

  const toggleShowAmounts = () => {
    setShowAmounts(prev => {
      const next = !prev
      try { localStorage.setItem('dashboard_show_amounts', String(next)) } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    loadDashboardData()
    
    const unsubscribe = subscribeLive('products', (snapshot) => {
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      checkLowStockProducts(products)
    })

    return () => unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- الجلب الأولي والاشتراك في الـ snapshot بيتعملوا مرة عند التحميل بس
  }, [])

  // تنبيه فوري (toast) أول ما أوردر يعدي 5 دقايق - مرة واحدة لكل أوردر فقط
  useEffect(() => {
    if (!showAlerts) return
    const fresh = lateOrders.filter(order => !alertedLateOrderIds.current.has(order.id))
    fresh.forEach(order => alertedLateOrderIds.current.add(order.id))
    if (fresh.length === 0) return
    // أكتر من أوردرين متأخرين في نفس اللحظة (زي أول ما الداشبورد يفتح) = إشعار واحد ملخص
    if (fresh.length > 2) {
      toast.error(`⏰ ${fresh.length} أوردرات متأخرة في المطبخ - التفاصيل في لوحة الأوردرات المتأخرة`, { id: 'late-summary', duration: 6000, icon: '🔥' })
      return
    }
    fresh.forEach(order => {
      toast.error(`⏰ أوردر متأخر في المطبخ #${getInvoiceDisplayRef(order)}`, { id: `late-${order.id}`, duration: 6000, icon: '🔥' })
    })
  }, [lateOrders, showAlerts])



  const getBusinessDate = () => {
  const now = new Date()
  const hour = now.getHours()
  if (hour < 3) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday
  }
  return now
  }

  
  // آخر مستوى تنبيه اتبعت لكل منتج - عشان التنبيه يظهر مرة واحدة بس لما
  // المنتج يدخل مستوى أسوأ، مش مع كل بيعة (كل بيعة بتحدّث المنتجات وكانت
  // بتعيد كل التنبيهات من الأول).
  const stockAlertLevels = useRef(new Map())
  const stockAlertsBaselined = useRef(false)

  const checkLowStockProducts = (products) => {
    // منتجات بدون تتبع مخزون (زي الأصناف اللي بتتحضر أول بأول) مالهاش داعي
    // تظهر في تنبيهات النقص خالص - أصلاً مش بتتراقب بكمية.
    const trackedProducts = products.filter(p => p.trackStock !== false)
    const limitOf = (p) => { const t = Number(p.lowStockThreshold); return Number.isFinite(t) && t > 0 ? t : 10 }
    const qtyOf = (p) => Number(p.quantity) || 0
    const lowStock = trackedProducts.filter(p => qtyOf(p) <= limitOf(p) && qtyOf(p) > limitOf(p) / 2)
    const criticalStock = trackedProducts.filter(p => qtyOf(p) <= limitOf(p) / 2 && qtyOf(p) > 0)
    const outOfStock = trackedProducts.filter(p => qtyOf(p) <= 0)

    setLowStockProducts(lowStock)
    setCriticalStockProducts([...criticalStock, ...outOfStock])

    const levels = stockAlertLevels.current
    const levelOf = (p) => (qtyOf(p) <= 0 ? 3 : qtyOf(p) <= limitOf(p) / 2 ? 2 : qtyOf(p) <= limitOf(p) ? 1 : 0)

    // أول قراءة = خط الأساس: من غير تنبيه لكل منتج (ده اللي كان بيغرّق الشاشة
    // بعشرات الإشعارات). بدلها إشعار ملخص واحد بس مرة واحدة في الجلسة.
    if (!stockAlertsBaselined.current) {
      stockAlertsBaselined.current = true
      trackedProducts.forEach(p => levels.set(p.id, levelOf(p)))
      let alreadyShown = false
      try { alreadyShown = sessionStorage.getItem('stockSummaryShown') === '1' } catch { /* ignore */ }
      if (showAlerts && !alreadyShown && (outOfStock.length + criticalStock.length) > 0) {
        try { sessionStorage.setItem('stockSummaryShown', '1') } catch { /* ignore */ }
        const parts = []
        if (outOfStock.length) parts.push(`${outOfStock.length} نافد`)
        if (criticalStock.length) parts.push(`${criticalStock.length} قرب يخلص`)
        toast(`📦 المخزون: ${parts.join(' و ')} - التفاصيل في لوحة النواقص تحت`, { id: 'stock-summary', duration: 6000 })
      }
      return
    }

    // بعد كده: تنبيه منفصل بس لما منتج ينزل لمستوى أسوأ أثناء الشغل (مثلاً بعد بيعة)
    trackedProducts.forEach(product => {
      const level = levelOf(product)
      const prev = levels.has(product.id) ? levels.get(product.id) : 0
      levels.set(product.id, level)
      if (!showAlerts || level <= prev) return
      const id = `stock-${product.id}`
      if (level === 3) toast.error(`❌ نفد المنتج: ${product.name}`, { id })
      else if (level === 2) toast(`⚠️ ${product.name} - المتبقي ${qtyOf(product)} فقط!`, { id, icon: '⚠️', duration: 5000 })
      else toast(`📦 ${product.name} - قارب على النفاد (${qtyOf(product)} متبقي)`, { id, icon: '📦', duration: 4000 })
    })
  }


  const loadDashboardData = async () => {
    try {
      const businessDate = getBusinessDate()
      businessDate.setHours(0, 0, 0, 0)
      const todayTimestamp = Timestamp.fromDate(businessDate)
      
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)
      const monthTimestamp = Timestamp.fromDate(startOfMonth)

      // جلب فواتير الشهر الحالي بس (مش كل الفواتير من أول يوم - دي كانت
      // أكبر حاجة بتستهلك حصة Firebase اليومية مع كل فتحة للداشبورد)
      const invoicesSnapshot = await getDocs(query(collection(db, 'invoices'), where('timestamp', '>=', monthTimestamp)))
      let todayTotal = 0
      let monthTotal = 0
      let uniqueCustomersToday = new Set() // عدد العملاء الفريدين لليوم
      
      invoicesSnapshot.forEach(doc => {
        const invoice = doc.data()
        if (invoice.status === 'voided') return // استبعاد الفواتير الملغاة من الإحصائيات
        if (invoice.timestamp >= todayTimestamp) {
          todayTotal += invoice.total || 0
          // إضافة العميل للمجموعة إذا كان موجود
          if (invoice.customerId) {
            uniqueCustomersToday.add(invoice.customerId)
          } else if (invoice.customerName && invoice.customerName !== 'عميل نقدي') {
            uniqueCustomersToday.add(invoice.customerName)
          }
        }
        if (invoice.timestamp >= monthTimestamp) {
          monthTotal += invoice.total || 0
        }
      })

      // عدد العملاء اليوم = حجم الـ Set
      const todayCustomersCount = uniqueCustomersToday.size

      // جلب إجمالي العملاء (كل العملاء المسجلين)
      // عدد العملاء من غير ما نقرا بياناتهم كلها (قراءة واحدة لكل 1000 عميل)
      // عدد العملاء من الذاكرة المشتركة (صفر قراءات إضافية بعد أول مرة)
      let totalCustomers = 0
      try {
        totalCustomers = (await getLiveSnapshot('customers')).size
      } catch (countError) {
        logger.error('Error counting customers:', countError)
      }
      
      // المنتجات والنواقص بتيجي من الـ listener المباشر (onSnapshot) - مفيش داعي نقراها تاني هنا
      
      // إجمالي مصروفات الشهر (لحساب صافي الربح التقريبي)
      let monthExpenses = 0
      try {
        const monthKey = `${businessDate.getFullYear()}-${String(businessDate.getMonth() + 1).padStart(2, '0')}`
        // مصروفات الشهر بس (التاريخ متسجل كنص yyyy-mm-dd فالمقارنة بالنص شغالة)
        const expensesSnapshot = await getDocs(query(collection(db, 'expenses'), where('date', '>=', `${monthKey}-01`), where('date', '<=', `${monthKey}-31`)))
        expensesSnapshot.forEach(doc => {
          const exp = doc.data()
          if (typeof exp.date === 'string' && exp.date.startsWith(monthKey)) {
            monthExpenses += exp.amount || 0
          }
        })
      } catch (expError) {
        // لو مفيش صلاحية أو المجموعة لسه فاضية - متأثرش على باقي الداشبورد
        logger.error('Error loading expenses for dashboard:', expError)
      }
      
      // أفضل المنتجات مبيعاً (من الفواتير)
      const productSales = {}
      invoicesSnapshot.forEach(doc => {
        const invoice = doc.data()
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
      
      // مش هنقتصر على 5 منتجات بس - هنجيب أعلى 50 منتج ترتيباً بالكمية
      // المباعة، والواجهة هتعرض جزء منهم بشكل احترافي مع خيار "عرض الكل"
      const topSelling = Object.values(productSales)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 50)
      
      setTopProducts(topSelling)
      
      setStats({
        todaySales: todayTotal,
        monthSales: monthTotal,
        netProfit: monthTotal - monthExpenses,
        monthExpenses,
        customersCount: todayCustomersCount,
        totalCustomers: totalCustomers,
        invoicesCount: invoicesSnapshot.size,
        cashBalance: 0
      })
      
    } catch (error) {
      logger.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }


  const StatCard = ({ title, value, suffix = '', icon, gradient }) => (
    <div className={`relative overflow-hidden rounded-2xl shadow-lg p-5 text-white bg-gradient-to-br ${gradient} hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200`}>
      <div className="absolute -left-4 -bottom-4 opacity-10 text-7xl">{icon}</div>
      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-white/80 text-xs font-medium mb-1">{title}</p>
          <p className={`text-2xl font-extrabold tracking-tight ${!showAmounts ? 'select-none' : ''}`}>
            {showAmounts
              ? <>{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</>
              : '••••••'}
          </p>
        </div>
        <div className="bg-white/20 backdrop-blur p-3 rounded-xl">
          {icon}
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  const currency = 'ج.م'
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'صباح الخير'
    if (h < 17) return 'مساء الخير'
    return 'مساء الخير'
  })()

  const quickLinks = [
    { to: '/pos', label: 'نقطة البيع', icon: '🛒', color: 'bg-blue-500' },
    { to: '/kitchen', label: 'شاشة المطبخ', icon: '🍳', color: 'bg-orange-500' },
    { to: '/expenses', label: 'المصروفات', icon: '💸', color: 'bg-red-500' },
    { to: '/reports', label: 'التقارير', icon: '📊', color: 'bg-purple-500' }
  ]

  return (
    <div className="p-6 rtl bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-800 dark:text-white">لوحة التحكم</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {greeting}{userData?.name ? `، ${userData.name}` : ''} - {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleShowAmounts}
            title={showAmounts ? 'إخفاء الأرقام' : 'إظهار الأرقام'}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm shadow-sm transition-colors ${
              showAmounts ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
            }`}
          >
            {showAmounts ? <EyeIcon className="w-5 h-5" /> : <EyeSlashIcon className="w-5 h-5" />}
            <span className="hidden sm:inline">{showAmounts ? 'إخفاء الأرقام' : 'إظهار الأرقام'}</span>
          </button>
          <button 
            onClick={() => setShowAlerts(!showAlerts)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm shadow-sm transition-colors ${
              showAlerts ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
            }`}
          >
            <BellIcon className="w-5 h-5" />
            <span className="hidden sm:inline">{showAlerts ? 'التنبيهات مفعّلة' : 'التنبيهات متوقفة'}</span>
          </button>
        </div>
      </div>

      {/* روابط سريعة */}
      <div className="flex flex-wrap gap-3 mb-6 mt-4">
        {quickLinks.map(link => (
          <Link
            key={link.to}
            to={link.to}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${link.color}`}
          >
            <span className="text-lg">{link.icon}</span> {link.label}
          </Link>
        ))}
      </div>

      {/* تنبيه الأوردرات المتأخرة في المطبخ (أكثر من 5 دقايق من غير تسليم) */}
      {lateOrders.length > 0 && (
        <div className="mb-6 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 border-r-4 border-r-red-500 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-500 rounded-full p-2.5 shrink-0">
                <FireIcon className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <p className="font-bold text-red-700 dark:text-red-300">
                  {lateOrders.length} أوردر متأخر في المطبخ
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">أكثر من 5 دقايق من غير تسليم</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/kitchen"
                className="text-sm font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors"
              >
                افتح شاشة المطبخ
              </Link>
              {lateOrders.length > 3 && (
                <button
                  onClick={() => setShowAllLateOrders(!showAllLateOrders)}
                  className="p-1.5 rounded-lg bg-white dark:bg-gray-800 text-red-600 border border-red-200 dark:border-red-800"
                  title={showAllLateOrders ? 'عرض أقل' : 'عرض الكل'}
                >
                  {showAllLateOrders ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(showAllLateOrders ? lateOrders : lateOrders.slice(0, 3)).map(order => {
              const minutesLate = Math.floor(order.elapsedMs / 60000)
              const veryLate = minutesLate >= 15
              return (
                <div
                  key={order.id}
                  className={`flex items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-gray-800 border ${veryLate ? 'border-red-400' : 'border-red-100 dark:border-red-900/50'}`}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-gray-800 dark:text-gray-100 truncate">
                      #{getInvoiceDisplayRef(order)}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {order.orderType === 'takeaway' ? 'تيك أواي' : order.orderType === 'delivery' ? 'ديليفري' : 'صالة'}
                      {order.tableNumber ? ` - طاولة ${order.tableNumber}` : ''}
                      {order.status === 'preparing' ? ' - جاري التحضير' : order.status === 'ready' ? ' - جاهز' : ' - في الانتظار'}
                    </p>
                  </div>
                  <span className={`shrink-0 flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${veryLate ? 'bg-red-500 text-white animate-pulse' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                    <ClockIcon className="w-3.5 h-3.5" /> {minutesLate} د
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard title="مبيعات اليوم" value={stats.todaySales.toFixed(0)} suffix={` ${currency}`} icon={<CurrencyDollarIcon className="w-6 h-6" />} gradient="from-blue-500 to-blue-600" />
        <StatCard title="مبيعات الشهر" value={stats.monthSales.toFixed(0)} suffix={` ${currency}`} icon={<CurrencyDollarIcon className="w-6 h-6" />} gradient="from-green-500 to-green-600" />
        <StatCard title="صافي ربح الشهر (تقريبي)" value={stats.netProfit.toFixed(0)} suffix={` ${currency}`} icon={<BanknotesIcon className="w-6 h-6" />} gradient={stats.netProfit >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-rose-500 to-rose-600'} />
        <StatCard title="عملاء اليوم" value={stats.customersCount} icon={<UserGroupIcon className="w-6 h-6" />} gradient="from-purple-500 to-purple-600" />
        <StatCard title="إجمالي العملاء" value={stats.totalCustomers} icon={<UserGroupIcon className="w-6 h-6" />} gradient="from-indigo-500 to-indigo-600" />
        <StatCard title="عدد الفواتير" value={stats.invoicesCount} icon={<DocumentTextIcon className="w-6 h-6" />} gradient="from-orange-500 to-orange-600" />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* المنتجات الناقصة */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" /> المنتجات الناقصة
            </h2>
            <Link to="/products" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
              إدارة المنتجات ←
            </Link>
          </div>

          {(criticalStockProducts.length > 0 || lowStockProducts.length > 0) ? (
            <>
              {/* شرائح ملخص قابلة للضغط للتنقل بين "حرجة" و"شبه ناقصة" */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setStockTab('critical')}
                  className={`flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                    stockTab === 'critical'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5"><XCircleIcon className="w-4 h-4" /> حرجة / نفدت</span>
                  <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${stockTab === 'critical' ? 'bg-white/25' : 'bg-red-200 dark:bg-red-900/50'}`}>{criticalStockProducts.length}</span>
                </button>
                <button
                  onClick={() => setStockTab('low')}
                  className={`flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                    stockTab === 'low'
                      ? 'bg-yellow-400 text-yellow-900 shadow-sm'
                      : 'bg-yellow-50 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-400'
                  }`}
                >
                  <span className="flex items-center gap-1.5"><ArrowTrendingDownIcon className="w-4 h-4" /> قاربت على النفاد</span>
                  <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${stockTab === 'low' ? 'bg-black/10' : 'bg-yellow-200 dark:bg-yellow-900/50'}`}>{lowStockProducts.length}</span>
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {stockTab === 'critical' && criticalStockProducts.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-6">مفيش منتجات حرجة دلوقتي 👍</p>
                )}
                {stockTab === 'critical' && criticalStockProducts.map((product, i) => {
                  const threshold = product.lowStockThreshold || 10
                  const pct = Math.min(100, Math.round((product.quantity / threshold) * 100))
                  const isOut = (Number(product.quantity) || 0) <= 0
                  return (
                    <div key={i} className={`p-3 rounded-xl ${isOut ? 'bg-red-50 dark:bg-red-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="min-w-0">
                          <span className="font-medium text-gray-800 dark:text-gray-200 text-sm truncate block">{product.name}</span>
                          {product.sku && <p className="text-xs text-gray-500">SKU: {product.sku}</p>}
                        </div>
                        <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${isOut ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
                          {isOut ? 'نفد تماماً' : `${product.quantity} متبقي`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-white dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isOut ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${isOut ? 100 : pct}%` }} />
                      </div>
                    </div>
                  )
                })}

                {stockTab === 'low' && lowStockProducts.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-6">مفيش أصناف شبه ناقصة دلوقتي 👍</p>
                )}
                {stockTab === 'low' && lowStockProducts.map((product, i) => {
                  const threshold = product.lowStockThreshold || 10
                  const pct = Math.min(100, Math.round((product.quantity / threshold) * 100))
                  return (
                    <div key={i} className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/10">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="min-w-0">
                          <span className="font-medium text-gray-800 dark:text-gray-200 text-sm truncate block">{product.name}</span>
                          {product.sku && <p className="text-xs text-gray-500">SKU: {product.sku}</p>}
                        </div>
                        <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-400 text-yellow-900">{product.quantity} متبقي</span>
                      </div>
                      <div className="h-1.5 w-full bg-white dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-yellow-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-gray-500">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-sm">جميع المنتجات متوفرة بكميات جيدة</p>
            </div>
          )}
        </div>
        
        {/* أفضل المنتجات مبيعاً */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">🏆 أفضل المنتجات مبيعاً <span className="text-xs font-normal text-gray-400">(الشهر ده)</span></h2>
            {topProducts.length > 0 && (
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{topProducts.length} منتج</span>
            )}
          </div>

          {topProducts.length === 0 ? (
            <p className="text-gray-500 text-center py-10 text-sm">لا توجد بيانات كافية</p>
          ) : (
            <>
              <div className={`space-y-1.5 ${showAllTopProducts ? 'max-h-[28rem] overflow-y-auto pr-1' : ''}`}>
                {(showAllTopProducts ? topProducts : topProducts.slice(0, 10)).map((product, i) => {
                  const maxQty = topProducts[0]?.quantity || 1
                  const pct = Math.max(4, Math.round((product.quantity / maxQty) * 100))
                  const rankStyle =
                    i === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white' :
                    i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white' :
                    i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                    'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  const barColor =
                    i === 0 ? 'bg-gradient-to-r from-yellow-400 to-amber-500' :
                    i === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-400' :
                    i === 2 ? 'bg-gradient-to-r from-amber-600 to-amber-700' :
                    'bg-blue-400'
                  return (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                      <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${rankStyle}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline gap-2 mb-1">
                          <span className="font-medium text-gray-800 dark:text-gray-200 text-sm truncate">{product.name}</span>
                          <span className="shrink-0 text-xs font-bold text-gray-700 dark:text-gray-300">{product.quantity} وحدة</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{showAmounts ? `${product.revenue.toFixed(0)} ${currency} إيراد` : '•••• إيراد'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {topProducts.length > 10 && (
                <button
                  onClick={() => setShowAllTopProducts(!showAllTopProducts)}
                  className="w-full mt-3 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  {showAllTopProducts ? 'عرض أقل' : `عرض كل المنتجات (${topProducts.length})`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard