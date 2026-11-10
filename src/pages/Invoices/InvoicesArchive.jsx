// src/pages/Invoices/InvoicesArchive.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, getDocs, query, orderBy, limit, startAfter, deleteDoc, doc, where, Timestamp, runTransaction } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { useSystem } from '../../contexts/SystemContext'
import { 
  MagnifyingGlassIcon, 
  PrinterIcon, 
  DocumentArrowDownIcon, 
  EyeIcon, 
  TrashIcon,
  ArrowPathIcon,
  
  ReceiptRefundIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { logger } from '../../utils/logger'
import { logActivity } from '../../services/auditLog'
import { printInvoiceReceipt } from '../../utils/thermalPrint'
import { readStockRestores, commitStockDeductions } from '../../services/inventoryService'
import { getInvoiceDisplayRef } from '../../services/invoiceNumberService'

const InvoicesArchive = () => {
  const { hasPermission, userData } = useAuth()
  const { systemSettings } = useSystem()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [lastDoc, setLastDoc] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [filterType, setFilterType] = useState('all') // all, today, week, month
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState(null)
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)
  const [invoiceToVoid, setInvoiceToVoid] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [showVoided, setShowVoided] = useState(true)

  const canDelete = hasPermission('invoices_delete') || userData?.role === 'admin'
  const canRefund = hasPermission('invoices_refund') || userData?.role === 'admin'

  useEffect(() => {
    loadInvoices()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- إعادة التحميل عمداً عند تغيير فلتر النوع بس
  }, [filterType])

  const getDateFilter = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    switch (filterType) {
      case 'today':
        return Timestamp.fromDate(today)
      case 'week':
        return Timestamp.fromDate(weekAgo)
      case 'month':
        return Timestamp.fromDate(monthAgo)
      default:
        return null
    }
  }

  const loadInvoices = async () => {
    setLoading(true)
    try {
      let invoicesQuery
      const dateFilterValue = getDateFilter()
      
      if (dateFilterValue) {
        invoicesQuery = query(
          collection(db, 'invoices'),
          where('timestamp', '>=', dateFilterValue),
          orderBy('timestamp', 'desc'),
          limit(50)
        )
      } else {
        invoicesQuery = query(
          collection(db, 'invoices'),
          orderBy('timestamp', 'desc'),
          limit(50)
        )
      }
      
      const snapshot = await getDocs(invoicesQuery)
      const invoicesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setInvoices(invoicesData)
      setLastDoc(snapshot.docs[snapshot.docs.length - 1])
      setHasMore(snapshot.docs.length === 50)
    } catch (error) {
      logger.error('Error loading invoices:', error)
      toast.error('فشل تحميل الفواتير')
    } finally {
      setLoading(false)
    }
  }


  const loadMore = async () => {
    if (!lastDoc) return
    setLoading(true)
    try {
      let invoicesQuery
      const dateFilterValue = getDateFilter()
      
      if (dateFilterValue) {
        invoicesQuery = query(
          collection(db, 'invoices'),
          where('timestamp', '>=', dateFilterValue),
          orderBy('timestamp', 'desc'),
          startAfter(lastDoc),
          limit(50)
        )
      } else {
        invoicesQuery = query(
          collection(db, 'invoices'),
          orderBy('timestamp', 'desc'),
          startAfter(lastDoc),
          limit(50)
        )
      }
      
      const snapshot = await getDocs(invoicesQuery)
      const newInvoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setInvoices(prev => [...prev, ...newInvoices])
      setLastDoc(snapshot.docs[snapshot.docs.length - 1])
      setHasMore(snapshot.docs.length === 50)
    } catch (error) {
      logger.error('Error loading more:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return
    
    try {
      await deleteDoc(doc(db, 'invoices', invoiceToDelete.id))
      toast.success('✅ تم حذف الفاتورة بنجاح')
      setShowDeleteConfirm(false)
      setInvoiceToDelete(null)
      loadInvoices()
    } catch (error) {
      logger.error('Error deleting invoice:', error)
      toast.error('فشل حذف الفاتورة')
    }
  }

  /**
   * استرجاع/إلغاء فاتورة: بعكس الحذف النهائي، الفاتورة تفضل موجودة في
   * الأرشيف لكن بحالة "ملغاة" مع سبب وتوقيت وشخص الإلغاء، وبيتم عكس أي
   * نقاط ولاء اتضافت للعميل من الفاتورة دي. الإجراء ده بيتسجل في سجل
   * النشاطات كمان لأنه إجراء حساس ماليًا.
   */
  const handleVoidInvoice = async () => {
    if (!invoiceToVoid) return
    if (!voidReason.trim()) {
      toast.error('لازم تكتب سبب الإلغاء/الاسترجاع')
      return
    }

    try {
      // كل الإلغاء في transaction واحدة: الفاتورة + إرجاع الكميات للمخزون +
      // عكس نقاط العميل. لو أي حاجة فشلت محدش بيتغير (مفيش نص إلغاء).
      let restoredCount = 0
      await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, 'invoices', invoiceToVoid.id)
        const invoiceSnap = await transaction.get(invoiceRef)
        if (!invoiceSnap.exists()) throw new Error('INVOICE_NOT_FOUND')
        const inv = invoiceSnap.data()
        if (inv.status === 'voided') throw new Error('ALREADY_VOIDED')

        // ---- قراءات ----
        const restores = await readStockRestores(transaction, inv.items)
        const customerRef = inv.customerId ? doc(db, 'customers', inv.customerId) : null
        const customerSnap = customerRef ? await transaction.get(customerRef) : null

        // ---- كتابات ----
        transaction.update(invoiceRef, {
          status: 'voided',
          voidReason: voidReason.trim(),
          voidedBy: userData?.uid || null,
          voidedByName: userData?.name || 'مستخدم',
          voidedAt: new Date(),
          stockRestored: restores.length > 0
        })
        commitStockDeductions(transaction, restores)
        restoredCount = restores.length

        // العميل ممكن يكون اتحذف - ساعتها بنكمل الإلغاء عادي من غيره
        if (customerSnap?.exists()) {
          const c = customerSnap.data()
          const total = Number(inv.total) || 0
          transaction.update(customerRef, {
            points: Math.max(0, (Number(c.points) || 0) - Math.floor(total / 10)),
            totalSpent: Math.max(0, (Number(c.totalSpent) || 0) - total),
            orders: Math.max(0, (Number(c.orders) || 0) - 1)
          })
        }
      })
      if (restoredCount > 0) toast.success(`تم إرجاع كميات ${restoredCount} منتج للمخزون`)

      await logActivity('استرجاع/إلغاء فاتورة', userData?.name, {
        invoiceId: invoiceToVoid.id,
        invoiceNumber: invoiceToVoid.invoiceNumber,
        total: invoiceToVoid.total,
        reason: voidReason.trim()
      })

      toast.success('✅ تم إلغاء الفاتورة')
      setShowVoidConfirm(false)
      setInvoiceToVoid(null)
      setVoidReason('')
      loadInvoices()
    } catch (error) {
      logger.error('Error voiding invoice:', error)
      if (error?.message === 'ALREADY_VOIDED') toast.error('الفاتورة دي ملغاة بالفعل')
      else if (error?.message === 'INVOICE_NOT_FOUND') toast.error('الفاتورة مش موجودة (ممكن تكون اتحذفت)')
      else toast.error('فشل إلغاء الفاتورة')
      loadInvoices()
    }
  }

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.id.includes(searchTerm) ||
      inv.customerName?.includes(searchTerm) ||
      inv.cashierName?.includes(searchTerm) ||
      inv.invoiceNumber?.toString().includes(searchTerm)
    const matchesVoidFilter = showVoided || inv.status !== 'voided'
    return matchesSearch && matchesVoidFilter
  })

  const exportToExcel = () => {
    const exportData = filteredInvoices.map(inv => ({
      'رقم الفاتورة': getInvoiceDisplayRef(inv),
      'التاريخ': inv.timestamp?.toDate().toLocaleString('ar-EG'),
      'العميل': inv.customerName,
      'الكاشير': inv.cashierName,
      'الإجمالي': inv.total,
      'المدفوع': inv.amountPaid,
      'طريقة الدفع': inv.paymentMethod === 'cash' ? 'كاش' : 
                      inv.paymentMethod === 'card' ? 'بطاقة' :
                      inv.paymentMethod === 'vodafone_cash' ? 'فودافون كاش' : 'تحويل بنكي',
      'الخصم': inv.discount?.amount || 0
    }))
    
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'الفواتير')
    XLSX.writeFile(wb, `الفواتير_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success('تم تصدير الفواتير بنجاح')
  }

  // إعادة الطباعة بنفس إيصال الطابعة الحرارية (نفس الأبعاد الثابتة) بدل صفحة A4
  const printInvoice = (invoice) => {
    printInvoiceReceipt(invoice, systemSettings)
  }

  if (!hasPermission('invoices_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">📄 أرشيف الفواتير</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">إدارة وعرض جميع الفواتير السابقة</p>
        </div>
        <button onClick={exportToExcel} className="bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <DocumentArrowDownIcon className="w-5 h-5" /> تصدير Excel
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="🔍 بحث برقم الفاتورة، اسم العميل، أو الكاشير..."
            className="w-full pr-10 pl-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${filterType === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            الكل
          </button>
          <button
            onClick={() => setFilterType('today')}
            className={`px-4 py-2 rounded-lg transition-colors ${filterType === 'today' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            اليوم
          </button>
          <button
            onClick={() => setFilterType('week')}
            className={`px-4 py-2 rounded-lg transition-colors ${filterType === 'week' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            آخر 7 أيام
          </button>
          <button
            onClick={() => setFilterType('month')}
            className={`px-4 py-2 rounded-lg transition-colors ${filterType === 'month' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            آخر 30 يوم
          </button>
        </div>
        
        <button onClick={loadInvoices} className="px-4 py-2 bg-purple-500 text-white rounded-lg flex items-center justify-center gap-2">
          <ArrowPathIcon className="w-5 h-5" /> تحديث
        </button>
      </div>

      <label className="flex items-center gap-2 mb-4 text-sm dark:text-gray-300">
        <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="w-4 h-4" />
        إظهار الفواتير الملغاة/المسترجعة
      </label>

      {/* Invoices Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-right">رقم الفاتورة</th>
                <th className="px-6 py-3 text-right">التاريخ</th>
                <th className="px-6 py-3 text-right">العميل</th>
                <th className="px-6 py-3 text-right">الكاشير</th>
                <th className="px-6 py-3 text-right">الإجمالي</th>
                <th className="px-6 py-3 text-right">طريقة الدفع</th>
                <th className="px-6 py-3 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && invoices.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-8">جاري التحميل...</td></tr>
              ) : filteredInvoices.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-8 text-gray-500">لا توجد فواتير</td></tr>
              ) : (
                filteredInvoices.map(inv => (
                  <tr key={inv.id} className={`border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${inv.status === 'voided' ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4 font-mono font-bold text-blue-600">
                      {getInvoiceDisplayRef(inv)}
                      {!inv.invoiceNumber && (
                        <span className="block mt-1 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 w-fit" title="اتسجلت وقت انقطاع الاتصال، مفيش رقم تسلسلي رسمي لها">
                          🔌 أوفلاين
                        </span>
                      )}
                      {inv.status === 'voided' && (
                        <span className="block mt-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-800 w-fit">ملغاة</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{inv.timestamp?.toDate().toLocaleString('ar-EG')}</td>
                    <td className="px-6 py-4">{inv.customerName || 'عميل نقدي'}</td>
                    <td className="px-6 py-4">{inv.cashierName || '—'}</td>
                    <td className={`px-6 py-4 font-bold ${inv.status === 'voided' ? 'text-red-500 line-through' : 'text-green-600'}`}>{inv.total?.toFixed(2)} ج.م</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        inv.paymentMethod === 'cash' ? 'bg-green-100 text-green-800' :
                        inv.paymentMethod === 'card' ? 'bg-blue-100 text-blue-800' :
                        inv.paymentMethod === 'vodafone_cash' ? 'bg-orange-100 text-orange-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {inv.paymentMethod === 'cash' ? 'كاش' :
                         inv.paymentMethod === 'card' ? 'بطاقة' :
                         inv.paymentMethod === 'vodafone_cash' ? 'فودافون كاش' : 'تحويل بنكي'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedInvoice(inv)} className="text-blue-500 hover:text-blue-700" title="عرض التفاصيل">
                          <EyeIcon className="w-5 h-5" />
                        </button>
                        <button onClick={() => printInvoice(inv)} className="text-gray-500 hover:text-gray-700" title="طباعة">
                          <PrinterIcon className="w-5 h-5" />
                        </button>
                        {canRefund && inv.status !== 'voided' && (
                          <button
                            onClick={() => { setInvoiceToVoid(inv); setShowVoidConfirm(true) }}
                            className="text-orange-500 hover:text-orange-700"
                            title="استرجاع/إلغاء الفاتورة"
                          >
                            <ReceiptRefundIcon className="w-5 h-5" />
                          </button>
                        )}
                        {canDelete && (
                          <button 
                            onClick={() => { setInvoiceToDelete(inv); setShowDeleteConfirm(true) }} 
                            className="text-red-500 hover:text-red-700" 
                            title="حذف الفاتورة"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                   </tr>
                ))
              )}
            </tbody>
           </table>
        </div>
        
        {hasMore && !loading && filteredInvoices.length > 0 && (
          <div className="p-4 text-center border-t">
            <button onClick={loadMore} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
              تحميل المزيد
            </button>
          </div>
        )}
      </div>

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold dark:text-white">تفاصيل الفاتورة #{getInvoiceDisplayRef(selectedInvoice)}</h2>
              <button onClick={() => setSelectedInvoice(null)} className="text-gray-500 text-2xl hover:text-gray-700">✕</button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div><p className="text-gray-500">التاريخ</p><p className="font-semibold">{selectedInvoice.timestamp?.toDate().toLocaleString('ar-EG')}</p></div>
                <div><p className="text-gray-500">العميل</p><p className="font-semibold">{selectedInvoice.customerName || 'عميل نقدي'}</p></div>
                <div><p className="text-gray-500">الكاشير</p><p className="font-semibold">{selectedInvoice.cashierName || '—'}</p></div>
                <div><p className="text-gray-500">طريقة الدفع</p><p className="font-semibold">{selectedInvoice.paymentMethod}</p></div>
              </div>
              
              <table className="w-full border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr><th className="p-2 text-right">المنتج</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-left">السعر</th><th className="p-2 text-left">الإجمالي</th></tr>
                </thead>
                <tbody>
                  {selectedInvoice.items?.map((item, idx) => (
                    <tr key={idx} className="border-t"><td className="p-2">{item.name}</td><td className="p-2 text-center">{item.quantity}</td><td className="p-2 text-left">{item.price} ج.م</td><td className="p-2 text-left">{item.total} ج.م</td></tr>
                  ))}
                </tbody>
              </table>
              
              <div className="border-t pt-3 text-left">
                <p>المجموع الفرعي: {selectedInvoice.subtotal} ج.م</p>
                {selectedInvoice.discount?.amount > 0 && <p className="text-green-600">الخصم: -{selectedInvoice.discount.amount} ج.م</p>}
                {selectedInvoice.tax > 0 && <p>الضريبة: {selectedInvoice.tax} ج.م</p>}
                <p className="text-xl font-bold mt-2">الإجمالي: {selectedInvoice.total} ج.م</p>
                <p>المدفوع: {selectedInvoice.amountPaid} ج.م</p>
                <p>الباقي: {selectedInvoice.change} ج.م</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Void/Refund Confirmation Modal */}
      {showVoidConfirm && invoiceToVoid && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <div className="text-center">
              <div className="text-6xl mb-4">↩️</div>
              <h2 className="text-2xl font-bold mb-4 dark:text-white">استرجاع/إلغاء الفاتورة</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                فاتورة رقم {getInvoiceDisplayRef(invoiceToVoid)} بقيمة {invoiceToVoid.total?.toFixed(2)} ج.م
              </p>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="سبب الإلغاء/الاسترجاع (إلزامي)"
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white mb-4"
                rows="3"
              />
              <p className="text-sm text-orange-600 mb-6">الفاتورة هتفضل محفوظة في الأرشيف بحالة "ملغاة" مع اسمك وسبب الإلغاء - مش هتتمسح.</p>
              <div className="flex gap-3">
                <button onClick={handleVoidInvoice} className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600">
                  تأكيد الإلغاء
                </button>
                <button onClick={() => { setShowVoidConfirm(false); setInvoiceToVoid(null); setVoidReason('') }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600">
                  تراجع
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && invoiceToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold mb-4 dark:text-white">تأكيد الحذف</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                هل أنت متأكد من حذف الفاتورة رقم {getInvoiceDisplayRef(invoiceToDelete)}؟
              </p>
              <p className="text-sm text-red-600 mb-6">⚠️ هذا الإجراء لا يمكن التراجع عنه</p>
              <div className="flex gap-3">
                <button onClick={handleDeleteInvoice} className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600">
                  نعم، احذف
                </button>
                <button onClick={() => { setShowDeleteConfirm(false); setInvoiceToDelete(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600">
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InvoicesArchive