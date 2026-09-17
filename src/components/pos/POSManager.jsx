import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, addDoc, getDocs, getDoc, doc, updateDoc, query, where, serverTimestamp, orderBy, increment, limit, runTransaction
} from 'firebase/firestore';
import {
  Receipt,
  Search,
  User,
  Phone,
  Loader2,
  X,
  Image as ImageIcon,
  UserPlus,
  Link2 as LinkIcon,
  CheckCircle
} from 'lucide-react';
import { InvoiceRenderer } from './InvoiceRenderer';
import { db } from '../../firebase/config';
import { useDebounce } from '../../hooks/useDebounce';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showInfo, showSuccess } from '../../utils/alerts';
import { buildQueryTokens, buildSearchTokens, normalizePhone, normalizeSearch } from '../../utils/search';

export function POSManager({ appUser, systemSettings, setGlobalLoading, prefillFromTicket, onConsumeTicketPrefill }) { 
  const [sellQty, setSellQty] = useState(1);
  const [search, setSearch] = useState('');
  const [foundItem, setFoundItem] = useState(null);
  const [invoice, setInvoice] = useState({ 
    customerName: '', 
    phone: '', 
    email: '',
    discount: 0, 
    discountType: 'value', 
    taxEnabled: true, 
    installationFeeId: '', 
    technicianName: '',
    paymentMethod: 'cash',
    notes: '',
    bankTransferDetails: '',
    cardLastFour: '',
    // ✨ ميزة جديدة: ربط الفاتورة بتذكرة الصيانة اللي طلعت منها (لو موجودة)
    ticketId: '',
    ticketNumber: ''
  });
  const [invoiceData, setInvoiceData] = useState(null);
  const [recentCustomers, setRecentCustomers] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [quickAmounts] = useState([100, 200, 500, 1000, 2000, 5000]);
  const [cart, setCart] = useState([]);

  // ✨ ميزة جديدة: تعبئة نقطة البيع تلقائيًا لما الفاتورة جاية من تذكرة صيانة
  useEffect(() => {
    if (!prefillFromTicket) return;
    setInvoice(prev => ({
      ...prev,
      customerName: prefillFromTicket.customerName || '',
      phone: prefillFromTicket.customerPhone || '',
      ticketId: prefillFromTicket.ticketId || '',
      ticketNumber: prefillFromTicket.ticketNumber || ''
    }));

    // 🛠️ FIX: كل قطع الغيار كانت بتتحول لـ"خدمات" عامة بدون خصم من
    // المخزون، حتى لو كانت فعليًا قطعة حقيقية مرتبطة بصنف في المخزون.
    // دلوقتي: لو القطعة معاها id حقيقي، بنتحقق من وجودها وكميتها المتاحة
    // فعليًا دلوقتي (مش الكمية القديمة المحفوظة وقت إضافتها للتذكرة، اللي
    // ممكن تكون اتغيرت)، وبتتحط في السلة كصنف حقيقي يتخصم من المخزون عند
    // الدفع. لو القطعة اتضافت يدويًا بدون ربط بالمخزون (أو الصنف بقى مش
    // موجود/اتحذف)، بتفضل تتعامل كخدمة عادية زي قبل كده.
    const loadPrefillItems = async () => {
      const rawItems = prefillFromTicket.items || [];
      const cartItems = [];

      for (let idx = 0; idx < rawItems.length; idx++) {
        const item = rawItems[idx];
        const fallbackServiceItem = {
          id: `ticket-item-${prefillFromTicket.ticketId}-${idx}`,
          name: item.name,
          price: Number(item.price) || 0,
          quantity: Number(item.quantity) || 1,
          serialNumber: '-',
          isService: true,
          underWarranty: false
        };

        if (!item.id) {
          cartItems.push(fallbackServiceItem);
          continue;
        }

        try {
          const snap = await getDoc(doc(db, 'inventory', item.id));
          if (!snap.exists() || snap.data().isDeleted) {
            cartItems.push(fallbackServiceItem);
            continue;
          }
          const invData = snap.data();
          const availableQty = Number(invData.quantity) || 0;
          const requestedQty = Number(item.quantity) || 1;

          if (availableQty <= 0) {
            showError(`⚠️ "${item.name}" نفذ من المخزون - اتضافت كخدمة بدون خصم مخزون`);
            cartItems.push(fallbackServiceItem);
            continue;
          }

          const finalQty = Math.min(requestedQty, availableQty);
          if (finalQty < requestedQty) {
            showError(`⚠️ الكمية المتاحة من "${item.name}" أقل من المطلوب (متاح ${availableQty} فقط)`);
          }

          cartItems.push({
            id: item.id,
            name: invData.name,
            price: Number(invData.price) || 0,
            quantity: finalQty,
            serialNumber: invData.serialNumber || item.serialNumber || '-',
            isService: false,
            underWarranty: false
          });
        } catch (error) {
          console.error('Failed to verify ticket spare part stock:', error);
          cartItems.push(fallbackServiceItem);
        }
      }

      if (cartItems.length > 0) {
        setCart(prev => [...prev, ...cartItems]);
      }
      showInfo(`تم تجهيز بيانات التذكرة #${prefillFromTicket.ticketNumber} في الفاتورة`);
    };

    loadPrefillItems();
    if (onConsumeTicketPrefill) onConsumeTicketPrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillFromTicket]);

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [paymentModal, setPaymentModal] = useState(false);
  const [cashReceived, setCashReceived] = useState(0);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrcode, setQrcode] = useState('');
  // ✨ ميزة جديدة: بحث ذكي عن العميل أثناء الكتابة في اسم العميل
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const debouncedCustomerName = useDebounce(invoice.customerName, 400);

  useEffect(() => {
    const term = (debouncedCustomerName || '').trim();
    if (term.length < 2) {
      setCustomerSuggestions([]);
      return;
    }
    const tokens = buildQueryTokens(term);
    if (tokens.length === 0) return;

    let cancelled = false;
    const search = async () => {
      setSearchingCustomers(true);
      try {
        const q = query(
          collection(db, 'customers'),
          where('searchTokens', 'array-contains-any', tokens),
          limit(20)
        );
        const snap = await getDocs(q);
        let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // ترتيب النتائج: الأقرب لبداية الاسم أولاً
        const normalizedTerm = normalizeSearch(term);
        results.sort((a, b) => {
          const aStarts = normalizeSearch(a.name || '').startsWith(normalizedTerm) ? 0 : 1;
          const bStarts = normalizeSearch(b.name || '').startsWith(normalizedTerm) ? 0 : 1;
          return aStarts - bStarts;
        });
        if (!cancelled) setCustomerSuggestions(results.slice(0, 6));
      } catch (error) {
        console.error("Customer search error:", error);
      }
      if (!cancelled) setSearchingCustomers(false);
    };
    search();
    return () => { cancelled = true; };
  }, [debouncedCustomerName]);

  useEffect(() => {
    const fetchRecentCustomers = async () => {
      try {
        const q = query(collection(db, 'customers'), orderBy('lastPurchase', 'desc'), limit(5));
        const snap = await getDocs(q);
        setRecentCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching recent customers:", error);
      }
    };
    fetchRecentCustomers();
  }, []);

  // ==========================================================================
  // 📊 حساب الإجمالي مع مراعاة الضمان والخدمات
  // ==========================================================================
  const calculations = useMemo(() => {
    if (cart.length === 0 && !foundItem) return { 
      subtotal: 0, 
      discountAmount: 0, 
      taxAmount: 0, 
      finalTotal: 0, 
      installAmount: 0,
      servicesAmount: 0 
    };
    
    let subtotal = 0;
    let servicesAmount = 0;
    
    if (foundItem) {
      // ✅ إذا كان العنصر وجد بشكل منفرد
      const price = foundItem.isService ? 0 : (Number(foundItem.price) || 0);
      subtotal = foundItem.isService ? 0 : price;
      servicesAmount = foundItem.isService ? price : 0;
    } else if (cart.length > 0) {
      // ✅ حساب القطع والخدمات بشكل منفصل
      cart.forEach(item => {
        if (item.isService) {
          // ✅ الخدمات تضاف إلى servicesAmount
          servicesAmount += (Number(item.price) || 0) * (item.quantity || 1);
        } else {
          // ✅ القطع: إذا كانت تحت الضمان تصبح قيمتها 0
          const itemPrice = item.underWarranty ? 0 : (Number(item.price) || 0);
          subtotal += itemPrice * (item.quantity || 1);
        }
      });
    }

    const discountVal = Number(invoice.discount) || 0;
    let discountAmount = 0;
    if (invoice.discountType === 'percent') {
      discountAmount = subtotal * discountVal / 100;
    } else {
      discountAmount = discountVal;
    }
    discountAmount = Math.min(discountAmount, subtotal);
    
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxRate = Number(systemSettings.taxRate) || 14;
    const taxAmount = invoice.taxEnabled ? (taxableAmount * (taxRate / 100)) : 0;
    
    const selectedFee = (systemSettings.installationFees || []).find(f => f.id === invoice.installationFeeId);
    const installAmount = Number(selectedFee?.value || 0);
    
    // ✅ الإجمالي النهائي = القطع + الخدمات + الضريبة + الرسوم
    const finalTotal = Math.round(taxableAmount + taxAmount + installAmount + servicesAmount);
    
    return { 
      subtotal, 
      discountAmount, 
      taxAmount, 
      installAmount,
      servicesAmount,
      finalTotal 
    };
  }, [foundItem, cart, invoice, systemSettings]);

  // ==========================================================================
  // 🔍 البحث عن المنتج وإضافته للسلة مع دعم الضمان
  // ==========================================================================
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;

    setSearchHistory(prev => [search, ...prev.slice(0, 4)]);
    setGlobalLoading(true);

    try {
      const searchTerm = search.trim().toLowerCase();

      // ✅ البحث في المخزون
      const q = query(
        collection(db, 'inventory'),
        where('serialNumber', '==', searchTerm),
        where('isDeleted', '==', false),
        where('quantity', '>', 0)
      );

      const snap = await getDocs(q);

      if (!snap.empty) {
        const item = { 
          id: snap.docs[0].id, 
          ...snap.docs[0].data(),
          underWarranty: false, // ✅ إضافة خاصية الضمان
          isService: false      // ✅ إضافة خاصية الخدمة
        };
        
        const qtyRequested = Number(sellQty) || 1;
        const availableQty = Number(item.quantity) || 0;

        if (qtyRequested > availableQty) {
          showError(`❌ الكمية المطلوبة (${qtyRequested}) أكبر من المتاح (${availableQty})`);
          setGlobalLoading(false);
          return;
        }

        const existingIndex = cart.findIndex(i => i.id === item.id);

        if (existingIndex !== -1) {
          // ✅ تحديث الكمية مع الحفاظ على حالة الضمان
          const newQty = cart[existingIndex].quantity + qtyRequested;
          if (newQty > availableQty) {
            showError(`❌ تم تجاوز الحد المتاح في المخزن (${availableQty})`);
            setGlobalLoading(false);
            return;
          }
          const updatedCart = [...cart];
          updatedCart[existingIndex] = { 
            ...updatedCart[existingIndex], 
            quantity: newQty
          };
          setCart(updatedCart);
        } else {
          // ✅ إضافة منتج جديد مع underWarranty = false
          setCart([...cart, { 
            ...item, 
            quantity: qtyRequested,
            underWarranty: false,
            isService: false
          }]);
        }

        setSellQty(1);
        setSearch('');
        setFoundItem(null);
      } else {
        showError("❌ الباركود غير صحيح أو الكمية غير متوفرة");
        setFoundItem(null);
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'permission-denied') {
        showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
      } else {
        showError("خطأ في البحث: " + err.message);
      }
    }
    setGlobalLoading(false);
  };

  // ==========================================================================
  // 👤 اختيار عميل
  // ==========================================================================
  const handleSelectCustomer = (customer) => {
    setInvoice({
      ...invoice,
      customerName: customer.name,
      phone: customer.phone,
      email: customer.email || ''
    });
    setShowCustomerModal(false);
  };

  // ==========================================================================
  // ➕ إضافة عميل جديد
  // ==========================================================================
  const handleAddNewCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) {
      showError("الاسم ورقم الهاتف مطلوبان");
      return;
    }

    setGlobalLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        createdAt: serverTimestamp(),
        createdBy: appUser.id,
        createdByName: appUser.name,
        searchKey: normalizeSearch(`${newCustomer.name} ${newCustomer.phone} ${newCustomer.email || ''}`)
      });
      
      setInvoice({
        ...invoice,
        customerName: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email
      });
      
      setShowCustomerModal(false);
      setNewCustomer({ name: '', phone: '', email: '' });
      showSuccess("تم إضافة العميل بنجاح");
      
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء إضافة العميل");
    }
    setGlobalLoading(false);
  };

  // ==========================================================================
  // 🗑️ إزالة من السلة
  // ==========================================================================
  const handleRemoveFromCart = (item) => {
    setCart(cart.filter(i => i.serialNumber !== item.serialNumber));
  };

  // ==========================================================================
  // 🧹 تفريغ السلة
  // ==========================================================================
  const handleClearCart = () => {
    setCart([]);
    setFoundItem(null);
  };

  // ==========================================================================
  // 💳 معالجة الدفع
  // ==========================================================================
  const handleProcessPayment = () => {
    if (cart.length === 0 && !foundItem) {
      showError("السلة فارغة");
      return;
    }
    if (!invoice.customerName) {
      showError("يرجى اختيار عميل");
      return;
    }
    setPaymentModal(true);
  };

  // ==========================================================================
  // 📱 إنشاء QR Code
  // ==========================================================================
  const handleGenerateQR = () => {
    const qrData = {
      invoiceNumber: 'INV-' + Date.now().toString().slice(-8),
      total: calculations.finalTotal,
      customer: invoice.customerName,
      date: new Date().toISOString()
    };
    setQrcode(JSON.stringify(qrData));
    setShowQrModal(true);
  };

  // ==========================================================================
  // ✅ إتمام عملية البيع
  // ==========================================================================
  // ==========================================================================
