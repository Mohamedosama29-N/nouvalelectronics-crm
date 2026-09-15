import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, doc, updateDoc, query, where, serverTimestamp, orderBy, onSnapshot, increment, limit, runTransaction
} from 'firebase/firestore';
import {
  ArrowRightLeft,
  Search,
  Loader2,
  X,
  Check,
  Download
} from 'lucide-react';
import { db } from '../../firebase/config';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { formatDate } from '../../utils/format';
import { buildInventorySearchTokens, normalizeSearch } from '../../utils/search';
import { exportToCSV } from '../../utils/exportUtils';

export function EnhancedTransferManager({ appUser, warehouseMap, setGlobalLoading }) {
  const [activeTab, setActiveTab] = useState('pending');
  const [transfers, setTransfers] = useState([]);
  const [inventory, setInventory] = useState([]);
  
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [reqQty, setReqQty] = useState(1);
  const [toWarehouseId, setToWarehouseId] = useState('');
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
  const canApprove = appUser.permissions?.approveTransfer || isMainWarehouse;
  const canReject = appUser.permissions?.rejectTransfer || isMainWarehouse;

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
      const fetched = snap.docs.map(d => ({id: d.id, ...d.data()}));
      setTransfers(fetched);
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

    return () => { unsub(); invUnsub(); };
  }, [appUser, currentWarehouseId, isMainWarehouse]);

  useEffect(() => {
    if (selectedWarehouse === 'all') {
      setFilteredTransfers(transfers);
    } else {
      setFilteredTransfers(transfers.filter(t => 
        t.toWarehouseId === selectedWarehouse || t.fromWarehouseId === selectedWarehouse
      ));
    }
  }, [transfers, selectedWarehouse]);

  const handleSearchProduct = (e) => {
    e.preventDefault();
    if (!searchProduct.trim() || inventory.length === 0) return;
    
    const term = normalizeSearch(searchProduct);
    const found = inventory.find(i => 
      normalizeSearch(i.serialNumber).includes(term) || 
      normalizeSearch(i.name).includes(term)
    );
    
    if (found) {
      if (found.quantity <= 0) {
        showError("المنتج غير متوفر بالكمية المطلوبة في مخزنك");
        return;
      }
      setSelectedProduct(found);
      setSearchProduct('');
      setReqQty(1);
    } else {
      showError("لم يتم العثور على المنتج في مخزنك");
    }
  };

  const handleSubmitRequest = async () => {
    if (!selectedProduct) return showError("اختر منتجاً أولاً");
    if (!toWarehouseId) return showError("اختر المخزن المرسل إليه");
    if (reqQty <= 0) return showError("الكمية غير صالحة");
    if (reqQty > selectedProduct.quantity) return showError("الكمية المطلوبة أكبر من المتاح في مخزنك!");
    
    setGlobalLoading(true);
    try {
      const transferData = {
        serialNumber: selectedProduct.serialNumber,
        itemName: selectedProduct.name,
        requestedQty: Number(reqQty),
        fromWarehouseId: currentWarehouseId,
        toWarehouseId: toWarehouseId,
        status: 'pending',
        priority,
        createdAt: serverTimestamp(),
        requestedBy: appUser.name || appUser.email,
        requestedById: appUser.id,
        notes: transferNotes,
        log: [{
          action: 'إنشاء طلب تحويل',
          timestamp: new Date().toISOString(),
          by: appUser.name,
          details: `طلب تحويل ${reqQty} قطعة من ${selectedProduct.name} إلى ${warehouseMap[toWarehouseId]}`
        }]
      };
      
      await addDoc(collection(db, 'transfers'), transferData);
      
      await logUserActivity(appUser, 'طلب تحويل مخزني', `طلب تحويل ${reqQty} قطعة من ${selectedProduct.name} إلى ${warehouseMap[toWarehouseId]}`);
      showSuccess("تم إرسال طلب التحويل بنجاح");
      setSelectedProduct(null);
      setSearchProduct('');
      setReqQty(1);
      setToWarehouseId('');
      setTransferNotes('');
      setPriority('normal');
      setActiveTab('history');
    } catch(e) {
      console.error(e);
      showError("فشل إرسال الطلب: " + e.message);
    }
    setGlobalLoading(false);
  };

  const handleApprove = async (req) => {
    const confirmed = await showConfirm(
      'الموافقة على التحويل',
      `الموافقة على تحويل ${req.requestedQty} قطعة من ${req.itemName} لفرع ${warehouseMap[req.toWarehouseId]}؟`
    );
    
    if (!confirmed) return;
    
    setGlobalLoading(true);
    
    try {
      await runTransaction(db, async (transaction) => {
        // 1. البحث عن المنتج في المخزن المرسل
        const fromQ = query(
          collection(db, 'inventory'),
          where('serialNumber', '==', req.serialNumber),
          where('warehouseId', '==', req.fromWarehouseId),
          where('isDeleted', '==', false)
        );
        const fromSnap = await getDocs(fromQ);
        
        if (fromSnap.empty) {
          throw new Error(`المنتج ${req.itemName} غير موجود بالمخزن المرسل!`);
        }
        
        const fromItem = fromSnap.docs[0];
        const currentQty = fromItem.data().quantity || 0;
        
        if (currentQty < req.requestedQty) {
          throw new Error(`الكمية غير كافية! المتاح: ${currentQty}, المطلوب: ${req.requestedQty}`);
        }

        // 2. خصم الكمية من المخزن المرسل
        transaction.update(fromItem.ref, {
          quantity: currentQty - req.requestedQty,
          updatedAt: serverTimestamp()
        });

        // 3. البحث عن المنتج في المخزن المستقبل
        const toQ = query(
          collection(db, 'inventory'),
          where('serialNumber', '==', req.serialNumber),
          where('warehouseId', '==', req.toWarehouseId),
          where('isDeleted', '==', false)
        );
        const toSnap = await getDocs(toQ);

        if (!toSnap.empty) {
          // إضافة الكمية للمنتج الموجود
          const toItem = toSnap.docs[0];
          transaction.update(toItem.ref, {
            quantity: increment(req.requestedQty),
            updatedAt: serverTimestamp()
          });
        } else {
          // إنشاء منتج جديد في المخزن المستقبل
          const newRef = doc(collection(db, 'inventory'));
          const sourceData = fromItem.data();
          transaction.set(newRef, {
            serialNumber: sourceData.serialNumber,
            name: sourceData.name,
            price: sourceData.price || 0,
            quantity: req.requestedQty,
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

        // 4. تحديث حالة الطلب
        const updatedLog = [...(req.log || []), {
          action: 'تمت الموافقة على التحويل',
          timestamp: new Date().toISOString(),
          by: appUser.name,
          details: `تم خصم ${req.requestedQty} قطعة من ${warehouseMap[req.fromWarehouseId]} وإضافتها إلى ${warehouseMap[req.toWarehouseId]}`
        }];

        const reqRef = doc(db, 'transfers', req.id);
        transaction.update(reqRef, {
          status: 'approved',
          processedAt: serverTimestamp(),
          processedBy: appUser.name || appUser.email,
          processedById: appUser.id,
          log: updatedLog
        });
      });
      
      await logUserActivity(appUser, 'موافقة على تحويل مخزني', `تمت الموافقة لفرع ${warehouseMap[req.toWarehouseId]} على ${req.requestedQty} قطعة من ${req.itemName}`);
      showSuccess("تمت الموافقة وتم التحويل المخزني بنجاح!");
      
    } catch(e) {
      console.error(e);
      showError(e.message || "خطأ أثناء الموافقة على التحويل");
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

  const pendingRequests = filteredTransfers.filter(t => t.status === 'pending');
  const processedRequests = filteredTransfers.filter(t => t.status !== 'pending');
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
                <div key={idx} className="relative pr-6 pb-4 border-r-2 border-indigo-200 dark:border-indigo-800 last:border-0 last:pb-0">
                  <div className="absolute right-[-5px] top-0 w-3 h-3 rounded-full bg-indigo-600"></div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(entry.timestamp).toLocaleString('ar-EG')}</p>
                  <p className="font-bold text-slate-800 dark:text-white">{entry.action}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{entry.details}</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">بواسطة: {entry.by}</p>
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
          <ArrowRightLeft className="text-indigo-600" size={24}/> 
          نظام التحويلات بين المخازن
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => exportToCSV(filteredTransfers.map(req => ({
              'من': warehouseMap[req.fromWarehouseId] || req.fromWarehouseId,
              'إلى': warehouseMap[req.toWarehouseId] || req.toWarehouseId,
              'الصنف': req.itemName,
              'السيريال': req.serialNumber,
              'الكمية': req.requestedQty,
              'الأولوية': req.priority === 'high' ? 'عالية' : req.priority === 'normal' ? 'عادية' : 'منخفضة',
              'الحالة': req.status === 'pending' ? 'قيد الانتظار' : req.status === 'approved' ? 'موافق عليه' : 'مرفوض',
              'التاريخ': formatDate(req.createdAt),
            })), 'التحويلات_بين_المخازن')}
            disabled={filteredTransfers.length === 0}
            className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50"
          >
            <Download size={14}/> تصدير CSV
          </button>
          <select 
            className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900 focus:border-indigo-500 outline-none"
            value={selectedWarehouse}
            onChange={e => setSelectedWarehouse(e.target.value)}
          >
            <option value="all">كل الفروع</option>
            {uniqueWarehouses.map(w => (
              <option key={w} value={w}>{warehouseMap[w] || w}</option>
            ))}
          </select>
          <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-2 rounded-lg text-xs font-bold">
            {pendingRequests.length} طلبات قيد الانتظار
          </span>
        </div>
      </div>

      {/* الألسنة */}
      <div className="flex border-b bg-white dark:bg-slate-800 overflow-x-auto custom-scrollbar">
        {[
          { id: 'pending', label: 'الطلبات المعلقة' },
          { id: 'history', label: 'سجل التحويلات' },
          ...(appUser.permissions?.createTransfer ? [{ id: 'new', label: 'طلب تحويل جديد' }] : [])
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={()=>setActiveTab(tab.id)} 
            className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* المحتوى */}
      <div className="p-6 max-h-[65vh] overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-900/50">
        
        {activeTab === 'new' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 font-bold text-sm leading-relaxed shadow-sm">
              ابحث عن المنتج في مخزنك واختر الكمية والمخزن المرسل إليه. المخزن الرئيسي يمكنه الموافقة أو رفض الطلب.
            </div>
            
            <form onSubmit={handleSearchProduct} className="flex gap-3">
              <input 
                className="flex-1 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold text-right bg-white dark:bg-slate-900 focus:border-indigo-500" 
                placeholder="ابحث بالاسم أو السيريال..." 
                value={searchProduct} 
                onChange={e=>setSearchProduct(e.target.value)} 
              />
              <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-indigo-700">
                <Search size={18}/>
              </button>
            </form>

            {selectedProduct && (
              <div className="bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-indigo-800 rounded-2xl p-6 shadow-md space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-lg text-slate-800 dark:text-white">{selectedProduct.name}</h3>
                  <button onClick={() => setSelectedProduct(null)} className="text-slate-400 dark:text-slate-500 hover:text-rose-500">
                    <X size={18}/>
                  </button>
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-mono text-sm">{selectedProduct.serialNumber}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-xl font-bold text-sm">
                    المتاح في مخزنك: {selectedProduct.quantity}
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-xl font-bold text-sm">
                    السعر: {selectedProduct.price} ج
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الكمية المطلوبة</label>
                    <input 
                      type="number" 
                      min="1" 
                      max={selectedProduct.quantity}
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-center bg-white dark:bg-slate-900" 
                      value={reqQty} 
                      onChange={e=>setReqQty(Number(e.target.value))} 
                    />
                  </div>
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
                </div>

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
                  className="w-full bg-slate-900 dark:bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-black dark:hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
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
                    <th className="p-4">بواسطة</th>
                    <th className="p-4">ملاحظات</th>
                    <th className="p-4">سجل</th>
                    <th className="p-4 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {pendingRequests.length === 0 ? <tr><td colSpan="9" className="p-12 text-center text-slate-400">لا توجد طلبات معلقة</td></tr> :
                    pendingRequests.map(req => (
                      <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <td className="p-4 font-black text-indigo-700 dark:text-indigo-400">{warehouseMap[req.fromWarehouseId]}</td>
                        <td className="p-4 font-black text-indigo-700 dark:text-indigo-400">{warehouseMap[req.toWarehouseId]}</td>
                        <td className="p-4">
                          <p className="font-bold text-slate-800 dark:text-white mb-0.5">{req.itemName}</p>
                          <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{req.serialNumber}</p>
                        </td>
                        <td className="p-4 text-center font-black text-lg text-slate-700 dark:text-slate-300">{req.requestedQty}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${getPriorityColor(req.priority)}`}>
                            {req.priority === 'high' ? 'عالية' : req.priority === 'normal' ? 'عادية' : 'منخفضة'}
                          </span>
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
                            className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
                          >
                            عرض السجل
                          </button>
                        </td>
                        <td className="p-4 text-center">
                          {canApprove ? (
                            <div className="flex justify-center gap-2">
                              <button onClick={()=>handleApprove(req)} className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 p-2 rounded-xl hover:bg-emerald-500 dark:hover:bg-emerald-800 hover:text-white" title="موافقة">
                                <Check size={18}/>
                              </button>
                              {canReject && (
                                <button onClick={()=>setRejectingReq(req)} className="bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 p-2 rounded-xl hover:bg-rose-500 dark:hover:bg-rose-800 hover:text-white" title="رفض">
                                  <X size={18}/>
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-amber-100 dark:border-amber-800 flex items-center gap-1 w-max mx-auto">
                              <Loader2 size={12} className="animate-spin"/> بالانتظار
                            </span>
                          )}
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
                          <p className="font-bold text-slate-800 dark:text-white mb-0.5">{req.itemName}</p>
                          <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{req.serialNumber}</p>
                        </td>
                        <td className="p-4 text-center font-black text-slate-700 dark:text-slate-300">{req.requestedQty}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${getPriorityColor(req.priority)}`}>
                            {req.priority === 'high' ? 'عالية' : req.priority === 'normal' ? 'عادية' : 'منخفضة'}
                          </span>
                        </td>
                        <td className="p-4">
                          {req.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-lg text-[10px] font-bold">
                              <Check size={12}/> تمت الموافقة
                            </span>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-2 py-1 rounded-lg text-[10px] font-bold">
                                <X size={12}/> مرفوض
                              </span>
                              {req.rejectReason && <p className="text-[9px] text-rose-600 dark:text-rose-400 mt-1">{req.rejectReason}</p>}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <button 
                            onClick={() => viewTransferLog(req)}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
                          >
                            عرض السجل
                          </button>
                        </td>
                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                          <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5">{formatDate(req.processedAt)}</p>
                          <p className="text-[9px]">بواسطة: {req.processedBy}</p>
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

      {/* مودال سبب الرفض */}
      {rejectingReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-xl mb-4 text-slate-800 dark:text-white border-b pb-3 text-rose-600 flex items-center gap-2">
              <X size={20}/> سبب رفض التحويل
            </h3>
            <form onSubmit={submitReject}>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
                أنت تقوم برفض طلب ({rejectingReq.itemName}) لفرع ({warehouseMap[rejectingReq.toWarehouseId]})
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
