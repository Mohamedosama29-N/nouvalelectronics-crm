import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, getDoc, setDoc, doc, updateDoc, query, where, serverTimestamp, orderBy, onSnapshot, increment, limit, runTransaction
} from 'firebase/firestore';
import {
  ArrowRightLeft,
  Plus,
  Search,
  Loader2,
  X,
  Check,
  Download,
  Truck,
  PackageCheck,
  KeyRound,
  Copy,
  ScanLine
} from 'lucide-react';
import { BarcodeScannerModal } from '../common/BarcodeScannerModal';
import { db } from '../../firebase/config';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { formatDate } from '../../utils/format';
import { buildInventorySearchTokens, normalizeSearch } from '../../utils/search';
import { exportToCSV } from '../../utils/exportUtils';

// 🆕 مراحل التحويل: pending (طلب) → approved (تمت الموافقة) → shipped (تم الإرسال للمخزن)
// → received (تم الاستلام). الخصم والإضافة الفعلية للمخزون بتحصل في مرحلة الاستلام بس،
// وبعد إدخال كود الاستلام اللي المخزن الرئيسي بيصدره وقت الإرسال.
const ACTIVE_STATUSES = ['pending', 'approved', 'shipped'];
const MAX_CODE_ATTEMPTS = 5;

const STATUS_META = {
  pending:  { label: 'قيد الانتظار',                cls: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  approved: { label: 'تمت الموافقة',                cls: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  shipped:  { label: 'تم الإرسال للمخزن المحوَّل إليه', cls: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' },
  received: { label: 'تم الاستلام',                 cls: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  rejected: { label: 'مرفوض',                       cls: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' }
};

// 🆕 الطلب الواحد ممكن يضم أكتر من صنف (items). الطلبات القديمة (صنف واحد) بتتحوّل لنفس الشكل.
const getTransferItems = (t) =>
  Array.isArray(t.items) && t.items.length
    ? t.items
    : [{ serialNumber: t.serialNumber, itemName: t.itemName, requestedQty: t.requestedQty }];
const totalQty = (t) => getTransferItems(t).reduce((sum, i) => sum + (Number(i.requestedQty) || 0), 0);
const summarizeItems = (t) => getTransferItems(t).map(i => `${i.itemName} × ${i.requestedQty}`).join('، ');

const generateReceiveCode = () => {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
};

// بنخزن Hash للكود على مستند التحويل نفسه (مش الكود الصريح) عشان الفرع
// المستلم ميشوفش الكود في بيانات التحويل اللي بتوصله.
const hashReceiveCode = async (code, transferId) => {
  const data = new TextEncoder().encode(`${transferId}:${String(code).trim()}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${m.cls}`}>{m.label}</span>;
}

export function EnhancedTransferManager({ appUser, warehouseMap, setGlobalLoading }) {
  const [activeTab, setActiveTab] = useState('pending');
  const [transfers, setTransfers] = useState([]);
  const [inventory, setInventory] = useState([]);
  
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [reqQty, setReqQty] = useState(1);
  // 🆕 سلة الطلب: أكتر من صنف في نفس طلب التحويل
  const [cart, setCart] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [toWarehouseId, setToWarehouseId] = useState('');
  // 🆕 الفروع بتطلب من المخزن الرئيسي بس. المخزن الرئيسي هو الوحيد اللي يحوّل لأي مخزن.
  const requestFromWarehouseId = 'main';
  const [codeModal, setCodeModal] = useState(null);       // عرض كود الاستلام للمخزن الرئيسي
  const [receivingReq, setReceivingReq] = useState(null); // مودال إدخال كود الاستلام
  const [receiveCodeInput, setReceiveCodeInput] = useState('');
  const [sourceInventory, setSourceInventory] = useState([]);
  const [rejectingReq, setRejectingReq] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [filteredTransfers, setFilteredTransfers] = useState([]);
  const [transferNotes, setTransferNotes] = useState('');
  const [priority, setPriority] = useState('normal');
  const [transferLog, setTransferLog] = useState([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedTransferForLog, setSelectedTransferForLog] = useState(null);

  const currentWarehouseId = appUser.assignedWarehouseId || 'main';
  const isMainWarehouse = currentWarehouseId === 'main' || appUser.role === 'admin' || appUser.role === 'main_warehouse_manager';
  const mainName = warehouseMap?.main || 'المخزن الرئيسي';
  const canReject = appUser.permissions?.rejectTransfer || isMainWarehouse;

  // الموافقة والإرسال والرفض: المخزن الرئيسي/الأدمن أو صاحب صلاحية approveTransfer
  const canActOnTransfer = () => isMainWarehouse || !!appUser.permissions?.approveTransfer;
  // الاستلام: مستخدمو المخزن المحوَّل إليه فقط (والأدمن) - وبكود الاستلام
  const canReceiveTransfer = (t) => t.toWarehouseId === currentWarehouseId || appUser.role === 'admin';

  useEffect(() => {
    let q = query(collection(db, 'transfers'), orderBy('createdAt', 'desc'));
    
    if (!appUser.permissions?.viewAllWarehouses) {
      if (isMainWarehouse) {
        q = query(q, where('fromWarehouseId', '==', 'main'));
      } else {
        q = query(q, where('toWarehouseId', '==', currentWarehouseId));
      }
    }

    const unsub = onSnapshot(query(q, limit(150)), snap => {
      setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const invQ = isMainWarehouse 
      ? query(collection(db, 'inventory'), where('warehouseId', '==', 'main'), where('isDeleted', '==', false))
      : query(collection(db, 'inventory'), where('warehouseId', '==', currentWarehouseId), where('isDeleted', '==', false));

    // 🛠️ FIX (أداء): زي مشكلة الموظفين - كان الاستماع مفتوح على مخزون الفرع
    // كامل بدون حد أقصى. الأفضل مستقبلًا استخدام pagination حقيقي هنا زي
    // شاشة المخزون الرئيسية، لكن كحل فوري وآمن حطينا سقف كبير كفاية لمعظم
    // الفروع بدون ما يكسر إمكانية اختيار أي صنف موجود فعليًا.
    const invUnsub = onSnapshot(query(invQ, limit(1000)), snap => {
      setInventory(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });

    // 🆕 مصدر البحث لطلب تحويل جديد - بيتغيّر حسب الفرع اللي تختاره من
    // القائمة المنسدلة (مش المخزن الرئيسي بس زي قبل كده)
    let sourceInvUnsub = () => {};
    if (!isMainWarehouse) {
      sourceInvUnsub = onSnapshot(
        query(collection(db, 'inventory'), where('warehouseId', '==', requestFromWarehouseId), where('isDeleted', '==', false), limit(1000)),
        snap => setSourceInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );
    }

    return () => { unsub(); invUnsub(); sourceInvUnsub(); };
  }, [appUser, currentWarehouseId, isMainWarehouse]);

  useEffect(() => {
    // 🆕 دمج طلبات المستخدم الشخصية مع الطلبات الواردة له كمصدر (لو فرع
    // عادي)، بدون تكرار
    const allTransfers = [...transfers]
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    if (selectedWarehouse === 'all') {
      setFilteredTransfers(allTransfers);
    } else {
      setFilteredTransfers(allTransfers.filter(t => 
        t.toWarehouseId === selectedWarehouse || t.fromWarehouseId === selectedWarehouse
      ));
    }
  }, [transfers, selectedWarehouse]);

  // 🆕 مصدر البحث يختلف حسب دور المستخدم:
  // - مستخدم فرع عادي: بيدوّر في مخزون المخزن الرئيسي (عشان يقدر يطلب
  //   صنف مش عنده هو أصلًا، والمخزن الرئيسي يوافق ويحوّله له).
  // - مستخدم المخزن الرئيسي: بيدوّر في مخزون المخزن الرئيسي نفسه (عشان
  //   يختار صنف يبعته بنفسه لفرع معين - تحويل بالدفع مش بالطلب).
  const searchSource = isMainWarehouse ? inventory : sourceInventory;

  const [searchResults, setSearchResults] = useState([]);

  const handleSearchProduct = (e, overrideTerm) => {
    e?.preventDefault?.();
    const term = normalizeSearch(typeof overrideTerm === 'string' ? overrideTerm : searchProduct);
    if (!term) {
      showError("اكتب اسم أو سيريال المنتج الأول");
      return;
    }

    // 🛠️ FIX (باگ حقيقي): كان بيستخدم .find() فبيختار أول نتيجة مطابقة
    // تلقائيًا - لو في صنفين سيريالهم "903" و"19035"، البحث عن "903"
    // كان ممكن يختار "19035" غلط من غير ما يديك فرصة تشوف باقي النتائج.
    // دلوقتي بنجيب كل النتائج المطابقة ونوريها عشان تختار الصح بنفسك،
    // إلا لو نتيجة واحدة بس مطابقة - وقتها نختارها تلقائيًا مباشرة.
    const matches = searchSource.filter(i => 
      normalizeSearch(i.serialNumber).includes(term) || 
      normalizeSearch(i.name).includes(term)
    );

    if (matches.length === 0) {
      showError(isMainWarehouse ? "لم يتم العثور على المنتج في مخزنك" : `لم يتم العثور على المنتج في ${mainName}`);
      setSearchResults([]);
    } else if (matches.length === 1) {
      selectProduct(matches[0]);
    } else {
      setSelectedProduct(null);
      setSearchResults(matches);
    }
  };

  const selectProduct = (item) => {
    if (item.quantity <= 0) {
      showError(isMainWarehouse ? "المنتج غير متوفر بالكمية المطلوبة في مخزنك" : `المنتج غير متوفر حاليًا في ${mainName}`);
      return;
    }
    setSelectedProduct(item);
    setSearchResults([]);
    setSearchProduct('');
    setReqQty(1);
  };

  const findSourceItem = (serialNumber) => searchSource.find(i => i.serialNumber === serialNumber);

  // إضافة الصنف المختار للسلة. لو نفس الصنف مضاف قبل كده، الكمية بتتجمّع عليه.
  const handleAddToCart = () => {
    if (!selectedProduct) return showError("اختر منتجاً أولاً");
    const qty = Number(reqQty);
    if (!Number.isFinite(qty) || qty <= 0) return showError("الكمية غير صالحة");
    const existing = cart.find(c => c.serialNumber === selectedProduct.serialNumber);
    const newTotal = (existing?.requestedQty || 0) + qty;
    if (newTotal > selectedProduct.quantity) {
      return showError(`الكمية الإجمالية (${newTotal}) أكبر من المتاح (${selectedProduct.quantity}) في ${isMainWarehouse ? 'مخزنك' : mainName}`);
    }
    setCart(prev => existing
      ? prev.map(c => c.serialNumber === selectedProduct.serialNumber ? { ...c, requestedQty: newTotal } : c)
      : [...prev, { inventoryId: selectedProduct.id, serialNumber: selectedProduct.serialNumber, itemName: selectedProduct.name, price: Number(selectedProduct.price) || 0, requestedQty: qty }]);
    setSelectedProduct(null);
    setSearchProduct('');
    setSearchResults([]);
    setReqQty(1);
  };

  const updateCartQty = (serialNumber, value) => {
    const qty = Math.max(1, Number(value) || 1);
    const src = findSourceItem(serialNumber);
    if (src && qty > src.quantity) {
      showError(`المتاح ${src.quantity} فقط`);
      return;
    }
    setCart(prev => prev.map(c => c.serialNumber === serialNumber ? { ...c, requestedQty: qty } : c));
  };

  const removeFromCart = (serialNumber) => setCart(prev => prev.filter(c => c.serialNumber !== serialNumber));

  // "اطلب كمية تانية": بيحط أصناف طلب سابق في السلة عشان تعدّل الكميات وتبعته تاني
  const reorderFromTransfer = (t) => {
    setCart(getTransferItems(t).map(i => ({ inventoryId: i.inventoryId || '', serialNumber: i.serialNumber, itemName: i.itemName, price: Number(i.price) || 0, requestedQty: Number(i.requestedQty) || 1 })));
    setSelectedProduct(null);
    setActiveTab('new');
  };

  const handleSubmitRequest = async () => {
    // لو في صنف مختار لسه ما اتضافش للسلة، بنضيفه تلقائيًا عشان ميضيعش
    let items = cart;
    if (selectedProduct) {
      const qty = Number(reqQty);
      if (qty > 0 && qty <= selectedProduct.quantity && !cart.some(c => c.serialNumber === selectedProduct.serialNumber)) {
        items = [...cart, { inventoryId: selectedProduct.id, serialNumber: selectedProduct.serialNumber, itemName: selectedProduct.name, price: Number(selectedProduct.price) || 0, requestedQty: qty }];
      }
    }
    if (items.length === 0) return showError("أضف منتجًا واحدًا على الأقل للطلب");
    if (isMainWarehouse && !toWarehouseId) return showError("اختر المخزن المرسل إليه");
    if (isMainWarehouse && toWarehouseId === 'main') return showError("لا يمكن التحويل للمخزن الرئيسي نفسه");
    for (const it of items) {
      const src = findSourceItem(it.serialNumber);
      if (src && it.requestedQty > src.quantity) {
        return showError(`الكمية المطلوبة من ${it.itemName} أكبر من المتاح (${src.quantity})`);
      }
    }

    // الفرع بيطلب من المخزن الرئيسي بس. المخزن الرئيسي بيبعت من مخزنه لأي فرع.
    const fromWarehouseId = isMainWarehouse ? currentWarehouseId : requestFromWarehouseId;
    const destinationWarehouseId = isMainWarehouse ? toWarehouseId : currentWarehouseId;
    const total = items.reduce((sum, i) => sum + i.requestedQty, 0);
    const summary = items.map(i => `${i.itemName} × ${i.requestedQty}`).join('، ');

    setGlobalLoading(true);
    try {
      const transferData = {
        // الحقول القديمة محفوظة (ملخّص) عشان التقارير والشاشات القديمة تفضل شغالة
        serialNumber: items[0].serialNumber,
        itemName: items.length > 1 ? `${items[0].itemName} +${items.length - 1} أصناف` : items[0].itemName,
        requestedQty: total,
        items,
        fromWarehouseId,
        toWarehouseId: destinationWarehouseId,
        // المخزن الرئيسي لما يبادر بالتحويل بنفسه، الموافقة متحققة ضمنيًا - بيبدأ من "تمت الموافقة"
        status: isMainWarehouse ? 'approved' : 'pending',
        ...(isMainWarehouse ? { processedAt: serverTimestamp(), processedBy: appUser.name || appUser.email, processedById: appUser.id } : {}),
        priority,
        createdAt: serverTimestamp(),
        requestedBy: appUser.name || appUser.email,
        requestedById: appUser.id,
        notes: transferNotes,
        log: [{
          action: isMainWarehouse ? 'إنشاء تحويل من المخزن الرئيسي (موافق عليه تلقائيًا)' : 'إنشاء طلب تحويل',
          timestamp: new Date().toISOString(),
          by: appUser.name,
          details: `${summary} إلى ${warehouseMap[destinationWarehouseId]}`
        }]
      };

      await addDoc(collection(db, 'transfers'), transferData);

      await logUserActivity(appUser, 'طلب تحويل مخزني', `${items.length} صنف (${total} قطعة): ${summary} إلى ${warehouseMap[destinationWarehouseId]}`);
      showSuccess(isMainWarehouse ? "تم إنشاء التحويل - اضغط \"تم الإرسال\" لما تجهّز القطع لإصدار كود الاستلام" : "تم إرسال طلب التحويل بنجاح");
      setCart([]);
      setSelectedProduct(null);
      setSearchProduct('');
      setReqQty(1);
      setToWarehouseId('');
      setTransferNotes('');
      setPriority('normal');
      setActiveTab('pending');
    } catch(e) {
      console.error(e);
      showError("فشل إرسال الطلب: " + e.message);
    }
    setGlobalLoading(false);
  };

  // المرحلة 1: الموافقة - مفيش حركة مخزون هنا، بس تأكيد إن الكمية متاحة
  const handleApprove = async (req) => {
    const confirmed = await showConfirm(
      'الموافقة على التحويل',
      `الموافقة على تحويل (${summarizeItems(req)}) لفرع ${warehouseMap[req.toWarehouseId]}؟`
    );
    if (!confirmed) return;

    setGlobalLoading(true);
    try {
      for (const it of getTransferItems(req)) {
        const snap = await getDocs(query(
          collection(db, 'inventory'),
          where('serialNumber', '==', it.serialNumber),
          where('warehouseId', '==', req.fromWarehouseId),
          where('isDeleted', '==', false)
        ));
        if (snap.empty) throw new Error(`المنتج ${it.itemName} غير موجود بالمخزن المرسل!`);
        const available = snap.docs[0].data().quantity || 0;
        if (available < it.requestedQty) throw new Error(`الكمية غير كافية من ${it.itemName}! المتاح: ${available}, المطلوب: ${it.requestedQty}`);
      }

      await updateDoc(doc(db, 'transfers', req.id), {
        status: 'approved',
        processedAt: serverTimestamp(),
        processedBy: appUser.name || appUser.email,
        processedById: appUser.id,
        log: [...(req.log || []), {
          action: 'تمت الموافقة على التحويل',
          timestamp: new Date().toISOString(),
          by: appUser.name,
          details: `تمت الموافقة على تحويل (${summarizeItems(req)}) إلى ${warehouseMap[req.toWarehouseId]} - بانتظار الإرسال`
        }]
      });
      await logUserActivity(appUser, 'موافقة على تحويل مخزني', `تمت الموافقة لفرع ${warehouseMap[req.toWarehouseId]} على: ${summarizeItems(req)}`);
      showSuccess("تمت الموافقة. اضغط \"تم الإرسال\" لما القطعة تتجهّز.");
    } catch (e) {
      console.error(e);
      showError(e.message || "خطأ أثناء الموافقة على التحويل");
    }
    setGlobalLoading(false);
  };

  // المرحلة 2: الإرسال - بيصدر كود استلام من 6 أرقام بيظهر للمخزن الرئيسي
  // ولازم المخزن المستلم يكتبه عشان الاستلام يتم
  const issueCode = async (req, { reissue = false } = {}) => {
    const code = generateReceiveCode();
    const hash = await hashReceiveCode(code, req.id);
    await setDoc(doc(db, 'transferSecrets', req.id), { code, transferId: req.id, issuedAt: serverTimestamp(), issuedBy: appUser.name || appUser.email });
    await updateDoc(doc(db, 'transfers', req.id), {
      status: 'shipped',
      receiveCodeHash: hash,
      codeAttempts: 0,
      ...(reissue ? {} : { shippedAt: serverTimestamp(), shippedBy: appUser.name || appUser.email, shippedById: appUser.id }),
      log: [...(req.log || []), {
        action: reissue ? 'إعادة إصدار كود الاستلام' : 'تم الإرسال للمخزن المحوَّل إليه',
        timestamp: new Date().toISOString(),
        by: appUser.name,
        details: reissue ? 'تم إصدار كود استلام جديد وإلغاء القديم' : `تم إرسال (${summarizeItems(req)}) إلى ${warehouseMap[req.toWarehouseId]} - الاستلام بكود`
      }]
    });
    return code;
  };

  const handleShip = async (req) => {
    const confirmed = await showConfirm('تأكيد الإرسال', `هل تم إرسال (${summarizeItems(req)}) إلى ${warehouseMap[req.toWarehouseId]}؟ هيتم إصدار كود الاستلام.`);
    if (!confirmed) return;
    setGlobalLoading(true);
    try {
      const code = await issueCode(req);
      await logUserActivity(appUser, 'إرسال تحويل مخزني', `تم إرسال: ${summarizeItems(req)} إلى ${warehouseMap[req.toWarehouseId]}`);
      setCodeModal({ req, code });
    } catch (e) {
      console.error(e);
      showError(e.message || "فشل تسجيل الإرسال");
    }
    setGlobalLoading(false);
  };

  const handleShowCode = async (req) => {
    setGlobalLoading(true);
    try {
      const snap = await getDoc(doc(db, 'transferSecrets', req.id));
      if (!snap.exists()) throw new Error("الكود غير متاح - أعد إصدار كود جديد");
      setCodeModal({ req, code: snap.data().code });
    } catch (e) {
      showError(e.message || "تعذر عرض الكود");
    }
    setGlobalLoading(false);
  };

  const handleReissueCode = async (req) => {
    const confirmed = await showConfirm('إعادة إصدار الكود', 'سيتم إلغاء الكود الحالي وإصدار كود جديد. متابعة؟');
    if (!confirmed) return;
    setGlobalLoading(true);
    try {
      const code = await issueCode(req, { reissue: true });
      setCodeModal({ req, code });
    } catch (e) {
      showError(e.message || "فشل إعادة الإصدار");
    }
    setGlobalLoading(false);
  };

  // المرحلة 3: الاستلام - بكود الاستلام. هنا بس بيتخصم من المخزن الرئيسي ويتضاف للمستلم
  const submitReceive = async (e) => {
    e.preventDefault();
    const req = receivingReq;
    if (!req) return;
    const code = receiveCodeInput.trim();
    if (!/^\d{6}$/.test(code)) return showError("اكتب كود الاستلام (6 أرقام)");
    if ((req.codeAttempts || 0) >= MAX_CODE_ATTEMPTS) {
      return showError("تم إيقاف الاستلام بعد محاولات خاطئة كتيرة. اطلب من المخزن الرئيسي إعادة إصدار الكود.");
    }

    setGlobalLoading(true);
    try {
      const hash = await hashReceiveCode(code, req.id);
      if (hash !== req.receiveCodeHash) {
        const attempts = (req.codeAttempts || 0) + 1;
        await updateDoc(doc(db, 'transfers', req.id), {
          codeAttempts: increment(1),
          log: [...(req.log || []), {
            action: 'محاولة استلام بكود خاطئ',
            timestamp: new Date().toISOString(),
            by: appUser.name,
            details: `المحاولة رقم ${attempts}`
          }]
        });
        throw new Error(attempts >= MAX_CODE_ATTEMPTS
          ? "الكود غلط، وتم إيقاف الاستلام. اطلب من المخزن الرئيسي إعادة إصدار الكود."
          : `الكود غلط (متبقي ${MAX_CODE_ATTEMPTS - attempts} محاولات)`);
      }

      const reqItems = getTransferItems(req);
      const refs = [];
      for (const it of reqItems) {
        const fromLookup = await getDocs(query(
          collection(db, 'inventory'),
          where('serialNumber', '==', it.serialNumber),
          where('warehouseId', '==', req.fromWarehouseId),
          where('isDeleted', '==', false)
        ));
        if (fromLookup.empty) throw new Error(`المنتج ${it.itemName} غير موجود بالمخزن المرسل!`);
        const toLookup = await getDocs(query(
          collection(db, 'inventory'),
          where('serialNumber', '==', it.serialNumber),
          where('warehouseId', '==', req.toWarehouseId),
          where('isDeleted', '==', false)
        ));
        refs.push({ it, fromRef: fromLookup.docs[0].ref, toRef: toLookup.empty ? null : toLookup.docs[0].ref });
      }
      const reqRef = doc(db, 'transfers', req.id);

      await runTransaction(db, async (transaction) => {
        // كل القراءات الأول (transaction.get) قبل أي كتابة
        const reqSnap = await transaction.get(reqRef);
        if (!reqSnap.exists() || reqSnap.data().status !== 'shipped') {
          throw new Error("التحويل ده مش في مرحلة الاستلام (ممكن يكون اتستلم قبل كده).");
        }
        if (reqSnap.data().receiveCodeHash !== hash) {
          throw new Error("الكود اتغيّر. اطلب الكود الجديد من المخزن الرئيسي.");
        }
        const loaded = [];
        for (const r of refs) {
          const fromSnap = await transaction.get(r.fromRef);
          if (!fromSnap.exists()) throw new Error(`المنتج ${r.it.itemName} غير موجود بالمخزن المرسل!`);
          const currentQty = fromSnap.data().quantity || 0;
          if (currentQty < r.it.requestedQty) {
            throw new Error(`الكمية غير كافية من ${r.it.itemName} في المخزن المرسل! المتاح: ${currentQty}, المطلوب: ${r.it.requestedQty}`);
          }
          const toSnap = r.toRef ? await transaction.get(r.toRef) : null;
          loaded.push({ ...r, fromSnap, currentQty, toSnap });
        }

        for (const r of loaded) {
          transaction.update(r.fromRef, { quantity: r.currentQty - r.it.requestedQty, updatedAt: serverTimestamp() });
          if (r.toSnap && r.toSnap.exists()) {
            transaction.update(r.toRef, { quantity: increment(r.it.requestedQty), updatedAt: serverTimestamp() });
          } else {
            const sourceData = r.fromSnap.data();
            transaction.set(doc(collection(db, 'inventory')), {
              serialNumber: sourceData.serialNumber,
              name: sourceData.name,
              price: sourceData.price || 0,
              quantity: r.it.requestedQty,
              minStock: sourceData.minStock || 2,
              category: sourceData.category || 'عام',
              location: sourceData.location || '',
              tags: sourceData.tags || [],
              notes: sourceData.notes || '',
              warehouseId: req.toWarehouseId,
              searchKey: normalizeSearch(`${sourceData.name} ${sourceData.serialNumber} ${sourceData.category || ''}`),
              searchTokens: buildInventorySearchTokens(sourceData.name, sourceData.serialNumber, sourceData.category),
              createdAt: serverTimestamp(),
              isDeleted: false,
              transferredFrom: req.fromWarehouseId,
              transferId: req.id
            });
          }
        }

        transaction.update(reqRef, {
          status: 'received',
          receivedAt: serverTimestamp(),
          receivedBy: appUser.name || appUser.email,
          receivedById: appUser.id,
          log: [...(req.log || []), {
            action: 'تم الاستلام',
            timestamp: new Date().toISOString(),
            by: appUser.name,
            details: `تم خصم (${summarizeItems(req)}) من ${warehouseMap[req.fromWarehouseId]} وإضافتها إلى ${warehouseMap[req.toWarehouseId]} بعد التحقق من الكود`
          }]
        });
      });

      await logUserActivity(appUser, 'استلام تحويل مخزني', `تم استلام: ${summarizeItems(req)} في ${warehouseMap[req.toWarehouseId]}`);
      showSuccess("تم الاستلام وإضافة القطعة لمخزنك بنجاح!");
      setReceivingReq(null);
      setReceiveCodeInput('');
    } catch (err) {
      console.error(err);
      showError(err.message || "خطأ أثناء الاستلام");
    }
    setGlobalLoading(false);
  };

  const submitReject = async (e) => {
    e.preventDefault();
    if(!rejectReason.trim()) return showError("يرجى كتابة سبب الرفض");
    
    setGlobalLoading(true);
    try {
      const updatedLog = [...(rejectingReq.log || []), {
        action: 'تم رفض التحويل',
        timestamp: new Date().toISOString(),
        by: appUser.name,
        details: `سبب الرفض: ${rejectReason}`
      }];

      await updateDoc(doc(db, 'transfers', rejectingReq.id), {
        status: 'rejected',
        rejectReason: rejectReason,
        processedAt: serverTimestamp(),
        processedBy: appUser.name || appUser.email,
        processedById: appUser.id,
        log: updatedLog
      });
      
      await logUserActivity(appUser, 'رفض تحويل مخزني', `رفض طلب فرع ${warehouseMap[rejectingReq.toWarehouseId]} بسبب: ${rejectReason}`);
      showSuccess("تم رفض الطلب بنجاح");
      setRejectingReq(null);
      setRejectReason('');
    } catch(err) {
      console.error(err);
      showError("فشل عملية الرفض: " + err.message);
    }
    setGlobalLoading(false);
  };

  const viewTransferLog = (transfer) => {
    setSelectedTransferForLog(transfer);
    setTransferLog(transfer.log || []);
    setShowLogModal(true);
  };

  const pendingRequests = filteredTransfers.filter(t => ACTIVE_STATUSES.includes(t.status));
  const processedRequests = filteredTransfers.filter(t => !ACTIVE_STATUSES.includes(t.status));
  const uniqueWarehouses = [...new Set([
    ...transfers.map(t => t.toWarehouseId),
    ...transfers.map(t => t.fromWarehouseId)
  ])];

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'high': return 'text-rose-600 bg-rose-50 dark:bg-rose-900/30';
      case 'normal': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/30';
      case 'low': return 'text-slate-600 bg-slate-50 dark:bg-slate-900/50';
      default: return 'text-slate-600 bg-slate-50 dark:bg-slate-900/50';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden text-right" dir="rtl">
      
      {/* مودال سجل التحويل */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">
              سجل التحويل #{selectedTransferForLog?.id?.slice(0,8)}
            </h3>
            <div className="space-y-4">
              {transferLog.map((entry, idx) => (
                <div key={idx} className="relative pr-6 pb-4 border-r-2 border-teal-200 dark:border-teal-800 last:border-0 last:pb-0">
                  <div className="absolute right-[-5px] top-0 w-3 h-3 rounded-full bg-teal-600"></div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(entry.timestamp).toLocaleString('ar-EG')}</p>
                  <p className="font-bold text-slate-800 dark:text-white">{entry.action}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{entry.details}</p>
                  <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">بواسطة: {entry.by}</p>
                </div>
              ))}
              {transferLog.length === 0 && (
                <p className="text-center text-slate-400 py-8">لا يوجد سجل</p>
              )}
            </div>
            <button 
              onClick={() => setShowLogModal(false)}
              className="mt-4 w-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* باقي المكون كما هو مع إضافة زر عرض السجل في الجدول */}

      <div className="p-6 border-b flex flex-wrap items-center justify-between bg-slate-50 dark:bg-slate-900/50 gap-4">
        <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
          <ArrowRightLeft className="text-teal-600" size={24}/> 
          نظام التحويلات بين المخازن
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => exportToCSV(filteredTransfers.map(req => ({
              'من': warehouseMap[req.fromWarehouseId] || req.fromWarehouseId,
              'إلى': warehouseMap[req.toWarehouseId] || req.toWarehouseId,
              'الأصناف': summarizeItems(req),
              'السيريال': getTransferItems(req).map(i => i.serialNumber).join(' | '),
              'إجمالي الكمية': totalQty(req),
              'الأولوية': req.priority === 'high' ? 'عالية' : req.priority === 'normal' ? 'عادية' : 'منخفضة',
              'الحالة': (STATUS_META[req.status]?.label || req.status),
              'التاريخ': formatDate(req.createdAt),
            })), 'التحويلات_بين_المخازن')}
            disabled={filteredTransfers.length === 0}
            className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50"
          >
            <Download size={14}/> تصدير CSV
          </button>
          <select 
            className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900 focus:border-teal-500 outline-none"
            value={selectedWarehouse}
            onChange={e => setSelectedWarehouse(e.target.value)}
          >
            <option value="all">كل الفروع</option>
            {uniqueWarehouses.map(w => (
              <option key={w} value={w}>{warehouseMap[w] || w}</option>
            ))}
          </select>
          <span className="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-3 py-2 rounded-lg text-xs font-bold">
            {pendingRequests.length} طلبات جارية
          </span>
        </div>
      </div>

      {/* الألسنة */}
      <div className="flex border-b bg-white dark:bg-slate-800 overflow-x-auto custom-scrollbar">
        {[
          { id: 'pending', label: 'الطلبات الجارية' },
          { id: 'history', label: 'سجل التحويلات' },
          ...(appUser.permissions?.createTransfer ? [{ id: 'new', label: 'طلب تحويل جديد' }] : [])
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={()=>setActiveTab(tab.id)} 
            className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-b-2 border-teal-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* المحتوى */}
      <div className="p-6 max-h-[65vh] overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-900/50">
        
        {activeTab === 'new' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-teal-50 dark:bg-teal-900/30 p-5 rounded-2xl border border-teal-100 dark:border-teal-800 text-teal-800 dark:text-teal-300 font-bold text-sm leading-relaxed shadow-sm">
              {isMainWarehouse
                ? 'ابحث عن المنتج في مخزنك واختر الكمية والفرع المرسل إليه.'
                : 'ابحث عن أي منتج موجود في المخزن الرئيسي حتى لو مش موجود عندك. بعد موافقة المخزن الرئيسي وإرسال الطلب، هتستلمه بكود الاستلام وهيتضاف لمخزنك - كصنف جديد أو زيادة في الكمية الموجودة.'}
            </div>

            <form onSubmit={handleSearchProduct} className="flex gap-3">
              <input 
                className="flex-1 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold text-right bg-white dark:bg-slate-900 focus:border-teal-500" 
                placeholder={isMainWarehouse ? "ابحث بالاسم أو السيريال..." : `ابحث بالاسم أو السيريال في ${mainName}...`} 
                value={searchProduct} 
                onChange={e=>setSearchProduct(e.target.value)} 
              />
              <button type="button" onClick={() => setShowScanner(true)} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-3 rounded-xl font-bold hover:bg-slate-200" title="مسح باركود بالكاميرا">
                <ScanLine size={18}/>
              </button>
              <button type="submit" className="bg-teal-600 text-white px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-teal-700">
                <Search size={18}/>
              </button>
            </form>
            {showScanner && (
              <BarcodeScannerModal
                onDetected={(code) => { setShowScanner(false); setSearchProduct(code); handleSearchProduct(null, code); }}
                onClose={() => setShowScanner(false)}
              />
            )}

            {searchResults.length > 1 && (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  لقينا {searchResults.length} أصناف مطابقة - اختر الصنف الصحيح:
                </p>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {searchResults.map(item => (
                    <button
                      key={item.id}
                      onClick={() => selectProduct(item)}
                      className="w-full text-right px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">{item.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{item.serialNumber}</p>
                      </div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-lg ${item.quantity > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'}`}>
                        الكمية: {item.quantity}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedProduct && (
              <div className="bg-white dark:bg-slate-800 border-2 border-teal-100 dark:border-teal-800 rounded-2xl p-6 shadow-md space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-lg text-slate-800 dark:text-white">{selectedProduct.name}</h3>
                  <button onClick={() => setSelectedProduct(null)} className="text-slate-400 dark:text-slate-500 hover:text-rose-500">
                    <X size={18}/>
                  </button>
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-mono text-sm">{selectedProduct.serialNumber}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-xl font-bold text-sm">
                    {isMainWarehouse ? 'المتاح في مخزنك' : 'المتاح في المخزن الرئيسي'}: {selectedProduct.quantity}
                  </div>
                  <div className="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-4 py-2 rounded-xl font-bold text-sm">
                    السعر: {selectedProduct.price} ج
                  </div>
                </div>
                {!isMainWarehouse && (() => {
                  const ownQty = inventory.find(i => i.serialNumber === selectedProduct.serialNumber)?.quantity;
                  return (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {ownQty
                        ? `عندك حاليًا ${ownQty} قطعة من الصنف ده - الكمية المطلوبة هتُضاف عليها بعد الموافقة.`
                        : 'الصنف ده مش موجود عندك حاليًا - هيتضاف كصنف جديد في مخزنك بعد الموافقة.'}
                    </p>
                  );
                })()}

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                    الكمية المطلوبة
                    {cart.find(c => c.serialNumber === selectedProduct.serialNumber) && (
                      <span className="text-indigo-600 dark:text-indigo-400"> (مضاف للطلب: {cart.find(c => c.serialNumber === selectedProduct.serialNumber).requestedQty} - هتتجمّع عليها)</span>
                    )}
                  </label>
                  <input 
                    type="number" 
                    min="1" 
                    max={selectedProduct.quantity}
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-center bg-white dark:bg-slate-900" 
                    value={reqQty} 
                    onChange={e=>setReqQty(Number(e.target.value))} 
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={18}/> إضافة للطلب
                </button>
              </div>
            )}

            {(cart.length > 0 || selectedProduct) && (
              <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-6 shadow-md space-y-4">
                <h3 className="font-black text-base text-slate-800 dark:text-white flex items-center gap-2">
                  <ArrowRightLeft size={18} className="text-teal-600"/> الطلب ({cart.length} {cart.length === 1 ? 'صنف' : 'أصناف'})
                </h3>

                {cart.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">اضغط "إضافة للطلب" بعد اختيار الكمية، وكرر البحث لإضافة أصناف تانية في نفس الطلب.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700 border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
                    {cart.map(item => (
                      <div key={item.serialNumber} className="flex items-center gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-slate-800 dark:text-white truncate">{item.itemName}</p>
                          <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{item.serialNumber}</p>
                        </div>
                        <input
                          type="number"
                          min="1"
                          className="w-20 border border-slate-200 dark:border-slate-700 p-2 rounded-lg font-bold text-center bg-white dark:bg-slate-900"
                          value={item.requestedQty}
                          onChange={e => updateCartQty(item.serialNumber, e.target.value)}
                        />
                        <button type="button" onClick={() => removeFromCart(item.serialNumber)} className="text-slate-400 hover:text-rose-500 p-1" title="حذف من الطلب">
                          <X size={16}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isMainWarehouse && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">المخزن المرسل إليه</label>
                    <select 
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900"
                      value={toWarehouseId}
                      onChange={e => setToWarehouseId(e.target.value)}
                    >
                      <option value="">-- اختر --</option>
                      {Object.entries(warehouseMap)
                        .filter(([id]) => id !== currentWarehouseId)
                        .map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الأولوية</label>
                  <select
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900"
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                  >
                    <option value="low">منخفضة</option>
                    <option value="normal">عادية</option>
                    <option value="high">عالية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                  <textarea
                    rows="2"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-sm resize-none bg-white dark:bg-slate-900"
                    value={transferNotes}
                    onChange={e => setTransferNotes(e.target.value)}
                    placeholder="أي ملاحظات إضافية..."
                  />
                </div>

                <button 
                  onClick={handleSubmitRequest} 
                  className="w-full bg-slate-900 dark:bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-black dark:hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowRightLeft size={18}/> إرسال طلب التحويل
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold border-b text-[11px] uppercase">
                  <tr>
                    <th className="p-4">من مخزن</th>
                    <th className="p-4">إلى مخزن</th>
                    <th className="p-4">المنتج</th>
                    <th className="p-4 text-center">الكمية</th>
                    <th className="p-4">الأولوية</th>
                    <th className="p-4">المرحلة</th>
                    <th className="p-4">بواسطة</th>
                    <th className="p-4">ملاحظات</th>
                    <th className="p-4">سجل</th>
                    <th className="p-4 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {pendingRequests.length === 0 ? <tr><td colSpan="10" className="p-12 text-center text-slate-400">لا توجد طلبات جارية</td></tr> :
                    pendingRequests.map(req => (
                      <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <td className="p-4 font-black text-teal-700 dark:text-teal-400">{warehouseMap[req.fromWarehouseId]}</td>
                        <td className="p-4 font-black text-teal-700 dark:text-teal-400">{warehouseMap[req.toWarehouseId]}</td>
                        <td className="p-4">
                          {getTransferItems(req).map((it, idx) => (
                            <div key={idx} className="mb-1 last:mb-0">
                              <p className="font-bold text-slate-800 dark:text-white">{it.itemName} <span className="text-teal-600 dark:text-teal-400">× {it.requestedQty}</span></p>
                              <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{it.serialNumber}</p>
                            </div>
                          ))}
                        </td>
                        <td className="p-4 text-center font-black text-lg text-slate-700 dark:text-slate-300">{totalQty(req)}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${getPriorityColor(req.priority)}`}>
                            {req.priority === 'high' ? 'عالية' : req.priority === 'normal' ? 'عادية' : 'منخفضة'}
                          </span>
                        </td>
                        <td className="p-4">
                          <StatusBadge status={req.status} />
                          {req.status === 'shipped' && (req.codeAttempts || 0) >= MAX_CODE_ATTEMPTS && (
                            <p className="text-[9px] text-rose-600 mt-1">الاستلام موقوف - يحتاج كود جديد</p>
                          )}
                        </td>
                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                          <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5">{req.requestedBy}</p>
                          <p className="text-[9px]">{formatDate(req.createdAt)}</p>
                        </td>
                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400 max-w-[150px] truncate">
                          {req.notes || '-'}
                        </td>
                        <td className="p-4">
                          <button 
                            onClick={() => viewTransferLog(req)}
                            className="text-teal-600 dark:text-teal-400 hover:underline text-xs"
                          >
                            عرض السجل
                          </button>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center gap-2 flex-wrap">
                            {req.status === 'pending' && canActOnTransfer() && (
                              <button onClick={()=>handleApprove(req)} className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-3 py-2 rounded-xl hover:bg-emerald-500 dark:hover:bg-emerald-800 hover:text-white text-xs font-bold flex items-center gap-1" title="موافقة">
                                <Check size={16}/> موافقة
                              </button>
                            )}
                            {req.status === 'approved' && canActOnTransfer() && (
                              <button onClick={()=>handleShip(req)} className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-3 py-2 rounded-xl hover:bg-indigo-600 hover:text-white text-xs font-bold flex items-center gap-1" title="تم الإرسال">
                                <Truck size={16}/> تم الإرسال
                              </button>
                            )}
                            {req.status === 'shipped' && canActOnTransfer() && (
                              <>
                                <button onClick={()=>handleShowCode(req)} className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-2 rounded-xl hover:bg-amber-500 hover:text-white text-xs font-bold flex items-center gap-1" title="عرض كود الاستلام">
                                  <KeyRound size={16}/> الكود
                                </button>
                                <button onClick={()=>handleReissueCode(req)} className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-xl hover:bg-slate-200 text-xs font-bold" title="إعادة إصدار كود جديد">
                                  كود جديد
                                </button>
                              </>
                            )}
                            {req.status === 'shipped' && canReceiveTransfer(req) && (
                              <button onClick={()=>{ setReceivingReq(req); setReceiveCodeInput(''); }} className="bg-emerald-600 text-white px-3 py-2 rounded-xl hover:bg-emerald-700 text-xs font-bold flex items-center gap-1" title="تم الاستلام">
                                <PackageCheck size={16}/> تم الاستلام
                              </button>
                            )}
                            {(req.status === 'pending' || req.status === 'approved') && canActOnTransfer() && (canReject || isMainWarehouse) && (
                              <button onClick={()=>setRejectingReq(req)} className="bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 p-2 rounded-xl hover:bg-rose-500 dark:hover:bg-rose-800 hover:text-white" title="رفض / إلغاء">
                                <X size={16}/>
                              </button>
                            )}
                            {!(canActOnTransfer() || (req.status === 'shipped' && canReceiveTransfer(req))) && (
                              <span className="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-amber-100 dark:border-amber-800 flex items-center gap-1 w-max">
                                <Loader2 size={12} className="animate-spin"/> {req.status === 'shipped' ? 'في الطريق إليك' : 'بالانتظار'}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold border-b text-[11px] uppercase">
                  <tr>
                    <th className="p-4">من مخزن</th>
                    <th className="p-4">إلى مخزن</th>
                    <th className="p-4">المنتج</th>
                    <th className="p-4 text-center">الكمية</th>
                    <th className="p-4">الأولوية</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4">سجل</th>
                    <th className="p-4">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {processedRequests.length === 0 ? <tr><td colSpan="8" className="p-12 text-center text-slate-400">لا يوجد سجل للتحويلات</td></tr> :
                    processedRequests.map(req => (
                      <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <td className="p-4 font-bold text-slate-700 dark:text-slate-300">{warehouseMap[req.fromWarehouseId]}</td>
                        <td className="p-4 font-bold text-slate-700 dark:text-slate-300">{warehouseMap[req.toWarehouseId]}</td>
                        <td className="p-4">
                          {getTransferItems(req).map((it, idx) => (
                            <div key={idx} className="mb-1 last:mb-0">
                              <p className="font-bold text-slate-800 dark:text-white">{it.itemName} <span className="text-teal-600 dark:text-teal-400">× {it.requestedQty}</span></p>
                              <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{it.serialNumber}</p>
                            </div>
                          ))}
                        </td>
                        <td className="p-4 text-center font-black text-slate-700 dark:text-slate-300">{totalQty(req)}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${getPriorityColor(req.priority)}`}>
                            {req.priority === 'high' ? 'عالية' : req.priority === 'normal' ? 'عادية' : 'منخفضة'}
                          </span>
                        </td>
                        <td className="p-4">
                          <StatusBadge status={req.status} />
                          {req.status === 'rejected' && req.rejectReason && <p className="text-[9px] text-rose-600 dark:text-rose-400 mt-1">{req.rejectReason}</p>}
                        </td>
                        <td className="p-4">
                          <button 
                            onClick={() => viewTransferLog(req)}
                            className="text-teal-600 dark:text-teal-400 hover:underline text-xs block"
                          >
                            عرض السجل
                          </button>
                          {appUser.permissions?.createTransfer && req.status !== 'pending' && (
                            <button
                              onClick={() => reorderFromTransfer(req)}
                              className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs mt-1 block"
                            >
                              اطلب كمية تانية
                            </button>
                          )}
                        </td>
                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                          <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5">{formatDate(req.receivedAt || req.processedAt)}</p>
                          <p className="text-[9px]">بواسطة: {req.receivedBy || req.processedBy}</p>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* مودال كود الاستلام (للمخزن الرئيسي) */}
      {codeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-sm shadow-2xl text-center">
            <KeyRound className="mx-auto text-amber-500 mb-2" size={32}/>
            <h3 className="font-black text-lg text-slate-800 dark:text-white mb-1">كود الاستلام</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {summarizeItems(codeModal.req)} - إلى {warehouseMap[codeModal.req.toWarehouseId]}
            </p>
            <div className="text-4xl font-black font-mono tracking-[0.4em] bg-slate-50 dark:bg-slate-900 rounded-2xl py-4 mb-3 text-slate-800 dark:text-white" dir="ltr">{codeModal.code}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">سلّم الكود ده للمخزن المستلم - مش هيقدر يستلم من غيره.</p>
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard?.writeText(codeModal.code).then(() => showSuccess('تم نسخ الكود'))} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-3 rounded-xl font-bold flex items-center justify-center gap-2"><Copy size={16}/> نسخ</button>
              <button onClick={() => setCodeModal(null)} className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold">تم</button>
            </div>
          </div>
        </div>
      )}

      {/* مودال إدخال كود الاستلام (للمخزن المستلم) */}
      {receivingReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-lg text-slate-800 dark:text-white mb-1 flex items-center gap-2"><PackageCheck className="text-emerald-600" size={20}/> تأكيد الاستلام</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {summarizeItems(receivingReq)} - من {warehouseMap[receivingReq.fromWarehouseId]}
            </p>
            <form onSubmit={submitReceive}>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اكتب كود الاستلام اللي ظهر في المخزن الرئيسي</label>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                dir="ltr"
                className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-center text-2xl font-black font-mono tracking-[0.4em] bg-slate-50 dark:bg-slate-900 outline-none focus:border-emerald-500 mb-4"
                placeholder="______"
                value={receiveCodeInput}
                onChange={e => setReceiveCodeInput(e.target.value.replace(/\D/g, ''))}
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700">تأكيد الاستلام</button>
                <button type="button" onClick={() => { setReceivingReq(null); setReceiveCodeInput(''); }} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال سبب الرفض */}
      {rejectingReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-xl mb-4 text-slate-800 dark:text-white border-b pb-3 text-rose-600 flex items-center gap-2">
              <X size={20}/> سبب رفض التحويل
            </h3>
            <form onSubmit={submitReject}>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
                أنت تقوم برفض طلب ({summarizeItems(rejectingReq)}) لفرع ({warehouseMap[rejectingReq.toWarehouseId]})
              </p>
              <textarea 
                required
                rows="3"
                className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-rose-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold resize-none mb-4" 
                placeholder="اكتب سبب الرفض هنا ليراه الفرع الطالب..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-md">تأكيد الرفض</button>
                <button type="button" onClick={()=>{setRejectingReq(null); setRejectReason('');}} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
// ==========================================================================
// 👥 مدير العملاء المحسن
// ==========================================================================
