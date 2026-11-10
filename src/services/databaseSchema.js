// src/services/databaseSchema.js
export const collections = {
  // المستخدمين والصلاحيات
  users: 'users',
  roles: 'roles',
  permissions: 'permissions',
  
  // الفروع
  branches: 'branches',
  
  // المنتجات والمخزون
  products: 'products',
  rawMaterials: 'rawMaterials',
  recipes: 'recipes',
  inventoryTransactions: 'inventoryTransactions',
  
  // المشتريات والموردين
  suppliers: 'suppliers',
  purchaseOrders: 'purchaseOrders',
  purchaseOrdersItems: 'purchaseOrdersItems',
  
  // المبيعات
  invoices: 'invoices',
  invoicesItems: 'invoicesItems',
  
  // العملاء ونظام الولاء
  customers: 'customers',
  loyaltyPoints: 'loyaltyPoints',
  loyaltyRewards: 'loyaltyRewards',
  loyaltyTransactions: 'loyaltyTransactions',
  
  // المطبخ
  kitchenOrders: 'kitchenOrders',
  kitchenStations: 'kitchenStations',
  
  // الموظفين
  employees: 'employees',
  attendance: 'attendance',
  shifts: 'shifts',
  
  // الحجوزات
  tables: 'tables',
  reservations: 'reservations',
  
  // العروض والخصومات
  offers: 'offers',
  coupons: 'coupons',
  
  // التقارير والتحليلات
  activityLogs: 'activityLogs',
  financialReports: 'financialReports',
  
  // الإعدادات
  settings: 'settings',
  backups: 'backups'
}