// 💳 إتمام عملية البيع - باستخدام Batch (بديل)
// ==========================================================================
const handleCheckout = async () => {
  if (cart.length === 0 && !foundItem) return showError("السلة فارغة");
  if (!invoice.customerName) return showError("يرجى إدخال اسم العميل");
  if (calculations.finalTotal < 0) return showError("الإجمالي لا يمكن أن يكون سالباً");
  
  const confirmed = await showConfirm(
    'تأكيد البيع',
    `هل أنت متأكد من إتمام عملية البيع بقيمة ${calculations.finalTotal} ج؟`
  );
  
  if (!confirmed) return;
  
  setGlobalLoading(true);
  const invId = 'INV-' + Date.now().toString().slice(-8);
  
  try {
    // 🛠️ FIX: كان بيستخدم Batch مع قراءة الكمية (getDoc) قبلها بشكل منفصل.
    // ده معناه لو كاشيرين بيبيعوا نفس المنتج في نفس اللحظة، الاتنين ممكن
    // يقروا نفس الكمية المتاحة، الاتنين يعدّوا إن الكمية كافية، ويحصل بيع
    // بكمية أكبر من المتاح فعليًا (oversell) لأن آخر batch بيكتب فوق الأول
    // بدل ما يخصم من القيمة الحقيقية وقت الكتابة. استخدام runTransaction
    // بيضمن إن القراءة والتحقق والخصم بيحصلوا كوحدة واحدة ذرية (atomic).
    // ✨ ميزة جديدة: لو العميل مش موجود بالفعل (مفيش رقم هاتف مطابق)،
    // يتم إنشاؤه تلقائيًا بدل ما بياناته تفضل موجودة في الفاتورة بس
    // (نفس الأسلوب المستخدم بالفعل عند إنشاء تذكرة صيانة لعميل جديد).
    let customerRefForUpdate = null;
    let isNewCustomer = false;
    const normalizedInvoicePhone = normalizePhone(invoice.phone);
    if (normalizedInvoicePhone) {
      const existingSnap = await getDocs(query(collection(db, 'customers'), where('phone', '==', normalizedInvoicePhone)));
      if (!existingSnap.empty) {
        customerRefForUpdate = existingSnap.docs[0].ref;
      } else {
        customerRefForUpdate = doc(collection(db, 'customers'));
        isNewCustomer = true;
      }
    }

    const transRef = doc(collection(db, 'transactions'));
    const itemsToProcess = foundItem ? [foundItem] : cart;

    await runTransaction(db, async (transaction) => {
      // 1️⃣ كل القراءات الأول (متطلب أساسي لـ Firestore transactions)
      const itemRefs = itemsToProcess
        .filter(item => !item.isService)
        .map(item => doc(db, 'inventory', item.id));
      const itemSnaps = await Promise.all(itemRefs.map(ref => transaction.get(ref)));

      // 2️⃣ التحقق من توفر الكمية بناءً على أحدث قراءة فعلية داخل نفس الـ transaction
      let snapIdx = 0;
      for (const item of itemsToProcess) {
        if (item.isService) continue;
        const itemSnap = itemSnaps[snapIdx++];
        if (!itemSnap.exists()) {
          throw new Error(`❌ المنتج ${item.name} غير موجود!`);
        }
        const currentQty = itemSnap.data().quantity || 0;
        if (currentQty < item.quantity) {
          throw new Error(`❌ الكمية غير كافية للمنتج ${item.name}! المتاح: ${currentQty}, المطلوب: ${item.quantity}`);
        }
      }

      // 3️⃣ الكتابات: خصم الكميات + إنشاء الفاتورة + تحديث العميل
      snapIdx = 0;
      for (const item of itemsToProcess) {
        if (item.isService) continue;
        const itemRef = itemRefs[snapIdx];
        const currentQty = itemSnaps[snapIdx].data().quantity || 0;
        snapIdx++;
        transaction.update(itemRef, {
          quantity: currentQty - item.quantity,
          updatedAt: serverTimestamp()
        });
      }

      const joinedNames = itemsToProcess.map(i => i.name).join(' + ');
      const joinedSerials = itemsToProcess.map(i => i.serialNumber).join(', ');

      const transactionData = { 
        ...calculations, 
        customerName: invoice.customerName,
        phone: invoice.phone,
        email: invoice.email,
        technicianName: invoice.technicianName,
        discount: Number(invoice.discount) || 0,
        discountType: invoice.discountType,
        taxEnabled: invoice.taxEnabled,
        installationFeeId: invoice.installationFeeId || null,
        paymentMethod: invoice.paymentMethod,
        paymentDetails: invoice.paymentMethod === 'card' ? { cardLastFour: invoice.cardLastFour } :
                       invoice.paymentMethod === 'transfer' ? { bankTransferDetails: invoice.bankTransferDetails } : {},
        notes: invoice.notes,
        type: 'sell', 
        // ✨ ميزة جديدة: ربط الفاتورة بتذكرة الصيانة (لو الفاتورة دي طالعة من تذكرة)
        ticketId: invoice.ticketId || null,
        ticketNumber: invoice.ticketNumber || null,
        items: itemsToProcess.map(item => {
          const warrantyMonths = Number(item.warrantyMonths) || 0;
          let warrantyEndDate = null;
          if (!item.isService && !item.underWarranty && warrantyMonths > 0) {
            const end = new Date();
            end.setMonth(end.getMonth() + warrantyMonths);
            warrantyEndDate = end.toISOString().split('T')[0];
          }
          return {
            ...item,
            underWarranty: item.underWarranty || false,
            isService: item.isService || false,
            warrantyMonths,
            warrantyEndDate
          };
        }),
        itemName: joinedNames, 
        serialNumber: joinedSerials, 
        warehouseId: appUser.assignedWarehouseId || 'main', 
        operator: appUser.name || appUser.email || 'موظف', 
        invoiceNumber: invId, 
        timestamp: serverTimestamp() 
      };

      transaction.set(transRef, transactionData);

      if (customerRefForUpdate) {
        if (isNewCustomer) {
          transaction.set(customerRefForUpdate, {
            name: invoice.customerName,
            phone: normalizedInvoicePhone,
            email: invoice.email || '',
            searchKey: normalizeSearch(`${invoice.customerName} ${normalizedInvoicePhone}`),
            searchTokens: buildSearchTokens(invoice.customerName, normalizedInvoicePhone),
            createdAt: serverTimestamp(),
            totalPurchases: 1,
            lastPurchase: serverTimestamp()
          });
        } else {
          transaction.update(customerRefForUpdate, {
            totalPurchases: increment(1),
            lastPurchase: serverTimestamp()
          });
        }
      }
    });
    
    await logUserActivity(appUser, 'إصدار فاتورة', `إصدار فاتورة #${invId} للعميل ${invoice.customerName} بقيمة ${calculations.finalTotal} ج`);

    // ✨ ميزة جديدة: ربط التذكرة برقم الفاتورة الناتجة عنها (ربط ثنائي الاتجاه)
    if (invoice.ticketId) {
      try {
        await updateDoc(doc(db, 'tickets', invoice.ticketId), {
          linkedInvoiceNumber: invId,
          linkedInvoiceDate: serverTimestamp()
        });
      } catch (linkError) {
        console.error("Ticket-invoice link error:", linkError);
      }
    }

    // ✨ ميزة جديدة: تسجيل صريح للخصومات على الفواتير (سجل تعديلات الخصومات)
    if ((Number(invoice.discount) || 0) > 0) {
      const discountLabel = invoice.discountType === 'percent'
        ? `${invoice.discount}%`
        : `${invoice.discount} ج`;
      await logUserActivity(
        appUser,
        'تطبيق خصم',
        `تطبيق خصم ${discountLabel} على فاتورة #${invId} للعميل ${invoice.customerName} (قيمة الخصم الفعلية: ${calculations.discountAmount || 0} ج)`
      );
    }

    setInvoiceData({ 
      id: transRef.id,
      items: foundItem ? [foundItem] : cart,
      ...invoice, 
      ...calculations, 
      invoiceNumber: invId, 
      date: new Date().toISOString(),
      operator: appUser.name || appUser.email
    });
    
    handleClearCart();
    setInvoice({ 
      customerName: '', 
      phone: '', 
      email: '',
      discount: 0, 
      discountType: 'value', 
      taxEnabled: true, 
      installationFeeId: '', 
      technicianName: '',
      paymentMethod: 'cash',
      notes: '',
      bankTransferDetails: '',
      cardLastFour: '',
      ticketId: '',
      ticketNumber: ''
    });
    
    showSuccess("✅ تم البيع بنجاح");
    setPaymentModal(false);
  } catch(e) { 
    showError(e.message || "❌ فشلت عملية البيع"); 
    console.error(e);
  }
  setGlobalLoading(false);
};

  // ==========================================================================
  // 🖨️ عرض الفاتورة
  // ==========================================================================
  if (invoiceData) {
    return <InvoiceRenderer data={invoiceData} systemSettings={systemSettings} onBack={() => setInvoiceData(null)} />;
  }

  const change = cashReceived - calculations.finalTotal;

  // ==========================================================================
  // 🎨 واجهة المستخدم
  // ==========================================================================
  return (
    <div className="max-w-[1400px] mx-auto" dir="rtl">
      
      {/* ===== مودال الدفع ===== */}
      {paymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">إتمام الدفع</h3>
            
            <div className="space-y-4">
              <div className="bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl">
                <p className="text-sm text-slate-600 dark:text-slate-400">المطلوب</p>
                <p className="text-3xl font-black text-teal-600 dark:text-teal-400">{calculations.finalTotal} ج</p>
              </div>

              {invoice.paymentMethod === 'cash' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">المبلغ المدفوع</label>
                    <input
                      type="number"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-center text-lg bg-white dark:bg-slate-900"
                      value={cashReceived}
                      onChange={e => setCashReceived(Number(e.target.value))}
                      autoFocus
                    />
                  </div>
                  {cashReceived > 0 && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl">
                      <p className="text-sm text-slate-600 dark:text-slate-400">الباقي</p>
                      <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{Math.max(0, change)} ج</p>
                    </div>
                  )}
                </>
              )}

              {invoice.paymentMethod === 'card' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">آخر 4 أرقام من البطاقة</label>
                  <input
                    type="text"
                    maxLength="4"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-center bg-white dark:bg-slate-900"
                    value={invoice.cardLastFour}
                    onChange={e => setInvoice({...invoice, cardLastFour: e.target.value})}
                  />
                </div>
              )}

              {invoice.paymentMethod === 'transfer' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">تفاصيل التحويل</label>
                  <textarea
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900"
                    rows="3"
                    value={invoice.bankTransferDetails}
                    onChange={e => setInvoice({...invoice, bankTransferDetails: e.target.value})}
                    placeholder="رقم العملية، اسم البنك، التاريخ..."
                  />
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleCheckout}
                  disabled={invoice.paymentMethod === 'cash' && cashReceived < calculations.finalTotal}
                  className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50"
                >
                  تأكيد الدفع
                </button>
                <button
                  onClick={() => setPaymentModal(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال إضافة عميل ===== */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">إضافة عميل جديد</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="اسم العميل *"
                className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-teal-500 bg-white dark:bg-slate-900"
                value={newCustomer.name}
                onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
              />
              <input
                type="text"
                placeholder="رقم الهاتف *"
                className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-teal-500 bg-white dark:bg-slate-900"
                value={newCustomer.phone}
                onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
              />
              <input
                type="email"
                placeholder="البريد الإلكتروني"
                className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-teal-500 bg-white dark:bg-slate-900"
                value={newCustomer.email}
                onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
              />
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleAddNewCustomer}
                  className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700"
                >
                  حفظ وإضافة
                </button>
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال QR Code ===== */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">رمز QR للفاتورة</h3>
            <div className="flex justify-center mb-4">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrcode)}`} alt="QR Code" className="w-48 h-48" />
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* ===== واجهة POS الرئيسية - عمودين: منطقة العمل + لوحة الدفع الثابتة ===== */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 bg-teal-600 text-white rounded-xl shadow-sm">
          <Receipt size={22}/>
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white">نقطة البيع</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">إضافة أصناف وإتمام عملية بيع جديدة</p>
        </div>
      </div>

      {/* ✨ تنبيه إن الفاتورة دي مرتبطة بتذكرة صيانة */}
      {invoice.ticketId && (
        <div className="mb-6 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 rounded-xl p-3 flex items-center gap-2 text-sm">
          <LinkIcon size={16} className="text-teal-600 dark:text-teal-400 shrink-0"/>
          <span className="text-teal-700 dark:text-teal-300 font-bold">
            هذه الفاتورة مرتبطة بتذكرة الصيانة #{invoice.ticketNumber}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start">

        {/* ===================== العمود الأساسي: البحث والسلة ===================== */}
        <div className="space-y-6">

          {/* ===== شريط البحث ===== */}
          <form onSubmit={handleSearch} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex gap-3">
            <div className="flex-1 flex items-center bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:border-teal-500 transition-colors">
              <Search className="mr-4 text-slate-400 shrink-0" size={20}/>
              <input 
                className="flex-1 border-none bg-transparent p-3.5 outline-none text-lg font-mono tracking-wide text-slate-700 dark:text-slate-300 placeholder-slate-300 dark:placeholder-slate-600" 
                placeholder="مرر الباركود أو اكتب رقم المنتج..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                autoFocus 
              />
            </div>
            <input
              type="number"
              min="1"
              className="w-20 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-bold bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-white outline-none focus:border-teal-500"
              value={sellQty}
              onChange={e => setSellQty(Number(e.target.value) || 1)}
            />
            <button 
              type="submit" 
              className="bg-teal-600 text-white px-6 rounded-xl font-bold text-sm shadow-sm hover:bg-teal-700 transition-colors flex items-center gap-2"
            >
              <Search size={18}/> إضافة
            </button>
          </form>

          {/* ===== السلة ===== */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900/50 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2">
                السلة
                {cart.length > 0 && (
                  <span className="bg-teal-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {cart.length}
                  </span>
                )}
              </h3>
              {cart.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1"
                >
                  <X size={14}/> تفريغ السلة
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                <Receipt size={40} className="mb-3 opacity-50"/>
                <p className="text-sm font-bold text-slate-400 dark:text-slate-500">السلة فاضية</p>
                <p className="text-xs mt-1">ابحث عن صنف بالباركود أو الاسم فوق عشان تضيفه</p>
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto custom-scrollbar divide-y divide-slate-50 dark:divide-slate-700/50">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.isService ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-500' : 'bg-teal-50 dark:bg-teal-900/30 text-teal-500'}`}>
                        {item.isService ? <LinkIcon size={16}/> : <Receipt size={16}/>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{item.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{item.serialNumber} {item.quantity > 1 ? `× ${item.quantity}` : ''}</p>
                      </div>
                    </div>

                    {!item.isService && (
                      <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title="تحت الضمان">
                        <input
                          type="checkbox"
                          checked={item.underWarranty || false}
                          onChange={(e) => {
                            const updatedCart = [...cart];
                            updatedCart[idx] = { ...updatedCart[idx], underWarranty: e.target.checked };
                            setCart(updatedCart);
                          }}
                          className="w-4 h-4 accent-emerald-600"
                        />
                        <span className={`text-[10px] font-bold whitespace-nowrap ${item.underWarranty ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          ضمان
                        </span>
                      </label>
                    )}

                    {!item.isService && !item.underWarranty && (
                      <input
                        type="number"
                        min="0"
                        placeholder="أشهر"
                        value={item.warrantyMonths || ''}
                        onChange={(e) => {
                          const updatedCart = [...cart];
                          updatedCart[idx] = { ...updatedCart[idx], warrantyMonths: Number(e.target.value) || 0 };
                          setCart(updatedCart);
                        }}
                        title="مدة ضمان هذا المنتج بالشهور"
                        className="w-14 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-xs text-center bg-slate-50 dark:bg-slate-900 shrink-0"
                      />
                    )}

                    <span className={`font-black shrink-0 w-24 text-left ${item.underWarranty ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
                      {item.underWarranty ? '0 ج' : `${(item.price * item.quantity).toLocaleString()} ج`}
                    </span>

                    <button
                      onClick={() => handleRemoveFromCart(item)}
                      className="text-slate-300 dark:text-slate-600 hover:text-rose-500 shrink-0"
                    >
                      <X size={18}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ===================== لوحة الدفع الجانبية (ثابتة أثناء التمرير) ===================== */}
        <div className="lg:sticky lg:top-6 space-y-4">

          {/* ===== معلومات العميل ===== */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">بيانات العميل</h3>
            <div>
              <div className="relative flex gap-2">
                <div className="flex-1 relative">
                  <User className="absolute right-3 top-3 text-slate-400" size={18}/>
                  <input 
                    className="w-full border border-slate-200 dark:border-slate-700 pr-10 p-3 rounded-xl font-bold focus:border-teal-500 outline-none text-sm bg-slate-50 dark:bg-slate-900/60" 
                    placeholder="اسم العميل" 
                    value={invoice.customerName} 
                    onChange={e => {
                      setInvoice({...invoice, customerName: e.target.value});
                      setShowCustomerSuggestions(true);
                    }}
                    onFocus={() => setShowCustomerSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 150)}
                    autoComplete="off"
                    required
                  />
                  {/* ✨ قائمة اقتراحات العملاء الموجودين فعليًا */}
                  {showCustomerSuggestions && invoice.customerName.trim().length >= 2 && (
                    <div className="absolute z-20 top-full mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                      {searchingCustomers ? (
                        <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <Loader2 size={14} className="animate-spin"/> جاري البحث...
                        </div>
                      ) : customerSuggestions.length > 0 ? (
                        <>
                          <div className="px-3 py-1.5 text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-700">
                            عملاء موجودين فعلاً - اضغط للاختيار
                          </div>
                          {customerSuggestions.map(c => (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => { handleSelectCustomer(c); setShowCustomerSuggestions(false); }}
                              className="w-full text-right px-3 py-2 hover:bg-teal-50 dark:hover:bg-teal-900/30 flex items-center justify-between gap-2 border-b border-slate-50 dark:border-slate-700/50 last:border-0"
                            >
                              <span className="font-bold text-sm">{c.name}</span>
                              <span className="text-xs text-slate-400 font-mono" dir="ltr">{c.phone}</span>
                            </button>
                          ))}
                        </>
                      ) : (
                        <div className="p-3 text-center text-xs text-slate-400">
                          مفيش عميل بهذا الاسم - هيتم اعتباره عميل جديد تلقائيًا عند إتمام البيع
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowCustomerModal(true)}
                  className="px-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl hover:bg-teal-100 dark:hover:bg-teal-900/50"
                  title="إضافة عميل جديد"
                >
                  <UserPlus size={18}/>
                </button>
              </div>
              
              {recentCustomers.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {recentCustomers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      className="text-[10px] bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md hover:bg-teal-100 dark:hover:bg-teal-900/50 hover:text-teal-700 dark:hover:text-teal-300"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="relative">
                <Phone className="absolute right-3 top-3 text-slate-400" size={18}/>
                <input 
                  className="w-full border border-slate-200 dark:border-slate-700 pr-10 p-3 rounded-xl font-bold font-mono focus:border-teal-500 outline-none text-sm bg-slate-50 dark:bg-slate-900/60" 
                  placeholder="رقم الهاتف" 
                  value={invoice.phone} 
                  onChange={e => setInvoice({...invoice, phone: e.target.value})} 
                />
              </div>
            </div>
          </div>

          {/* ===== خيارات الفاتورة ===== */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-3">
            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">تفاصيل الفاتورة</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">الفني</label>
                <select 
                  className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/60 font-bold text-xs outline-none focus:border-teal-500" 
                  value={invoice.technicianName} 
                  onChange={e => setInvoice({...invoice, technicianName: e.target.value})}
                >
                  <option value="">-- بدون فني --</option>
                  {(systemSettings.technicians || []).map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">الخصم</label>
                <div className="flex bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <input 
                    type="number" 
                    className="flex-1 w-0 p-2.5 outline-none font-bold text-center text-rose-600 dark:text-rose-400 text-sm bg-transparent" 
                    value={invoice.discount} 
                    onChange={e => setInvoice({...invoice, discount: e.target.value})} 
                    min="0"
                    max={invoice.discountType === 'percent' ? 100 : undefined}
                    placeholder="0"
                  />
                  <select 
                    className="bg-slate-100 dark:bg-slate-800 px-2 font-bold text-xs border-r border-slate-200 dark:border-slate-700 outline-none" 
                    value={invoice.discountType} 
                    onChange={e => setInvoice({...invoice, discountType: e.target.value})}
                  >
                    <option value="value">ج.م</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">الرسوم</label>
                <select 
                  className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/60 font-bold text-xs outline-none focus:border-teal-500" 
                  value={invoice.installationFeeId} 
                  onChange={e => setInvoice({...invoice, installationFeeId: e.target.value})}
                >
                  <option value="">بدون رسوم</option>
                  {(systemSettings.installationFees || []).map(f => <option key={f.id} value={f.id}>{f.label} (+{f.value} ج)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">طريقة الدفع</label>
                <select 
                  className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/60 font-bold text-xs outline-none focus:border-teal-500" 
                  value={invoice.paymentMethod}
                  onChange={e => setInvoice({...invoice, paymentMethod: e.target.value})}
                >
                  <option value="cash">نقداً</option>
                  <option value="card">بطاقة</option>
                  <option value="transfer">تحويل بنكي</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">الضريبة</label>
                <button 
                  type="button" 
                  onClick={() => setInvoice({...invoice, taxEnabled: !invoice.taxEnabled})} 
                  className={`w-full p-2.5 rounded-xl font-bold text-xs transition-all border ${invoice.taxEnabled ? 'bg-teal-600 border-teal-600 text-white' : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}
                >
                  {invoice.taxEnabled ? 'مطبقة' : 'غير مطبقة'}
                </button>
              </div>
            </div>
          </div>

          {/* ===== عرض الإجماليات وزرار الدفع ===== */}
          <div className="bg-teal-900 text-white p-6 rounded-2xl shadow-lg border-t-4 border-emerald-500 space-y-4">
            <div className="text-xs font-bold text-teal-100 space-y-1.5">
              <p className="flex justify-between"><span>المجموع الفرعي</span><span className="text-white">{calculations.subtotal}</span></p>
              {calculations.discountAmount > 0 && 
                <p className="flex justify-between text-rose-300"><span>الخصم</span><span>-{calculations.discountAmount.toFixed(1)}</span></p>
              }
              <p className="flex justify-between"><span>الضريبة</span><span className="text-white">+{calculations.taxAmount.toFixed(1)}</span></p>
              {calculations.installAmount > 0 && 
                <p className="flex justify-between"><span>الرسوم</span><span className="text-white">+{calculations.installAmount}</span></p>
              }
              {calculations.servicesAmount > 0 && 
                <p className="flex justify-between text-emerald-300"><span>الخدمات</span><span className="text-white">+{calculations.servicesAmount}</span></p>
              }
            </div>
            <div className="border-t border-teal-800 pt-4 flex items-end justify-between">
              <p className="text-[11px] text-teal-200">الصافي للدفع</p>
              <span className="text-4xl font-black text-emerald-400 tracking-tighter">
                {calculations.finalTotal.toLocaleString()} <span className="text-sm font-normal">ج.م</span>
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              <button 
                onClick={handleProcessPayment}
                disabled={cart.length === 0 && !foundItem}
                className="flex-1 bg-emerald-500 text-white py-3.5 rounded-xl font-bold text-base shadow-md hover:bg-emerald-600 transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle size={22}/> إتمام البيع
              </button>
              <button 
                onClick={handleGenerateQR}
                disabled={calculations.finalTotal === 0}
                className="px-5 bg-teal-700 hover:bg-teal-600 text-white py-3.5 rounded-xl font-bold shadow-md transition-colors disabled:opacity-50"
                title="توليد QR للفاتورة"
              >
                <ImageIcon size={22}/>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// ==========================================================================
// 🏪 مخزن المرتجعات المتكامل - Returns Manager
// ==========================================================================
