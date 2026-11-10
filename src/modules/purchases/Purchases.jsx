// src/modules/purchases/Purchases.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, query, orderBy, Timestamp, deleteDoc, getDoc } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { PlusIcon, EyeIcon, CheckIcon, TrashIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

const Purchases = () => {
  const { hasPermission, userData, user } = useAuth()
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    supplierId: '',
    items: [],
    notes: '',
    status: 'pending'
  })
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', email: '', address: '' })
  const [showSupplierModal, setShowSupplierModal] = useState(false)

  useEffect(() => {
    loadPurchaseOrders()
    loadSuppliers()
    loadProducts()
  }, [])

  const loadPurchaseOrders = async () => {
    setLoading(true)
    try {
      const q = query(collection(db, 'purchaseOrders'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setPurchaseOrders(ordersData)
    } catch (error) {
      logger.error('Error loading purchase orders:', error)
      toast.error('فشل تحميل أوامر الشراء')
    } finally {
      setLoading(false)
    }
  }

  const loadSuppliers = async () => {
    try {
      const snapshot = await getLiveSnapshot('suppliers')
      const suppliersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setSuppliers(suppliersData)
    } catch (error) {
      logger.error('Error loading suppliers:', error)
    }
  }

  const loadProducts = async () => {
    try {
      const snapshot = await getLiveSnapshot('products')
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setProducts(productsData)
    } catch (error) {
      logger.error('Error loading products:', error)
    }
  }

  const addSupplier = async () => {
    if (!newSupplier.name) {
      toast.error('الرجاء إدخال اسم المورد')
      return
    }
    try {
      const docRef = await addDoc(collection(db, 'suppliers'), { 
        ...newSupplier, 
        createdAt: Timestamp.now(),
        createdBy: user?.uid || 'unknown'
      })
      setSuppliers([...suppliers, { id: docRef.id, ...newSupplier }])
      setShowSupplierModal(false)
      setNewSupplier({ name: '', phone: '', email: '', address: '' })
      toast.success('تم إضافة المورد بنجاح')
    } catch (error) {
      logger.error('Error adding supplier:', error)
      toast.error('فشل إضافة المورد')
    }
  }

  const addItemToOrder = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: '', productName: '', quantity: 1, price: 0, total: 0 }]
    })
  }

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items]
    newItems[index][field] = value
    
    if (field === 'productId') {
      const product = products.find(p => p.id === value)
      if (product) {
        newItems[index].productName = product.name
        newItems[index].price = product.cost || product.price || 0
      }
    }
    
    if (field === 'quantity' || field === 'price') {
      const qty = parseFloat(newItems[index].quantity) || 0
      const prc = parseFloat(newItems[index].price) || 0
      newItems[index].total = qty * prc
    }
    
    setFormData({ ...formData, items: newItems })
  }

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index)
    setFormData({ ...formData, items: newItems })
  }

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0)
  }

  const submitPurchaseOrder = async () => {
    if (!formData.supplierId) {
      toast.error('الرجاء اختيار المورد')
      return
    }
    if (formData.items.length === 0) {
      toast.error('الرجاء إضافة منتجات')
      return
    }

    setLoading(true)
    try {
      const total = calculateTotal()
      
      const orderData = {
        supplierId: formData.supplierId || '',
        items: formData.items.map(item => ({
          productId: item.productId || '',
          productName: item.productName || '',
          quantity: parseFloat(item.quantity) || 0,
          price: parseFloat(item.price) || 0,
          total: parseFloat(item.total) || 0
        })),
        notes: formData.notes || '',
        total: total,
        status: 'pending',
        createdAt: Timestamp.now()
      }
      
      if (user?.uid) {
        orderData.createdBy = user.uid
        orderData.createdByName = userData?.name || user.email?.split('@')[0] || 'مستخدم'
      }
      
      await addDoc(collection(db, 'purchaseOrders'), orderData)
      toast.success('تم إنشاء أمر الشراء بنجاح')
      setShowModal(false)
      setFormData({ supplierId: '', items: [], notes: '', status: 'pending' })
      loadPurchaseOrders()
    } catch (error) {
      logger.error('Error submitting purchase order:', error)
      toast.error('فشل إنشاء أمر الشراء: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const approveOrder = async (orderId) => {
    setLoading(true)
    try {
      const updateData = { 
        status: 'approved', 
        approvedAt: Timestamp.now()
      }
      if (user?.uid) {
        updateData.approvedBy = user.uid
      }
      await updateDoc(doc(db, 'purchaseOrders', orderId), updateData)
      toast.success('تم اعتماد أمر الشراء')
      loadPurchaseOrders()
    } catch (error) {
      logger.error('Error approving order:', error)
      toast.error('فشل اعتماد الأمر')
    } finally {
      setLoading(false)
    }
  }

  const receiveOrder = async (orderId, items) => {
    setLoading(true)
    try {
      logger.log('📦 بدء استلام الطلب:', orderId)
      
      for (const item of items) {
        if (item.productId && item.quantity > 0) {
          const productRef = doc(db, 'products', item.productId)
          
          // جلب المنتج الحالي للتأكد
          const productDoc = await getDoc(productRef)
          if (productDoc.exists()) {
            const currentQty = productDoc.data().quantity || 0
            const addQty = parseFloat(item.quantity) || 0
            const newQty = currentQty + addQty
            
            logger.log(`📦 المنتج: ${item.productName}`)
            logger.log(`   الكمية الحالية: ${currentQty}`)
            logger.log(`   الكمية المضافة: ${addQty}`)
            logger.log(`   الكمية الجديدة: ${newQty}`)
            
            await updateDoc(productRef, {
              quantity: newQty,
              lastUpdated: Timestamp.now()
            })
          }
        }
      }
      
      const updateData = { 
        status: 'received', 
        receivedAt: Timestamp.now()
      }
      if (user?.uid) {
        updateData.receivedBy = user.uid
      }
      
      await updateDoc(doc(db, 'purchaseOrders', orderId), updateData)
      toast.success('✅ تم استلام الطلب وتحديث المخزون بنجاح')
      loadPurchaseOrders()
    } catch (error) {
      logger.error('❌ Error receiving order:', error)
      toast.error('فشل استلام الطلب: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteOrder = async (orderId) => {
    if (!confirm('هل أنت متأكد من حذف أمر الشراء هذا؟')) return
    
    setLoading(true)
    try {
      await deleteDoc(doc(db, 'purchaseOrders', orderId))
      toast.success('تم حذف أمر الشراء')
      loadPurchaseOrders()
    } catch (error) {
      logger.error('Error deleting order:', error)
      toast.error('فشل حذف الأمر')
    } finally {
      setLoading(false)
    }
  }

  if (!hasPermission('purchases_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">📦 أوامر الشراء والموردين</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">إدارة أوامر الشراء والموردين</p>
        </div>
        <button 
          onClick={() => setShowModal(true)} 
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" /> أمر شراء جديد
        </button>
      </div>

      {/* Suppliers Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">🏭 الموردين</h2>
          <button onClick={() => setShowSupplierModal(true)} className="text-blue-500 hover:text-blue-600 text-sm">
            + إضافة مورد
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {suppliers.length === 0 ? (
            <div className="col-span-full text-center py-4 text-gray-500">لا يوجد موردين</div>
          ) : (
            suppliers.map(supplier => (
              <div key={supplier.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-r-4 border-blue-500">
                <h3 className="font-bold dark:text-white">{supplier.name}</h3>
                <p className="text-sm text-gray-500">{supplier.phone || '—'}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Purchase Orders Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-right">رقم الأمر</th>
                <th className="px-6 py-3 text-right">المورد</th>
                <th className="px-6 py-3 text-right">التاريخ</th>
                <th className="px-6 py-3 text-right">الإجمالي</th>
                <th className="px-6 py-3 text-right">الحالة</th>
                <th className="px-6 py-3 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && purchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8">جاري التحميل...</td>
                </tr>
              ) : purchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-500">لا توجد أوامر شراء</td>
                </tr>
              ) : (
                purchaseOrders.map(order => {
                  const supplier = suppliers.find(s => s.id === order.supplierId)
                  return (
                    <tr key={order.id} className="border-t dark:border-gray-700">
                      <td className="px-6 py-4 font-mono">{order.id.slice(-8)}</td>
                      <td className="px-6 py-4">{supplier?.name || '—'}</td>
                      <td className="px-6 py-4">{order.createdAt?.toDate().toLocaleDateString('ar-EG')}</td>
                      <td className="px-6 py-4 font-bold text-blue-600">{order.total?.toFixed(2)} ج.م</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {order.status === 'pending' ? 'قيد الانتظار' : 
                           order.status === 'approved' ? 'معتمد' : 'تم الاستلام'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => setSelectedOrder(order)} className="text-blue-500" title="عرض التفاصيل">
                            <EyeIcon className="w-5 h-5" />
                          </button>
                          {order.status === 'pending' && hasPermission('purchases_approve') && (
                            <button onClick={() => approveOrder(order.id)} className="text-green-500" title="اعتماد">
                              <CheckIcon className="w-5 h-5" />
                            </button>
                          )}
                          {order.status === 'approved' && hasPermission('purchases_receive') && (
                            <button onClick={() => receiveOrder(order.id, order.items)} className="text-purple-500" title="استلام">
                              <CheckIcon className="w-5 h-5" />
                            </button>
                          )}
                          {order.status === 'pending' && (
                            <button onClick={() => deleteOrder(order.id)} className="text-red-500" title="حذف">
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Purchase Order Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">أمر شراء جديد</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">المورد</label>
                <select 
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" 
                  value={formData.supplierId} 
                  onChange={(e) => setFormData({...formData, supplierId: e.target.value})}
                >
                  <option value="">اختر المورد</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">المنتجات</label>
                <div className="space-y-2">
                  {formData.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select 
                        className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-700" 
                        value={item.productId} 
                        onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                      >
                        <option value="">اختر منتج</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input 
                        type="number" 
                        placeholder="الكمية" 
                        className="w-24 px-4 py-2 border rounded-lg dark:bg-gray-700" 
                        value={item.quantity} 
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      />
                      <input 
                        type="number" 
                        placeholder="السعر" 
                        className="w-24 px-4 py-2 border rounded-lg dark:bg-gray-700" 
                        value={item.price} 
                        onChange={(e) => updateItem(idx, 'price', e.target.value)}
                      />
                      <span className="w-24 text-sm">{item.total?.toFixed(2)} ج.م</span>
                      <button onClick={() => removeItem(idx)} className="text-red-500">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={addItemToOrder} className="text-blue-500 text-sm">
                    + إضافة منتج
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">ملاحظات</label>
                <textarea 
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" 
                  rows="2" 
                  value={formData.notes} 
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                />
              </div>
              
              <div className="text-left font-bold text-lg">
                الإجمالي: {calculateTotal().toFixed(2)} ج.م
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button onClick={submitPurchaseOrder} disabled={loading} className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600">
                {loading ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => { setShowModal(false); setFormData({ supplierId: '', items: [], notes: '', status: 'pending' }) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">إضافة مورد جديد</h2>
            <div className="space-y-3">
              <input type="text" placeholder="اسم المورد" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={newSupplier.name} onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})} />
              <input type="tel" placeholder="رقم الهاتف" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={newSupplier.phone} onChange={(e) => setNewSupplier({...newSupplier, phone: e.target.value})} />
              <input type="email" placeholder="البريد الإلكتروني" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={newSupplier.email} onChange={(e) => setNewSupplier({...newSupplier, email: e.target.value})} />
              <input type="text" placeholder="العنوان" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={newSupplier.address} onChange={(e) => setNewSupplier({...newSupplier, address: e.target.value})} />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={addSupplier} className="flex-1 bg-blue-500 text-white py-2 rounded-lg">إضافة</button>
              <button onClick={() => setShowSupplierModal(false)} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold dark:text-white">تفاصيل أمر الشراء</h2>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-500">✕</button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div><p className="text-gray-500">رقم الأمر</p><p className="font-mono">{selectedOrder.id.slice(-8)}</p></div>
                <div><p className="text-gray-500">التاريخ</p><p>{selectedOrder.createdAt?.toDate().toLocaleString('ar-EG')}</p></div>
                <div><p className="text-gray-500">المورد</p><p>{suppliers.find(s => s.id === selectedOrder.supplierId)?.name}</p></div>
                <div><p className="text-gray-500">الحالة</p>
                  <span className={`px-2 py-1 rounded text-xs ${
                    selectedOrder.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    selectedOrder.status === 'approved' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {selectedOrder.status === 'pending' ? 'قيد الانتظار' : 
                     selectedOrder.status === 'approved' ? 'معتمد' : 'تم الاستلام'}
                  </span>
                </div>
              </div>
              
              <table className="w-full border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr><th className="p-2 text-right">المنتج</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-left">السعر</th><th className="p-2 text-left">الإجمالي</th></tr>
                </thead>
                <tbody>
                  {selectedOrder.items?.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{item.productName}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-left">{item.price} ج.م</td>
                      <td className="p-2 text-left">{item.total} ج.م</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-bold">
                    <td colSpan="3" className="p-2 text-left">الإجمالي</td>
                    <td className="p-2 text-left">{selectedOrder.total} ج.م</td>
                  </tr>
                </tfoot>
              </table>
              
              {selectedOrder.notes && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-gray-500">ملاحظات</p>
                  <p>{selectedOrder.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Purchases