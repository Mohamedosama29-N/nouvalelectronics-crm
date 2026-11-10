// src/modules/data/ExportImport.jsx

import { useAuth } from '../../contexts/AuthContext'
import { Link } from 'react-router-dom'
import { 
  
  
  CubeIcon,
  UsersIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'

const ExportImport = () => {
  const { hasPermission } = useAuth()

  const modules = [
    {
      title: 'المنتجات',
      icon: CubeIcon,
      description: 'استيراد وتصدير المنتجات دفعة واحدة',
      path: '/export-import-products',
      color: 'bg-blue-500'
    },
    {
      title: 'العملاء',
      icon: UsersIcon,
      description: 'استيراد وتصدير بيانات العملاء',
      path: '/export-import-customers',
      color: 'bg-green-500',
      comingSoon: true
    },
    {
      title: 'الفواتير',
      icon: DocumentTextIcon,
      description: 'تصدير الفواتير إلى Excel/PDF',
      path: '/export-import-invoices',
      color: 'bg-purple-500',
      comingSoon: true
    }
  ]

  if (!hasPermission('data_export')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold dark:text-white mb-2">📁 تصدير واستيراد البيانات</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">إدارة البيانات بشكل شامل</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map((module) => (
            <Link
              key={module.title}
              to={module.comingSoon ? '#' : module.path}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all ${!module.comingSoon && 'cursor-pointer'}`}
              onClick={(e) => module.comingSoon && e.preventDefault()}
            >
              <div className={`p-4 ${module.color}`}>
                <module.icon className="w-10 h-10 text-white" />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold mb-2 dark:text-white">{module.title}</h3>
                <p className="text-gray-500 text-sm mb-3">{module.description}</p>
                {module.comingSoon ? (
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">قريباً</span>
                ) : (
                  <span className="text-blue-500 text-sm">استيراد/تصدير →</span>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* تعليمات الاستخدام */}
        <div className="mt-8 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-6">
          <h3 className="font-bold mb-3 flex items-center gap-2">📖 تعليمات استيراد المنتجات</h3>
          <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>1. قم بتحميل قالب Excel من خلال الضغط على "تحميل القالب"</li>
            <li>2. املأ البيانات في القالب حسب التنسيق المحدد</li>
            <li>3. الأعمدة المطلوبة: الاسم، السعر (باقي الأعمدة اختيارية)</li>
            <li>4. بعد ملء البيانات، اضغط على "رفع ملف Excel" واختر الملف</li>
            <li>5. راجع البيانات في شاشة المعاينة ثم اضغط "تأكيد الاستيراد"</li>
            <li>6. سيتم إضافة المنتجات إلى قاعدة البيانات تلقائياً</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

export default ExportImport