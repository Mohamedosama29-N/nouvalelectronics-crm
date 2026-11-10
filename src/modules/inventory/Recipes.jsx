// src/modules/inventory/Recipes.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

const Recipes = () => {
  const { hasPermission } = useAuth()
  const [recipes, setRecipes] = useState([])
  const [products, setProducts] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [formData, setFormData] = useState({
    productId: '',
    items: [],
    instructions: '',
    yield: 1
  })
  const [newItem, setNewItem] = useState({ materialId: '', quantity: 0, unit: '' })

  useEffect(() => {
    loadRecipes()
    loadProducts()
    loadRawMaterials()
  }, [])

  const loadRecipes = async () => {
    try {
      const snapshot = await getLiveSnapshot('recipes')
      const recipesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setRecipes(recipesData)
    } catch (error) {
      toast.error('فشل تحميل الوصفات')
    }
  }

  const loadProducts = async () => {
    try {
      const snapshot = await getLiveSnapshot('products')
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      logger.error('Error loading products:', error)
    }
  }

  const loadRawMaterials = async () => {
    try {
      const snapshot = await getLiveSnapshot('rawMaterials')
      setRawMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      logger.error('Error loading raw materials:', error)
    }
  }

  const addItem = () => {
    if (!newItem.materialId || newItem.quantity <= 0) {
      toast.error('الرجاء اختيار المادة والكمية')
      return
    }
    const material = rawMaterials.find(m => m.id === newItem.materialId)
    setFormData({
      ...formData,
      items: [...formData.items, { ...newItem, materialName: material?.name, unit: material?.unit }]
    })
    setNewItem({ materialId: '', quantity: 0, unit: '' })
  }

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index)
    setFormData({ ...formData, items: newItems })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.productId || formData.items.length === 0) {
      toast.error('الرجاء اختيار المنتج وإضافة المواد')
      return
    }
    try {
      if (editingRecipe) {
        await updateDoc(doc(db, 'recipes', editingRecipe.id), { ...formData, updatedAt: new Date() })
        toast.success('تم تحديث الوصفة بنجاح')
      } else {
        await addDoc(collection(db, 'recipes'), { ...formData, createdAt: new Date() })
        toast.success('تم إضافة الوصفة بنجاح')
      }
      setShowModal(false)
      setEditingRecipe(null)
      setFormData({ productId: '', items: [], instructions: '', yield: 1 })
      loadRecipes()
    } catch (error) {
      toast.error('حدث خطأ')
    }
  }

  const handleDelete = async (recipeId) => {
    if (!hasPermission('products_edit')) {
      toast.error('ليس لديك صلاحية حذف الوصفات')
      return
    }
    if (!window.confirm('متأكد إنك عايز تحذف الوصفة دي؟')) return
    try {
      await deleteDoc(doc(db, 'recipes', recipeId))
      toast.success('تم حذف الوصفة')
      loadRecipes()
    } catch (error) {
      logger.error('Error deleting recipe:', error)
      toast.error('فشل حذف الوصفة')
    }
  }

  const calculateTotalCost = (items = []) => {
    return (items || []).reduce((sum, item) => {
      const material = rawMaterials.find(m => m.id === item.materialId)
      return sum + (material?.cost || 0) * item.quantity
    }, 0)
  }

  if (!hasPermission('inventory_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">📋 الوصفات (BOM)</h1>
          <p className="text-gray-500 mt-1">تحديد مكونات كل منتج نهائي</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <PlusIcon className="w-5 h-5" /> وصفة جديدة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {recipes.map(recipe => {
          const product = products.find(p => p.id === recipe.productId)
          return (
            <div key={recipe.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
              <div className="p-6 border-b dark:border-gray-700">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold">{product?.name || 'منتج'}</h3>
                    <p className="text-sm text-gray-500">التكلفة التقديرية: {calculateTotalCost(recipe.items || recipe.ingredients)} ج.م</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingRecipe(recipe); setFormData({ ...recipe, items: recipe.items || recipe.ingredients || [] }); setShowModal(true) }} className="text-blue-500"><PencilIcon className="w-5 h-5" /></button>
                    <button onClick={() => handleDelete(recipe.id)} className="text-red-500"><TrashIcon className="w-5 h-5" /></button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <p className="font-semibold mb-2">المكونات:</p>
                {(recipe.items || recipe.ingredients || []).map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1">
                    <span>{item.materialName}</span>
                    <span>{item.quantity} {item.unit}</span>
                  </div>
                ))}
                {recipe.instructions && <p className="text-sm text-gray-500 mt-3">📝 {recipe.instructions}</p>}
              </div>
            </div>
          )
        })}
      </div>

      {recipes.length === 0 && (
        <div className="text-center py-12 text-gray-500">لا توجد وصفات. أضف وصفة جديدة لتحديد مكونات المنتجات</div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">{editingRecipe ? 'تعديل وصفة' : 'إضافة وصفة جديدة'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <select className="w-full px-4 py-2 border rounded-lg" value={formData.productId} onChange={(e) => setFormData({...formData, productId: e.target.value})} required>
                  <option value="">اختر المنتج</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                
                <div>
                  <p className="font-semibold mb-2">المكونات:</p>
                  <div className="flex gap-2 mb-2">
                    <select className="flex-1 px-4 py-2 border rounded-lg" value={newItem.materialId} onChange={(e) => setNewItem({...newItem, materialId: e.target.value})}>
                      <option value="">اختر مادة</option>
                      {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <input type="number" placeholder="الكمية" className="w-24 px-4 py-2 border rounded-lg" value={newItem.quantity} onChange={(e) => setNewItem({...newItem, quantity: parseFloat(e.target.value)})} />
                    <button type="button" onClick={addItem} className="px-4 py-2 bg-green-500 text-white rounded-lg">+</button>
                  </div>
                  {formData.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded mb-1">
                      <span>{item.materialName}</span>
                      <span>{item.quantity} {item.unit}</span>
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-500">✕</button>
                    </div>
                  ))}
                </div>
                
                <textarea placeholder="تعليمات التحضير (اختياري)" className="w-full px-4 py-2 border rounded-lg" rows="2" value={formData.instructions} onChange={(e) => setFormData({...formData, instructions: e.target.value})} />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg">حفظ</button>
                <button type="button" onClick={() => { setShowModal(false); setEditingRecipe(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Recipes