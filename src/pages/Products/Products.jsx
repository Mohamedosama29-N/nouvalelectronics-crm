// src/pages/Products/Products.jsx
import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { db } from '../../services/firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

const Products = () => {
  const [products, setProducts] = useState([])  // <- ابدأي فاضي
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [stockFilter, setStockFilter] = useState('all') // all | out | made
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '', barcode: '', sku: '', price: 0, quantity: 0, lowStockThreshold: 10, trackStock: true
  })

  // جلب المنتجات من Firebase
  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getLiveSnapshot('products')
      const productsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setProducts(productsData)
    } catch (error) {
      logger.error('Error loading products:', error)
      toast.error('فشل تحميل المنتجات')
    } finally {
      setLoading(false)
    }
  }

  const emptyForm = { name: '', barcode: '', sku: '', price: 0, quantity: 0, lowStockThreshold: 10, trackStock: true }

  // تنضيف القيم قبل الحفظ: لو الحقل الرقمي اتمسح، parseInt/parseFloat بيرجّعوا NaN
  // وكان بيتحفظ NaN في قاعدة البيانات ويبوّظ الحسابات بعد كده.
  const buildProductPayload = () => {
    const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
    const { id: _id, ...rest } = formData
    return {
      ...rest,
      name: (formData.name || '').trim(),
      barcode: (formData.barcode || '').trim(),
      sku: (formData.sku || '').trim(),
      price: num(formData.price),
      quantity: Math.max(0, Math.trunc(num(formData.quantity))),
      lowStockThreshold: Math.max(0, Math.trunc(num(formData.lowStockThreshold, 10))),
      trackStock: formData.trackStock !== false
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    const payload = buildProductPayload()

    if (!payload.name) {
      toast.error('اكتب اسم المنتج')
      return
    }
    if (payload.price < 0) {
      toast.error('السعر لا يمكن أن يكون سالب')
      return
    }
    // منع تكرار نفس الباركود على منتجين (بيخلي الاسكان يجيب منتج غلط)
    if (payload.barcode) {
      const duplicate = products.find(p => p.barcode === payload.barcode && p.id !== editingProduct?.id)
      if (duplicate) {
        toast.error(`الباركود ده مستخدم بالفعل في المنتج: ${duplicate.name}`)
        return
      }
    }

    setSaving(true)
    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), { ...payload, updatedAt: new Date() })
        toast.success('تم تحديث المنتج بنجاح')
      } else {
        await addDoc(collection(db, 'products'), { ...payload, createdAt: new Date() })
        toast.success('تم إضافة المنتج بنجاح')
      }
      setShowModal(false)
      setEditingProduct(null)
      setFormData(emptyForm)
      loadProducts()
    } catch (error) {
      logger.error('Error saving product:', error)
      toast.error('حدث خطأ أثناء حفظ المنتج')
    } finally {
      setSaving(false)
    }
  }

  // السكانر بيبعت Enter بعد قراءة الباركود - ده كان بيعمل submit للفورم فوراً
  // ويحفظ المنتج ناقص. دلوقتي Enter في خانة الباركود بينقلك للخانة اللي بعدها بس.
  const handleBarcodeKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const fields = Array.from(e.target.form?.querySelectorAll('input:not([type=checkbox]), select') || [])
    const idx = fields.indexOf(e.target)
    fields[idx + 1]?.focus()
  }

  // زرار واحد يفعّل تتبع المخزون لكل المنتجات القديمة اللي مفيهاش الحقل
  const enableTrackingForLegacy = async () => {
    const legacy = products.filter(p => p.trackStock === undefined)
    if (legacy.length === 0) {
      toast.success('كل المنتجات متظبطة بالفعل')
      return
    }
    if (!window.confirm(`تفعيل تتبع المخزون على ${legacy.length} منتج قديم؟`)) return
    try {
      const batch = writeBatch(db)
      legacy.forEach(p => batch.update(doc(db, 'products', p.id), {
        trackStock: true,
        quantity: Number(p.quantity) || 0
      }))
      await batch.commit()
      toast.success(`تم تفعيل التتبع على ${legacy.length} منتج`)
      loadProducts()
    } catch (error) {
      logger.error('Error enabling stock tracking:', error)
      toast.error('فشل تحديث المنتجات القديمة')
    }
  }

  const openAddModal = () => {
    setEditingProduct(null)
    setFormData(emptyForm)
    setShowModal(true)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    // نضمن إن كل الحقول ليها قيمة (منتجات قديمة ممكن تكون ناقصة حقول)
    setFormData({
      ...emptyForm,
      ...product,
      barcode: product.barcode || '',
      sku: product.sku || '',
      quantity: Number(product.quantity) || 0,
      lowStockThreshold: product.lowStockThreshold ?? 10,
      trackStock: product.trackStock !== false
    })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المنتج؟')) return
    try {
      await deleteDoc(doc(db, 'products', id))
      toast.success('تم الحذف بنجاح')
      loadProducts()
    } catch (error) {
      logger.error('Error deleting product:', error)
      toast.error('فشل حذف المنتج')
    }
  }

  const isOut = (p) => p.trackStock !== false && (Number(p.quantity) || 0) <= 0
  const outCount = products.filter(isOut).length
  const filteredProducts = products
    .filter(p => stockFilter === 'all' || (stockFilter === 'out' ? isOut(p) : p.trackStock === false))
    .filter(p =>
      p.name?.includes(searchTerm) ||
      p.barcode?.includes(searchTerm) ||
      p.sku?.includes(searchTerm)
    )

  // زرار سريع: المنتج يتحضر أول بأول (من غير مخزون) ↔ بيتتبع مخزونه
  const toggleTrackStock = async (product) => {
    const next = product.trackStock === false
    try {
      await updateDoc(doc(db, 'products', product.id), { trackStock: next, updatedAt: new Date() })
      setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, trackStock: next } : p)))
      toast.success(next ? `${product.name}: بقى بيتتبع مخزونه` : `${product.name}: بقى يتحضر أول بأول (مش هيظهر في النواقص)`)
    } catch (error) {
      logger.error('Error toggling trackStock:', error)
      toast.error('فشل تحديث المنتج')
    }
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold dark:text-white">📦 المنتجات</h1>
        <div className="flex gap-2">
          {products.some(p => p.trackStock === undefined) && (
            <button
              onClick={enableTrackingForLegacy}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg"
            >
              تفعيل تتبع المخزون للمنتجات القديمة
            </button>
          )}
          <button
            onClick={openAddModal}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            إضافة منتج
          </button>
        </div>
      </div>

      <div className="mb-6 relative">
        <MagnifyingGlassIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="بحث بالاسم، الباركود، أو SKU..."
          className="w-full pr-10 pl-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { id: 'all', label: `الكل (${products.length})` },
          { id: 'out', label: `نافد (${outCount})` },
          { id: 'made', label: `يتحضر أول بأول (${products.filter(p => p.trackStock === false).length})` }
        ].map(f => (
          <button key={f.id} onClick={() => setStockFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-sm border ${stockFilter === f.id ? 'bg-blue-500 text-white border-blue-500' : 'bg-white dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'}`}>
            {f.label}
          </button>
        ))}
        {stockFilter === 'out' && outCount > 0 && (
          <span className="text-xs text-gray-500 self-center">
            الأصناف اللي بتتعمل عند الطلب (عصائر، وافل...) دوس "يتحضر أول بأول" جنبها عشان متظهرش كنواقص
          </span>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-right">المنتج</th>
                <th className="px-6 py-3 text-right">الباركود</th>
                <th className="px-6 py-3 text-right">SKU</th>
                <th className="px-6 py-3 text-right">السعر</th>
                <th className="px-6 py-3 text-right">المخزون</th>
                <th className="px-6 py-3 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center py-8">جاري التحميل...</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-8 text-gray-500">لا توجد منتجات. أضف منتجك الأول!</td></tr>
              ) : (
                filteredProducts.map(product => (
                  <tr key={product.id} className="border-t dark:border-gray-700">
                    <td className="px-6 py-4 font-medium dark:text-white">{product.name}</td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{product.barcode || '—'}</td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{product.sku || '—'}</td>
                    <td className="px-6 py-4 dark:text-white">{product.price} ج.م</td>
                    <td className="px-6 py-4">
                      {product.trackStock === false ? (
                        <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">🍳 يتحضر أول بأول</span>
                      ) : (
                        <span className={`px-2 py-1 rounded ${(Number(product.quantity) || 0) <= 0 ? 'bg-red-100 text-red-800' : product.quantity <= product.lowStockThreshold ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                          {(Number(product.quantity) || 0) <= 0 ? 'نفد' : product.quantity}
                        </span>
                      )}
                      <button
                        onClick={() => toggleTrackStock(product)}
                        className="block mt-1.5 text-xs text-blue-600 hover:underline dark:text-blue-400"
                        title="تبديل بين تتبع المخزون والتحضير أول بأول"
                      >
                        {product.trackStock === false ? '📦 تتبع المخزون' : '🍳 يتحضر أول بأول'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEditModal(product)} className="text-blue-500"><PencilIcon className="w-5 h-5" /></button>
                        <button onClick={() => handleDelete(product.id)} className="text-red-500"><TrashIcon className="w-5 h-5" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form (نفسه ما تغيرش) */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">{editingProduct ? 'تعديل منتج' : 'إضافة منتج جديد'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3">
                <input type="text" placeholder="اسم المنتج" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                <input type="text" placeholder="الباركود" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.barcode} onChange={(e) => setFormData({...formData, barcode: e.target.value})} onKeyDown={handleBarcodeKeyDown} autoFocus />
                <input type="text" placeholder="SKU" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.sku} onChange={(e) => setFormData({...formData, sku: e.target.value})} />
                <input type="number" placeholder="السعر" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} min="0" step="any" required />

                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={formData.trackStock !== false}
                    onChange={(e) => setFormData({...formData, trackStock: e.target.checked})}
                  />
                  <span className="dark:text-white text-sm">📦 تتبع المخزون (اطفيها للأصناف اللي بتتحضر أول بأول ومالهاش كمية ثابتة)</span>
                </label>

                {formData.trackStock !== false && (
                  <>
                    <input type="number" placeholder="الكمية" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: e.target.value})} min="0" />
                    <input type="number" placeholder="حد التنبيه" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.lowStockThreshold} onChange={(e) => setFormData({...formData, lowStockThreshold: e.target.value})} min="0" />
                  </>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" disabled={saving} className="flex-1 bg-blue-500 disabled:bg-blue-300 text-white py-2 rounded-lg">{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                <button type="button" onClick={() => { setShowModal(false); setEditingProduct(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Products