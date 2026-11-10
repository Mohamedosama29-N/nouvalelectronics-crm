// src/modules/branches/BranchesManager.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { PlusIcon, PencilIcon, TrashIcon, MapPinIcon, PhoneIcon, UserIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { getLiveSnapshot } from '../../services/liveCollections'

const BranchesManager = () => {
  const { hasPermission } = useAuth()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingBranch, setEditingBranch] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    manager: '',
    openingHours: { from: '09:00', to: '22:00' },
    isActive: true
  })

  useEffect(() => {
    loadBranches()
  }, [])

  const loadBranches = async () => {
    setLoading(true)
    try {
      const snapshot = await getLiveSnapshot('branches')
      const branchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setBranches(branchesData)
    } catch (error) {
      toast.error('فشل تحميل الفروع')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingBranch) {
        await updateDoc(doc(db, 'branches', editingBranch.id), { ...formData, updatedAt: new Date() })
        toast.success('تم تحديث الفرع بنجاح')
      } else {
        await addDoc(collection(db, 'branches'), { ...formData, createdAt: new Date() })
        toast.success('تم إضافة الفرع بنجاح')
      }
      setShowModal(false)
      setEditingBranch(null)
      setFormData({ name: '', address: '', phone: '', email: '', manager: '', openingHours: { from: '09:00', to: '22:00' }, isActive: true })
      loadBranches()
    } catch (error) {
      toast.error('حدث خطأ')
    }
  }

  const handleDelete = async (id) => {
    if (confirm('هل أنت متأكد من حذف هذا الفرع؟')) {
      await deleteDoc(doc(db, 'branches', id))
      toast.success('تم الحذف بنجاح')
      loadBranches()
    }
  }

  if (!hasPermission('branches_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">🏢 الفروع</h1>
          <p className="text-gray-500 mt-1">إدارة فروع المقهى ومواقع العمل</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <PlusIcon className="w-5 h-5" /> فرع جديد
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12">جاري التحميل...</div>
        ) : branches.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">لا توجد فروع</div>
        ) : (
          branches.map(branch => (
            <div key={branch.id} className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border-t-4 ${branch.isActive ? 'border-green-500' : 'border-red-500'}`}>
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold dark:text-white">{branch.name}</h3>
                    <span className={`text-xs px-2 py-1 rounded ${branch.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {branch.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingBranch(branch); setFormData(branch); setShowModal(true) }} className="text-blue-500"><PencilIcon className="w-5 h-5" /></button>
                    <button onClick={() => handleDelete(branch.id)} className="text-red-500"><TrashIcon className="w-5 h-5" /></button>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm">
                  {branch.address && <p className="flex items-center gap-2"><MapPinIcon className="w-4 h-4 text-gray-400" /> {branch.address}</p>}
                  {branch.phone && <p className="flex items-center gap-2"><PhoneIcon className="w-4 h-4 text-gray-400" /> {branch.phone}</p>}
                  {branch.email && <p className="flex items-center gap-2">📧 {branch.email}</p>}
                  {branch.manager && <p className="flex items-center gap-2"><UserIcon className="w-4 h-4 text-gray-400" /> {branch.manager}</p>}
                  <p className="flex items-center gap-2">🕐 {branch.openingHours?.from} - {branch.openingHours?.to}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">{editingBranch ? 'تعديل فرع' : 'إضافة فرع جديد'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3">
                <input type="text" placeholder="اسم الفرع" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                <input type="text" placeholder="العنوان" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
                <input type="tel" placeholder="رقم الهاتف" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                <input type="email" placeholder="البريد الإلكتروني" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                <input type="text" placeholder="اسم المدير" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.manager} onChange={(e) => setFormData({...formData, manager: e.target.value})} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="time" placeholder="من" className="px-4 py-2 border rounded-lg" value={formData.openingHours?.from} onChange={(e) => setFormData({...formData, openingHours: { ...formData.openingHours, from: e.target.value }})} />
                  <input type="time" placeholder="إلى" className="px-4 py-2 border rounded-lg" value={formData.openingHours?.to} onChange={(e) => setFormData({...formData, openingHours: { ...formData.openingHours, to: e.target.value }})} />
                </div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({...formData, isActive: e.target.checked})} /> فرع نشط</label>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg">حفظ</button>
                <button type="button" onClick={() => { setShowModal(false); setEditingBranch(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default BranchesManager