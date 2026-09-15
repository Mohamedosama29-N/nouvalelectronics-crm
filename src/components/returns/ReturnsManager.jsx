import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, getDoc, doc, updateDoc, query, where, serverTimestamp, orderBy, increment, limit
} from 'firebase/firestore';
import {
  Plus,
  Search,
  Save,
  Loader2,
  X,
  RotateCcw,
  Download
} from 'lucide-react';
import { db } from '../../firebase/config';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showInfo, showSuccess } from '../../utils/alerts';
import { buildInventorySearchTokens, normalizeSearch, normalizeSerial } from '../../utils/search';
import { exportToCSV } from '../../utils/exportUtils';

export function ReturnsManager({ appUser, setGlobalLoading, warehouses, warehouseMap }) {
  const [returns, setReturns] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveData, setApproveData] = useState({ toWarehouse: '', notes: '' });
  
  // ✅ حالة المنتج الجديد
  const [newReturn, setNewReturn] = useState({
    serialNumber: '',
    productName: '',
    originalInvoice: '',
    customerName: '',
    customerPhone: '',
    reason: 'new_spare_parts',
    condition: 'good',
    fromWarehouse: appUser.assignedWarehouseId || 'main',
    quantity: 1,
    price: 0,
    notes: ''
  });

  // ✅ حالة البحث عن المنتج
  const [searchProduct, setSearchProduct] = useState('');
  const [foundProduct, setFoundProduct] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // ========== تحميل المرتجعات ==========
  useEffect(() => {
    loadReturns();
  }, []);

  const loadReturns = async () => {
    setLoading(true);
    try {
      let q = collection(db, 'returns');
      let constraints = [];
      
      // ✅ التحكم في البيانات حسب صلاحيات المستخدم
      if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
        constraints.push(where('fromWarehouse', '==', appUser.assignedWarehouseId || 'main'));
      }
      
      constraints.push(orderBy('createdAt', 'desc'));
      constraints.push(limit(500));
      q = query(q, ...constraints);
      
      const snap = await getDocs(q);
      setReturns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error loading returns:", error);
      showError("فشل تحميل بيانات المرتجعات");
    }
    setLoading(false);
  };

  // ========== البحث عن المنتج بالسيريال ==========
  const handleSearchProduct = async (e) => {
    e.preventDefault();
    if (!searchProduct.trim()) {
      showError("يرجى إدخال السيريال");
      return;
    }

    setIsSearching(true);
    try {
      const term = normalizeSerial(searchProduct);
      
      // ✅ البحث في المخزون
      const q = query(
        collection(db, 'inventory'),
        where('serialNumber', '==', term),
        where('isDeleted', '==', false)
      );
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const product = snap.docs[0].data();
        setFoundProduct({
          id: snap.docs[0].id,
          ...product
        });
        
        // ✅ ملء البيانات تلقائياً
        setNewReturn(prev => ({
          ...prev,
          productName: product.name || '',
          price: product.price || 0,
          serialNumber: term,
          fromWarehouse: product.warehouseId || appUser.assignedWarehouseId || 'main'
        }));
        
        showSuccess(`✅ تم العثور على المنتج: ${product.name}`);
      } else {
        // ✅ البحث في المرتجعات السابقة
        const returnQ = query(
          collection(db, 'returns'),
          where('serialNumber', '==', term)
        );
        const returnSnap = await getDocs(returnQ);
        
        if (!returnSnap.empty) {
          const returnData = returnSnap.docs[0].data();
          setFoundProduct({
            name: returnData.productName,
            price: returnData.price
          });
          
          setNewReturn(prev => ({
            ...prev,
            productName: returnData.productName || '',
            price: returnData.price || 0,
            serialNumber: term
          }));
          
          showInfo(`تم العثور على المنتج في سجل المرتجعات: ${returnData.productName}`);
        } else {
          showError(`❌ لم يتم العثور على منتج بالسيريال "${searchProduct}"`);
          setFoundProduct(null);
          setNewReturn(prev => ({
            ...prev,
            productName: '',
            price: 0
          }));
        }
      }
    } catch (error) {
      console.error("Error searching product:", error);
      showError("حدث خطأ أثناء البحث");
    }
    setIsSearching(false);
  };

  // ========== إضافة مرتجع جديد ==========
  const handleAddReturn = async (e) => {
    e.preventDefault();
    
    if (!newReturn.serialNumber || !newReturn.productName) {
      showError("السيريال واسم المنتج مطلوبان");
      return;
    }

    if (!newReturn.reason) {
      showError("يرجى اختيار سبب الإرجاع");
      return;
    }

    setGlobalLoading(true);
    try {
      // ✅ الحصول على تسمية السبب
      const reasonLabels = {
        'new_spare_parts': 'مرتجع جديد - قطع غيار',
        'defective_warranty': 'مرتجع تالف - بالضمان',
        'new_defective_spare_parts': 'مرتجع جديد تالف - قطع غيار'
      };

      const returnData = {
        ...newReturn,
        reasonLabel: reasonLabels[newReturn.reason] || newReturn.reason,
        createdAt: serverTimestamp(),
        createdBy: appUser.name,
        createdById: appUser.id,
        fromWarehouse: appUser.assignedWarehouseId || 'main',
        status: 'pending',
        approvedBy: '',
        approvedAt: null,
        // 🛠️ FIX: تسجيل الصنف اللي اتخصمت منه الكمية فعليًا (لو موجود)،
        // عشان لو المرتجع اترفض بعدين، نرجّع الكمية لنفس الصنف بالظبط
        // مش نبحث تاني بالسيريال (اللي ممكن يطابق صنف مختلف أو يفشل).
        deductedInventoryId: (foundProduct && foundProduct.id) ? foundProduct.id : null
      };

      const docRef = await addDoc(collection(db, 'returns'), returnData);
      
      // ✅ إذا كان المنتج موجوداً في المخزون، قم بتحديث كميته
      if (foundProduct && foundProduct.id) {
        // ✅ نزول الكمية من المخزون المصدر
        const inventoryRef = doc(db, 'inventory', foundProduct.id);
        const inventorySnap = await getDoc(inventoryRef);
        
        if (inventorySnap.exists()) {
          const currentQty = inventorySnap.data().quantity || 0;
          const newQty = Math.max(0, currentQty - newReturn.quantity);
          
          await updateDoc(inventoryRef, {
            quantity: newQty,
            updatedAt: serverTimestamp()
          });
        }
      }
      
      await logUserActivity(appUser, 'إضافة مرتجع', `إضافة مرتجع: ${newReturn.productName} (${newReturn.serialNumber}) - ${reasonLabels[newReturn.reason]}`);
      
      showSuccess("✅ تم إضافة المرتجع بنجاح");
      setShowAddModal(false);
      resetForm();
      loadReturns();
    } catch (error) {
      console.error("Error adding return:", error);
      showError("فشل إضافة المرتجع: " + error.message);
    }
    setGlobalLoading(false);
  };

  // ========== الموافقة على المرتجع ==========
  // ========== الموافقة على المرتجع ==========
