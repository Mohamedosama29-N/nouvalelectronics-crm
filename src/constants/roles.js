import {
  User,
  Calculator,
  Wrench,
  Shield,
  HardHat,
  Headphones,
  Crown,
  ShieldCheck
} from 'lucide-react';

export const USER_ROLES = [
  { key: 'admin', label: 'مدير النظام', level: 100, icon: Crown, color: 'purple' },
  { key: 'main_warehouse_manager', label: 'مسؤول المخزن الرئيسي', level: 90, icon: ShieldCheck, color: 'sky' },
  { key: 'warehouse_manager', label: 'مسؤول مخزن', level: 80, icon: Shield, color: 'blue' },
  { key: 'accountant', label: 'محاسب', level: 60, icon: Calculator, color: 'emerald' },
  { key: 'maintenance_center', label: 'مركز صيانة', level: 50, icon: Wrench, color: 'orange' },
  // 🆕 دور جديد: استقبال مركز - لموظف الاستقبال اللي بيستلم الأجهزة والتذاكر
  // في مركز الصيانة، من غير صلاحيات تعديل الفني/التكلفة زي مركز الصيانة نفسه
  { key: 'center_reception', label: 'استقبال مركز', level: 45, icon: Headphones, color: 'teal' },
  { key: 'technician', label: 'فني صيانة', level: 40, icon: HardHat, color: 'amber' },
  { key: 'call_center', label: 'كول سنتر', level: 30, icon: Headphones, color: 'cyan' },
  { key: 'sales', label: 'موظف مبيعات', level: 20, icon: User, color: 'slate' }
];

