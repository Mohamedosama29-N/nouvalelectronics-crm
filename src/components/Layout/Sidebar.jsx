// src/components/Layout/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { 
  HomeIcon, ShoppingCartIcon, CubeIcon, UsersIcon, ChartBarIcon, 
  Cog6ToothIcon, DocumentTextIcon, BuildingStorefrontIcon, TruckIcon,
  UserGroupIcon, GiftIcon, ClipboardDocumentListIcon,
  ArrowPathIcon, ShieldCheckIcon, ServerIcon, TableCellsIcon, ClockIcon,
  UserCircleIcon, BanknotesIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { APP_VERSION } from '../../version'

const Sidebar = ({ open }) => {
  const { userData, hasPermission } = useAuth()
  const isAdmin = userData?.role === 'admin'

  // تعريف العناصر مع الصلاحيات المطلوبة
  const menuItems = [
    // القسم الرئيسي - لا يحتاج صلاحيات
    { path: '/dashboard', name: 'لوحة التحكم', icon: HomeIcon, section: 'main', permission: null },
    { path: '/pos', name: 'نقطة البيع', icon: ShoppingCartIcon, section: 'main', permission: 'pos_access' },
    { path: '/cash-register', name: 'درج الكاش', icon: BanknotesIcon, section: 'main', permission: 'shifts_view' },
    
    // قسم المبيعات والعملاء
    { path: '/customers', name: 'العملاء', icon: UsersIcon, section: 'sales', permission: 'customers_view' },
    { path: '/invoices', name: 'أرشيف الفواتير', icon: DocumentTextIcon, section: 'sales', permission: 'invoices_archive' },
    { path: '/loyalty', name: 'نقاط الولاء', icon: GiftIcon, section: 'sales', permission: 'loyalty_view' },
    
    // قسم المنتجات والمخزون
    { path: '/products', name: 'المنتجات', icon: CubeIcon, section: 'products', permission: 'products_view' },
    { path: '/raw-materials', name: 'المواد الخام', icon: CubeIcon, section: 'products', permission: 'raw_materials_view' },
    { path: '/recipes', name: 'الوصفات (BOM)', icon: ClipboardDocumentListIcon, section: 'products', permission: 'recipes_view' },
    
    // قسم المشتريات والموردين
    { path: '/purchases', name: 'أوامر الشراء', icon: ShoppingCartIcon, section: 'purchases', permission: 'purchases_view' },
    { path: '/suppliers', name: 'الموردين', icon: TruckIcon, section: 'purchases', permission: 'suppliers_view' },
    
    // قسم العمليات
    { path: '/kitchen', name: 'شاشة المطبخ', icon: ClockIcon, section: 'operations', permission: 'kitchen_view' },
    { path: '/bookings', name: 'الحجوزات والطاولات', icon: TableCellsIcon, section: 'operations', permission: 'bookings_view' },
    
    // قسم الموظفين والفروع
    { path: '/employees', name: 'الموظفين', icon: UserGroupIcon, section: 'hr', permission: 'employees_view' },
    { path: '/branches', name: 'الفروع', icon: BuildingStorefrontIcon, section: 'hr', permission: 'branches_view' },
    
    // قسم التقارير والتحليلات
    { path: '/reports', name: 'التقارير', icon: ChartBarIcon, section: 'reports', permission: 'reports_view' },
    { path: '/expenses', name: 'المصروفات', icon: BanknotesIcon, section: 'reports', permission: 'expenses_view' },
    { path: '/advanced-reports', name: 'تقارير متقدمة', icon: ChartBarIcon, section: 'reports', permission: 'reports_advanced' },
    { path: '/activity-logs', name: 'سجل النشاطات', icon: ClockIcon, section: 'reports', permission: 'logs_view' },
    
    // قسم CRM
    { path: '/crm', name: 'CRM المتقدم', icon: UsersIcon, section: 'crm', permission: 'crm_view' },
    
    // قسم استيراد وتصدير المنتجات
    { path: '/export-import-products', name: 'استيراد المنتجات', icon: ArrowPathIcon, section: 'import', permission: 'data_export' },
    
    // قسم إدارة النظام (للمدير فقط)
    { path: '/users', name: 'المستخدمين', icon: UserGroupIcon, section: 'admin', permission: 'users_manage' },
    { path: '/roles', name: 'الأدوار والصلاحيات', icon: ShieldCheckIcon, section: 'admin', permission: 'roles_manage' },
    { path: '/export-import', name: 'تصدير واستيراد', icon: ArrowPathIcon, section: 'admin', permission: 'data_export' },
    { path: '/settings', name: 'الإعدادات', icon: Cog6ToothIcon, section: 'admin', permission: 'settings_view' },
    { path: '/settings/system', name: 'إعدادات النظام', icon: ServerIcon, section: 'admin', permission: 'settings_edit' },
  ]

  // فلترة العناصر حسب الصلاحيات
  const filteredMenuItems = menuItems.filter(item => {
    if (!item.permission) return true // عناصر بدون صلاحية تظهر للجميع
    if (isAdmin) return true // الأدمن يرى كل شيء
    return hasPermission(item.permission) // باقي المستخدمين حسب صلاحياتهم
  })

  // إضافة حساب المدير للمدير فقط
  const adminProfileItem = isAdmin ? [{ 
    path: '/admin-profile', 
    name: 'حساب المدير', 
    icon: UserCircleIcon, 
    section: 'admin',
    permission: null
  }] : []

  // تجميع العناصر حسب الأقسام
  const sections = {
    main: { title: 'الرئيسية', items: filteredMenuItems.filter(item => item.section === 'main') },
    sales: { title: 'المبيعات والعملاء', items: filteredMenuItems.filter(item => item.section === 'sales') },
    products: { title: 'المنتجات والمخزون', items: filteredMenuItems.filter(item => item.section === 'products') },
    purchases: { title: 'المشتريات', items: filteredMenuItems.filter(item => item.section === 'purchases') },
    operations: { title: 'العمليات', items: filteredMenuItems.filter(item => item.section === 'operations') },
    hr: { title: 'الموارد البشرية', items: filteredMenuItems.filter(item => item.section === 'hr') },
    reports: { title: 'التقارير', items: filteredMenuItems.filter(item => item.section === 'reports') },
    crm: { title: 'إدارة العملاء', items: filteredMenuItems.filter(item => item.section === 'crm') },
    import: { title: 'الاستيراد والتصدير', items: filteredMenuItems.filter(item => item.section === 'import') },
    admin: { title: 'إدارة النظام', items: [...filteredMenuItems.filter(item => item.section === 'admin'), ...adminProfileItem] }
  }

  return (
    <div className={`${open ? 'w-72' : 'w-20'} bg-white dark:bg-gray-800 transition-all duration-300 flex flex-col shadow-lg overflow-y-auto`}>
      <div className="p-4 border-b dark:border-gray-700">
        <h1 className={`${!open && 'hidden'} text-xl font-bold text-center text-blue-600`}>
          ☕ نظام المقهى
        </h1>
        <div className={`${open && 'hidden'} text-center text-2xl`}>
          ☕
        </div>
      </div>
      
      <nav className="flex-1 p-4">
        {Object.entries(sections).map(([key, section]) => (
          section.items.length > 0 && (
            <div key={key} className="mb-4">
              {open && (
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-2 mr-2">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center p-3 mb-1 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span className={`${!open && 'hidden'} mr-3 text-sm`}>{item.name}</span>
                </NavLink>
              ))}
            </div>
          )
        ))}
      </nav>
      <div className="mt-auto p-3 text-center text-xs text-gray-400 dark:text-gray-500 border-t dark:border-gray-700" title="رقم إصدار السيستم">
        {open ? `إصدار السيستم: ${APP_VERSION}` : APP_VERSION}
      </div>
    </div>
  )
}

export default Sidebar