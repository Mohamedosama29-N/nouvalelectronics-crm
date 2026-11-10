// src/pages/Settings/InvoiceSettings.jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getCurrentInvoiceNumber, resetInvoiceCounter, setInvoiceCounter, repairOfflineInvoiceNumbers } from '../../services/invoiceNumberService'
import { ArrowPathIcon, DocumentTextIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const InvoiceSettings = () => {
  const { hasPermission } = useAuth()
  const [currentNumber, setCurrentNumber] = useState(0)
  const [newStartNumber, setNewStartNumber] = useState(1)
  const [loading, setLoading] = useState(false)
  const [repairing, setRepairing] = useState(false)

  useEffect(() => {
    loadCurrentNumber()
  }, [])

  const loadCurrentNumber = async () => {
    const result = await getCurrentInvoiceNumber()
    setCurrentNumber(result.number)
  }

  const handleReset = async () => {
    if (confirm('⚠️ تحذير: إعادة تعيين الترقيم سيجعل الفاتورة القادمة رقم 1. هل أنت متأكد؟')) {
      setLoading(true)
      const result = await resetInvoiceCounter()
      if (result.success) {
        toast.success('تم إعادة تعيين ترقيم الفواتير')
        loadCurrentNumber()
      } else {
        toast.error('فشل إعادة التعيين')
      }
      setLoading(false)
    }
  }

  const handleSetStart = async () => {
    if (newStartNumber < 1) {
      toast.error('الرجاء إدخال رقم صحيح')
      return
    }
    if (confirm(`⚠️ تحذير: سيبدأ الترقيم من الرقم ${newStartNumber}. هل أنت متأكد؟`)) {
      setLoading(true)
      const result = await setInvoiceCounter(newStartNumber)
      if (result.success) {
        toast.success(`تم تعيين بداية الترقيم إلى ${newStartNumber}`)
        loadCurrentNumber()
      } else {
        toast.error('فشل تعيين البداية')
      }
      setLoading(false)
    }
  }

  const handleRepairOffline = async () => {
    if (!confirm('هيتم إعطاء كل الفواتير اللي طلعت برقم "أوفلاين" أرقام تسلسلية عادية جديدة، مرتبة زمنياً زي ما اتباعت بالظبط. متأكد؟')) return
    setRepairing(true)
    try {
      const result = await repairOfflineInvoiceNumbers()
      if (result.totalFound === 0) {
        toast.success('مفيش فواتير أوفلاين محتاجة إصلاح 👍')
      } else {
        toast.success(`تم إصلاح ${result.fixedCount} من ${result.totalFound} فاتورة`)
      }
      loadCurrentNumber()
    } catch (error) {
      toast.error('فشل إصلاح الترقيم')
    } finally {
      setRepairing(false)
    }
  }

  if (!hasPermission('settings_edit')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="text-center mb-6">
            <DocumentTextIcon className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold dark:text-white">إعدادات ترقيم الفواتير</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">التحكم في تسلسل أرقام الفواتير</p>
          </div>

          <div className="border-t dark:border-gray-700 pt-6 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">رقم الفاتورة الحالي</p>
              <p className="text-4xl font-bold text-blue-600">{currentNumber}</p>
              <p className="text-xs text-gray-500 mt-1">الفاتورة القادمة ستكون رقم {currentNumber + 1}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-bold mb-2 dark:text-white">🔄 إعادة التعيين</h3>
              <p className="text-sm text-gray-500 mb-3">إعادة تعيين الترقيم ليبدأ من الرقم 1</p>
              <button
                onClick={handleReset}
                disabled={loading}
                className="w-full py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ArrowPathIcon className="w-5 h-5" />
                إعادة تعيين الترقيم
              </button>
            </div>

            <div className="border rounded-lg p-4">
              <h3 className="font-bold mb-2 dark:text-white">🎯 تعيين رقم بداية مخصص</h3>
              <p className="text-sm text-gray-500 mb-3">تعيين رقم بداية مخصص للفواتير</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  value={newStartNumber}
                  onChange={(e) => setNewStartNumber(parseInt(e.target.value) || 1)}
                />
                <button
                  onClick={handleSetStart}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  تعيين
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-400 text-center">
              ⚠️ ملاحظة: تغيير ترقيم الفواتير يؤثر على الفواتير الجديدة فقط، الفواتير السابقة تحتفظ بأرقامها
            </p>
          </div>

          <div className="mt-4 border-2 border-orange-200 dark:border-orange-900 rounded-lg p-4">
            <h3 className="font-bold mb-1 dark:text-white flex items-center gap-2">
              <WrenchScrewdriverIcon className="w-5 h-5 text-orange-500" /> إصلاح الفواتير "أوفلاين"
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              لو فيه فواتير في الأرشيف رقمها ظاهر بصيغة "OFFLINE-..." بدل رقم عادي (بيحصل ده لو الجهاز فقد
              الاتصال بالسيرفر لحظة تسجيل البيع)، الزرار ده بيديها أرقام تسلسلية عادية مرتبة زمنياً زي باقي
              الفواتير.
            </p>
            <button
              onClick={handleRepairOffline}
              disabled={repairing}
              className="w-full py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <WrenchScrewdriverIcon className="w-5 h-5" />
              {repairing ? 'جاري الإصلاح...' : 'إصلاح ترقيم الفواتير الأوفلاين'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InvoiceSettings