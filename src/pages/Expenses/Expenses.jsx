// src/pages/Expenses/Expenses.jsx
import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon, BanknotesIcon } from '@heroicons/react/24/outline'
import { db } from '../../services/firebase'
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { useSystem } from '../../contexts/SystemContext'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'

const CATEGORIES = [
  { id: 'rent', label: '🏠 إيجار' },
  { id: 'salaries', label: '👥 رواتب' },
  { id: 'supplies', label: '📦 مستلزمات ومشتريات' },
  { id: 'bills', label: '💡 فواتير (كهرباء/مياه/نت)' },
  { id: 'maintenance', label: '🔧 صيانة' },
  { id: 'marketing', label: '📢 تسويق' },
  { id: 'other', label: '🧾 أخرى' }
]

const todayStr = () => new Date().toISOString().split('T')[0]

// التاريخ ممكن يكون نص (yyyy-mm-dd) أو Timestamp من Firestore (بيانات قديمة/مستوردة)
// عرض الـ Timestamp مباشرة في الصفحة كان بيكسرها.
const toDateStr = (v) => {
  if (!v) return ''
  if (typeof v === 'string') return v
  const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v)
  return isNaN(d) ? '' : d.toISOString().split('T')[0]
}

const Expenses = () => {
  const { userData, hasPermission } = useAuth()
  const { systemSettings } = useSystem()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterRange, setFilterRange] = useState('month') // today | month | all
  const [formData, setFormData] = useState({
    date: todayStr(),
    category: 'other',
    amount: '',
    note: ''
  })

  useEffect(() => {
    loadExpenses()
  }, [])

  const loadExpenses = async () => {
    setLoading(true)
    try {
      const q = query(collection(db, 'expenses'), orderBy('date', 'desc'))
      const snap = await getDocs(q)
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (error) {
      logger.error('Error loading expenses:', error)
      toast.error('فشل تحميل المصروفات')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const amount = Number(formData.amount)
    if (!amount || amount <= 0) {
      toast.error('أدخل مبلغ صحيح')
      return
    }
    try {
      await addDoc(collection(db, 'expenses'), {
        date: formData.date,
        category: formData.category,
        amount,
        note: formData.note || '',
        createdBy: userData?.name || 'مستخدم',
        createdAt: new Date()
      })
      toast.success('تم تسجيل المصروف')
      setShowModal(false)
      setFormData({ date: todayStr(), category: 'other', amount: '', note: '' })
      loadExpenses()
    } catch (error) {
      logger.error('Error adding expense:', error)
      toast.error('فشل تسجيل المصروف')
    }
  }

  const handleDelete = async (id) => {
    if (!hasPermission('expenses_delete')) {
      toast.error('ليس لديك صلاحية حذف المصروفات')
      return
    }
    if (!window.confirm('متأكد إنك عايز تحذف المصروف ده؟')) return
    try {
      await deleteDoc(doc(db, 'expenses', id))
      toast.success('تم الحذف')
      loadExpenses()
    } catch (error) {
      logger.error('Error deleting expense:', error)
      toast.error('فشل الحذف')
    }
  }

  const filteredExpenses = expenses.filter(exp => {
    if (filterRange === 'all') return true
    const expDate = new Date(toDateStr(exp.date))
    const now = new Date()
    if (filterRange === 'today') {
      return toDateStr(exp.date) === todayStr()
    }
    if (filterRange === 'month') {
      return expDate.getFullYear() === now.getFullYear() && expDate.getMonth() === now.getMonth()
    }
    return true
  })

  const totalFiltered = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const currency = systemSettings?.currency || 'ج.م'

  const categoryLabel = (id) => CATEGORIES.find(c => c.id === id)?.label || id

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <BanknotesIcon className="w-8 h-8 text-red-500" /> المصروفات
        </h1>
        <button
          onClick={() => setShowModal(true)}
          disabled={!hasPermission('expenses_add')}
          className="flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg shadow"
        >
          <PlusIcon className="w-5 h-5" /> تسجيل مصروف
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-xl shadow-lg p-5">
          <p className="text-red-100 text-sm">إجمالي المصروفات ({filterRange === 'today' ? 'اليوم' : filterRange === 'month' ? 'الشهر' : 'الكل'})</p>
          <p className="text-3xl font-bold mt-1">{totalFiltered.toFixed(2)} {currency}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5">
          <p className="text-gray-500 text-sm">عدد المصروفات</p>
          <p className="text-3xl font-bold mt-1 dark:text-white">{filteredExpenses.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 flex items-center gap-2">
          {['today', 'month', 'all'].map(r => (
            <button
              key={r}
              onClick={() => setFilterRange(r)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold ${filterRange === r ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-300'}`}
            >
              {r === 'today' ? 'اليوم' : r === 'month' ? 'الشهر' : 'الكل'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-right">التاريخ</th>
                <th className="px-6 py-3 text-right">التصنيف</th>
                <th className="px-6 py-3 text-right">المبلغ</th>
                <th className="px-6 py-3 text-right">ملاحظة</th>
                <th className="px-6 py-3 text-right">بواسطة</th>
                <th className="px-6 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center py-8">جاري التحميل...</td></tr>
              ) : filteredExpenses.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-8 text-gray-500">لا توجد مصروفات في هذه الفترة</td></tr>
              ) : (
                filteredExpenses.map(exp => (
                  <tr key={exp.id} className="border-t dark:border-gray-700">
                    <td className="px-6 py-4 dark:text-gray-300">{toDateStr(exp.date)}</td>
                    <td className="px-6 py-4 dark:text-gray-300">{categoryLabel(exp.category)}</td>
                    <td className="px-6 py-4 font-bold text-red-600">{Number(exp.amount).toFixed(2)} {currency}</td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{exp.note || '—'}</td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-sm">{exp.createdBy || '—'}</td>
                    <td className="px-6 py-4">
                      {hasPermission('expenses_delete') && (
                        <button onClick={() => handleDelete(exp.id)} className="text-red-500"><TrashIcon className="w-5 h-5" /></button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">تسجيل مصروف جديد</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm mb-1 dark:text-gray-300">التاريخ</label>
                  <input type="date" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:text-white" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm mb-1 dark:text-gray-300">التصنيف</label>
                  <select className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:text-white" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1 dark:text-gray-300">المبلغ ({currency})</label>
                  <input type="number" step="0.01" placeholder="0.00" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:text-white" value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm mb-1 dark:text-gray-300">ملاحظة (اختياري)</label>
                  <input type="text" placeholder="مثال: فاتورة كهرباء شهر 8" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:text-white" value={formData.note} onChange={(e) => setFormData({...formData, note: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg">حفظ</button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Expenses
