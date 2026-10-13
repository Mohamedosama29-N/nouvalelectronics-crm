import React, { useState, useMemo } from 'react';
import {
  Package,
  Receipt,
  AlertTriangle,
  AlertOctagon,
  Wallet,
  Calendar,
  Activity,
  Award,
  Layers
} from 'lucide-react';
import { AdvancedCharts } from '../common/AdvancedCharts';
import { LiveBadge } from '../common/LiveBadge';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { TICKET_STATUSES, TICKET_TERMINAL_STATUSES } from '../../constants/tickets';
import { useLiveSources } from '../../hooks/useLiveSources';
import { getDashboardWidgetConfig } from '../../utils/dashboardHelpers';
import { formatDate } from '../../utils/format';
import {
  buildInventoryStats, buildReturnsStats, buildSalesSeries, buildSalesStats, buildTicketStats,
  buildTransferStats, canSeeWarehouse, startOfDay, addDays, topProductsFrom
} from '../../utils/liveStats';
import { getTicketSLAInfo } from '../../utils/ticketHelpers';

const DAY = 24 * 60 * 60 * 1000;
const SOURCE_LABELS = { inventory: 'المخزون', transactions: 'المبيعات', activity: 'النشاطات', tickets: 'التذاكر', transfers: 'التحويلات', returns: 'المرتجعات' };