export const ALL_PERMISSIONS = [
  // عام
  { key: 'viewDashboard', label: 'لوحة التحكم والمؤشرات', category: 'عام' },
  
  // مخزون
  { key: 'viewInventory', label: 'عرض المخزون', category: 'مخزون' },
  { key: 'addInventoryItem', label: 'إضافة صنف', category: 'مخزون' },
  { key: 'editInventoryItem', label: 'تعديل صنف', category: 'مخزون' },
  { key: 'deleteInventoryItem', label: 'حذف صنف', category: 'مخزون' },
  { key: 'bulkDeleteInventory', label: 'حذف مجمع للمخزون', category: 'مخزون' },
  { key: 'importInventoryCSV', label: 'استيراد مخزون من CSV', category: 'مخزون' },
  { key: 'exportInventoryCSV', label: 'تصدير مخزون إلى CSV', category: 'مخزون' },
  { key: 'viewInventoryValue', label: 'رؤية قيمة المخزون', category: 'مخزون' },
  { key: 'viewLowStock', label: 'مشاهدة النواقص', category: 'مخزون' },
  { key: 'bulkUpdatePrices', label: 'تحديث أسعار مجمع', category: 'مخزون' },
  { key: 'viewReturns', label: 'عرض المرتجعات', category: 'مخزون' },
  { key: 'manageReturns', label: 'إدارة المرتجعات (إضافة/موافقة/رفض)', category: 'مخزون' },  
  

  // مبيعات
  { key: 'viewPOS', label: 'نقطة البيع', category: 'مبيعات' },
  { key: 'makeSale', label: 'إجراء عملية بيع', category: 'مبيعات' },
  { key: 'makeReturn', label: 'إجراء مرتجع', category: 'مبيعات' },
  { key: 'viewTransactions', label: 'عرض المعاملات', category: 'مبيعات' },
  { key: 'printInvoice', label: 'طباعة الفاتورة', category: 'مبيعات' },
  { key: 'exportTransactions', label: 'تصدير المعاملات', category: 'مبيعات' },
  { key: 'viewInvoices', label: 'عرض أرشيف الفواتير', category: 'مبيعات' },
  { key: 'viewAllInvoices', label: 'رؤية كل الفواتير (حتى فواتير الفروع الأخرى)', category: 'مبيعات' },


  // عملاء
  { key: 'viewCustomers', label: 'عرض العملاء', category: 'عملاء' },
  { key: 'addCustomer', label: 'إضافة عميل', category: 'عملاء' },
  { key: 'editCustomer', label: 'تعديل عميل', category: 'عملاء' },
  { key: 'deleteCustomer', label: 'حذف عميل', category: 'عملاء' },
  { key: 'bulkDeleteCustomers', label: 'حذف مجمع للعملاء', category: 'عملاء' },
  { key: 'importCustomersCSV', label: 'استيراد عملاء من CSV', category: 'عملاء' },
  { key: 'exportCustomersCSV', label: 'تصدير عملاء إلى CSV', category: 'عملاء' },
  { key: 'viewCustomerHistory', label: 'عرض سجل العميل', category: 'عملاء' },
  
  // الصيانة
  { key: 'manageTickets', label: 'إدارة تذاكر الصيانة', category: 'صيانة' },
  { key: 'addTicket', label: 'إضافة تذكرة', category: 'صيانة' },
  { key: 'editTicket', label: 'تعديل تذكرة', category: 'صيانة' },
  { key: 'deleteTicket', label: 'حذف تذكرة', category: 'صيانة' },
  { key: 'bulkDeleteTickets', label: 'حذف مجمع للتذاكر', category: 'صيانة' },
  { key: 'addSpareParts', label: 'إضافة قطع غيار', category: 'صيانة' },
  { key: 'changeTicketStatus', label: 'تغيير حالة التذكرة', category: 'صيانة' },
  { key: 'assignTechnician', label: 'تعيين فني', category: 'صيانة' },
  { key: 'assignMaintenanceCenter', label: 'تعيين مركز صيانة', category: 'صيانة' },
  { key: 'assignCallCenter', label: 'تعيين كول سنتر', category: 'صيانة' },
  { key: 'viewAllTickets', label: 'رؤية كل تذاكر الصيانة (حتى تذاكر الفروع الأخرى)', category: 'صيانة' },
  
  // تحويلات
  { key: 'viewTransfers', label: 'عرض التحويلات', category: 'تحويلات' },
  { key: 'createTransfer', label: 'إنشاء طلب تحويل', category: 'تحويلات' },
  { key: 'approveTransfer', label: 'الموافقة على التحويل', category: 'تحويلات' },
  { key: 'rejectTransfer', label: 'رفض التحويل', category: 'تحويلات' },
  
  // تقارير
  { key: 'viewReports', label: 'عرض التقارير', category: 'تقارير' },
  { key: 'viewCharts', label: 'رؤية الرسوم البيانية', category: 'تقارير' },
  { key: 'exportReports', label: 'تصدير التقارير', category: 'تقارير' },
  { key: 'exportPDF', label: 'تصدير PDF', category: 'تقارير' },
  { key: 'printReports', label: 'طباعة التقارير', category: 'تقارير' },
  { key: 'scheduleReports', label: 'جدولة التقارير', category: 'تقارير' },

  // مالية
  { key: 'viewFinance', label: 'عرض الملف المالي', category: 'مالية' },
  { key: 'manageFinance', label: 'إدارة المصروفات', category: 'مالية' },
  
  // فروع
  { key: 'viewWarehouses', label: 'عرض الفروع', category: 'فروع' },
  { key: 'manageWarehouses', label: 'إدارة الفروع', category: 'فروع' },
  { key: 'viewAllWarehouses', label: 'رؤية كل الفروع', category: 'فروع' },
  { key: 'assignUsersToWarehouse', label: 'تعيين مستخدمين للفرع', category: 'فروع' },
  
  // مستخدمين
  { key: 'viewUsers', label: 'عرض المستخدمين', category: 'مستخدمين' },
  { key: 'manageUsers', label: 'إدارة المستخدمين', category: 'مستخدمين' },
  { key: 'addUser', label: 'إضافة مستخدم', category: 'مستخدمين' },
  { key: 'editUser', label: 'تعديل مستخدم', category: 'مستخدمين' },
  { key: 'deleteUser', label: 'حذف مستخدم', category: 'مستخدمين' },
  { key: 'bulkDeleteUsers', label: 'حذف مجمع للمستخدمين', category: 'مستخدمين' },
  { key: 'managePermissions', label: 'إدارة الصلاحيات', category: 'مستخدمين' },
  { key: 'viewUserActivity', label: 'عرض نشاط المستخدم', category: 'مستخدمين' },
  { key: 'viewLoginHistory', label: 'عرض سجل الدخول', category: 'مستخدمين' },
  
  // إعدادات
  { key: 'viewSettings', label: 'عرض الإعدادات', category: 'إعدادات' },
  { key: 'manageSettings', label: 'تعديل الإعدادات', category: 'إعدادات' },
  { key: 'manageInvoiceTemplate', label: 'إدارة قالب الفاتورة', category: 'إعدادات' },
  { key: 'backupData', label: 'النسخ الاحتياطي', category: 'إعدادات' },
  { key: 'restoreData', label: 'استعادة البيانات', category: 'إعدادات' },
  { key: 'viewAuditLog', label: 'سجل التدقيق', category: 'إعدادات' },
  { key: 'manageAPIKeys', label: 'إدارة مفاتيح API', category: 'إعدادات' },
  { key: 'manageIntegrations', label: 'إدارة التكاملات', category: 'إعدادات' },
  { key: 'manageTags', label: 'إدارة الوسوم', category: 'إعدادات' },

    // إعدادات جزئية - للتحكم في من يمكنه تعديل ماذا
  { key: 'editSystemSettings', label: 'تعديل الإعدادات العامة (اسم النظام، الضريبة، الشعار)', category: 'إعدادات' },
  { key: 'editInvoiceTemplate', label: 'تعديل قالب الفاتورة', category: 'إعدادات' },
  { key: 'manageTechniciansList', label: 'إدارة قائمة الفنيين', category: 'إعدادات' },
  { key: 'manageFeesAndCategories', label: 'إدارة الرسوم والتصنيفات', category: 'إعدادات' },
  { key: 'manageProductModels', label: 'إدارة المنتجات والموديلات', category: 'إعدادات' },
  { key: 'manageFaultCodes', label: 'إدارة أكواد الأعطال', category: 'إعدادات' },
  { key: 'manageMaintenanceCenters', label: 'إدارة مراكز الصيانة', category: 'إعدادات' },
  { key: 'manageBranchesList', label: 'إدارة قائمة الفروع', category: 'إعدادات' },


  { key: 'viewReturnsWarehouse', label: 'عرض مخزن المرتجعات', category: 'مخزون' },
  { key: 'manageReturnsWarehouse', label: 'إدارة مخزن المرتجعات', category: 'مخزون' }

];

