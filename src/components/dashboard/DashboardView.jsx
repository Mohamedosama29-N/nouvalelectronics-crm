import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, getDocs, query, where, orderBy, limit
} from 'firebase/firestore';
import {
  Package,
  Receipt,
  AlertTriangle,
  AlertOctagon,
  Wallet,
  Calendar,
  Activity,
  Award,
  RefreshCcw,
  Layers
} from 'lucide-react';
import { AdvancedCharts } from '../common/AdvancedCharts';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { TICKET_STATUSES } from '../../constants/tickets';
import { db } from '../../firebase/config';
import { showError } from '../../utils/alerts';
import { getDashboardWidgetConfig } from '../../utils/dashboardHelpers';
import { formatDate } from '../../utils/format';
import { getTicketSLAInfo } from '../../utils/ticketHelpers';

export function DashboardView({ appUser, warehouses, onNavigateToInventory, systemSettings }) {
  const [stats, setStats] = useState({ 
    totalItems: 0, 
    itemsCount: 0,
    totalValue: 0, 
    lowStockCount: 0, 
    salesToday: 0,
    salesWeek: 0,
    salesMonth: 0,
    salesYear: 0,
    totalTrend: 0,
    valueTrend: 0,
    salesTrend: 0,
    lowStockTrend: 0,
    topProducts: [],
    topCustomers: [],
    recentTransactions: [],
    dailySales: [],
    monthlySales: [],
    categoryDistribution: [],
    warehouseDistribution: []
  });
  
  const [ticketStats, setTicketStats] = useState({ 
    today: 0, 
    week: 0, 
    month: 0, 
    closed: 0, 
    waitingApproval: 0,
    highPriority: 0,
    overdueSLA: 0,
    byStatus: [],
    byPriority: []
  });
  
  const [loading, setLoading] = useState(true);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [showInventoryValue, setShowInventoryValue] = useState(false);
  const [error, setError] = useState(null);
  const [selectedChart, setSelectedChart] = useState('line');
  const [dateRange, setDateRange] = useState('week');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [chartType, setChartType] = useState('sales');

  // 🎛️ تخصيص الداشبورد: ترتيب وإظهار/إخفاء العناصر حسب إعدادات المستخدم
  // الحالي (اللي بيضبطها المدير من صفحة "فريق العمل والصلاحيات")
  const widgetConfig = useMemo(() => getDashboardWidgetConfig(appUser), [appUser]);
  const isWidgetVisible = (id) => {
    const w = widgetConfig.find(x => x.id === id);
    if (!w || !w.visible) return false;
    if (w.permission && !(appUser.role === 'admin' || appUser.permissions?.[w.permission])) return false;
    return true;
  };
  const widgetOrder = (id) => widgetConfig.findIndex(x => x.id === id);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    if(!appUser) return;
    let isMounted = true;

    const fetchDashboardStats = async () => {
       setLoading(true);
       setError(null);
       try {
           let invSnap;
           try {
             let q = collection(db, 'inventory');
             if (selectedWarehouse !== 'all') {
               q = query(q, where('warehouseId', '==', selectedWarehouse));
             }
             invSnap = await getDocs(q);
           } catch (err) {
             console.warn("Inventory access error:", err);
             invSnap = { docs: [] };
           }
           
           let totalQty = 0;
           let itemsCount = 0; // 🔢 FIX: عدد الأصناف الفعلي (عدد المستندات) مش مجموع القطع
           let totalVal = 0;
           let lowStock = 0;
           let lowStockList = [];
           let categoryCount = {};
           let warehouseCount = {};

           invSnap.docs.forEach(doc => {
             const data = doc.data();
             // ✨ FIX: توحيد الشرط مع باقي السيستم (where('isDeleted','==',false))
             // بدل !data.isDeleted، عشان أي صنف قديم ناقصه الحقل ميتحسبش هنا
             // بينما هو مختفي فعليًا من كل مكان تاني (المخزون، البحث، الجرد).
             if (data.isDeleted === false) {
                if (appUser.role === 'admin' || appUser.permissions?.viewAllWarehouses || data.warehouseId === (appUser.assignedWarehouseId || 'main')) {
                   const qty = Number(data.quantity ?? 0);
                   const price = Number(data.price ?? 0);
                   const minStock = Number(data.minStock ?? 0);
                   
                   totalQty += qty;
                   itemsCount += 1;
                   totalVal += qty * price;
                   
                   warehouseCount[data.warehouseId] = (warehouseCount[data.warehouseId] || 0) + qty;
                   
                   const category = data.category || 'عام';
                   categoryCount[category] = (categoryCount[category] || 0) + qty;
                   
                   if (minStock > 0 && qty <= minStock) {
                     lowStock++;
                     lowStockList.push({
                       id: doc.id,
                       name: data.name,
                       serialNumber: data.serialNumber,
                       quantity: qty,
                       minStock: minStock,
                       warehouseId: data.warehouseId,
                       category: category
                     });
                   }
                }
             }
           });

           setShowInventoryValue(appUser.permissions?.viewInventoryValue || false);

           const categoryDistribution = Object.entries(categoryCount).map(([name, count]) => ({
             name,
             value: count
           }));

           const warehouseDistribution = Object.entries(warehouseCount).map(([id, count]) => ({
             name: warehouses.find(w => w.id === id)?.name || id,
             value: count
           }));

           let salesToday = 0;
           let salesWeek = 0;
           let salesMonth = 0;
           let salesYear = 0;
           let salesYesterday = 0;
           let dailySalesData = [];
           let monthlySalesData = [];
           let productSales = {};
           
           try {
             const now = new Date();
             const today = new Date(now.setHours(0,0,0,0));
             const yesterday = new Date(today);
             yesterday.setDate(yesterday.getDate() - 1);
             const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
             const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
             const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
             
             let salesQuery = collection(db, 'transactions');
             if (selectedWarehouse !== 'all') {
               salesQuery = query(salesQuery, where('warehouseId', '==', selectedWarehouse));
             }
             
             const salesSnap = await getDocs(query(
               salesQuery, 
               where('timestamp', '>=', yearAgo),
               where('type', '==', 'sell')
             ));
             
             const dailyTotals = {};
             const monthlyTotals = {};
             
             salesSnap.docs.forEach(doc => {
                const data = doc.data();
                if (appUser.role === 'admin' || appUser.permissions?.viewAllWarehouses || data.warehouseId === (appUser.assignedWarehouseId || 'main')) {
                   const amount = Number(data.finalTotal || data.total || 0);
                   const date = data.timestamp?.toDate?.() || new Date(data.timestamp);
                   const dateStr = date.toISOString().split('T')[0];
                   const monthStr = date.toISOString().slice(0, 7);
                   
                   dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + amount;
                   monthlyTotals[monthStr] = (monthlyTotals[monthStr] || 0) + amount;
                   
                   if (date >= today) salesToday += amount;
                   if (date >= yesterday && date < today) salesYesterday += amount;
                   if (date >= weekAgo) salesWeek += amount;
                   if (date >= monthAgo) salesMonth += amount;
                   if (date >= yearAgo) salesYear += amount;
                   
                   const productName = data.itemName;
                   productSales[productName] = (productSales[productName] || 0) + amount;
                }
             });

             dailySalesData = Object.entries(dailyTotals)
               .sort((a, b) => a[0].localeCompare(b[0]))
               .slice(-30)
               .map(([date, total]) => ({ date, total }));

             monthlySalesData = Object.entries(monthlyTotals)
               .sort((a, b) => a[0].localeCompare(b[0]))
               .slice(-12)
               .map(([month, total]) => ({ month, total }));
             
           } catch (err) {
             console.warn("Sales access error:", err);
           }

           const topProducts = Object.entries(productSales)
             .sort((a, b) => b[1] - a[1])
             .slice(0, 10)
             .map(([name, value]) => ({ name, value }));

           let todayTickets = 0, weekTickets = 0, monthTickets = 0, closedTickets = 0, 
               waitingApprovalTickets = 0, highPriorityTickets = 0, overdueSLATickets = 0;
           let statusCount = {};
           let priorityCount = { high: 0, medium: 0, low: 0 };
           
           try {
             let ticketsQuery = collection(db, 'tickets');
             if (selectedWarehouse !== 'all') {
               ticketsQuery = query(ticketsQuery, where('warehouseId', '==', selectedWarehouse));
             }
             
             const ticketsSnap = await getDocs(ticketsQuery);
             
             const now = new Date();
             const today = new Date(now.setHours(0,0,0,0));
             const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
             const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
             
             ticketsSnap.docs.forEach(doc => {
                const data = doc.data();
                const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                
                if (createdDate >= today) todayTickets++;
                if (createdDate >= weekAgo) weekTickets++;
                if (createdDate >= monthAgo) monthTickets++;
                
                if (data.status === 'delivered_to_customer' || data.status === 'closed') closedTickets++;
                if (data.status === 'waiting_customer_approval_cost') waitingApprovalTickets++;

                // ✨ ميزة جديدة: تتبع SLA - عدد التذاكر المتأخرة
                if (getTicketSLAInfo({ ...data, id: doc.id }, systemSettings?.ticketSLA)?.level === 'overdue') {
                  overdueSLATickets++;
                }
                
                if (data.priority === 'high') {
                  highPriorityTickets++;
                  priorityCount.high++;
                } else if (data.priority === 'medium') {
                  priorityCount.medium++;
                } else {
                  priorityCount.low++;
                }
                
                statusCount[data.status] = (statusCount[data.status] || 0) + 1;
             });
           } catch (err) {
             console.warn("Tickets access error:", err);
           }
           
           const ticketsByStatus = Object.entries(statusCount).map(([status, count]) => ({
             name: TICKET_STATUSES.find(s => s.value === status)?.label || status,
             count,
             status
           })).sort((a, b) => b.count - a.count);

           const ticketsByPriority = Object.entries(priorityCount).map(([priority, count]) => ({
             name: priority === 'high' ? 'عالية' : priority === 'medium' ? 'متوسطة' : 'منخفضة',
             count
           }));

           let recentActs = [];
           try {
             const activitiesSnap = await getDocs(query(
               collection(db, 'activity_logs'),
               orderBy('timestamp', 'desc'),
               limit(20)
             ));
             recentActs = activitiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
           } catch (err) {
             console.warn("Activities access error:", err);
           }

           if (isMounted) {
               setStats({
                  totalItems: totalQty,
                  itemsCount: itemsCount,
                  totalValue: totalVal,
                  lowStockCount: lowStock,
                  salesToday: salesToday,
                  salesWeek: salesWeek,
                  salesMonth: salesMonth,
                  salesYear: salesYear,
                  totalTrend: salesYesterday > 0 ? Math.round((salesToday - salesYesterday) / salesYesterday * 100) : 0,
                  valueTrend: 3,
                  salesTrend: salesYesterday > 0 ? Math.round((salesToday - salesYesterday) / salesYesterday * 100) : 0,
                  lowStockTrend: -2,
                  topProducts: topProducts,
                  dailySales: dailySalesData,
                  monthlySales: monthlySalesData,
                  categoryDistribution,
                  warehouseDistribution
               });
               setTicketStats({
                 today: todayTickets,
                 week: weekTickets,
                 month: monthTickets,
                 closed: closedTickets,
                 waitingApproval: waitingApprovalTickets,
                 highPriority: highPriorityTickets,
                 overdueSLA: overdueSLATickets,
                 byStatus: ticketsByStatus,
                 byPriority: ticketsByPriority
               });
               setLowStockItems(lowStockList);
               setRecentActivities(recentActs);
           }
       } catch(e) {
           console.error("Dashboard Stats Fetch Error:", e);
           setError(e.message);
           if (isMounted) {
             showError("حدث خطأ في تحميل بيانات لوحة التحكم");
           }
       }
       if (isMounted) setLoading(false);
    };

    fetchDashboardStats();
    return () => { isMounted = false; };
  }, [appUser, warehouses, refreshKey, selectedWarehouse]);

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
           <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg text-xs">
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
           
           <button
             onClick={handleRefresh}
             className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
             title="تحديث"
           >
             <RefreshCcw size={18} />
           </button>
           
           <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2">
              <Calendar size={14}/> 
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
           </div>
         </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 text-rose-700 dark:text-rose-300 text-sm font-bold flex items-center gap-2">
          <AlertTriangle size={20} />
          <div>
            <p>خطأ في تحميل البيانات: {error}</p>
            <p className="text-xs mt-1">تأكد من إعدادات قواعد الأمان في Firebase Console.</p>
          </div>
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
              className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all hover:border-indigo-300 dark:hover:border-indigo-600 relative overflow-hidden group text-right w-full h-full"
            >
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-xl group-hover:bg-indigo-100 dark:group-hover:bg-indigo-800/50 transition-colors w-fit">
                <Package size={22}/>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">إجمالي القطع بالمخزن</p>
                <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.totalItems.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className={`text-[9px] font-bold ${stats.totalTrend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {stats.totalTrend > 0 ? '+' : ''}{stats.totalTrend}%
                  </span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500">عن الأمس</span>
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
                  <span className={`text-[9px] font-bold ${stats.valueTrend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {stats.valueTrend > 0 ? '+' : ''}{stats.valueTrend}%
                  </span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500">عن الأمس</span>
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
                  <span className={`text-[9px] font-bold ${stats.salesTrend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {stats.salesTrend > 0 ? '+' : ''}{stats.salesTrend}%
                  </span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500">عن الأمس</span>
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
          salesWeek: () => xsCard('from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30', 'border-blue-100 dark:border-blue-800', 'text-blue-800 dark:text-blue-300', 'مبيعات الأسبوع', `${stats.salesWeek.toLocaleString()} ج`),
          salesMonth: () => xsCard('from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30', 'border-green-100 dark:border-green-800', 'text-green-800 dark:text-green-300', 'مبيعات الشهر', `${stats.salesMonth.toLocaleString()} ج`),
          salesYear: () => xsCard('from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30', 'border-purple-100 dark:border-purple-800', 'text-purple-800 dark:text-purple-300', 'مبيعات السنة', `${stats.salesYear.toLocaleString()} ج`),
          avgInvoice: () => xsCard('from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30', 'border-amber-100 dark:border-amber-800', 'text-amber-800 dark:text-amber-300', 'متوسط الفاتورة', `${stats.salesWeek > 0 ? Math.round(stats.salesWeek / (stats.salesWeek / 1000)).toLocaleString() : 0} ج`),
          ticketsToday: () => xsCard('from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30', 'border-blue-100 dark:border-blue-800', 'text-blue-800 dark:text-blue-300', 'تذاكر اليوم', ticketStats.today),
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
                      <span className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">{product.name}</span>
                    </div>
                    <span className="font-black text-indigo-600 dark:text-indigo-400">{product.value.toLocaleString()} ج</span>
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
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'sales' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                >
                  المبيعات
                </button>
                <button
                  onClick={() => setChartType('tickets')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'tickets' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                >
                  التذاكر
                </button>
                <button
                  onClick={() => setChartType('inventory')}
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'inventory' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                >
                  المخزون
                </button>
              </div>

              {chartType === 'sales' && (
                <>
                  <AdvancedCharts data={stats.dailySales.map(d => ({ name: d.date, value: d.total }))} type="line" title="المبيعات اليومية (آخر 30 يوم)" height={300} />
                  <AdvancedCharts data={stats.monthlySales.map(d => ({ name: d.month, value: d.total }))} type="bar" title="المبيعات الشهرية (آخر 12 شهر)" height={300} />
                </>
              )}
              {chartType === 'tickets' && (
                <>
                  <AdvancedCharts data={ticketStats.byStatus.map(s => ({ name: s.name, value: s.count }))} type="pie" title="توزيع حالات التذاكر" height={300} />
                  <AdvancedCharts data={ticketStats.byPriority.map(p => ({ name: p.name, value: p.count }))} type="bar" title="توزيع أولويات التذاكر" height={300} />
                </>
              )}
              {chartType === 'inventory' && (
                <>
                  <AdvancedCharts data={stats.categoryDistribution} type="pie" title="توزيع الأصناف حسب التصنيف" height={300} />
                  <AdvancedCharts data={stats.warehouseDistribution} type="bar" title="توزيع الأصناف حسب المخزن" height={300} />
                </>
              )}
            </div>
          ),
          recentActivity: () => (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                <Activity className="text-indigo-600" size={20}/> آخر النشاطات
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                {recentActivities.length > 0 ? (
                  recentActivities.map(act => (
                    <div key={act.id} className="flex items-start gap-3 p-3 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors rounded-lg">
                      <div className="w-2 h-2 mt-2 rounded-full bg-indigo-400"></div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-800 dark:text-white">{act.action}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{act.details}</p>
                        <div className="flex justify-between items-center mt-1">
                          <p className="text-[8px] text-slate-400 dark:text-slate-500">{formatDate(act.timestamp)}</p>
                          <p className="text-[8px] font-bold text-indigo-600 dark:text-indigo-400">{act.userName}</p>
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




// ==========================================================================
// 📦 مدير المخزون المحسن (مع Virtual Scrolling واستيراد 10000 صنف)
// ==========================================================================
