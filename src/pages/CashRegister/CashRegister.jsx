// src/pages/CashRegister/CashRegister.jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  BanknotesIcon,
  LockClosedIcon,
  LockOpenIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import {
  getActiveShift,
  openShift,
  closeShift,
  getShiftSalesSummary,
  getRecentShifts
} from '../../services/shiftService'
import { logActivity } from '../../services/auditLog'
import { logger } from '../../utils/logger'

const CashRegister = () => {
  const { userData, hasPermission } = useAuth()
  const canManage = hasPermission('shifts_manage') || userData?.role === 'admin'

  const [activeShift, setActiveShift] = useState(null)
  const [liveSummary, setLiveSummary] = useState(null)
  const [recentShifts, setRecentShifts] = useState([])
  const [loading, setLoading] = useState(true)

  const [openingCash, setOpeningCash] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [showCloseForm, setShowCloseForm] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const shift = await getActiveShift()
      setActiveShift(shift)
      if (shift) {
        const summary = await getShiftSalesSummary(shift)
        setLiveSummary(summary)
      }
      const recent = await getRecentShifts()
      setRecentShifts(recent)
    } catch (error) {
      logger.error('Error loading shift data:', error)
      toast.error('فشل تحميل بيانات الشيفت')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenShift = async () => {
    if (openingCash === '' || Number(openingCash) < 0) {
      toast.error('أدخل رصيد ابتدائي صحيح للدرج')
      return
    }
    try {
      const shift = await openShift({
        openingCash: Number(openingCash),
        userId: userData?.uid,
        userName: userData?.name,
        branch: userData?.branch || null
      })
      await logActivity('فتح شيفت', userData?.name, { openingCash: Number(openingCash) })
      toast.success('✅ تم فتح الشيفت')
      setOpeningCash('')
      setActiveShift(shift)
      loadData()
    } catch (error) {
      toast.error(error.message || 'فشل فتح الشيفت')
    }
  }

  const handleCloseShift = async () => {
    if (countedCash === '' || Number(countedCash) < 0) {
      toast.error('أدخل المبلغ المعدود في الدرج')
      return
    }
    try {
      const result = await closeShift(activeShift.id, {
        countedCash: Number(countedCash),
        userId: userData?.uid,
        userName: userData?.name,
        notes: closeNotes
      })
      await logActivity('قفل شيفت', userData?.name, {
        countedCash: Number(countedCash),
        expectedCash: result.expectedCash,
        difference: result.difference
      })
      toast.success(
        result.difference === 0
          ? '✅ تم قفل الشيفت - الدرج مطابق تماماً'
          : result.difference > 0
          ? `تم قفل الشيفت - زيادة ${result.difference.toFixed(2)} ج.م`
          : `تم قفل الشيفت - عجز ${Math.abs(result.difference).toFixed(2)} ج.م`
      )
      setShowCloseForm(false)
      setCountedCash('')
      setCloseNotes('')
      setActiveShift(null)
      setLiveSummary(null)
      loadData()
    } catch (error) {
      toast.error(error.message || 'فشل قفل الشيفت')
    }
  }

  if (!hasPermission('shifts_view') && userData?.role !== 'admin') {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold dark:text-white mb-6 flex items-center gap-2">
        <BanknotesIcon className="w-8 h-8 text-green-600" /> درج الكاش / الشيفت
      </h1>

      {loading ? (
        <div className="text-center py-12 text-gray-500">جاري التحميل...</div>
      ) : activeShift ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600 font-bold">
              <LockOpenIcon className="w-6 h-6" /> شيفت مفتوح حالياً
            </div>
            <span className="text-sm text-gray-500">
              فتحه: {activeShift.openedByName} • {activeShift.openedAt?.toDate?.().toLocaleString('ar-EG') || ''}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
              <p className="text-xs text-gray-500">رصيد ابتدائي</p>
              <p className="font-bold text-lg">{Number(activeShift.openingCash).toFixed(2)} ج.م</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
              <p className="text-xs text-gray-500">عدد الفواتير</p>
              <p className="font-bold text-lg">{liveSummary?.invoiceCount ?? 0}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
              <p className="text-xs text-gray-500">مبيعات كاش</p>
              <p className="font-bold text-lg text-green-600">{(liveSummary?.cashSales ?? 0).toFixed(2)} ج.م</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
              <p className="text-xs text-gray-500">إجمالي المبيعات</p>
              <p className="font-bold text-lg">{(liveSummary?.totalSales ?? 0).toFixed(2)} ج.م</p>
            </div>
          </div>

          {canManage && (
            !showCloseForm ? (
              <button
                onClick={() => setShowCloseForm(true)}
                className="w-full py-3 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 flex items-center justify-center gap-2"
              >
                <LockClosedIcon className="w-5 h-5" /> قفل الشيفت
              </button>
            ) : (
              <div className="space-y-3 border-t dark:border-gray-700 pt-4">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">المبلغ الفعلي المعدود في الدرج</label>
                  <input
                    type="number"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
                    placeholder="مثال: 1250"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">ملاحظات (اختياري)</label>
                  <input
                    type="text"
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCloseShift} className="flex-1 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600">
                    تأكيد القفل
                  </button>
                  <button onClick={() => setShowCloseForm(false)} className="flex-1 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500">
                    إلغاء
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-4">
          <div className="flex items-center gap-2 text-gray-500 font-bold">
            <LockClosedIcon className="w-6 h-6" /> مفيش شيفت مفتوح حالياً
          </div>
          {canManage ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">الرصيد الابتدائي في الدرج</label>
                <input
                  type="number"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="مثال: 500"
                />
              </div>
              <button onClick={handleOpenShift} className="w-full py-3 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 flex items-center justify-center gap-2">
                <LockOpenIcon className="w-5 h-5" /> فتح شيفت جديد
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-500">لازم شيفت يتفتح الأول قبل ما تقدر تستخدم نقطة البيع.</p>
          )}
        </div>
      )}

      {recentShifts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold dark:text-white mb-3 flex items-center gap-2">
            <ClockIcon className="w-5 h-5" /> آخر الشيفتات
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-right">الفتح</th>
                  <th className="px-4 py-2 text-right">القفل</th>
                  <th className="px-4 py-2 text-right">المبيعات</th>
                  <th className="px-4 py-2 text-right">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {recentShifts.map((s) => (
                  <tr key={s.id} className="border-t dark:border-gray-700">
                    <td className="px-4 py-2">{s.openedByName} • {s.openedAt?.toDate?.().toLocaleString('ar-EG') || ''}</td>
                    <td className="px-4 py-2">{s.status === 'open' ? <span className="text-green-600 font-bold">مفتوح</span> : (s.closedAt?.toDate?.().toLocaleString('ar-EG') || '—')}</td>
                    <td className="px-4 py-2">{s.totalSales != null ? `${s.totalSales.toFixed(2)} ج.م` : '—'}</td>
                    <td className="px-4 py-2">
                      {s.difference != null ? (
                        <span className={s.difference === 0 ? 'text-green-600' : s.difference > 0 ? 'text-blue-600' : 'text-red-600'}>
                          {s.difference > 0 ? '+' : ''}{s.difference.toFixed(2)} ج.م
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default CashRegister
