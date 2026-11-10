// src/pages/Settings/Settings.jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { 
  GlobeAltIcon, 
  
  PrinterIcon, 
  UsersIcon, 
  BuildingStorefrontIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const Settings = () => {
  const { darkMode, toggleDarkMode } = useTheme()
  const { userData, hasPermission } = useAuth()
  const [language, setLanguage] = useState('ar')
  const [notifications, setNotifications] = useState(true)
  const [printerType, setPrinterType] = useState('80mm')
  const [backupSchedule, setBackupSchedule] = useState('daily')

  const handleSave = () => {
    toast.success('تم حفظ الإعدادات بنجاح')
  }

  const handleBackup = () => {
    toast.success('جاري إنشاء نسخة احتياطية...')
    setTimeout(() => {
      toast.success('تم إنشاء النسخة الاحتياطية بنجاح')
    }, 2000)
  }

  const handleRestore = () => {
    if (confirm('تحذير: استعادة النسخة الاحتياطية ستستبدل جميع البيانات. هل أنت متأكد؟')) {
      toast.success('تم استعادة النسخة الاحتياطية')
    }
  }

  return (
    <div className="p-6 rtl">
      <h1 className="text-3xl font-bold dark:text-white mb-8">⚙️ الإعدادات</h1>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* System Settings Link - إعدادات النظام */}
        <Link to="/settings/system">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer">
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <BuildingStorefrontIcon className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold dark:text-white">إعدادات النظام</h2>
                  <p className="text-sm text-gray-500">تعديل اسم المقهى، الشعار، وإعدادات الفواتير</p>
                </div>
              </div>
              <span className="text-gray-400 text-2xl">←</span>
            </div>
          </div>
        </Link>

        {/* Invoices Archive Link */}
        <Link to="/invoices">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer">
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <DocumentTextIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold dark:text-white">أرشيف الفواتير</h2>
                  <p className="text-sm text-gray-500">عرض وتصدير جميع الفواتير السابقة</p>
                </div>
              </div>
              <span className="text-gray-400 text-2xl">←</span>
            </div>
          </div>
        </Link>

        {/* Export Import Link - للمستخدمين المصرح لهم */}
        {hasPermission('data_export') && (
          <Link to="/export-import">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer">
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                    <ArrowPathIcon className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold dark:text-white">تصدير واستيراد</h2>
                    <p className="text-sm text-gray-500">إدارة البيانات، استيراد منتجات من Excel</p>
                  </div>
                </div>
                <span className="text-gray-400 text-2xl">←</span>
              </div>
            </div>
          </Link>
        )}

        {/* Appearance */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b dark:border-gray-700 flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <span className="text-xl">🎨</span>
            </div>
            <h2 className="text-xl font-bold dark:text-white">المظهر</h2>
          </div>
          <div className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium dark:text-white">الوضع الداكن</p>
                <p className="text-sm text-gray-500">تغيير مظهر التطبيق</p>
              </div>
              <button
                onClick={toggleDarkMode}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors bg-gray-300 dark:bg-blue-600"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b dark:border-gray-700 flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <GlobeAltIcon className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-xl font-bold dark:text-white">اللغة</h2>
          </div>
          <div className="p-6">
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="ar"
                  checked={language === 'ar'}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="dark:text-white">العربية</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="en"
                  checked={language === 'en'}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="dark:text-white">English</span>
              </label>
            </div>
          </div>
        </div>

        {/* Printer Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b dark:border-gray-700 flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <PrinterIcon className="w-6 h-6 text-purple-600" />
            </div>
            <h2 className="text-xl font-bold dark:text-white">إعدادات الطباعة</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">نوع الفاتورة</label>
                <select
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={printerType}
                  onChange={(e) => setPrinterType(e.target.value)}
                >
                  <option value="58mm">فاتورة حرارية 58mm</option>
                  <option value="76mm">فاتورة حرارية 76mm</option>
                  <option value="80mm">فاتورة حرارية 80mm</option>
                  <option value="a4">فاتورة PDF A4</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={(e) => setNotifications(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="dark:text-white">إرسال الفاتورة واتساب للعميل</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Users Management Link - فقط للمدير */}
        {userData?.role === 'admin' && (
          <Link to="/users">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer">
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                    <UsersIcon className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold dark:text-white">إدارة المستخدمين</h2>
                    <p className="text-sm text-gray-500">إضافة وتعديل صلاحيات المستخدمين</p>
                  </div>
                </div>
                <span className="text-gray-400 text-2xl">←</span>
              </div>
            </div>
          </Link>
        )}

        {/* Backup */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b dark:border-gray-700 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <span className="text-xl">💾</span>
            </div>
            <h2 className="text-xl font-bold dark:text-white">النسخ الاحتياطي</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">موعد النسخ التلقائي</label>
                <select
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={backupSchedule}
                  onChange={(e) => setBackupSchedule(e.target.value)}
                >
                  <option value="daily">يومياً (الساعة 2 صباحاً)</option>
                  <option value="weekly">أسبوعياً (يوم الأحد)</option>
                  <option value="monthly">شهرياً (أول كل شهر)</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleBackup}
                  className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
                >
                  إنشاء نسخة فورية
                </button>
                <button
                  onClick={handleRestore}
                  className="flex-1 bg-yellow-500 text-white py-2 rounded-lg hover:bg-yellow-600"
                >
                  استعادة نسخة
                </button>
              </div>
              <p className="text-xs text-gray-500 text-center">
                يتم الاحتفاظ بآخر 7 أيام، آخر 30 يوم، وآخر 12 شهر
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-colors"
        >
          حفظ جميع الإعدادات
        </button>
      </div>
    </div>
  )
}

export default Settings