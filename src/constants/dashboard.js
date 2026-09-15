export const DASHBOARD_WIDGETS = [
  { id: 'totalItems', label: 'إجمالي القطع بالمخزن', category: 'مخزون', size: 'sm' },
  { id: 'itemsCount', label: 'عدد الأصناف بالمخزن', category: 'مخزون', size: 'sm' },
  { id: 'inventoryValue', label: 'قيمة المخزون الإجمالية', category: 'مخزون', size: 'sm', permission: 'viewInventoryValue' },
  { id: 'salesToday', label: 'مبيعات اليوم', category: 'مبيعات', size: 'sm' },
  { id: 'lowStock', label: 'نواقص تحتاج طلب', category: 'مخزون', size: 'sm' },
  { id: 'salesWeek', label: 'مبيعات الأسبوع', category: 'مبيعات', size: 'xs' },
  { id: 'salesMonth', label: 'مبيعات الشهر', category: 'مبيعات', size: 'xs' },
  { id: 'salesYear', label: 'مبيعات السنة', category: 'مبيعات', size: 'xs' },
  { id: 'avgInvoice', label: 'متوسط الفاتورة', category: 'مبيعات', size: 'xs' },
  { id: 'ticketsToday', label: 'تذاكر اليوم', category: 'صيانة', size: 'xs', permission: 'manageTickets' },
  { id: 'ticketsWeek', label: 'تذاكر الأسبوع', category: 'صيانة', size: 'xs', permission: 'manageTickets' },
  { id: 'ticketsMonth', label: 'تذاكر الشهر', category: 'صيانة', size: 'xs', permission: 'manageTickets' },
  { id: 'ticketsWaiting', label: 'تذاكر بانتظار الموافقة', category: 'صيانة', size: 'xs', permission: 'manageTickets' },
  { id: 'ticketsHighPriority', label: 'تذاكر عالية الأولوية', category: 'صيانة', size: 'xs', permission: 'manageTickets' },
  { id: 'ticketsSLA', label: 'تذاكر متأخرة عن SLA', category: 'صيانة', size: 'xs', permission: 'manageTickets' },
  { id: 'topProducts', label: 'أفضل المنتجات مبيعاً', category: 'مبيعات', size: 'full' },
  { id: 'charts', label: 'الرسوم البيانية', category: 'تقارير', size: 'full', permission: 'viewCharts' },
  { id: 'recentActivity', label: 'آخر النشاطات', category: 'عام', size: 'full' }
];

// بيرجع قائمة العناصر بعد تطبيق تخصيص المستخدم (ظاهر/مخفي + ترتيب)، مرتبة فعليًا
