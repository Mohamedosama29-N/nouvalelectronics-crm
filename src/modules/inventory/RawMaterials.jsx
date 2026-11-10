// src/modules/inventory/RawMaterials.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { PlusIcon, PencilIcon, TrashIcon, PlusCircleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { getLiveSnapshot } from '../../services/liveCollections'

const RawMaterials = () => {
  const { hasPermission } = useAuth()
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showQuantityModal, setShowQuantityModal] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState(null)
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [quantityToAdd, setQuantityToAdd] = useState(0)
  const [formData, setFormData] = useState({
    name: '',
    unit: 'piece',
    quantity: 0,
    reorderPoint: 10,
    cost: 0,
    supplier: ''
  })

  useEffect(() => {
    loadMaterials()
  }, [])

  const loadMaterials = async () => {
    setLoading(true)
    try {
      const snapshot = await getLiveSnapshot('rawMaterials')
      const materialsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setMaterials(materialsData)
    } catch (error) {
      toast.error('فشل تحميل المواد الخام')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingMaterial) {
        await updateDoc(doc(db, 'rawMaterials', editingMaterial.id), { ...formData, updatedAt: new Date() })
        toast.success('تم تحديث المادة بنجاح')
      } else {
        await addDoc(collection(db, 'rawMaterials'), { ...formData, createdAt: new Date() })
        toast.success('تم إضافة المادة بنجاح')
      }
      setShowModal(false)
      setEditingMaterial(null)
      setFormData({ name: '', unit: 'piece', quantity: 0, reorderPoint: 10, cost: 0, supplier: '' })
      loadMaterials()
    } catch (error) {
      toast.error('حدث خطأ')
    }
  }

  const handleDelete = async (materialId) => {
    if (!hasPermission('inventory_edit')) {
      toast.error('ليس لديك صلاحية حذف المواد الخام')
      return
    }
    if (!window.confirm('متأكد إنك عايز تحذف المادة الخام دي؟')) return
    try {
      await deleteDoc(doc(db, 'rawMaterials', materialId))
      toast.success('تم حذف المادة')
      loadMaterials()
    } catch (error) {
      toast.error('فشل حذف المادة')
    }
  }

  const addQuantity = async () => {
    if (quantityToAdd <= 0) {
      toast.error('الرجاء إدخال كمية صحيحة')
      return
    }
    try {
      const materialRef = doc(db, 'rawMaterials', selectedMaterial.id)
      await updateDoc(materialRef, {
        quantity: (selectedMaterial.quantity || 0) + quantityToAdd,
        updatedAt: new Date()
      })
      toast.success(`تم إضافة ${quantityToAdd} إلى ${selectedMaterial.name}`)
      setShowQuantityModal(false)
      setQuantityToAdd(0)
      loadMaterials()
    } catch (error) {
      toast.error('فشل إضافة الكمية')
    }
  }

  const getUnitLabel = (unit) => {
    const units = { piece: 'قطعة', kg: 'كيلوجرام', gram: 'جرام', liter: 'لتر', ml: 'مليلتر', bag: 'كيس' }
    return units[unit] || unit
  }

  const getStatusColor = (quantity, reorderPoint) => {
    if (quantity <= 0) return 'bg-red-100 text-red-800'
    if (quantity <= reorderPoint) return 'bg-yellow-100 text-yellow-800'
    return 'bg-green-100 text-green-800'
  }

  if (!hasPermission('inventory_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">📦 المواد الخام</h1>
          <p className="text-gray-500 mt-1">إدارة المخزون من المواد الخام والمكونات</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <PlusIcon className="w-5 h-5" /> مادة جديدة
        </button>
      </div>

      {/* Low Stock Alert */}
      {materials.filter(m => m.quantity <= m.reorderPoint).length > 0 && (
        <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-yellow-800 dark:text-yellow-400 font-bold mb-2">⚠️ تنبيه: مواد منخفضة</h3>
          {materials.filter(m => m.quantity <= m.reorderPoint).map(m => (
            <div key={m.id} className="flex justify-between items-center">
              <span>{m.name}</span>
              <span className="text-yellow-600">{m.quantity} {getUnitLabel(m.unit)} متبقي</span>
              <button onClick={() => { setSelectedMaterial(m); setShowQuantityModal(true) }} className="text-blue-500 text-sm">إضافة كمية</button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-right">المادة</th>
                <th className="px-6 py-3 text-right">الوحدة</th>
                <th className="px-6 py-3 text-right">الكمية</th>
                <th className="px-6 py-3 text-right">حد الطلب</th>
                <th className="px-6 py-3 text-right">التكلفة</th>
                <th className="px-6 py-3 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center py-8">جاري التحميل...</td></tr>
              ) : materials.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-8 text-gray-500">لا توجد مواد خام</td></tr>
              ) : (
                materials.map(material => (
                  <tr key={material.id} className="border-t dark:border-gray-700">
                    <td className="px-6 py-4 font-medium">{material.name}</td>
                    <td className="px-6 py-4">{getUnitLabel(material.unit)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded ${getStatusColor(material.quantity, material.reorderPoint)}`}>
                        {material.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4">{material.reorderPoint}</td>
                    <td className="px-6 py-4">{material.cost} ج.م</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => { setSelectedMaterial(material); setShowQuantityModal(true) }} className="text-green-500" title="إضافة كمية"><PlusCircleIcon className="w-5 h-5" /></button>
                        <button onClick={() => { setEditingMaterial(material); setFormData(material); setShowModal(true) }} className="text-blue-500"><PencilIcon className="w-5 h-5" /></button>
                        <button onClick={() => handleDelete(material.id)} className="text-red-500"><TrashIcon className="w-5 h-5" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">{editingMaterial ? 'تعديل مادة' : 'إضافة مادة جديدة'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3">
                <input type="text" placeholder="اسم المادة" className="w-full px-4 py-2 border rounded-lg" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                <select className="w-full px-4 py-2 border rounded-lg" value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})}>
                  <option value="piece">قطعة</option><option value="kg">كيلوجرام</option><option value="gram">جرام</option>
                  <option value="liter">لتر</option><option value="ml">مليلتر</option><option value="bag">كيس</option>
                </select>
                <input type="number" placeholder="الكمية الحالية" className="w-full px-4 py-2 border rounded-lg" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value)})} />
                <input type="number" placeholder="حد إعادة الطلب" className="w-full px-4 py-2 border rounded-lg" value={formData.reorderPoint} onChange={(e) => setFormData({...formData, reorderPoint: parseFloat(e.target.value)})} />
                <input type="number" placeholder="تكلفة الوحدة" className="w-full px-4 py-2 border rounded-lg" value={formData.cost} onChange={(e) => setFormData({...formData, cost: parseFloat(e.target.value)})} />
                <input type="text" placeholder="المورد" className="w-full px-4 py-2 border rounded-lg" value={formData.supplier} onChange={(e) => setFormData({...formData, supplier: e.target.value})} />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg">حفظ</button>
                <button type="button" onClick={() => { setShowModal(false); setEditingMaterial(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Quantity Modal */}
      {showQuantityModal && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">إضافة كمية لـ {selectedMaterial.name}</h2>
            <div className="mb-4 p-3 bg-gray-50 rounded flex justify-between">
              <span>الكمية الحالية:</span>
              <span className="font-bold">{selectedMaterial.quantity} {getUnitLabel(selectedMaterial.unit)}</span>
            </div>
            <input type="number" placeholder="الكمية المضافة" className="w-full px-4 py-2 border rounded-lg" value={quantityToAdd} onChange={(e) => setQuantityToAdd(parseFloat(e.target.value))} />
            <div className="flex gap-3 mt-6">
              <button onClick={addQuantity} className="flex-1 bg-green-500 text-white py-2 rounded-lg">إضافة</button>
              <button onClick={() => { setShowQuantityModal(false); setQuantityToAdd(0) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RawMaterials