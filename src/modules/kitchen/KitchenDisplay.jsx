// src/modules/kitchen/KitchenDisplay.jsx
import { useState, useEffect, useRef } from 'react'
import { db } from '../../services/firebase'
import { collection, onSnapshot, updateDoc, doc, orderBy, query, increment, getDocs, limit, runTransaction, where } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { useSystem } from '../../contexts/SystemContext'
import { CheckCircleIcon, FireIcon, PrinterIcon, ArchiveBoxIcon, XCircleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { printOrderTickets, printInvoiceReceipt } from '../../utils/thermalPrint'
import { readStockDeductions, commitStockDeductions } from '../../services/inventoryService'
import { getInvoiceDisplayRef, readNextInvoiceNumber, commitInvoiceNumber } from '../../services/invoiceNumberService'
import { logger } from '../../utils/logger'

// المدة اللي بعدها يعتبر الأوردر "متأخر" - 5 دقايق زي المطلوب
const LATE_THRESHOLD_SECONDS = 5 * 60

const KitchenDisplay = () => {
  const { hasPermission } = useAuth()
  const { systemSettings } = useSystem()
  const [orders, setOrders] = useState([])
  const [selectedStation, setSelectedStation] = useState('all')
  const [timers, setTimers] = useState({})
  const [view, setView] = useState('active') // 'active' | 'archive'
  const [archivedOrders, setArchivedOrders] = useState([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  // بنمنع الضغط المتكرر على نفس الأوردر (تسليم/إلغاء) وهو لسه بيتعالج، عشان
  // نضمن مفيش فاتورة تتسجل مرتين لنفس الأوردر (مصدر مشكلة "الفواتير بتتدبلر").
  const [processingIds, setProcessingIds] = useState(new Set())
  const audioRef = useRef(null)

  const stations = [
    { id: 'all', name: 'جميع الطلبات', icon: '📋' },
    { id: 'coffee', name: 'مشروبات ساخنة', icon: '☕' },
    { id: 'cold', name: 'مشروبات باردة', icon: '🥤' },
    { id: 'food', name: 'أطعمة', icon: '🍔' }
  ]

  useEffect(() => {
    // ⚠️ بنقرا الأوردرات المفتوحة بس (مش كل تاريخ المطبخ من أول يوم) - قبل كده
    // كل فتحة للشاشة كانت بتقرا آلاف الأوردرات القديمة وتستهلك حصة Firebase اليومية.
    // (من غير orderBy عشان ميحتاجش إندكس مركّب - الترتيب بيتعمل على الجهاز)
    const q = query(collection(db, 'kitchenOrders'), where('status', 'in', ['pending', 'preparing', 'ready']))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setOrders(ordersData
        .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
        .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)))

      // تشغيل صوت للطلبات الجديدة
      if (snapshot.docChanges().some(change => change.type === 'added')) {
        audioRef.current?.play()?.catch(() => {}) // المتصفح بيمنع الصوت قبل أول ضغطة
        toast.success('طلب جديد في المطبخ!', { duration: 5000, icon: '🔔' })
      }
    })
    return () => unsubscribe()
  }, [])

  // تحميل أرشيف الطلبات المُسلَّمة/الملغاة (مرة واحدة عند فتح التبويب + زر تحديث)
  const loadArchive = async () => {
    setArchiveLoading(true)
    try {
      // بنجيب آخر الطلبات بترتيب وقت الإنشاء (بدون فلترة status في الاستعلام
      // نفسه عشان نتفادى الحاجة لإندكس مركّب) وبعدين بنفلتر على الجهاز.
      const q = query(collection(db, 'kitchenOrders'), orderBy('createdAt', 'desc'), limit(150))
      const snap = await getDocs(q)
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setArchivedOrders(all.filter(o => o.status === 'completed' || o.status === 'cancelled').slice(0, 150))
    } catch (error) {
      logger.error('Error loading kitchen archive:', error)
      toast.error('فشل تحميل أرشيف الطلبات')
    } finally {
      setArchiveLoading(false)
    }
  }

  useEffect(() => {
    if (view === 'archive') loadArchive()
  }, [view])

  // تحديث المؤقتات - وقت البدء (createdAt) ثابت دايماً وبيتحسب الفرق منه كل ثانية
  useEffect(() => {
    const interval = setInterval(() => {
      const newTimers = {}
      orders.forEach(order => {
        const startedAt = order.createdAt?.toDate ? order.createdAt.toDate() : null
        if (!startedAt) return
        const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000)
        newTimers[order.id] = {
          minutes: Math.floor(elapsed / 60),
          seconds: elapsed % 60,
          isUrgent: elapsed > LATE_THRESHOLD_SECONDS
        }
      })
      setTimers(newTimers)
    }, 1000)
    return () => clearInterval(interval)
  }, [orders])

  const setProcessing = (orderId, value) => {
    setProcessingIds(prev => {
      const next = new Set(prev)
      if (value) next.add(orderId)
      else next.delete(orderId)
      return next
    })
  }

  /**
   * تحديث حالة الأوردر + (لو "تم التسليم") تسجيل الفاتورة - كل ده في
   * transaction واحدة ذرية. الـ transaction بتقرأ حالة "invoiced" أول حاجة
   * وتتأكد إنها لسه false قبل ما تكتب أي حاجة، فحتى لو المستخدم دبل كليك أو
   * حصل تصادم شبكة، مستحيل تتسجل فاتورتين لنفس الأوردر.
   */
  const updateOrderStatus = async (order, status) => {
    if (processingIds.has(order.id)) return // منع الضغط المزدوج من الواجهة
    setProcessing(order.id, true)

    try {
      const orderRef = doc(db, 'kitchenOrders', order.id)
      let createdInvoiceId = null
      let alreadyInvoiced = false
      let assignedInvoiceNumber = null

      await runTransaction(db, async (transaction) => {
        const freshSnap = await transaction.get(orderRef)
        if (!freshSnap.exists()) throw new Error('الأوردر مش موجود')
        const freshOrder = freshSnap.data()

        const updates = {
          status,
          updatedAt: new Date(),
          completedAt: status === 'completed' ? new Date() : (freshOrder.completedAt ?? null)
        }

        if (status === 'completed' && freshOrder.invoiceData && !freshOrder.invoiced) {
          // ⚠️ كل القراءات في الـ transaction لازم تحصل قبل أي كتابة خالص -
          // عشان كده بنقرأ خصومات المخزون ورقم الفاتورة الجديد الأول (كلها
          // قراءات)، وبعدين نبدأ نكتب (خصم المخزون، الفاتورة، عداد الرقم،
          // نقاط العميل، تحديث الأوردر) كلها مع بعض في الآخر.
          const stockDeductions = await readStockDeductions(transaction, freshOrder.invoiceData.items || [])

          // ✅ رقم الفاتورة التسلسلي بيتحجز هنا بالظبط - في نفس لحظة تسجيل
          // الفاتورة فعلياً، مش وقت إرسال الأوردر للمطبخ. كده الرقم مبيضيعش
          // أبداً حتى لو أوردرات تانية اتلغت قبل كده (ترقيم بدون فجوات).
          const reservedNumber = await readNextInvoiceNumber(transaction)
          assignedInvoiceNumber = reservedNumber.result

          // العميل بيتقري هنا (قبل أي كتابة) - ولو كان اتحذف منحاولش نحدّثه،
          // لأن تحديث مستند مش موجود كان بيفشّل "تم التسليم" كله.
          const customerRef = freshOrder.invoiceData.customerId ? doc(db, 'customers', freshOrder.invoiceData.customerId) : null
          const customerSnap = customerRef ? await transaction.get(customerRef) : null

          const invoicePayload = {
            ...freshOrder.invoiceData,
            invoiceNumber: assignedInvoiceNumber.number,
            invoiceFullNumber: assignedInvoiceNumber.fullNumber
          }

          // ---- من هنا كتابة بس (مفيش أي transaction.get بعد كده) ----
          commitStockDeductions(transaction, stockDeductions)
          commitInvoiceNumber(transaction, reservedNumber)

          // بنحدّث نسخة الأوردر بنفس بيانات الفاتورة (بما فيها الرقم الجديد)
          // عشان أرشيف شاشة المطبخ وإعادة الطباعة يعرضوا الرقم الصح دايماً.
          updates.invoiceData = invoicePayload

          // بنولّد مرجع فاتورة جديد ونكتبه جوه نفس الـ transaction، فده يضمن
          // إن أي محاولة تانية متزامنة هتلاقي invoiced=true فعلاً وتوقف.
          const invoiceRef = doc(collection(db, 'invoices'))
          transaction.set(invoiceRef, invoicePayload)
          updates.invoiced = true
          updates.invoiceId = invoiceRef.id
          createdInvoiceId = invoiceRef.id

          if (customerSnap?.exists()) {
            transaction.update(customerRef, {
              points: increment(Math.floor((freshOrder.invoiceData.total || 0) / 10)),
              totalSpent: increment(freshOrder.invoiceData.total || 0),
              orders: increment(1),
              lastVisit: new Date()
            })
          }
        } else if (status === 'completed' && freshOrder.invoiced) {
          alreadyInvoiced = true
        }

        transaction.update(orderRef, updates)
      })

      if (status === 'completed') {
        if (createdInvoiceId) {
          toast.success(`✅ تم التسليم وصدرت الفاتورة رقم ${assignedInvoiceNumber?.number ?? assignedInvoiceNumber?.fullNumber}`, { duration: 5000 })
          // طباعة الفاتورة تلقائياً لحظة التسليم
          try {
            printInvoiceReceipt(
              {
                ...order.invoiceData,
                id: createdInvoiceId,
                invoiceNumber: assignedInvoiceNumber?.number,
                invoiceFullNumber: assignedInvoiceNumber?.fullNumber
              },
              systemSettings
            )
          } catch (printError) {
            logger.error('Error auto-printing invoice on delivery:', printError)
            toast.error('صدرت الفاتورة لكن فشلت الطباعة التلقائية - تقدر تعيد الطباعة من الأرشيف')
          }
        } else if (alreadyInvoiced) {
          toast('الفاتورة كانت صدرت بالفعل لهذا الأوردر', { icon: 'ℹ️' })
        } else {
          toast.success('تم تحديث حالة الطلب')
        }
      } else {
        toast.success('تم تحديث حالة الطلب')
      }
    } catch (error) {
      logger.error('Error updating kitchen order status:', error)
      toast.error(
        error?.code === 'permission-denied'
          ? 'فشل تحديث الحالة: الحساب ده معندوش صلاحية في Firebase - راجع قواعد Firestore'
          : `فشل تحديث الحالة (${error?.code || error?.message || 'خطأ'}) - افحص الاتصال من إعدادات النظام`,
        { duration: 8000 }
      )
    } finally {
      setProcessing(order.id, false)
    }
  }

  // إلغاء الأوردر - بيوقف أي فاتورة مرتبطة بيه للأبد (مش هتتسجل خالص) وبيشيله
  // من قائمة الطلبات الحالية وينقله للأرشيف كـ"ملغي".
  const cancelOrder = async (order) => {
    if (!hasPermission('kitchen_cancel')) {
      toast.error('ليس لديك صلاحية إلغاء الطلبات')
      return
    }
    if (processingIds.has(order.id)) return
    const confirmed = window.confirm(`متأكد إنك عايز تلغي الطلب #${getInvoiceDisplayRef(order)}؟\nمفيش فاتورة هتتسجل لهذا الطلب.`)
    if (!confirmed) return

    setProcessing(order.id, true)
    try {
      await updateDoc(doc(db, 'kitchenOrders', order.id), {
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date()
      })
      toast.success('تم إلغاء الطلب')
    } catch (error) {
      logger.error('Error cancelling kitchen order:', error)
      toast.error('فشل إلغاء الطلب')
    } finally {
      setProcessing(order.id, false)
    }
  }

  // طباعة تذكرة البار والمطبخ منفصلين (كل قسم في ورقة لوحده)
  const printTicket = (order) => {
    printOrderTickets(order, systemSettings)
  }

  // إعادة طباعة فاتورة العميل من الأرشيف (متاحة فقط للأوردرات اللي اتحوّلت فاتورة)
  const reprintInvoice = (order) => {
    if (!order.invoiceData) {
      toast.error('لا توجد فاتورة مرتبطة بهذا الأوردر')
      return
    }
    printInvoiceReceipt({ ...order.invoiceData, id: order.invoiceId, invoiceNumber: order.invoiceData.invoiceNumber }, systemSettings)
  }

  const filteredOrders = selectedStation === 'all' ? orders : orders.filter(o => o.station === selectedStation)

  return (
    <div className="p-6 rtl">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-3xl font-bold dark:text-white">🍳 شاشة المطبخ</h1>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setView('active')}
            className={`px-4 py-2 rounded-lg font-bold ${view === 'active' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            الطلبات الحالية ({orders.length})
          </button>
          {hasPermission('kitchen_archive') && (
            <button
              onClick={() => setView('archive')}
              className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${view === 'archive' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
            >
              <ArchiveBoxIcon className="w-5 h-5" /> أرشيف الطلبات
            </button>
          )}
          {view === 'active' && stations.map(station => (
            <button key={station.id} onClick={() => setSelectedStation(station.id)} className={`px-4 py-2 rounded-lg flex items-center gap-2 ${selectedStation === station.id ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
              {station.icon} {station.name} ({orders.filter(o => o.station === station.id || station.id === 'all').length})
            </button>
          ))}
        </div>
      </div>

      {view === 'active' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredOrders.map(order => {
              const isProcessing = processingIds.has(order.id)
              return (
                <div key={order.id} className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border-r-4 ${timers[order.id]?.isUrgent ? 'border-red-500' : 'border-yellow-500'} ${isProcessing ? 'opacity-60' : ''}`}>
                  <div className="p-4 border-b dark:border-gray-700">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold">طلب #{getInvoiceDisplayRef(order)}</h3>
                        <p className="text-sm text-gray-500">{order.customerName || 'عميل'}</p>
                        {order.orderType && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${
                            order.orderType === 'takeaway' ? 'bg-orange-100 text-orange-800' :
                            order.orderType === 'delivery' ? 'bg-purple-100 text-purple-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {order.orderType === 'takeaway' ? 'تيك أواي' : order.orderType === 'delivery' ? 'ديليفري' : 'صالة'}
                            {order.tableNumber ? ` - طاولة ${order.tableNumber}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-center">
                        {timers[order.id] && (
                          <div className={`text-xl font-mono font-bold ${timers[order.id].isUrgent ? 'text-red-500 animate-pulse' : 'text-gray-600'}`}>
                            {timers[order.id].minutes}:{timers[order.id].seconds.toString().padStart(2, '0')}
                          </div>
                        )}
                        {timers[order.id]?.isUrgent && <div className="text-xs text-red-500 flex items-center gap-1"><FireIcon className="w-3 h-3" /> متأخر! (أكثر من 5 دقايق)</div>}
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="space-y-2">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <div><span className="font-bold">{item.quantity}x</span> <span className="mr-2">{item.name}</span>{item.notes && <p className="text-xs text-gray-500 mr-6">{item.notes}</p>}</div>
                          {item.preparing && <span className="text-xs text-green-500">جاري التحضير</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex flex-wrap gap-2">
                    {order.status === 'pending' && (
                      <button disabled={isProcessing} onClick={() => updateOrderStatus(order, 'preparing')} className="flex-1 py-2 bg-blue-500 disabled:bg-blue-300 text-white rounded-lg">بدء التحضير</button>
                    )}
                    {order.status === 'preparing' && (
                      <button disabled={isProcessing} onClick={() => updateOrderStatus(order, 'ready')} className="flex-1 py-2 bg-green-500 disabled:bg-green-300 text-white rounded-lg">جاهز للتسليم</button>
                    )}
                    {order.status === 'ready' && (
                      <button disabled={isProcessing} onClick={() => updateOrderStatus(order, 'completed')} className="flex-1 py-2 bg-gray-600 disabled:bg-gray-400 text-white rounded-lg">تم التسليم</button>
                    )}
                    <button disabled={isProcessing} onClick={() => printTicket(order)} className="px-3 py-2 bg-purple-500 text-white rounded-lg" title="طباعة التذكرة"><PrinterIcon className="w-5 h-5" /></button>
                    {hasPermission('kitchen_cancel') && (
                      <button disabled={isProcessing} onClick={() => cancelOrder(order)} className="px-3 py-2 bg-red-500 disabled:bg-red-300 text-white rounded-lg" title="إلغاء الطلب"><XCircleIcon className="w-5 h-5" /></button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {filteredOrders.length === 0 && (
            <div className="text-center py-12"><div className="text-6xl mb-4">🍽️</div><p className="text-gray-500">لا توجد طلبات حالياً</p></div>
          )}
        </>
      )}

      {view === 'archive' && hasPermission('kitchen_archive') && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">آخر {archivedOrders.length} أوردر (مُسلَّم أو ملغي)</p>
            <button onClick={loadArchive} className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg">تحديث</button>
          </div>

          {archiveLoading ? (
            <div className="text-center py-12 text-gray-500">جاري التحميل...</div>
          ) : archivedOrders.length === 0 ? (
            <div className="text-center py-12"><div className="text-6xl mb-4">🗂️</div><p className="text-gray-500">لا يوجد أرشيف بعد</p></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {archivedOrders.map(order => {
                const isCancelled = order.status === 'cancelled'
                return (
                  <div key={order.id} className={`bg-white dark:bg-gray-800 rounded-xl shadow p-4 border-r-4 ${isCancelled ? 'border-red-400' : 'border-green-500'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold">طلب #{isCancelled ? getInvoiceDisplayRef(order) : getInvoiceDisplayRef(order.invoiceData || order)}</h3>
                        <p className="text-xs text-gray-500">{order.customerName || 'عميل'}</p>
                      </div>
                      {isCancelled
                        ? <XCircleIcon className="w-6 h-6 text-red-500" />
                        : <CheckCircleIcon className="w-6 h-6 text-green-500" />}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      {isCancelled
                        ? `وقت الإلغاء: ${order.cancelledAt?.toDate ? order.cancelledAt.toDate().toLocaleString('ar-EG') : '-'}`
                        : `وقت التسليم: ${order.completedAt?.toDate ? order.completedAt.toDate().toLocaleString('ar-EG') : '-'}`}
                    </p>
                    <div className="space-y-1 mb-3">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="text-sm">{item.quantity}x {item.name}</div>
                      ))}
                    </div>
                    {!isCancelled && order.invoiceData?.total != null && (
                      <p className="text-sm font-bold mb-2">الإجمالي: {Number(order.invoiceData.total).toFixed(2)} {systemSettings?.currency || 'ج.م'}</p>
                    )}
                    {isCancelled && (
                      <p className="text-sm font-bold text-red-500 mb-2">ملغي - مفيش فاتورة</p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => printTicket({ ...order, invoiceNumber: order.invoiceData?.invoiceNumber ?? order.invoiceNumber })} className="flex-1 py-1.5 text-sm bg-purple-500 text-white rounded-lg flex items-center justify-center gap-1"><PrinterIcon className="w-4 h-4" /> تذكرة</button>
                      {!isCancelled && order.invoiceData && (
                        <button onClick={() => reprintInvoice(order)} className="flex-1 py-1.5 text-sm bg-blue-500 text-white rounded-lg">إعادة طباعة الفاتورة</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default KitchenDisplay
