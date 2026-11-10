// src/pages/POS/POS.jsx
import { useState, useRef, useEffect } from 'react'
import { 
  PlusIcon, 
  MinusIcon, 
  TrashIcon, 
  
  UserPlusIcon,
  TagIcon,
  
} from '@heroicons/react/24/outline'
import { db } from '../../services/firebase'
import { collection, addDoc, updateDoc, doc, increment } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { useSystem } from '../../contexts/SystemContext'
import toast from 'react-hot-toast'
import { getNextInvoiceNumber, getCurrentInvoiceNumber, getNextOrderNumber } from '../../services/invoiceNumberService'
import { printOrderTickets, printInvoiceReceipt, classifyItemDestination } from '../../utils/thermalPrint'
import { getActiveShift } from '../../services/shiftService'
import { deductProductsStock } from '../../services/inventoryService'
import { logger } from '../../utils/logger'
import { getLiveSnapshot, subscribeLive } from '../../services/liveCollections'

// تعريف أحجام ورق الكاشير المدعومة - محسنة لطابعة XP-V320N (80mm)
const POS = () => {
  const { userData, hasPermission } = useAuth()
  const { systemSettings } = useSystem()
  
  // ✅ الضريبة تأخذ القيمة من الإعدادات (مقفولة للتغيير)
  // الضريبة اتشالت من السيستم نهائياً (بطلب صاحب المكان)

  const [cart, setCart] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [customer, setCustomer] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [customers, setCustomers] = useState([])
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)
  const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '', email: '' })
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [amountPaid, setAmountPaid] = useState(0)
  const [products, setProducts] = useState([])
  const [discountType, setDiscountType] = useState('none')
  const [discountValue, setDiscountValue] = useState(0)
  const [orderType, setOrderType] = useState('dine_in') // dine_in | takeaway | delivery
  const [tableNumber, setTableNumber] = useState('')
  const [activeShift, setActiveShift] = useState(null)
  const [shiftLoading, setShiftLoading] = useState(true)
  const barcodeInput = useRef(null)
  const [invoiceNumber, setInvoiceNumber] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Load invoice number on component mount (عرض فقط - لا يزيد العداد)
  useEffect(() => {
    loadCurrentInvoiceNumber()
  }, [])

  const loadCurrentInvoiceNumber = async () => {
    try {
      const number = await getCurrentInvoiceNumber()
      setInvoiceNumber(number)
    } catch (error) {
      logger.error('Error loading invoice number:', error)
    }
  }

  // ✅ التأكد من وجود شيفت مفتوح قبل السماح بالبيع (درج الكاش)
  useEffect(() => {
    checkActiveShift()
  }, [])

  const checkActiveShift = async () => {
    setShiftLoading(true)
    try {
      const shift = await getActiveShift()
      setActiveShift(shift)
    } catch (error) {
      logger.error('Error checking active shift:', error)
    } finally {
      setShiftLoading(false)
    }
  }

  // المنتجات بـ listener واحد مباشر: بيقرا الكل مرة واحدة عند الفتح، وبعدها
  // بيستقبل المنتج اللي اتغيّر بس (زي الكمية بعد البيع). قبل كده كنا بنعيد
  // قراءة كل المنتجات بعد كل بيعة - وده كان بيستهلك حصة Firebase اليومية بسرعة.
  useEffect(() => {
    return subscribeLive(
      'products',
      (snapshot) => setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
      (error) => {
        logger.error('Error loading products:', error)
        toast.error('فشل تحميل المنتجات')
      }
    )
  }, [])

  // Search products
  useEffect(() => {
    if (searchTerm.length > 1) {
      const results = products.filter(p => 
        p.name?.includes(searchTerm) || 
        p.barcode?.includes(searchTerm) || 
        p.sku?.includes(searchTerm)
      )
      setSearchResults(results)
    } else {
      setSearchResults([])
    }
  }, [searchTerm, products])

  // تحميل العملاء مرة واحدة عند فتح الشاشة (بدل قراءة كل العملاء من Firestore
  // في كل ضغطة زر أثناء البحث، وهو ما كان يحدث سابقاً ويكلّف قراءات غير ضرورية)
  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    try {
      const querySnapshot = await getLiveSnapshot('customers')
      setCustomers(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      logger.error('Error loading customers:', error)
    }
  }

  // Search customers (فلترة محلية + debounce بسيط لتقليل عدد مرات الفلترة أثناء الكتابة)
  useEffect(() => {
    if (customerSearch.length <= 1) {
      setCustomerResults([])
      return
    }

    const timeoutId = setTimeout(() => {
      const results = customers.filter(
        c => c.name?.includes(customerSearch) || c.phone?.includes(customerSearch)
      )
      setCustomerResults(results)
    }, 250)

    return () => clearTimeout(timeoutId)
  }, [customerSearch, customers])

  const createNewCustomer = async () => {
    if (!newCustomerData.name || !newCustomerData.phone) {
      toast.error('الاسم ورقم الهاتف مطلوبين')
      return
    }
    
    try {
      const newCustomer = {
        ...newCustomerData,
        points: 0,
        totalSpent: 0,
        orders: 0,
        lastVisit: new Date(),
        createdAt: new Date()
      }
      const docRef = await addDoc(collection(db, 'customers'), newCustomer)
      const savedCustomer = { id: docRef.id, ...newCustomer }
      setCustomer(savedCustomer)
      setCustomers(prev => [...prev, savedCustomer])
      setShowNewCustomerModal(false)
      setNewCustomerData({ name: '', phone: '', email: '' })
      setCustomerSearch('')
      toast.success('تم إضافة العميل بنجاح')
    } catch (error) {
      toast.error('فشل إضافة العميل')
    }
  }

  const addToCart = (product) => {
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === product.id)
      if (existing) {
        return prevCart.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prevCart, { ...product, quantity: 1 }]
    })
    toast.success(`تم إضافة ${product.name}`)
    setSearchTerm('')
    barcodeInput.current?.focus()
  }

  // السكانر بيكتب الباركود بسرعة ويبعت Enter فوراً - ساعات قبل ما نتايج البحث
  // تتحدّث، أو يطابق منتج تاني باركوده بيحتوي على نفس الأرقام. فبندوّر الأول
  // على تطابق تام للباركود/SKU في كل المنتجات، وبعدين نرجع لأول نتيجة بحث.
  const handleSearchEnter = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const term = searchTerm.trim()
    if (!term) return
    const exact = products.find(p => p.barcode === term || p.sku === term)
    if (exact) return addToCart(exact)
    const matches = products.filter(p =>
      p.name?.includes(term) || p.barcode?.includes(term) || p.sku?.includes(term)
    )
    if (matches.length > 0) return addToCart(matches[0])
    toast.error(`مفيش منتج بالباركود ${term}`)
    setSearchTerm('')
  }

  const updateQuantity = (id, delta) => {
    setCart(prev => 
      prev.map(item =>
        item.id === id
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    )
  }

  const updateItemNotes = (id, notes) => {
    setCart(prev =>
      prev.map(item =>
        item.id === id ? { ...item, notes } : item
      )
    )
  }

  const removeItem = (id) => {
    setCart(prev => prev.filter(item => item.id !== id))
    toast.success('تم حذف المنتج')
  }

  // حساب الإجماليات
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  
  let discountAmount = 0
  if (discountType === 'percentage') {
    discountAmount = subtotal * (discountValue / 100)
  } else if (discountType === 'fixed') {
    discountAmount = discountValue
  }
  
  const afterDiscount = subtotal - discountAmount
  const total = afterDiscount
  const change = amountPaid - total

  // طباعة فاتورة البيع - بقت دالة مشتركة في thermalPrint.js عشان تتستخدم
  // كمان من شاشة المطبخ لحظة "تم التسليم" (لو تفعيل ربط المطبخ بالفاتورة شغال)
  const printReceipt = (invoice) => printInvoiceReceipt(invoice, systemSettings)

  const completeSale = async (forceImmediate = false) => {
    // ✅ منع التكرار
    if (isProcessing) {
      return
    }

    if (forceImmediate && !hasPermission('pos_direct_sale')) {
      toast.error('ليس لديك صلاحية "بيع مباشر"')
      return
    }

    if (cart.length === 0) {
      toast.error('السلة فارغة')
      return
    }
    if (amountPaid < total) {
      toast.error('المبلغ المدفوع أقل من الإجمالي')
      return
    }
    const shiftRequired = systemSettings?.requireOpenShift === true
    if (shiftRequired && !activeShift) {
      toast.error('لازم تفتح شيفت من صفحة "درج الكاش" الأول قبل البيع')
      return
    }
    if (orderType === 'dine_in' && !tableNumber) {
      toast.error('أدخل رقم الطاولة')
      return
    }

    setIsProcessing(true)

    try {
      const kitchenEnabled = systemSettings?.kitchenDisplayEnabled !== false
      // ✅ الإعداد الافتراضي: الفاتورة متتسجلش في جدول الفواتير إلا لما شاشة
      // المطبخ تحدّث حالة الأوردر لـ"تم التسليم". ⚠️ ده إعداد مستقل تماماً عن
      // kitchenDisplayEnabled. اتحكم فيه من صفحة الإعدادات -> "شاشة المطبخ" ->
      // "لا تُصدر الفاتورة إلا بعد التسليم" (systemSettings.requireKitchenDeliveryForInvoice).
      // زرار "بيع مباشر" (forceImmediate=true) بيتجاوز الإعداد ده يدوياً لأصناف
      // جاهزة أو بتتباع على طول من غير ما تحتاج تحضير في المطبخ.
      const requireDeliveryBeforeInvoice = !forceImmediate && systemSettings?.requireKitchenDeliveryForInvoice !== false

      // بناء بيانات الفاتورة (من غير رقم تسلسلي لسه - شوف الملاحظة تحت)
      const invoiceData = {
        items: cart.map(item => ({
          productId: item.id || '',
          name: item.name || '',
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
          total: Number(item.price * item.quantity) || 0,
          // بنسجل حالة تتبع المخزون وقت البيع نفسه، عشان خصم الكمية (سواء
          // فوري أو لحظة التسليم من المطبخ) يعرف يتجاهل صح المنتجات اللي
          // من غير تتبع مخزون (بتتحضر أول بأول) من غير ما يحتاج يرجع يقرأ
          // المنتج تاني.
          trackStock: item.trackStock !== false
        })),
        subtotal: Number(subtotal) || 0,
        discount: {
          type: discountType,
          value: Number(discountValue) || 0,
          amount: Number(discountAmount) || 0
        },
        tax: 0,
        taxRate: 0,
        total: Number(total) || 0,
        paymentMethod: paymentMethod,
        amountPaid: Number(amountPaid) || 0,
        change: Number(change > 0 ? change : 0),
        customerName: customer?.name || 'عميل نقدي',
        cashierName: userData?.name || 'كاشير',
        cashierId: userData?.uid || null,
        timestamp: new Date(),
        status: 'completed',
        shiftId: activeShift?.id || null,
        orderType,
        tableNumber: orderType === 'dine_in' ? tableNumber : null
      }

      if (customer?.id) {
        invoiceData.customerId = customer.id
      }
      if (userData?.branch) {
        invoiceData.branch = userData.branch
      }

      const kitchenItems = cart.map(item => ({
        name: item.name || '',
        quantity: Number(item.quantity) || 1,
        notes: item.notes || '',
        category: item.category || '',
        destination: classifyItemDestination(item)
      }))

      if (requireDeliveryBeforeInvoice) {
        // ⛔ مفيش فاتورة بتتسجل دلوقتي خالص، وبالتالي مفيش رقم فاتورة
        // تسلسلي بيتحجز دلوقتي كمان. لو حجزنا رقم دلوقتي والأوردر اتلغى بعد
        // كده، الرقم ده كان هيضيع للأبد ويعمل "فجوة" في تسلسل الفواتير.
        // عشان كده رقم الفاتورة بيتحجز بس في اللحظة اللي الفاتورة فعلاً
        // بتتسجل فيها (لحظة "تم التسليم" - شوف KitchenDisplay.jsx)، فيضمن
        // ترقيم متسلسل بدون فجوات مهما اتلغى من أوردرات.
        //
        // بدل ما الأوردر يظهر برقم عشوائي (جزء من معرّف قاعدة البيانات)
        // لحد ما ياخد رقم الفاتورة الرسمي، بناخده رقم أوردر بسيط تسلسلي
        // (1، 2، 3...) فوراً - مستقل عن رقم الفاتورة ومش بيأثر فيه.
        const orderNumber = await getNextOrderNumber()

        const kitchenOrderData = {
          orderNumber,
          customerName: customer?.name || null,
          cashierName: userData?.name || 'كاشير',
          orderType,
          tableNumber: orderType === 'dine_in' ? tableNumber : null,
          items: kitchenItems,
          station: 'all',
          status: 'pending',
          invoiced: false,
          invoiceData,
          createdAt: new Date()
        }

        const kitchenDocRef = await addDoc(collection(db, 'kitchenOrders'), kitchenOrderData)
        if (systemSettings?.kitchenAutoPrint !== false) {
          try {
            printOrderTickets({ id: kitchenDocRef.id, ...kitchenOrderData }, systemSettings)
          } catch (printError) {
            logger.error('Error auto-printing kitchen/bar tickets:', printError)
            toast.error('تم إرسال الطلب للمطبخ، لكن فشلت الطباعة التلقائية - تقدر تطبع يدوياً من شاشة المطبخ')
          }
        }

        toast.success(`🧾 تم إرسال الطلب رقم ${orderNumber ?? kitchenDocRef.id.slice(-6)} للمطبخ - هياخد رقم فاتورة رسمي تلقائياً بعد "تم التسليم"`, { duration: 6000 })

        // تصفير السلة عشان الكاشير ياخد أوردر تاني وهو مستني تحضير ده
        setCart([])
        setCustomer(null)
        setAmountPaid(0)
        setTableNumber('')
        setDiscountType('none')
        setDiscountValue(0)

        barcodeInput.current?.focus()

        return
      }

      // ------- بيع فوري: فاتورة بتتسجل على طول (المطبخ مقفول، أو الإعداد
      // متوقف، أو الكاشير دوس "بيع مباشر" يدوياً للأصناف اللي مش محتاجة تحضير) -------
      // هنا بس بيتحجز رقم الفاتورة، لحظة إنشائها فعلياً بعد سطرين.
      const newInvoiceNumber = await getNextInvoiceNumber()
      setInvoiceNumber(newInvoiceNumber)
      invoiceData.invoiceNumber = newInvoiceNumber.number
      invoiceData.invoiceFullNumber = newInvoiceNumber.fullNumber
      invoiceData.offlineGenerated = !!newInvoiceNumber.offline
      if (newInvoiceNumber.offline) {
        invoiceData.offlineReason = newInvoiceNumber.reason || null
        toast.error(
          newInvoiceNumber.reason === 'permission-denied'
            ? 'رقم الفاتورة مؤقت: الحساب ده معندوش صلاحية على عداد الفواتير في Firebase (راجع قواعد Firestore)'
            : 'رقم الفاتورة مؤقت بسبب مشكلة في الاتصال - هيتصلح تلقائياً لرقم تسلسلي أول ما الاتصال يرجع',
          { duration: 7000 }
        )
      }

      // ✅ حفظ الفاتورة في Firebase (مرة واحدة)
      const docRef = await addDoc(collection(db, 'invoices'), invoiceData)

      // ✅ خصم الكميات المباعة من مخزون المنتجات (بيتجاهل تلقائياً أي منتج
      // معلّم "بدون تتبع مخزون"). فشل الخصم لا يوقف البيع نفسه بعد ما
      // الفاتورة اتسجلت، بس بيبلّغ الكاشير عشان يراجع المخزون يدوياً.
      try {
        await deductProductsStock(invoiceData.items)
      } catch (stockError) {
        logger.error('Error deducting product stock:', stockError)
        toast.error(
          stockError?.code === 'permission-denied'
            ? 'تم البيع، لكن الحساب ده معندوش صلاحية يعدّل كميات المنتجات في Firebase - راجع قواعد Firestore'
            : `تم البيع، لكن المخزون متخصمش (${stockError?.code || 'خطأ'}) - افحص الاتصال من إعدادات النظام`,
          { duration: 8000 }
        )
      }

      // ✅ إنشاء أوردر على شاشة المطبخ/البار للتوثيق والطباعة فقط (مُسجَّل
      // كـ"مُفوتَر" مسبقاً invoiced:true عشان محدّش يحاول يصدر له فاتورة تانية)
      // - بيتفعل بس لو الأوردر أصلاً معدى مسار المطبخ (مش بيع مباشر بالكامل)
      if (kitchenEnabled && !forceImmediate) {
        try {
          const kitchenOrderData = {
            invoiceId: docRef.id,
            invoiceNumber: newInvoiceNumber.number,
            invoiceFullNumber: newInvoiceNumber.fullNumber,
            customerName: customer?.name || null,
            cashierName: userData?.name || 'كاشير',
            orderType,
            tableNumber: orderType === 'dine_in' ? tableNumber : null,
            items: kitchenItems,
            station: 'all',
            status: 'pending',
            invoiced: true,
            createdAt: new Date()
          }
          const kitchenDocRef = await addDoc(collection(db, 'kitchenOrders'), kitchenOrderData)
          if (systemSettings?.kitchenAutoPrint !== false) {
            printOrderTickets({ id: kitchenDocRef.id, ...kitchenOrderData }, systemSettings)
          }
        } catch (kitchenError) {
          // فشل إرسال الأوردر للمطبخ لا يجب أن يوقف عملية البيع نفسها بعد نجاح
          // حفظ الفاتورة، لكن لازم الكاشير يعرف عشان يبلغ البار يدوياً
          logger.error('Error creating kitchen order:', kitchenError)
          toast.error('تم البيع، لكن فشل إرسال الأوردر لشاشة المطبخ - بلّغ البار يدوياً')
        }
      }

      // تحديث نقاط العميل - في try/catch منفصلة ومؤجّلة لآخر حاجة، عشان
      // فشلها (لو حصل) ميوقفش طباعة الفاتورة أو رسالة نجاح البيع اللي
      // المفروض حصلت فعلاً بالفعل في السطور اللي فاتت.
      toast.success(`✅ تم إتمام البيع بنجاح - فاتورة رقم ${newInvoiceNumber.number ?? newInvoiceNumber.fullNumber}`)
      
      // ✅ طباعة الفاتورة (مرة واحدة)
      try {
        printReceipt({ ...invoiceData, id: docRef.id, invoiceNumber: newInvoiceNumber.number })
      } catch (printError) {
        logger.error('Error auto-printing invoice receipt:', printError)
        toast.error('تم البيع بنجاح، لكن فشلت طباعة الفاتورة التلقائية - تقدر تعيد الطباعة من الأرشيف')
      }

      if (customer?.id) {
        try {
          const customerRef = doc(db, 'customers', customer.id)
          await updateDoc(customerRef, {
            points: increment(Math.floor(total / 10)),
            totalSpent: increment(total),
            orders: increment(1),
            lastVisit: new Date()
          })
        } catch (customerError) {
          logger.error('Error updating customer loyalty points:', customerError)
          toast.error('تم البيع والطباعة، لكن فشل تحديث نقاط العميل')
        }
      }
      
      // تصفير السلة
      setCart([])
      setCustomer(null)
      setAmountPaid(0)
      setTableNumber('')
      setDiscountType('none')
      setDiscountValue(0)
      
      // جلب رقم الفاتورة التالي (عرض فقط)
      const nextNumber = await getCurrentInvoiceNumber()
      setInvoiceNumber(nextNumber)
      
      barcodeInput.current?.focus()
      
    } catch (error) {
      logger.error('❌ Error completing sale:', error)
      toast.error('حدث خطأ في إتمام البيع: ' + error.message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4 rtl">
      {/* Cart Section */}
      <div className="w-1/2 bg-white dark:bg-gray-800 rounded-xl shadow-lg flex flex-col">
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold dark:text-white">🛒 السلة</h2>
            {invoiceNumber && (
              <p className="text-xs text-gray-500 mt-1">رقم الفاتورة القادم: {invoiceNumber.number}</p>
            )}
          </div>
          {customer && (
            <div className="text-sm bg-green-100 dark:bg-green-900/20 px-3 py-1 rounded-full">
              👤 {customer.name}
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-6xl mb-4">🛒</div>
              <p>السلة فارغة</p>
              <p className="text-sm mt-2">امسح الباركود أو ابحث عن منتج</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold dark:text-white">{item.name}</p>
                      <p className="text-sm text-gray-500">{item.price} ج.م</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 bg-red-500 text-white rounded-lg hover:bg-red-600"><MinusIcon className="w-4 h-4 mx-auto" /></button>
                      <span className="w-8 text-center font-bold dark:text-white">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 bg-green-500 text-white rounded-lg hover:bg-green-600"><PlusIcon className="w-4 h-4 mx-auto" /></button>
                      <button onClick={() => removeItem(item.id)} className="w-8 h-8 bg-gray-500 text-white rounded-lg hover:bg-gray-600"><TrashIcon className="w-4 h-4 mx-auto" /></button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={item.notes || ''}
                    onChange={(e) => updateItemNotes(item.id, e.target.value)}
                    placeholder="ملاحظة للبار (مثال: سكر زيادة، من غير ثلج)"
                    className="w-full px-3 py-1.5 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t dark:border-gray-700 space-y-2">
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>المجموع الفرعي:</span>
            <span>{subtotal.toFixed(2)} ج.م</span>
          </div>
          
          {discountAmount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>الخصم:</span>
              <span>- {discountAmount.toFixed(2)} ج.م</span>
            </div>
          )}
          
          <div className="flex justify-between text-xl font-bold dark:text-white pt-2 border-t">
            <span>الإجمالي:</span>
            <span>{total.toFixed(2)} ج.م</span>
          </div>
        </div>
      </div>
      
      {/* Controls Section */}
      <div className="w-1/2 space-y-4">
        {/* Search */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4">
          <input 
            ref={barcodeInput} 
            type="text" 
            placeholder="🔍 ابحث بالاسم، الباركود، أو SKU..." 
            className="w-full px-4 py-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            onKeyDown={handleSearchEnter} 
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className="mt-3 border rounded-lg max-h-60 overflow-y-auto">
              {searchResults.map(product => (
                <div key={product.id} className="p-3 border-b cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" onClick={() => addToCart(product)}>
                  <p className="font-semibold dark:text-white">{product.name}</p>
                  <p className="text-sm text-gray-500">{product.price} ج.م | {product.barcode || 'بدون باركود'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customer Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4">
          <div className="flex gap-2 mb-3">
            <input 
              type="text" 
              placeholder="👤 بحث عن عميل..." 
              className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value={customerSearch} 
              onChange={(e) => setCustomerSearch(e.target.value)} 
            />
            <button 
              onClick={() => setShowNewCustomerModal(true)} 
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <UserPlusIcon className="w-5 h-5" /> جديد
            </button>
          </div>
          
          {customerResults.length > 0 && (
            <div className="mt-2 border rounded-lg max-h-32 overflow-y-auto">
              {customerResults.map(cust => (
                <div 
                  key={cust.id} 
                  className="p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" 
                  onClick={() => { setCustomer(cust); setCustomerSearch(''); setCustomerResults([]); }}
                >
                  {cust.name} - {cust.phone}
                </div>
              ))}
            </div>
          )}
          
          {customer && (
            <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/20 rounded-lg flex justify-between items-center">
              <span>✓ العميل: {customer.name} ({customer.points || 0} نقطة)</span>
              <button className="text-red-500 hover:text-red-700" onClick={() => setCustomer(null)}>إلغاء</button>
            </div>
          )}
        </div>

        {/* Discount */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <span className="dark:text-white font-medium self-center">الخصم:</span>
            <select 
              value={discountType} 
              onChange={(e) => { setDiscountType(e.target.value); setDiscountValue(0) }} 
              className="px-3 py-1 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="none">بدون خصم</option>
              <option value="percentage">نسبة مئوية %</option>
              <option value="fixed">قيمة ثابتة</option>
            </select>
          </div>
          
          {discountType !== 'none' && (
            <div className="flex gap-2">
              <input 
                type="number" 
                placeholder={discountType === 'percentage' ? 'نسبة الخصم %' : 'قيمة الخصم'} 
                className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                value={discountValue} 
                onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)} 
              />
              <TagIcon className="w-5 h-5 text-gray-400 self-center" />
            </div>
          )}
        </div>

        {/* Order Type */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4">
          <p className="text-sm font-semibold mb-2 dark:text-gray-300">نوع الأوردر</p>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[
              { id: 'dine_in', name: 'صالة' },
              { id: 'takeaway', name: 'تيك أواي' },
              { id: 'delivery', name: 'ديليفري' }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setOrderType(type.id)}
                className={`p-2 rounded-lg border text-sm transition-all ${orderType === type.id ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 dark:border-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                {type.name}
              </button>
            ))}
          </div>
          {orderType === 'dine_in' && (
            <input
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="رقم الطاولة"
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Payment */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4">
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { id: 'cash', name: 'كاش', icon: '💰' }, 
              { id: 'vodafone_cash', name: 'فودافون كاش', icon: '📱' }, 
              { id: 'card', name: 'بطاقة', icon: '💳' }, 
              { id: 'bank_transfer', name: 'تحويل بنكي', icon: '🏦' }
            ].map(method => (
              <button 
                key={method.id} 
                onClick={() => setPaymentMethod(method.id)} 
                className={`p-3 rounded-lg border transition-all ${paymentMethod === method.id ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 dark:border-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                {method.icon} {method.name}
              </button>
            ))}
          </div>
          
          <input 
            type="number" 
            placeholder="💵 المبلغ المدفوع" 
            className="w-full px-4 py-3 border rounded-lg text-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
            value={amountPaid} 
            onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)} 
          />
          
          {amountPaid >= total && amountPaid > 0 && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-green-600 dark:text-green-400 font-semibold">الباقي للعميل: {change.toFixed(2)} ج.م</p>
            </div>
          )}
        </div>
        
        {/* Shift closed warning - يظهر بس لو فتح الشيفت مفعّل كإلزامي من الإعدادات */}
        {systemSettings?.requireOpenShift === true && !shiftLoading && !activeShift && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg text-center">
            <p className="text-red-600 dark:text-red-400 font-semibold text-sm">
              لا يوجد شيفت مفتوح - لازم تفتح شيفت من صفحة "درج الكاش" قبل البيع
            </p>
          </div>
        )}

        {/* Complete Sale Button */}
        <div className="space-y-2">
          <button 
            onClick={() => completeSale(false)} 
            disabled={isProcessing || cart.length === 0 || (systemSettings?.requireOpenShift === true && !activeShift)}
            className={`w-full py-4 text-white font-bold rounded-xl text-lg transition-all transform hover:scale-[1.02] shadow-lg ${
              isProcessing || cart.length === 0 || (systemSettings?.requireOpenShift === true && !activeShift)
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
            }`}
          >          {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                جاري المعالجة...
              </span>
            ) : (
              systemSettings?.requireKitchenDeliveryForInvoice !== false
                ? '🍳 إرسال الطلب للمطبخ'
                : '✅ إتمام البيع'
            )}
          </button>

          {/* بيع مباشر: يتجاوز مسار المطبخ يدوياً لأصناف جاهزة/بتتباع على طول
              (زي المياه، السجاير، أي منتج جاهز) - بيسجل الفاتورة فوراً ويطبعها. */}
          {systemSettings?.requireKitchenDeliveryForInvoice !== false && hasPermission('pos_direct_sale') && (
            <button
              onClick={() => completeSale(true)}
              disabled={isProcessing || cart.length === 0 || (systemSettings?.requireOpenShift === true && !activeShift)}
              className={`w-full py-2.5 font-bold rounded-xl text-sm transition-all shadow ${
                isProcessing || cart.length === 0 || (systemSettings?.requireOpenShift === true && !activeShift)
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700'
                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50'
              }`}
              title="لأصناف جاهزة ومش محتاجة تحضير في المطبخ - بتسجل الفاتورة فوراً"
            >
              ⚡ بيع مباشر (بدون انتظار المطبخ)
            </button>
          )}
        </div>
      </div>

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">إضافة عميل جديد</h2>
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="الاسم الكامل" 
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                value={newCustomerData.name} 
                onChange={(e) => setNewCustomerData({...newCustomerData, name: e.target.value})} 
              />
              <input 
                type="tel" 
                placeholder="رقم الهاتف" 
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                value={newCustomerData.phone} 
                onChange={(e) => setNewCustomerData({...newCustomerData, phone: e.target.value})} 
              />
              <input 
                type="email" 
                placeholder="البريد الإلكتروني (اختياري)" 
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                value={newCustomerData.email} 
                onChange={(e) => setNewCustomerData({...newCustomerData, email: e.target.value})} 
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={createNewCustomer} className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors">إضافة</button>
              <button onClick={() => setShowNewCustomerModal(false)} className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default POS