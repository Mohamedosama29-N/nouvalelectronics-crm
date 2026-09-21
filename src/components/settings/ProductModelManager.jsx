import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where, serverTimestamp, onSnapshot, limit
} from 'firebase/firestore';
import {
  Package,
  GitBranch,
  AlertCircle,
  Layers,
  Tag
} from 'lucide-react';
import { db } from '../../firebase/config';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { normalizeSearch, buildQueryTokens } from '../../utils/search';

export function ProductModelManager({}) {
  const [products, setProducts] = useState([]);
  const [models, setModels] = useState([]);
  const [mainFaults, setMainFaults] = useState([]);
  const [subFaults, setSubFaults] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedMainFaultId, setSelectedMainFaultId] = useState('');
  const [selectedSubFaultId, setSelectedSubFaultId] = useState('');
  
  const [newProduct, setNewProduct] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newMainFault, setNewMainFault] = useState({ code: '', description: '' });
  const [newSubFault, setNewSubFault] = useState({ code: '', description: '', productCode: '' });

  // 🆕 الخانة الخامسة: ربط كود منتج بكود العطل الفرعي المختار، مع معاينة
  // حية للصنف المطابق في المخزون قبل الحفظ (نفس منطق البحث المرن
  // المستخدم في التذاكر - بيجرب تطابق تام الأول، وبعدين بحث بالكلمات).
  const [productCodeInput, setProductCodeInput] = useState('');
  const [matchedItem, setMatchedItem] = useState(null);
  const [searchingMatch, setSearchingMatch] = useState(false);
  const [savingProductCode, setSavingProductCode] = useState(false);

  useEffect(() => {
    const current = subFaults.find(f => f.id === selectedSubFaultId);
    setProductCodeInput(current?.productCode || '');
    setMatchedItem(null);
  }, [selectedSubFaultId, subFaults]);

  const lookupProductCodeMatch = async (codeValue) => {
    if (!codeValue.trim()) {
      setMatchedItem(null);
      return;
    }
    setSearchingMatch(true);
    try {
      const exactSnap = await getDocs(query(
        collection(db, 'inventory'),
        where('serialNumber', '==', codeValue.trim()),
        where('isDeleted', '==', false),
        limit(1)
      ));
      let found = null;
      if (!exactSnap.empty) {
        found = { id: exactSnap.docs[0].id, ...exactSnap.docs[0].data() };
      } else {
        const term = normalizeSearch(codeValue);
        const tokens = buildQueryTokens(term);
        const candidatesSnap = await getDocs(query(
          collection(db, 'inventory'),
          where('isDeleted', '==', false),
          where('searchTokens', 'array-contains-any', tokens.length ? tokens : [term]),
          limit(10)
        ));
        const match = candidatesSnap.docs.find(d => {
          const data = d.data();
          return normalizeSearch(data.name || '').includes(term) || normalizeSearch(data.serialNumber || '').includes(term);
        }) || candidatesSnap.docs[0];
        if (match) found = { id: match.id, ...match.data() };
      }
      setMatchedItem(found);
    } catch {
      showError('فشل البحث في المخزون');
    }
    setSearchingMatch(false);
  };

  const saveProductCodeLink = async () => {
    if (!selectedSubFaultId) return;
    setSavingProductCode(true);
    try {
      await updateDoc(doc(db, 'subFaultCodes', selectedSubFaultId), { productCode: productCodeInput.trim() });
      showSuccess('تم حفظ كود المنتج بنجاح');
    } catch {
      showError('فشل حفظ كود المنتج');
    }
    setSavingProductCode(false);
  };

  // تحميل المنتجات
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const snap = await getDocs(collection(db, 'products'));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const addProduct = async () => {
    if (!newProduct.trim()) return;
    await addDoc(collection(db, 'products'), { name: newProduct.trim(), createdAt: serverTimestamp() });
    setNewProduct('');
    loadProducts();
  };

  const deleteProduct = async (id) => {
    // 🛠️ FIX: الحذف كان بيحصل فورًا من غير أي تأكيد، رغم إنه بيمسح
    // بشكل تسلسلي كل الموديلات وأكواد الأعطال المرتبطة بالمنتج ده.
    const confirmed = await showConfirm(
      'تأكيد حذف المنتج',
      'سيتم حذف هذا المنتج وكل الموديلات وأكواد الأعطال المرتبطة به نهائيًا. هل أنت متأكد؟'
    );
    if (!confirmed) return;

    // حذف جميع الموديلات المرتبطة بهذا المنتج
    const modelsSnap = await getDocs(query(collection(db, 'models'), where('productId', '==', id)));
    for (const modelDoc of modelsSnap.docs) {
      // حذف أكواد الأعطال الرئيسية والفرعية المرتبطة بكل موديل
      const mainFaultsSnap = await getDocs(query(collection(db, 'mainFaultCodes'), where('modelId', '==', modelDoc.id)));
      for (const mainFaultDoc of mainFaultsSnap.docs) {
        const subFaultsSnap = await getDocs(query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', mainFaultDoc.id)));
        for (const subFaultDoc of subFaultsSnap.docs) {
          await deleteDoc(doc(db, 'subFaultCodes', subFaultDoc.id));
        }
        await deleteDoc(doc(db, 'mainFaultCodes', mainFaultDoc.id));
      }
      await deleteDoc(doc(db, 'models', modelDoc.id));
    }
    await deleteDoc(doc(db, 'products', id));
    loadProducts();
    if (selectedProductId === id) {
      setSelectedProductId('');
      setSelectedModelId('');
      setSelectedMainFaultId('');
    }
  };

  // تحميل الموديلات عند اختيار منتج
  useEffect(() => {
    if (selectedProductId) {
      const q = query(collection(db, 'models'), where('productId', '==', selectedProductId));
      const unsub = onSnapshot(q, snap => setModels(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      return unsub;
    } else {
      setModels([]);
      setSelectedModelId('');
    }
  }, [selectedProductId]);

  const addModel = async () => {
    if (!selectedProductId || !newModel.trim()) return;
    await addDoc(collection(db, 'models'), { productId: selectedProductId, name: newModel.trim() });
    setNewModel('');
  };

  const deleteModel = async (modelId) => {
    const confirmed = await showConfirm(
      'تأكيد حذف الموديل',
      'سيتم حذف هذا الموديل وكل أكواد الأعطال المرتبطة به نهائيًا. هل أنت متأكد؟'
    );
    if (!confirmed) return;

    // حذف أكواد الأعطال الرئيسية والفرعية المرتبطة بهذا الموديل
    const mainFaultsSnap = await getDocs(query(collection(db, 'mainFaultCodes'), where('modelId', '==', modelId)));
    for (const mainFaultDoc of mainFaultsSnap.docs) {
      const subFaultsSnap = await getDocs(query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', mainFaultDoc.id)));
      for (const subFaultDoc of subFaultsSnap.docs) {
        await deleteDoc(doc(db, 'subFaultCodes', subFaultDoc.id));
      }
      await deleteDoc(doc(db, 'mainFaultCodes', mainFaultDoc.id));
    }
    await deleteDoc(doc(db, 'models', modelId));
  };

  // تحميل أكواد الأعطال الرئيسية عند اختيار موديل
  useEffect(() => {
    if (selectedModelId) {
      const q = query(collection(db, 'mainFaultCodes'), where('modelId', '==', selectedModelId));
      const unsub = onSnapshot(q, snap => setMainFaults(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      return unsub;
    } else {
      setMainFaults([]);
      setSelectedMainFaultId('');
    }
  }, [selectedModelId]);

  const addMainFault = async () => {
    if (!selectedModelId || !newMainFault.code.trim() || !newMainFault.description.trim()) return;
    await addDoc(collection(db, 'mainFaultCodes'), {
      modelId: selectedModelId,
      code: newMainFault.code.trim(),
      description: newMainFault.description.trim()
    });
    setNewMainFault({ code: '', description: '' });
  };

  const deleteMainFault = async (mainFaultId) => {
    const confirmed = await showConfirm(
      'تأكيد الحذف',
      'سيتم حذف كود العطل الرئيسي وكل الأكواد الفرعية المرتبطة به. هل أنت متأكد؟'
    );
    if (!confirmed) return;

    // حذف أكواد الأعطال الفرعية المرتبطة
    const subFaultsSnap = await getDocs(query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', mainFaultId)));
    for (const subFaultDoc of subFaultsSnap.docs) {
      await deleteDoc(doc(db, 'subFaultCodes', subFaultDoc.id));
    }
    await deleteDoc(doc(db, 'mainFaultCodes', mainFaultId));
  };

  // تحميل أكواد الأعطال الفرعية عند اختيار كود رئيسي
  useEffect(() => {
    setSelectedSubFaultId('');
    if (selectedMainFaultId) {
      const q = query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', selectedMainFaultId));
      const unsub = onSnapshot(q, snap => setSubFaults(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      return unsub;
    } else {
      setSubFaults([]);
    }
  }, [selectedMainFaultId]);

  const addSubFault = async () => {
    if (!selectedMainFaultId || !newSubFault.code.trim() || !newSubFault.description.trim()) return;
    await addDoc(collection(db, 'subFaultCodes'), {
      mainFaultId: selectedMainFaultId,
      code: newSubFault.code.trim(),
      description: newSubFault.description.trim(),
      productCode: newSubFault.productCode.trim()
    });
    setNewSubFault({ code: '', description: '', productCode: '' });
  };

  const deleteSubFault = async (subFaultId) => {
    const confirmed = await showConfirm('تأكيد الحذف', 'هل أنت متأكد من حذف كود العطل الفرعي هذا؟');
    if (!confirmed) return;
    await deleteDoc(doc(db, 'subFaultCodes', subFaultId));
  };

  const getProductName = (productId) => {
    return products.find(p => p.id === productId)?.name || '';
  };

  const getModelName = (modelId) => {
    return models.find(m => m.id === modelId)?.name || '';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* قسم المنتجات */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border">
        <h3 className="font-bold text-teal-600 mb-4 flex items-center gap-2">
          <Package size={18}/> المنتجات
        </h3>
        <div className="flex gap-2 mb-4">
          <input className="flex-1 border p-3 rounded-xl" placeholder="اسم المنتج" value={newProduct} onChange={e => setNewProduct(e.target.value)} />
          <button onClick={addProduct} className="bg-teal-600 text-white px-6 py-3 rounded-xl font-bold">إضافة</button>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {products.map(p => (
            <div key={p.id} className={`flex justify-between items-center p-3 rounded-xl cursor-pointer ${selectedProductId === p.id ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-500 border' : 'hover:bg-slate-50'}`}>
              <button onClick={() => setSelectedProductId(p.id)} className="font-bold flex-1 text-right">{p.name}</button>
              <button onClick={() => deleteProduct(p.id)} className="text-rose-500 p-2">🗑️</button>
            </div>
          ))}
        </div>
      </div>

      {/* قسم الموديلات */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border">
        <h3 className="font-bold text-teal-600 mb-4 flex items-center gap-2">
          <Layers size={18}/> الموديلات {selectedProductId && `لـ ${getProductName(selectedProductId)}`}
        </h3>
        {!selectedProductId ? (
          <p className="text-center text-slate-400 py-8 text-sm">اختر منتجاً أولاً</p>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <input className="flex-1 border p-3 rounded-xl" placeholder="اسم الموديل" value={newModel} onChange={e => setNewModel(e.target.value)} />
              <button onClick={addModel} className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold">إضافة</button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {models.map(m => (
                <div key={m.id} className={`flex justify-between items-center p-3 rounded-xl cursor-pointer ${selectedModelId === m.id ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500 border' : 'hover:bg-slate-50'}`}>
                  <button onClick={() => setSelectedModelId(m.id)} className="font-bold flex-1 text-right">{m.name}</button>
                  <button onClick={() => deleteModel(m.id)} className="text-rose-500 p-2">🗑️</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* قسم أكواد الأعطال الرئيسية */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border">
        <h3 className="font-bold text-teal-600 mb-4 flex items-center gap-2">
          <AlertCircle size={18}/> أكواد الأعطال الرئيسية {selectedModelId && `لـ ${getModelName(selectedModelId)}`}
        </h3>
        {!selectedModelId ? (
          <p className="text-center text-slate-400 py-8 text-sm">اختر موديلاً أولاً</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <input className="border p-3 rounded-xl" placeholder="الكود (مثال: ERR-001)" value={newMainFault.code} onChange={e => setNewMainFault({...newMainFault, code: e.target.value})} />
              <input className="border p-3 rounded-xl" placeholder="الوصف" value={newMainFault.description} onChange={e => setNewMainFault({...newMainFault, description: e.target.value})} />
            </div>
            <button onClick={addMainFault} className="w-full mb-4 bg-amber-600 text-white py-3 rounded-xl font-bold">إضافة كود رئيسي</button>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {mainFaults.map(f => (
                <div key={f.id} className={`flex justify-between items-center p-3 rounded-xl cursor-pointer ${selectedMainFaultId === f.id ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-500 border' : 'hover:bg-slate-50'}`}>
                  <button onClick={() => setSelectedMainFaultId(f.id)} className="flex-1 text-right">
                    <span className="font-mono font-bold">{f.code}</span> – {f.description}
                  </button>
                  <button onClick={() => deleteMainFault(f.id)} className="text-rose-500 p-2">🗑️</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* قسم أكواد الأعطال الفرعية */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border">
        <h3 className="font-bold text-teal-600 mb-4 flex items-center gap-2">
          <GitBranch size={18}/> أكواد الأعطال الفرعية
        </h3>
        {!selectedMainFaultId ? (
          <p className="text-center text-slate-400 py-8 text-sm">اختر كود عطل رئيسياً أولاً</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
              <input className="border p-3 rounded-xl" placeholder="الكود الفرعي" value={newSubFault.code} onChange={e => setNewSubFault({...newSubFault, code: e.target.value})} />
              <input className="border p-3 rounded-xl" placeholder="الوصف" value={newSubFault.description} onChange={e => setNewSubFault({...newSubFault, description: e.target.value})} />
              <input className="border p-3 rounded-xl" placeholder="كود المنتج (اختياري)" value={newSubFault.productCode} onChange={e => setNewSubFault({...newSubFault, productCode: e.target.value})} />
            </div>
            <button onClick={addSubFault} className="w-full mb-4 bg-purple-600 text-white py-3 rounded-xl font-bold">إضافة كود فرعي</button>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {subFaults.map(f => (
                <div key={f.id} className={`flex flex-wrap justify-between items-center gap-2 p-3 rounded-xl cursor-pointer ${selectedSubFaultId === f.id ? 'bg-rose-50 dark:bg-rose-900/30 border-rose-500 border' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  <button onClick={() => setSelectedSubFaultId(f.id)} className="flex-1 text-right min-w-[140px]">
                    <span className="font-mono font-bold">{f.code}</span> – {f.description}
                    {f.productCode && (
                      <span className="block text-[10px] text-rose-500 dark:text-rose-400 font-mono mt-0.5">كود المنتج: {f.productCode}</span>
                    )}
                  </button>
                  <button onClick={() => deleteSubFault(f.id)} className="text-rose-500 p-2">🗑️</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 🆕 الخانة الخامسة: كود المنتج - ربط كود العطل الفرعي المختار
          بصنف حقيقي في المخزون، مع معاينة حية قبل الحفظ */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border lg:col-span-2">
        <h3 className="font-bold text-rose-600 mb-4 flex items-center gap-2">
          <Tag size={18}/> كود المنتج
        </h3>
        {!selectedSubFaultId ? (
          <p className="text-center text-slate-400 py-8 text-sm">اختر كود عطل فرعياً أولاً</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                className="flex-1 border p-3 rounded-xl font-mono"
                placeholder="كود المنتج (سيريال أو وصف قريب من صنف في المخزون)"
                value={productCodeInput}
                onChange={e => { setProductCodeInput(e.target.value); setMatchedItem(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupProductCodeMatch(productCodeInput); } }}
              />
              <button
                onClick={() => lookupProductCodeMatch(productCodeInput)}
                disabled={searchingMatch}
                className="bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-4 rounded-xl font-bold text-sm"
              >
                {searchingMatch ? '...جاري البحث' : 'معاينة'}
              </button>
              <button
                onClick={saveProductCodeLink}
                disabled={savingProductCode}
                className="bg-rose-600 text-white px-5 rounded-xl font-bold text-sm disabled:opacity-50"
              >
                حفظ
              </button>
            </div>

            {matchedItem && (
              <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-sm flex items-center justify-between">
                <div>
                  <span className="font-bold">{matchedItem.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono block">{matchedItem.serialNumber}</span>
                </div>
                <span className="text-emerald-700 dark:text-emerald-300 font-bold">{matchedItem.price} ج - متاح: {matchedItem.quantity}</span>
              </div>
            )}
            {matchedItem === null && productCodeInput && !searchingMatch && (
              <p className="text-xs text-slate-400">دوس "معاينة" للتأكد إن الكود ده بيطابق صنف موجود في المخزون فعليًا</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// 🔁 دمج العملاء المكررين - Duplicate Customers Manager
// (ميزة جديدة: تكتشف العملاء اللي عندهم نفس رقم الهاتف بعد التوحيد
// وتسمح بدمجهم في سجل واحد بدل التكرار)
// ==========================================================================
