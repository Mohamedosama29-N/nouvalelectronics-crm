// src/modules/purchases/Suppliers.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { getLiveSnapshot } from '../../services/liveCollections'

const Suppliers = () => {
  const { hasPermission } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    contactPerson: '',
    notes: ''
  })

  useEffect(() => {
    loadSuppliers()
  }, [])

  const loadSuppliers = async () => {
    setLoading(true)
    try {
      const snapshot = await getLiveSnapshot('suppliers')
      const suppliersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setSuppliers(suppliersData)
    } catch (error) {
      toast.error('فشل تحميل الموردين')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), { ...formData, updatedAt: new Date() })
        toast.success('تم تحديث المورد بنجاح')
      } else {
        await addDoc(collection(db, 'suppliers'), { ...formData, createdAt: new Date() })
        toast.success('تم إضافة المورد بنجاح')
      }
      setShowModal(false)
      setEditingSupplier(null)
      setFormData({ name: '', phone: '', email: '', address: '', contactPerson: '', notes: '' })
      loadSuppliers()
    } catch (error) {
      toast.error('حدث خطأ')
    }
  }

  const handleDelete = async (id) => {
    if (confirm('هل أنت متأكد من حذف هذا المورد؟')) {
      await deleteDoc(doc(db, 'suppliers', id))
      toast.success('تم الحذف بنجاح')
      loadSuppliers()
    }
  }

  const filteredSuppliers = suppliers.filter(s =>
    s.name?.includes(searchTerm) || s.phone?.includes(searchTerm) || s.email?.includes(searchTerm)
  )

  if (!hasPermission('purchases_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">🏭 الموردين</h1>
          <p className="text-gray-500 mt-1">إدارة قائمة الموردين والشركات</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <PlusIcon className="w-5 h-5" /> مورد جديد
        </button>
      </div>

      <div className="mb-6 relative">
        <MagnifyingGlassIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" placeholder="بحث بالاسم، الهاتف، أو البريد..." className="w-full pr-10 pl-4 py-2 border rounded-lg dark:bg-gray-800" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12">جاري التحميل...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">لا يوجد موردين</div>
        ) : (
          filteredSuppliers.map(supplier => (
            <div key={supplier.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold dark:text-white">{supplier.name}</h3>
                    <p className="text-gray-500">{supplier.phone}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingSupplier(supplier); setFormData(supplier); setShowModal(true) }} className="text-blue-500"><PencilIcon className="w-5 h-5" /></button>
                    <button onClick={() => handleDelete(supplier.id)} className="text-red-500"><TrashIcon className="w-5 h-5" /></button>
                  </div>
                </div>
                {supplier.email && <p className="text-sm text-gray-600 mt-1">📧 {supplier.email}</p>}
                {supplier.address && <p className="text-sm text-gray-600">📍 {supplier.address}</p>}
                {supplier.contactPerson && <p className="text-sm text-gray-600">👤 {supplier.contactPerson}</p>}
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">{editingSupplier ? 'تعديل مورد' : 'إضافة مورد جديد'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3">
                <input type="text" placeholder="اسم المورد" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                <input type="tel" placeholder="رقم الهاتف" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                <input type="email" placeholder="البريد الإلكتروني" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                <input type="text" placeholder="الشخص المسؤول" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.contactPerson} onChange={(e) => setFormData({...formData, contactPerson: e.target.value})} />
                <input type="text" placeholder="العنوان" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
                <textarea placeholder="ملاحظات" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" rows="2" value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg">حفظ</button>
                <button type="button" onClick={() => { setShowModal(false); setEditingSupplier(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Suppliers