const handleApproveReturn = async (returnId) => {
  if (!approveData.toWarehouse) {
    showError("يرجى اختيار المخزن المستهدف");
    return;
  }

  setGlobalLoading(true);
  try {
    const returnRef = doc(db, 'returns', returnId);
    const returnSnap = await getDoc(returnRef);
    
    if (!returnSnap.exists()) {
      throw new Error("المرتجع غير موجود");
    }
    
    const returnData = returnSnap.data();

    // 🛠️ FIX: مفيش أي تحقق قبل كده من إن المرتجع لسه "قيد الانتظار"، فلو
    // الأدمن ضغط "موافقة" مرتين بسرعة (أو الشبكة اتأخرت والزرار اتضغط تاني)
    // كان بيتكرر إضافة الكمية للمخزون/مخزن المرتجعات مرتين لنفس المرتجع.
    if (returnData.status && returnData.status !== 'pending') {
      throw new Error("تمت معالجة هذا المرتجع بالفعل");
    }
    
    // ✅ معالجة حسب نوع المرتجع
    const reason = returnData.reason;
    const serialNumber = returnData.serialNumber;
    const quantity = returnData.quantity || 1;
    const productName = returnData.productName;
    const price = returnData.price || 0;
    
    // ✅ 1. مرتجع جديد - قطع غيار (يضاف للمخزن المستهدف)
    if (reason === 'new_spare_parts') {
      // البحث عن المنتج في المخزن المستهدف
      const targetQ = query(
        collection(db, 'inventory'),
        where('serialNumber', '==', serialNumber),
        where('warehouseId', '==', approveData.toWarehouse),
        where('isDeleted', '==', false)
      );
      const targetSnap = await getDocs(targetQ);
      
      // ✅ التصحيح: استخدام size بدلاً من empty
      if (targetSnap.size > 0) {
        // ✅ إضافة الكمية للمنتج الموجود
        const targetItem = targetSnap.docs[0];
        const currentQty = targetItem.data().quantity || 0;
        await updateDoc(targetItem.ref, {
          quantity: currentQty + quantity,
          updatedAt: serverTimestamp()
        });
      } else {
        // ✅ إنشاء منتج جديد في المخزن المستهدف
        await addDoc(collection(db, 'inventory'), {
          serialNumber: serialNumber,
          name: productName,
          price: price,
          quantity: quantity,
          minStock: 2,
          category: 'مرتجع',
          location: approveData.toWarehouse === 'main' ? 'المخزن الرئيسي' : approveData.toWarehouse,
          tags: ['مرتجع', 'مستعمل'],
          notes: `مرتجع من ${returnData.fromWarehouse}`,
          warehouseId: approveData.toWarehouse,
          searchKey: normalizeSearch(`${productName} ${serialNumber}`),
          searchTokens: buildInventorySearchTokens(productName, serialNumber),
          createdAt: serverTimestamp(),
          isDeleted: false
        });
      }
    }
    
    // ✅ 2. مرتجع تالف بالضمان (يضاف لمخزن المرتجعات فقط)
    else if (reason === 'defective_warranty') {
      // ✅ إضافة المنتج لمخزن المرتجعات فقط (لا يضاف لأي مخزن آخر)
      await addDoc(collection(db, 'returnsWarehouse'), {
        serialNumber: serialNumber,
        name: productName,
        originalInvoice: returnData.originalInvoice || '',
        reason: 'تالف بالضمان',
        condition: 'defective',
        customerName: returnData.customerName || '',
        customerPhone: returnData.customerPhone || '',
        returnDate: new Date().toISOString().split('T')[0],
        warehouseId: 'returns',
        price: price,
        quantity: quantity,
        fromReturnId: returnId,
        createdAt: serverTimestamp(),
        createdBy: appUser.name
      });
    }
    
    // ✅ 3. مرتجع جديد تالف - قطع غيار (يضاف لمخزن المرتجعات فقط)
    else if (reason === 'new_defective_spare_parts') {
      // ✅ إضافة المنتج لمخزن المرتجعات فقط
      await addDoc(collection(db, 'returnsWarehouse'), {
        serialNumber: serialNumber,
        name: productName,
        originalInvoice: returnData.originalInvoice || '',
        reason: 'جديد تالف - قطع غيار',
        condition: 'defective',
        customerName: returnData.customerName || '',
        customerPhone: returnData.customerPhone || '',
        returnDate: new Date().toISOString().split('T')[0],
        warehouseId: 'returns',
        price: price,
        quantity: quantity,
        fromReturnId: returnId,
        createdAt: serverTimestamp(),
        createdBy: appUser.name
      });
    }
    
    // ✅ تحديث حالة المرتجع
    await updateDoc(returnRef, {
      status: 'approved',
      approvedBy: appUser.name,
      approvedAt: serverTimestamp(),
      toWarehouse: approveData.toWarehouse,
      notes: approveData.notes || returnData.notes
    });
    
    await logUserActivity(appUser, 'موافقة على مرتجع', `تمت الموافقة على مرتجع ${productName} (${serialNumber}) - ${returnData.reasonLabel}`);
    
    showSuccess("✅ تمت الموافقة على المرتجع");
    setShowApproveModal(false);
    setApproveData({ toWarehouse: '', notes: '' });
    loadReturns();
  } catch (error) {
    console.error("Error approving return:", error);
    showError("فشل الموافقة على المرتجع: " + error.message);
  }
  setGlobalLoading(false);
};

  // ========== رفض المرتجع ==========
  const handleRejectReturn = async (returnId) => {
    const confirmed = await showConfirm(
      'تأكيد الرفض',
      'هل أنت متأكد من رفض هذا المرتجع؟ سيتم إلغاؤه نهائياً.'
    );
    
    if (!confirmed) return;
    
    setGlobalLoading(true);
    try {
      const returnRef = doc(db, 'returns', returnId);
      const returnSnap = await getDoc(returnRef);
      if (!returnSnap.exists()) {
        throw new Error("المرتجع غير موجود");
      }
      const returnData = returnSnap.data();

      // 🛠️ FIX: منع رفض مرتجع اتعالج بالفعل (موافق عليه أو مرفوض سابقًا)
      if (returnData.status && returnData.status !== 'pending') {
        throw new Error("تمت معالجة هذا المرتجع بالفعل");
      }

      // 🛠️ FIX: إضافة المرتجع كانت بتخصم الكمية من مخزون المصدر فورًا،
      // ولما يترفض المرتجع الكمية دي مكنتش بترجع تاني للمخزون أبدًا،
      // فالمخزون كان بيفقد كمية حقيقية بدون أي سبب. هنا بنرجّعها لنفس
      // الصنف بالظبط اللي اتخصم منه (لو كان الخصم حصل أصلًا).
      if (returnData.deductedInventoryId) {
        const sourceRef = doc(db, 'inventory', returnData.deductedInventoryId);
        const sourceSnap = await getDoc(sourceRef);
        if (sourceSnap.exists()) {
          await updateDoc(sourceRef, {
            quantity: increment(returnData.quantity || 1),
            updatedAt: serverTimestamp()
          });
        }
      }
      
      await updateDoc(returnRef, {
        status: 'rejected',
        approvedBy: appUser.name,
        approvedAt: serverTimestamp()
      });
      
      showSuccess("تم رفض المرتجع وإرجاع الكمية للمخزون");
      loadReturns();
    } catch (error) {
      console.error("Error rejecting return:", error);
      showError("فشل رفض المرتجع: " + (error.message || ''));
    }
    setGlobalLoading(false);
  };

  // ========== إعادة تعيين النموذج ==========
  const resetForm = () => {
    setNewReturn({
      serialNumber: '',
      productName: '',
      originalInvoice: '',
      customerName: '',
      customerPhone: '',
      reason: 'new_spare_parts',
      condition: 'good',
      fromWarehouse: appUser.assignedWarehouseId || 'main',
      quantity: 1,
      price: 0,
      notes: ''
    });
    setFoundProduct(null);
    setSearchProduct('');
  };

  // ========== الفلاتر والبحث ==========
  const filteredReturns = returns.filter(item => {
    const term = normalizeSearch(search);
    return (
      normalizeSearch(item.serialNumber || '').includes(term) ||
      normalizeSearch(item.productName || '').includes(term) ||
      normalizeSearch(item.customerName || '').includes(term) ||
      normalizeSearch(item.originalInvoice || '').includes(term)
    );
  });

  // ========== تنسيق التاريخ ==========
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '-';
    try {
      if (timestamp?.toDate) {
        return timestamp.toDate().toLocaleString('ar-EG');
      }
      return new Date(timestamp).toLocaleString('ar-EG');
    } catch {
      return '-';
    }
  };

  // ========== الحصول على تسمية السبب ==========
  const getReasonLabel = (reason) => {
    const labels = {
      'new_spare_parts': '🔄 مرتجع جديد - قطع غيار',
      'defective_warranty': '🔧 مرتجع تالف - بالضمان',
      'new_defective_spare_parts': '❌ مرتجع جديد تالف - قطع غيار'
    };
    return labels[reason] || reason;
  };

  const getReasonColor = (reason) => {
    const colors = {
      'new_spare_parts': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      'defective_warranty': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      'new_defective_spare_parts': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
    };
    return colors[reason] || 'bg-slate-100 text-slate-700';
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      'approved': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      'rejected': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  // ========== رندر ==========
  return (
    <div className="space-y-6" dir="rtl">
      
      {/* ===== مودال إضافة مرتجع ===== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="font-black text-xl text-slate-800 dark:text-white">إضافة مرتجع جديد</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleAddReturn} className="space-y-4">
              {/* ===== البحث عن المنتج ===== */}
              <div className="bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl border border-teal-200 dark:border-teal-800">
                <label className="block text-xs font-bold text-teal-900 dark:text-teal-300 mb-2">
                  🔍 البحث عن المنتج بالسيريال
                </label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-teal-200 dark:border-teal-800 p-3 rounded-xl font-mono text-sm bg-white dark:bg-slate-900"
                    placeholder="أدخل السيريال..."
                    value={searchProduct}
                    onChange={e => setSearchProduct(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleSearchProduct}
                    disabled={isSearching}
                    className="bg-teal-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-teal-700 disabled:opacity-50"
                  >
                    {isSearching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                  </button>
                </div>
                
                {foundProduct && (
                  <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-teal-200 dark:border-teal-800">
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">
                      ✅ تم العثور على: {foundProduct.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      السعر: {foundProduct.price} ج | المخزن: {warehouseMap[foundProduct.warehouseId] || foundProduct.warehouseId}
                    </p>
                  </div>
                )}
              </div>

              {/* ===== معلومات المنتج ===== */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">السيريال *</label>
                  <input
                    required
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-mono bg-white dark:bg-slate-900"
                    value={newReturn.serialNumber}
                    onChange={e => setNewReturn({...newReturn, serialNumber: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اسم المنتج *</label>
                  <input
                    required
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900"
                    value={newReturn.productName}
                    onChange={e => setNewReturn({...newReturn, productName: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم الفاتورة الأصلية</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-mono bg-white dark:bg-slate-900"
                    value={newReturn.originalInvoice}
                    onChange={e => setNewReturn({...newReturn, originalInvoice: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الكمية</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-center bg-white dark:bg-slate-900"
                    value={newReturn.quantity}
                    onChange={e => setNewReturn({...newReturn, quantity: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اسم العميل</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900"
                    value={newReturn.customerName}
                    onChange={e => setNewReturn({...newReturn, customerName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم العميل</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-mono bg-white dark:bg-slate-900"
                    value={newReturn.customerPhone}
                    onChange={e => setNewReturn({...newReturn, customerPhone: e.target.value})}
                  />
                </div>
              </div>

              {/* ===== سبب الإرجاع ===== */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">سبب الإرجاع *</label>
                <select
                  required
                  className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 font-bold"
                  value={newReturn.reason}
                  onChange={e => setNewReturn({...newReturn, reason: e.target.value})}
                >
                  <option value="new_spare_parts">🔄 مرتجع جديد - قطع غيار (يضاف للمخزن المستهدف)</option>
                  <option value="defective_warranty">🔧 مرتجع تالف - بالضمان (يضاف لمخزن المرتجعات فقط)</option>
                  <option value="new_defective_spare_parts">❌ مرتجع جديد تالف - قطع غيار (يضاف لمخزن المرتجعات فقط)</option>
                </select>
              </div>

              {/* ===== شرح أسباب الإرجاع ===== */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">🔄 مرتجع جديد - قطع غيار:</span> يتم خصم المنتج من المخزن المصدر وإضافته للمخزن المستهدف (قابل للبيع مرة أخرى)
                  <br/>
                  <span className="font-bold text-amber-600 dark:text-amber-400">🔧 مرتجع تالف - بالضمان:</span> يتم خصم المنتج من المخزن المصدر وإضافته لمخزن المرتجعات (غير قابل للبيع)
                  <br/>
                  <span className="font-bold text-rose-600 dark:text-rose-400">❌ مرتجع جديد تالف - قطع غيار:</span> يتم خصم المنتج من المخزن المصدر وإضافته لمخزن المرتجعات (غير قابل للبيع)
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                <textarea
                  rows="2"
                  className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 resize-none"
                  value={newReturn.notes}
                  onChange={e => setNewReturn({...newReturn, notes: e.target.value})}
                />
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <button type="submit" className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700">
                  <Save size={18} className="inline ml-2" /> حفظ المرتجع
                </button>
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== مودال الموافقة على المرتجع ===== */}
      {showApproveModal && selectedReturn && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="font-black text-xl text-slate-800 dark:text-white">الموافقة على المرتجع</h3>
              <button onClick={() => setShowApproveModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                <p className="text-sm font-bold">{selectedReturn.productName}</p>
                <p className="text-xs font-mono text-slate-500">{selectedReturn.serialNumber}</p>
                <p className="text-xs text-slate-500">السبب: {getReasonLabel(selectedReturn.reason)}</p>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">المخزن المستهدف</label>
                <select
                  className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900"
                  value={approveData.toWarehouse}
                  onChange={e => setApproveData({...approveData, toWarehouse: e.target.value})}
                >
                  <option value="">-- اختر المخزن --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                <textarea
                  rows="2"
                  className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 resize-none"
                  value={approveData.notes}
                  onChange={e => setApproveData({...approveData, notes: e.target.value})}
                />
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                <p className="text-[10px] text-amber-700 dark:text-amber-300">
                  ⚠️ عند الموافقة، سيتم تحويل المرتجع حسب نوعه وتحديث أرصدة المخازن تلقائياً.
                </p>
              </div>
              
              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => handleApproveReturn(selectedReturn.id)}
                  disabled={!approveData.toWarehouse}
                  className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50"
                >
                  موافقة
                </button>
                <button
                  onClick={() => handleRejectReturn(selectedReturn.id)}
                  className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700"
                >
                  رفض
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== رأس الصفحة ===== */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <h2 className="text-xl font-black flex items-center gap-2">
            <RotateCcw className="text-teal-600" size={24} />
            إدارة المرتجعات
          </h2>
          
          <div className="flex gap-2">
            <button
              onClick={() => exportToCSV(filteredReturns.map(item => ({
                'السيريال': item.serialNumber,
                'المنتج': item.productName,
                'رقم الفاتورة': item.originalInvoice || '-',
                'العميل': item.customerName || '-',
                'السبب': getReasonLabel(item.reason),
                'الحالة': item.status === 'pending' ? 'قيد الانتظار' : item.status === 'approved' ? 'موافق عليه' : 'مرفوض',
                'المخزن': warehouseMap[item.fromWarehouse] || item.fromWarehouse,
                'التاريخ': formatTimestamp(item.createdAt),
              })), 'المرتجعات')}
              disabled={filteredReturns.length === 0}
              className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50"
            >
              <Download size={16} /> تصدير CSV
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-teal-700"
            >
              <Plus size={16} /> مرتجع جديد
            </button>
          </div>
        </div>

        {/* ===== البحث ===== */}
        <div className="relative mb-4">
          <Search className="absolute right-3 top-3 text-slate-400" size={16} />
          <input
            className="w-full border border-slate-200 dark:border-slate-700 p-2 pr-10 rounded-lg text-sm bg-white dark:bg-slate-900"
            placeholder="بحث بالسيريال، اسم المنتج، العميل، أو رقم الفاتورة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* ===== عرض البيانات ===== */}
        {loading ? (
          <p className="text-center py-8">جاري التحميل...</p>
        ) : filteredReturns.length === 0 ? (
          <p className="text-center py-8 text-slate-400">لا توجد مرتجعات</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold text-xs">
                <tr>
                  <th className="p-3">السيريال</th>
                  <th className="p-3">المنتج</th>
                  <th className="p-3">الفاتورة</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3">السبب</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">من مخزن</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredReturns.map(item => (
                  <tr key={item.id}>
                    <td className="p-3 font-mono">{item.serialNumber}</td>
                    <td className="p-3 font-bold">{item.productName}</td>
                    <td className="p-3 font-mono">{item.originalInvoice || '-'}</td>
                    <td className="p-3">{item.customerName || '-'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${getReasonColor(item.reason)}`}>
                        {getReasonLabel(item.reason)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${getStatusColor(item.status)}`}>
                        {item.status === 'pending' ? 'قيد الانتظار' : 
                         item.status === 'approved' ? '✅ موافق عليه' : '❌ مرفوض'}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-teal-600">{warehouseMap[item.fromWarehouse] || item.fromWarehouse}</td>
                    <td className="p-3 text-[10px]">{formatTimestamp(item.createdAt)}</td>
                    <td className="p-3">
                      {item.status === 'pending' && (
                        <button
                          onClick={() => {
                            setSelectedReturn(item);
                            setShowApproveModal(true);
                          }}
                          className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-teal-700"
                        >
                          معالجة
                        </button>
                      )}
                      {item.status === 'approved' && (
                        <span className="text-emerald-600 text-xs font-bold">تمت الموافقة</span>
                      )}
                      {item.status === 'rejected' && (
                        <span className="text-rose-600 text-xs font-bold">مرفوض</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
// ==========================================================================
// ⚙️ صفحة الإعدادات المركزية المتكاملة (معدلة - حذف Faults Tab)
// ==========================================================================