export function DashboardView({ appUser, warehouses, onNavigateToInventory, systemSettings }) {
  const [dateRange, setDateRange] = useState('week');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [chartType, setChartType] = useState('sales');

  const isScoped = !(appUser?.role === 'admin' || appUser?.permissions?.viewAllWarehouses);
  const scopeWarehouse = appUser?.assignedWarehouseId || 'main';
  const warehouseName = (id) => warehouses.find(w => w.id === id)?.name || id;

  // 🎛️ تخصيص الداشبورد: ترتيب وإظهار/إخفاء العناصر حسب إعدادات المستخدم
  const widgetConfig = useMemo(() => getDashboardWidgetConfig(appUser), [appUser]);
  const isWidgetVisible = (id) => {
    const w = widgetConfig.find(x => x.id === id);
    if (!w || !w.visible) return false;
    if (w.permission && !(appUser.role === 'admin' || appUser.permissions?.[w.permission])) return false;
    return true;
  };

  // 📡 اشتراكات لحظية: أي بيع/تذكرة/تحويل جديد بيظهر في الأرقام والرسوم فوراً من غير تحديث.
  // النوافذ الزمنية محدودة لتقليل القراءات: سنة للمبيعات، 90 يوم للتحويلات والمرتجعات.
  // sinceMs بيتقرّب لأول اليوم عشان الاشتراك ميتعادش كل ثانية.
  const dayStart = startOfDay(new Date()).getTime();
  const specs = useMemo(() => {
    const s = [
      { key: 'inventory', collection: 'inventory', wheres: isScoped ? [['warehouseId', '==', scopeWarehouse]] : [] },
      { key: 'transactions', collection: 'transactions', timeField: 'timestamp', sinceMs: dayStart - 364 * DAY, max: 20000 },
      { key: 'activity', collection: 'activity_logs', timeField: 'timestamp', sinceMs: dayStart - 30 * DAY, max: 20 }
    ];
    if (appUser?.role === 'admin' || appUser?.permissions?.manageTickets) {
      s.push({ key: 'tickets', collection: 'tickets', timeField: 'createdAt', sinceMs: dayStart - 365 * DAY, max: 10000 });
    }
    if (appUser?.role === 'admin' || appUser?.permissions?.viewTransfers) {
      s.push({ key: 'transfers', collection: 'transfers', timeField: 'createdAt', sinceMs: dayStart - 90 * DAY, max: 1000 });
    }
    if (appUser?.role === 'admin' || appUser?.permissions?.viewReturns) {
      s.push({ key: 'returns', collection: 'returns', timeField: 'createdAt', sinceMs: dayStart - 90 * DAY, max: 1000 });
    }
    return s;
  }, [appUser, isScoped, scopeWarehouse, dayStart]);

  const { data, errors, loading, updatedAt, truncated } = useLiveSources(specs, !!appUser);

  // فلترة المخازن (على العميل عشان نتجنب Composite Indexes)
  const inScope = (wid) => (isScoped ? canSeeWarehouse(appUser, wid) : (selectedWarehouse === 'all' || wid === selectedWarehouse));
  const txs = useMemo(() => (data.transactions || []).filter(t => inScope(t.warehouseId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.transactions, selectedWarehouse, isScoped, appUser]);
  const tickets = useMemo(() => (data.tickets || []).filter(t => inScope(t.warehouseId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.tickets, selectedWarehouse, isScoped, appUser]);
  const transfers = useMemo(() => (data.transfers || []).filter(t => inScope(t.fromWarehouseId) || inScope(t.toWarehouseId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.transfers, selectedWarehouse, isScoped, appUser]);
  const returns = useMemo(() => (data.returns || []).filter(r => inScope(r.fromWarehouse)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.returns, selectedWarehouse, isScoped, appUser]);

  // تغيير المخزن المختار بيفلتر محلياً بدون إعادة الاشتراك (عشان منقرأش المبيعات من الأول)
  const inv = useMemo(() => buildInventoryStats((data.inventory || []).filter(i => inScope(i.warehouseId)), warehouseName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.inventory, warehouses, selectedWarehouse]);
  const sales = useMemo(() => buildSalesStats(txs), [txs]);
  const salesSeries = useMemo(() => buildSalesSeries(txs, dateRange), [txs, dateRange]);
  const monthlySeries = useMemo(() => buildSalesSeries(txs, 'year'), [txs]);
  const topProducts = useMemo(() => topProductsFrom(txs.filter(t => {
    const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
    const days = dateRange === 'day' ? 0 : dateRange === 'week' ? 6 : dateRange === 'month' ? 29 : 364;
    return d >= addDays(startOfDay(new Date()), -days);
  }), 10), [txs, dateRange]);
  const ticketStats = useMemo(() => buildTicketStats(tickets, {
    isOverdue: (t) => getTicketSLAInfo(t, systemSettings?.ticketSLA)?.level === 'overdue',
    statusLabel: (s) => TICKET_STATUSES.find(x => x.value === s)?.label || s,
    terminal: TICKET_TERMINAL_STATUSES
  }), [tickets, systemSettings]);
  const transferStats = useMemo(() => buildTransferStats(transfers, warehouseName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transfers, warehouses]);
  const returnStats = useMemo(() => buildReturnsStats(returns), [returns]);

  const stats = {
    totalItems: inv.totalQty,
    itemsCount: inv.skuCount,
    totalValue: inv.totalValue,
    lowStockCount: inv.lowStock.length,
    salesToday: sales.today,
    salesTrend: sales.trendVsYesterday,
    salesWeek: sales.week,
    salesMonth: sales.month,
    salesYear: sales.year,
    avgInvoice: sales.avgInvoice,
    topProducts,
    categoryDistribution: inv.byCategory,
    warehouseDistribution: inv.byWarehouse
  };
  const recentActivities = data.activity || [];
  const errorList = Object.entries(errors).filter(([, v]) => v);
  const rangeLabel = { day: 'اليوم (بالساعة)', week: 'آخر 7 أيام', month: 'آخر 30 يوم', year: 'آخر 12 شهر' }[dateRange];

  const handleStatClick = (type) => {

    if (type === 'inventory') {
      onNavigateToInventory('inventory');
    }

    if (type === 'lowstock') {
      onNavigateToInventory('lowstock');
    }

    if (type === 'tickets') {
      onNavigateToInventory('tickets');
    }

    if (type === 'sales') {
      onNavigateToInventory('reports');
    }

  };

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton type="card" count={4} />
        <LoadingSkeleton type="table" count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-right">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
         <div className="flex items-center gap-2">
           <h2 className="text-xl font-black text-slate-800 dark:text-white">لوحة المؤشرات</h2>
           <span className="bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 px-3 py-1 rounded-lg text-xs">
             {new Date().toLocaleDateString('ar-EG')}
           </span>
         </div>
         
         <div className="flex flex-wrap gap-2">
           <select
             className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
             value={selectedWarehouse}
             onChange={e => setSelectedWarehouse(e.target.value)}
           >
             <option value="all">كل المخازن</option>
             {warehouses.map(w => (
               <option key={w.id} value={w.id}>{w.name}</option>
             ))}
           </select>
           
           <select
             className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
             value={dateRange}
             onChange={e => setDateRange(e.target.value)}
           >
             <option value="day">اليوم</option>
             <option value="week">الأسبوع</option>
             <option value="month">الشهر</option>
             <option value="year">السنة</option>
           </select>
           
           <LiveBadge updatedAt={updatedAt} loading={loading} />
           
           <div className="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2">
              <Calendar size={14}/> 
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
           </div>
         </div>
      </div>

      {errorList.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 text-rose-700 dark:text-rose-300 text-sm font-bold flex items-start gap-2">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div>
            {errorList.map(([k, v]) => (
              <p key={k}>تعذّر تحميل «{SOURCE_LABELS[k] || k}»: {v}</p>
            ))}
            <p className="text-xs mt-1 font-normal">باقي الأقسام بتشتغل عادي. لو المشكلة في الصلاحيات راجع قواعد الأمان في Firebase.</p>
          </div>
        </div>
      )}
      {Object.entries(truncated || {}).some(([, v]) => v) && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 text-amber-800 dark:text-amber-300 text-xs font-bold">
          عدد السجلات وصل للحد الأقصى للعرض الحي، فالأرقام ممكن تكون ناقصة للفترات الأقدم. استخدم صفحة التقارير للتفاصيل الكاملة.
        </div>
      )}

      {/* 🎛️ من هنا لتحت: كل قسم عبارة عن "widget" مستقل - بيتفلتر ويترتب حسب
          تخصيص الداشبورد الخاص بالمستخدم الحالي (widgetConfig) */}
      {(() => {
        const SM_IDS = ['totalItems', 'itemsCount', 'inventoryValue', 'salesToday', 'lowStock'];
        const XS_IDS = ['salesWeek', 'salesMonth', 'salesYear', 'avgInvoice', 'ticketsToday', 'ticketsWeek', 'ticketsMonth', 'ticketsWaiting', 'ticketsHighPriority', 'ticketsSLA'];
        const FULL_IDS = ['topProducts', 'charts', 'recentActivity'];

        const visibleSm = widgetConfig.filter(w => SM_IDS.includes(w.id) && isWidgetVisible(w.id));
        const visibleXs = widgetConfig.filter(w => XS_IDS.includes(w.id) && isWidgetVisible(w.id));
        const visibleFull = widgetConfig.filter(w => FULL_IDS.includes(w.id) && isWidgetVisible(w.id));

        const smRenderers = {
          totalItems: () => (
            <button
              onClick={() => handleStatClick('inventory')}
              className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all hover:border-teal-300 dark:hover:border-teal-600 relative overflow-hidden group text-right w-full h-full"
            >
              <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-300 rounded-xl group-hover:bg-teal-100 dark:group-hover:bg-teal-800/50 transition-colors w-fit">
                <Package size={22}/>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">إجمالي القطع بالمخزن</p>
                <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.totalItems.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[9px] text-slate-400 dark:text-slate-500">مجموع الكميات (لحظي)</span>
                </div>
              </div>
            </button>
          ),
          itemsCount: () => (
            <button
              onClick={() => handleStatClick('inventory')}
              className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all hover:border-violet-300 dark:hover:border-violet-600 relative overflow-hidden group text-right w-full h-full"
            >
              <div className="p-3 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 rounded-xl group-hover:bg-violet-100 dark:group-hover:bg-violet-800/50 transition-colors w-fit">
                <Layers size={22}/>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">عدد الأصناف بالمخزن</p>
                <p className="text-2xl font-black text-slate-800 dark:text-white">{(stats.itemsCount || 0).toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[9px] text-slate-400 dark:text-slate-500">نوع/منتج مختلف، مش مجموع الكميات</span>
                </div>
              </div>
            </button>
          ),
          inventoryValue: () => (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow h-full">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 rounded-xl w-fit">
                <Wallet size={22}/>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">قيمة المخزون الإجمالية</p>
                <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.totalValue.toLocaleString()} ج</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[9px] text-slate-400 dark:text-slate-500">الكمية × السعر (لحظي)</span>
                </div>
              </div>
            </div>
          ),
          salesToday: () => (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow h-full">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-xl w-fit">
                <Receipt size={22}/>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">مبيعات اليوم</p>
                <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.salesToday.toLocaleString()} ج</p>
                <div className="flex items-center gap-1 mt-2">
                  {stats.salesTrend === null ? (
                    <span className="text-[9px] text-slate-400 dark:text-slate-500">{sales.todayCount} فاتورة · لا مبيعات أمس للمقارنة</span>
                  ) : (
                    <>
                      <span className={`text-[9px] font-bold ${stats.salesTrend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {stats.salesTrend > 0 ? '+' : ''}{stats.salesTrend}%
                      </span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500">عن الأمس · {sales.todayCount} فاتورة</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ),
          lowStock: () => (
            <button
              onClick={() => handleStatClick('lowstock')}
              className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all hover:border-rose-300 dark:hover:border-rose-600 relative overflow-hidden group text-right w-full h-full"
            >
              <div className="p-3 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 rounded-xl group-hover:bg-rose-100 dark:group-hover:bg-rose-800/50 transition-colors w-fit">
                <AlertOctagon size={22}/>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">نواقص تحتاج طلب</p>
                <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.lowStockCount.toLocaleString()}</p>
                {stats.lowStockCount > 0 && (
                  <p className="text-[9px] text-rose-500 dark:text-rose-400 font-bold mt-2">اضغط لعرض التفاصيل</p>
                )}
              </div>
            </button>
          )
        };

        const xsCard = (grad, border, textCls, label, value) => (
          <div className={`bg-gradient-to-br ${grad} p-4 rounded-xl border ${border} h-full`}>
            <p className={`text-xs font-bold ${textCls} mb-1`}>{label}</p>
            <p className={`text-2xl font-black ${textCls.replace('800', '600').replace('300', '400')}`}>{value}</p>
          </div>
        );

        const xsRenderers = {
          salesWeek: () => xsCard('from-blue-50 to-teal-50 dark:from-blue-900/30 dark:to-teal-900/30', 'border-blue-100 dark:border-blue-800', 'text-blue-800 dark:text-blue-300', 'مبيعات الأسبوع', `${stats.salesWeek.toLocaleString()} ج`),
          salesMonth: () => xsCard('from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30', 'border-green-100 dark:border-green-800', 'text-green-800 dark:text-green-300', 'مبيعات الشهر', `${stats.salesMonth.toLocaleString()} ج`),
          salesYear: () => xsCard('from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30', 'border-purple-100 dark:border-purple-800', 'text-purple-800 dark:text-purple-300', 'مبيعات السنة', `${stats.salesYear.toLocaleString()} ج`),
          avgInvoice: () => xsCard('from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30', 'border-amber-100 dark:border-amber-800', 'text-amber-800 dark:text-amber-300', 'متوسط الفاتورة (آخر 7 أيام)', `${stats.avgInvoice.toLocaleString()} ج`),
          ticketsToday: () => xsCard('from-blue-50 to-teal-50 dark:from-blue-900/30 dark:to-teal-900/30', 'border-blue-100 dark:border-blue-800', 'text-blue-800 dark:text-blue-300', 'تذاكر اليوم', ticketStats.today),
          ticketsWeek: () => xsCard('from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30', 'border-green-100 dark:border-green-800', 'text-green-800 dark:text-green-300', 'تذاكر الأسبوع', ticketStats.week),
          ticketsMonth: () => xsCard('from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30', 'border-purple-100 dark:border-purple-800', 'text-purple-800 dark:text-purple-300', 'تذاكر الشهر', ticketStats.month),
          ticketsWaiting: () => xsCard('from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30', 'border-amber-100 dark:border-amber-800', 'text-amber-800 dark:text-amber-300', 'بانتظار الموافقة', ticketStats.waitingApproval),
          ticketsHighPriority: () => xsCard('from-rose-50 to-red-50 dark:from-rose-900/30 dark:to-red-900/30', 'border-rose-100 dark:border-rose-800', 'text-rose-800 dark:text-rose-300', 'عالية الأولوية', ticketStats.highPriority),
          ticketsSLA: () => xsCard('from-red-50 to-rose-100 dark:from-red-900/40 dark:to-rose-900/40', 'border-red-200 dark:border-red-800', 'text-red-800 dark:text-red-300', '⏰ متأخرة عن SLA', ticketStats.overdueSLA)
        };

        const fullRenderers = {
          topProducts: () => stats.topProducts.length > 0 ? (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                <Award className="text-amber-500" size={20}/> أفضل المنتجات مبيعاً
              </h3>
              <div className="space-y-3">
                {stats.topProducts.slice(0, 5).map((product, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 rounded-full flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">{product.name}</span>
                    </div>
                    <span className="font-black text-teal-600 dark:text-teal-400">{product.value.toLocaleString()} ج</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null,
          charts: () => (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="col-span-1 lg:col-span-2 flex gap-2 mb-2">
                <button
                  onClick={() => setChartType('sales')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'sales' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                >
                  المبيعات
                </button>
                <button
                  onClick={() => setChartType('tickets')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'tickets' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                >
                  التذاكر
                </button>
                <button
                  onClick={() => setChartType('inventory')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'inventory' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                >
                  المخزون
                </button>
                <button
                  onClick={() => setChartType('operations')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'operations' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                >
                  التحويلات والمرتجعات
                </button>
              </div>

              {chartType === 'sales' && (
                <>
                  <AdvancedCharts
                    data={salesSeries}
                    series={[{ key: 'sales', name: 'المبيعات', color: '#0d9488' }, { key: 'returns', name: 'المرتجعات', color: '#f43f5e' }]}
                    type="line" title={`المبيعات والمرتجعات - ${rangeLabel}`} height={300}
                  />
                  <AdvancedCharts
                    data={monthlySeries}
                    series={[{ key: 'net', name: 'صافي المبيعات', color: '#10b981' }]}
                    type="bar" title="صافي المبيعات الشهري (آخر 12 شهر)" height={300}
                  />
                </>
              )}
              {chartType === 'tickets' && (
                <>
                  <AdvancedCharts data={ticketStats.perDay} type="line" title="تذاكر جديدة يومياً (آخر 30 يوم)" height={300} />
                  <AdvancedCharts data={ticketStats.byStatus} type="pie" title="توزيع حالات التذاكر" height={300} />
                  <AdvancedCharts data={ticketStats.byPriority} type="bar" title="توزيع أولويات التذاكر" height={300} />
                </>
              )}
              {chartType === 'inventory' && (
                <>
                  <AdvancedCharts data={stats.categoryDistribution} type="pie" title="توزيع القطع حسب التصنيف" height={300} />
                  <AdvancedCharts data={stats.warehouseDistribution} type="bar" title="توزيع القطع حسب المخزن" height={300} />
                </>
              )}
              {chartType === 'operations' && (
                <>
                  <AdvancedCharts data={transferStats.byStatus} type="pie" title="التحويلات حسب الحالة (آخر 90 يوم)" height={300} />
                  <AdvancedCharts data={transferStats.perDay} type="line" title="طلبات التحويل يومياً (آخر 30 يوم)" height={300} />
                  <AdvancedCharts data={returnStats.byStatus} type="pie" title="المرتجعات حسب الحالة (آخر 90 يوم)" height={300} />
                  <AdvancedCharts data={returnStats.byReason} type="bar" title="المرتجعات حسب السبب" height={300} />
                </>
              )}
            </div>
          ),
          recentActivity: () => (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                <Activity className="text-teal-600" size={20}/> آخر النشاطات
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                {recentActivities.length > 0 ? (
                  recentActivities.map(act => (
                    <div key={act.id} className="flex items-start gap-3 p-3 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors rounded-lg">
                      <div className="w-2 h-2 mt-2 rounded-full bg-teal-400"></div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-800 dark:text-white">{act.action}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{act.details}</p>
                        <div className="flex justify-between items-center mt-1">
                          <p className="text-[8px] text-slate-400 dark:text-slate-500">{formatDate(act.timestamp)}</p>
                          <p className="text-[8px] font-bold text-teal-600 dark:text-teal-400">{act.userName}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-slate-400 dark:text-slate-500 py-4">لا توجد نشاطات حديثة</p>
                )}
              </div>
            </div>
          )
        };

        return (
          <>
            {visibleSm.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {visibleSm.map(w => <React.Fragment key={w.id}>{smRenderers[w.id]?.()}</React.Fragment>)}
              </div>
            )}
            {visibleXs.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
                {visibleXs.map(w => <React.Fragment key={w.id}>{xsRenderers[w.id]?.()}</React.Fragment>)}
              </div>
            )}
            {visibleFull.map(w => (
              <div key={w.id} className="mt-6">
                {fullRenderers[w.id]?.()}
              </div>
            ))}
          </>
        );
      })()}
    </div>
  );
}
