// src/pages/Customers/Customers.jsx
import { useState, useEffect } from 'react'
import { 
  UserPlusIcon, 
  MagnifyingGlassIcon, 
  GiftIcon, 
  XMarkIcon,
  PencilIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { db } from '../../services/firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { useAuth } from '../../contexts/AuthContext'
import { getLiveSnapshot } from '../../services/liveCollections'

const Customers = () => {
  const { hasPermission } = useAuth()
  const canAdd = hasPermission('customers_add')
  const canEdit = hasPermission('customers_edit')
  const canDelete = hasPermission('customers_delete')
  const [customers, setCustomers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '' })
  const [editFormData, setEditFormData] = useState({ name: '', phone: '', email: '', address: '' })

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getLiveSnapshot('customers')
      const customersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setCustomers(customersData)
    } catch (error) {
      logger.error('Error loading customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!hasPermission('customers_add')) { toast.error('ليس لديك صلاحية لهذا الإجراء'); return }
    e.preventDefault()
    try {
      await addDoc(collection(db, 'customers'), {
        ...formData,
        points: 0,
        totalSpent: 0,
        orders: 0,
        lastVisit: new Date(),
        createdAt: new Date()
      })
      toast.success('تم إضافة العميل بنجاح')
      setShowModal(false)
      setFormData({ name: '', phone: '', email: '', address: '' })
      loadCustomers()
    } catch (error) {
      toast.error('حدث خطأ')
    }
  }

  const handleUpdateCustomer = async (e) => {
    e?.preventDefault?.()
    if (!hasPermission('customers_edit')) { toast.error('ليس لديك صلاحية لهذا الإجراء'); return }
    e.preventDefault()
    try {
      const customerRef = doc(db, 'customers', selectedCustomer.id)
      await updateDoc(customerRef, {
        ...editFormData,
        updatedAt: new Date()
      })
      toast.success('تم تحديث بيانات العميل بنجاح')
      setShowEditModal(false)
      setSelectedCustomer({ ...selectedCustomer, ...editFormData })
      loadCustomers()
    } catch (error) {
      toast.error('فشل تحديث البيانات')
    }
  }

  const handleDeleteCustomer = async (customer) => {
    if (!hasPermission('customers_delete')) { toast.error('ليس لديك صلاحية لهذا الإجراء'); return }
    if (!confirm(`هل أنت متأكد من حذف العميل "${customer.name}" نهائياً؟`)) return
    
    try {
      await deleteDoc(doc(db, 'customers', customer.id))
      toast.success('تم حذف العميل بنجاح')
      setShowProfile(false)
      loadCustomers()
    } catch (error) {
      toast.error('فشل حذف العميل')
    }
  }

  const filteredCustomers = customers.filter(c =>
    c.name?.includes(searchTerm) || c.phone?.includes(searchTerm) || c.email?.includes(searchTerm)
  )

  const CustomerProfile = ({ customer, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold dark:text-white">ملف العميل</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        
        <div className="space-y-4">
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-3xl">👤</div>
            <h3 className="text-xl font-bold mt-2 dark:text-white">{customer.name}</h3>
            <p className="text-gray-500">{customer.phone}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div><p className="text-sm text-gray-500">نقاط الولاء</p><p className="text-2xl font-bold text-blue-600">{customer.points || 0}</p></div>
            <div><p className="text-sm text-gray-500">عدد الطلبات</p><p className="text-2xl font-bold text-green-600">{customer.orders || 0}</p></div>
            <div><p className="text-sm text-gray-500">إجمالي المشتريات</p><p className="text-2xl font-bold text-purple-600">{customer.totalSpent || 0} ج.م</p></div>
            <div><p className="text-sm text-gray-500">آخر زيارة</p><p className="text-sm font-semibold">{customer.lastVisit ? new Date(customer.lastVisit.toDate()).toLocaleDateString('ar-EG') : '—'}</p></div>
          </div>
          
          {customer.email && (<div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><p className="text-sm text-gray-500">البريد الإلكتروني</p><p className="font-medium">{customer.email}</p></div>)}
          {customer.address && (<div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><p className="text-sm text-gray-500">العنوان</p><p className="font-medium">{customer.address}</p></div>)}
          
          {customer.points >= 20 && (<div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-center gap-2"><GiftIcon className="w-5 h-5 text-yellow-600" /><p className="text-sm text-yellow-800 dark:text-yellow-400">مؤهل للحصول على مكافأة!</p></div>)}
          
          <div className="flex gap-3">
            {canEdit && <button onClick={() => { setEditFormData(customer); setShowEditModal(true); onClose() }} className="flex-1 py-2 bg-blue-500 text-white rounded-lg flex items-center justify-center gap-2">
              <PencilIcon className="w-4 h-4" /> تعديل
            </button>}
            {canDelete && <button onClick={() => handleDeleteCustomer(customer)} className="flex-1 py-2 bg-red-500 text-white rounded-lg flex items-center justify-center gap-2">
              <TrashIcon className="w-4 h-4" /> حذف
            </button>}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold dark:text-white">👥 العملاء</h1>
        {canAdd && (
          <button onClick={() => setShowModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <UserPlusIcon className="w-5 h-5" /> عميل جديد
          </button>
        )}
      </div>

      <div className="mb-6 relative">
        <MagnifyingGlassIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" placeholder="بحث بالاسم أو رقم الهاتف..." className="w-full pr-10 pl-4 py-2 border rounded-lg dark:bg-gray-800" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (<div className="col-span-full text-center py-12">جاري التحميل...</div>
        ) : filteredCustomers.length === 0 ? (<div className="col-span-full text-center py-12 text-gray-500">لا يوجد عملاء</div>
        ) : (
          filteredCustomers.map(customer => (
            <div key={customer.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-shadow" onClick={() => { setSelectedCustomer(customer); setShowProfile(true) }}>
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div><h3 className="text-xl font-bold dark:text-white">{customer.name}</h3><p className="text-gray-500">{customer.phone}</p></div>
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-800">برونزي</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-2xl font-bold text-blue-600">{customer.points || 0}</p><p className="text-sm text-gray-500">نقطة</p></div>
                  <div><p className="text-2xl font-bold text-green-600">{customer.totalSpent || 0}</p><p className="text-sm text-gray-500">ج.م</p></div>
                  <div><p className="text-2xl font-bold text-purple-600">{customer.orders || 0}</p><p className="text-sm text-gray-500">طلب</p></div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">إضافة عميل جديد</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3">
                <input type="text" placeholder="الاسم الكامل" className="w-full px-4 py-2 border rounded-lg" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                <input type="tel" placeholder="رقم الهاتف" className="w-full px-4 py-2 border rounded-lg" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required />
                <input type="email" placeholder="البريد الإلكتروني (اختياري)" className="w-full px-4 py-2 border rounded-lg" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                <input type="text" placeholder="العنوان (اختياري)" className="w-full px-4 py-2 border rounded-lg" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg">إضافة</button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEditModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">تعديل بيانات العميل</h2>
            <form onSubmit={handleUpdateCustomer}>
              <div className="space-y-3">
                <input type="text" placeholder="الاسم الكامل" className="w-full px-4 py-2 border rounded-lg" value={editFormData.name} onChange={(e) => setEditFormData({...editFormData, name: e.target.value})} required />
                <input type="tel" placeholder="رقم الهاتف" className="w-full px-4 py-2 border rounded-lg" value={editFormData.phone} onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})} required />
                <input type="email" placeholder="البريد الإلكتروني" className="w-full px-4 py-2 border rounded-lg" value={editFormData.email} onChange={(e) => setEditFormData({...editFormData, email: e.target.value})} />
                <input type="text" placeholder="العنوان" className="w-full px-4 py-2 border rounded-lg" value={editFormData.address} onChange={(e) => setEditFormData({...editFormData, address: e.target.value})} />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg">حفظ التعديلات</button>
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProfile && selectedCustomer && <CustomerProfile customer={selectedCustomer} onClose={() => { setShowProfile(false); setSelectedCustomer(null) }} />}
    </div>
  )
}

export default Customers