export const ROLE_DEFAULT_PERMISSIONS = {
  admin: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {}),
  
  main_warehouse_manager: {
    viewDashboard: true,
    viewInventory: true,
    addInventoryItem: true,
    editInventoryItem: true,
    deleteInventoryItem: false,
    bulkDeleteInventory: false,
    importInventoryCSV: true,
    exportInventoryCSV: true,
    viewInventoryValue: true,
    viewLowStock: true,
    bulkUpdatePrices: true,
    viewPOS: false,
    makeSale: false,
    viewTransactions: true,
    viewCustomers: false,
    addCustomer: false,
    viewTransfers: true,
    createTransfer: false,
    approveTransfer: true,
    rejectTransfer: true,
    viewReports: true,
    viewCharts: true,
    exportReports: true,
    exportPDF: true,
    viewWarehouses: true,
    manageWarehouses: false,
    viewAllWarehouses: true,
    viewUsers: false,
    manageUsers: false,
    viewSettings: false,
    manageSettings: false,
    viewAllTickets: true,
    viewAllInvoices: true,
    viewReturns: true,
    manageReturns: true,

  editSystemSettings: true,      // لا يمكنه تعديل إعدادات النظام العامة
  editInvoiceTemplate: true,      // يمكنه تعديل قالب الفاتورة
  manageTechniciansList: true,    // يمكنه إدارة الفنيين
  manageFeesAndCategories: false, // لا يمكنه تعديل الرسوم والتصنيفات
  manageProductModels: true,      // يمكنه إدارة المنتجات والموديلات
  manageFaultCodes: true,         // يمكنه إدارة أكواد الأعطال
  manageMaintenanceCenters: true, // يمكنه إدارة مراكز الصيانة
  manageBranchesList: false       // لا يمكنه إدارة الفروع 

  },
  
  warehouse_manager: {
    viewDashboard: true,
    viewInventory: true,
    addInventoryItem: true,
    editInventoryItem: true,
    deleteInventoryItem: false,
    bulkDeleteInventory: false,
    importInventoryCSV: true,
    exportInventoryCSV: true,
    viewInventoryValue: true,
    viewLowStock: true,
    bulkUpdatePrices: false,
    viewPOS: false,
    makeSale: false,
    viewTransactions: true,
    viewCustomers: false,
    addCustomer: false,
    viewTransfers: true,
    createTransfer: true,
    approveTransfer: false,
    rejectTransfer: false,
    viewReports: true,
    viewCharts: true,
    exportReports: true,
    exportPDF: true,
    viewWarehouses: true,
    manageWarehouses: false,
    viewAllWarehouses: false,
    viewUsers: false,
    manageUsers: false,
    viewSettings: false,
    viewAllInvoices: true,
      viewReturns: true,
      manageReturns: true,
    manageSettings: false,
    viewAllTickets: false
  },
  
  technician: {
    viewDashboard: true,
    viewInventory: false,
    addInventoryItem: false,
    viewLowStock: true,
    viewPOS: false,
    viewCustomers: true,
    addCustomer: true,
    editCustomer: false,
    manageTickets: true,
    addTicket: true,
    editTicket: true,
    addSpareParts: true,
    changeTicketStatus: true,
    assignTechnician: false,
    viewTransfers: false,
    viewReports: false,
    viewCharts: true,
    viewWarehouses: false,
    viewSettings: true,
  editSystemSettings: false,
  editInvoiceTemplate: false,
  manageTechniciansList: false,
  manageFeesAndCategories: false,
  manageProductModels: false,
  manageFaultCodes: false,
  manageMaintenanceCenters: false,
  manageBranchesList: false,
  viewAllWarehouses: false,
  viewReturnsWarehouse: false,
  viewAllInvoices: false,
    viewReturns: false,
    manageReturns: false,
  manageReturnsWarehouse: false,
  viewInvoices: false
  
  },
  
  maintenance_center: {
    viewDashboard: true,
    viewInventory: true,
    viewLowStock: true,
    viewPOS: false,
    viewCustomers: true,
    addCustomer: true,
    manageTickets: true,
    addTicket: true,
    editTicket: true,
    addSpareParts: true,
    changeTicketStatus: true,
    assignTechnician: true,
    assignMaintenanceCenter: false,
    assignCallCenter: true,
    viewTransfers: false,
    viewReports: true,
    viewCharts: true,

    viewSettings: true,
  editSystemSettings: false,
  editInvoiceTemplate: false,
  manageTechniciansList: false,
  manageFeesAndCategories: false,
  manageProductModels: false,
  manageFaultCodes: true,     // يمكنه إدارة أكواد الأعطال
  manageMaintenanceCenters: false,
  manageBranchesList: false,
  viewAllWarehouses: false,  // لا يرى إلا فرعه
  viewReturnsWarehouse: true,
  manageReturnsWarehouse: false,
  viewInvoices: false,
   viewAllInvoices: false,
  viewReturns: false,
  manageReturns: false,
  viewAllTickets: false

  },
  
  // 🆕 استقبال مركز: بيستلم الأجهزة ويفتح تذاكر ويتابع حالتها، من غير صلاحيات
  // تعيين فني/تكلفة أو إدارة إعدادات (دي مسؤولية "مركز صيانة" نفسه)
  center_reception: {
    viewDashboard: true,
    viewCustomers: true,
    addCustomer: true,
    editCustomer: true,
    manageTickets: true,
    addTicket: true,
    editTicket: true,
    changeTicketStatus: true,
    assignTechnician: false,
    assignMaintenanceCenter: true,
    assignCallCenter: false,
    viewTransfers: false,
    viewReports: false,
    viewCharts: false,

    viewSettings: false,
    editSystemSettings: false,
    editInvoiceTemplate: false,
    manageTechniciansList: false,
    manageFeesAndCategories: false,
    manageProductModels: false,
    manageFaultCodes: false,
    manageMaintenanceCenters: false,
    manageBranchesList: false,
    viewAllWarehouses: false,
    viewReturnsWarehouse: false,
    manageReturnsWarehouse: false,
    viewInvoices: false,
    viewAllInvoices: false,
    viewReturns: false,
    manageReturns: false,
    viewAllTickets: false
  },
  
  call_center: {
    viewDashboard: true,
    viewCustomers: true,
    addCustomer: true,
    editCustomer: true,
    manageTickets: true,
    addTicket: true,
    editTicket: true,
    changeTicketStatus: true,
    assignTechnician: true,
    assignMaintenanceCenter: true,
    assignCallCenter: false,
    viewTransfers: false,
    viewReports: false,
    viewCharts: true,

     viewSettings: true,
  editSystemSettings: false,
  editInvoiceTemplate: false,
  manageTechniciansList: false,
  manageFeesAndCategories: false,
  manageProductModels: false,
  manageFaultCodes: false,
  manageMaintenanceCenters: false,
  manageBranchesList: false,
  viewAllTickets: false

  },
  
  sales: {
    viewDashboard: true,
    viewInventory: true,
    viewLowStock: true,
    viewPOS: true,
    makeSale: true,
    makeReturn: true,
    viewTransactions: true,
    printInvoice: true,
    viewCustomers: true,
    addCustomer: true,
    editCustomer: true,
    viewCustomerHistory: true,
    manageTickets: false,
    viewTransfers: false,
    viewReports: false,
    viewCharts: true,
    viewWarehouses: false,

     viewSettings: true,
  editSystemSettings: false,
  editInvoiceTemplate: true,   // يمكنه تعديل قالب الفاتورة
  manageTechniciansList: false,
  manageFeesAndCategories: false,
  manageProductModels: false,
  manageFaultCodes: false,
  manageMaintenanceCenters: false,
  manageBranchesList: false,
  viewAllTickets: false

  },
  
  accountant: {
    viewDashboard: true,
    viewInventory: false,
    viewInventoryValue: true,
    viewPOS: false,
    viewTransactions: true,
    exportTransactions: true,
    viewCustomers: false,
    viewTransfers: false,
    viewReports: true,
    viewCharts: true,
    exportReports: true,
    exportPDF: true,
    printReports: true,
    viewSettings: false,
    viewAllTickets: false
  }
};

// ==========================================================================
// 🎛️ نظام تخصيص الداشبورد لكل مستخدم (Dashboard Widgets)
// كل عنصر هنا = كارت/قسم مستقل تقدر تظهره أو تخفيه، وتتحكم في ترتيبه، لكل
// مستخدم على حدة. الإعدادات المخصصة بتتخزن في مستند الموظف نفسه تحت
// employees/{id}.dashboardConfig.widgets = { [id]: { visible, order } }
// لو مفيش إعدادات مخصصة للمستخدم، كل العناصر بتظهر بالترتيب الافتراضي هنا.
// size: 'sm' = كارت رئيسي كبير، 'xs' = كارت صغير في صف، 'full' = قسم كامل العرض
// permission: لو موجودة، العنصر بيتفلتر حسب صلاحية المستخدم كمان (مش بس التخصيص)
// ==========================================================================

export const ROLE_COLOR_CLASSES = {
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  sky: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  cyan: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
};
