import * as React from 'react';
const { useState, useEffect, useMemo, useRef, useCallback } = React;

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, 
  query, where, serverTimestamp, orderBy, onSnapshot, setDoc, increment, 
  limit, runTransaction, writeBatch, startAfter, Timestamp
} from 'firebase/firestore';
import { 
  LayoutDashboard, Package, Users, Receipt, ArrowRightLeft, LogOut, 
  AlertTriangle, Download, Plus, Search, Settings, Edit, Store, 
  Trash2, User, Save, Printer, Contact, History, 
  Lock, FileSpreadsheet, Calculator, AlertOctagon, MapPin, 
  Phone, Loader2, Menu, UserCog, Wrench, Wallet, Mail, 
  CheckCircle2, Calendar, X, LogIn, Shield, Image as ImageIcon, Percent,
  ChevronDown, Database, UploadCloud, DownloadCloud, Check, Activity, Eye
} from 'lucide-react';

/* ==========================================================================
   🔥 1. FIREBASE CONFIGURATION & CORE SETUP
   ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyBrRvCAWdC_SOjBqSFPXyav-3ifE80UoLU",
  authDomain: "nouval-system.firebaseapp.com",
  projectId: "nouval-system",
  storageBucket: "nouval-system.firebasestorage.app",
  messagingSenderId: "194279959532",
  appId: "1:194279959532:web:578f5894f58102d4872ec9"
};

const appId = 'nouval-erp-master-final';
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const getCollRef = (collName) => collection(db, 'artifacts', appId, 'public', 'data', collName);
const getDocRef = (collName, docId) => doc(db, 'artifacts', appId, 'public', 'data', collName, docId);

const ALL_PERMISSIONS = [
  { key: 'viewDashboard', label: 'لوحة التحكم والمؤشرات' },
  { key: 'viewInventory', label: 'إدارة المخزون والأصناف' },
  { key: 'viewPOS', label: 'نقطة البيع وإصدار الفواتير' },
  { key: 'viewReports', label: 'التقارير وسجل المبيعات' },
  { key: 'viewCustomers', label: 'سجل بيانات العملاء' },
  { key: 'viewAllWarehouses', label: 'صلاحية رؤية كافة الفروع (إدارة عليا)' },
  { key: 'manageSettings', label: 'إدارة الإعدادات المركزية' }
];

/* ==========================================================================
   🛠️ 2. UTILITIES & LOGGING
   ========================================================================== */
const normalizeSearch = (str) => String(str || '').toLowerCase().trim().replace(/\s+/g, ' ');
const normalizeSerial = (str) => String(str || '').trim().toUpperCase();

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const exportToCSV = (data, filename) => {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = ["\ufeff" + headers.join(','), ...data.map(row => headers.map(f => JSON.stringify(row[f] ?? '')).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
};

const formatDate = (dateObj) => {
  if (!dateObj) return '-';
  const d = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
  return d.toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const reviveTimestamps = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj.seconds !== undefined && obj.nanoseconds !== undefined && Object.keys(obj).length === 2) {
        return new Timestamp(obj.seconds, obj.nanoseconds);
    }
    if (Array.isArray(obj)) {
        return obj.map(reviveTimestamps);
    }
    const newObj = {};
    for (const key in obj) {
        newObj[key] = reviveTimestamps(obj[key]);
    }
    return newObj;
};

const logUserActivity = (user, action, details) => {
    if (!user) return;
    addDoc(getCollRef('activity_logs'), {
        userId: user.id,
        userName: user.name || user.email,
        action: action,
        details: details,
        timestamp: serverTimestamp()
    }).catch(err => console.error("Activity Log Error:", err));
};

/* ==========================================================================
   🔐 3. AUTHENTICATION & LOGIN
   ========================================================================== */
function LoginScreen({ fbReady, onLoginSuccess, systemSettings, notify }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!fbReady) return notify("يرجى الانتظار حتى يتم الاتصال بالخادم...", "warn");
    if (!email || !pass) return notify("الرجاء إدخال البريد الإلكتروني وكلمة المرور", "warn");
    
    setLoading(true);
    try {
      const q = query(getCollRef('employees'), where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        const allUsers = await getDocs(getCollRef('employees'));
        if (allUsers.empty) {
          const newAdmin = {
            email: email.trim().toLowerCase(),
            pass: pass,
            name: 'مدير النظام',
            role: 'admin',
            assignedWarehouseId: 'main',
            permissions: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {}),
            createdAt: serverTimestamp()
          };
          const docRef = await addDoc(getCollRef('employees'), newAdmin);
          onLoginSuccess({ id: docRef.id, ...newAdmin, permissions: newAdmin.permissions });
          notify("مرحباً! تم تفعيل حسابك كمدير للنظام بنجاح.", "success");
        } else {
          notify("هذا البريد الإلكتروني غير مسجل في النظام.", "error");
        }
      } else {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        if (userData.isDisabled) {
           notify("عذراً، هذا الحساب موقوف من قبل الإدارة.", "error");
        } else if (userData.pass === pass) {
           onLoginSuccess({ id: userDoc.id, ...userData, permissions: userData.permissions || {} });
           notify(`أهلاً بك مجدداً يا ${userData.name}`, "success");
           logUserActivity({ id: userDoc.id, ...userData }, 'تسجيل دخول', 'قام بتسجيل الدخول إلى النظام');
        } else {
           notify("كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.", "error");
        }
      }
    } catch (err) {
      console.error(err);
      notify("فشل الاتصال بقاعدة البيانات. تأكد من جودة الإنترنت.", "error");
    }
    setLoading(false);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[#0f172a] p-4 text-right" dir="rtl">
      <div className="bg-white p-10 rounded-[2rem] w-full max-w-md shadow-2xl relative border-t-[6px] border-indigo-600 animate-in fade-in zoom-in-95">
        <div className="flex justify-center mb-6">
           <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
             <Package size={40}/>
           </div>
        </div>
        <h1 className="text-2xl font-black text-center text-slate-800 mb-1">{systemSettings?.systemName || 'نوڤال ERP'}</h1>
        <p className="text-center text-slate-500 text-[10px] mb-8 font-bold uppercase tracking-widest">Enterprise Management Portal</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative font-bold">
            <Mail className="absolute right-4 top-3.5 text-slate-400" size={18}/>
            <input className="w-full border-2 border-slate-100 pr-12 p-3 rounded-xl focus:border-indigo-500 outline-none text-right bg-slate-50 font-bold text-slate-700 text-sm transition-all" placeholder="البريد الإلكتروني للموظف" value={email} onChange={e=>setEmail(e.target.value)} type="email" required dir="ltr"/>
          </div>
          <div className="relative font-bold">
            <Lock className="absolute right-4 top-3.5 text-slate-400" size={18}/>
            <input className="w-full border-2 border-slate-100 pr-12 p-3 rounded-xl focus:border-indigo-500 outline-none text-right bg-slate-50 font-bold text-slate-700 text-sm transition-all" type="password" placeholder="كلمة المرور" value={pass} onChange={e=>setPass(e.target.value)} required dir="ltr"/>
          </div>
          <button disabled={loading || !fbReady} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 flex justify-center items-center gap-2 mt-6 text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed">
             {loading || !fbReady ? <Loader2 className="animate-spin" size={20}/> : <><LogIn size={20}/> تسجيل الدخول بأمان</>}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ==========================================================================
   🧾 4. INVOICE PRINTING
   ========================================================================== */
function InvoiceRenderer({ data, systemSettings, onBack }) {
  useEffect(() => { setTimeout(() => window.print(), 800); }, []);
  return (
    <div className="flex justify-center p-6 bg-slate-100 min-h-full" dir="rtl">
       <div className="bg-white w-[80mm] p-6 text-black border shadow-lg print:shadow-none print:border-none print:m-0 animate-in zoom-in-95">
          <div className="text-center border-b border-black border-dashed pb-4 mb-4">
             {systemSettings.invoiceLogo && (
                <img src={systemSettings.invoiceLogo} alt="Logo" className="max-h-16 mx-auto mb-2" crossOrigin="anonymous" />
             )}
             <h1 className="text-xl font-black">{systemSettings.storeName}</h1>
             <p className="text-[11px] font-bold mt-1">فاتورة مبيعات #{data.invoiceNumber}</p>
             <p className="text-[10px] mt-1 text-gray-600">{new Date(data.date).toLocaleString('ar-EG')}</p>
          </div>
          <div className="text-[11px] mb-4 space-y-1.5 font-bold text-right">
             <div className="flex justify-between"><span>العميل:</span><span>{data.customerName}</span></div>
             <div className="flex justify-between"><span>الهاتف:</span><span dir="ltr">{data.phone || '-'}</span></div>
             {data.technicianName && <div className="flex justify-between"><span>الفني المختص:</span><span>{data.technicianName}</span></div>}
             <div className="flex justify-between text-gray-600"><span>الكاشير:</span><span>{data.operator}</span></div>
          </div>
          
          <table className="w-full text-[11px] border-y border-black border-dashed py-2 mb-4 text-right">
             <thead>
                <tr className="font-bold border-b border-gray-300">
                   <th className="pb-2">الصنف</th>
                   <th className="pb-2 text-center">كمية</th>
                   {systemSettings.invoiceDisplayMode !== 'total_only' && <th className="pb-2 text-left">السعر</th>}
                </tr>
             </thead>
             <tbody>
                {data.items && data.items.length > 0 ? (
                   data.items.map((item, idx) => (
                      <tr key={idx}>
                         <td className="py-2 text-right font-bold">{item.name}<br/><span className="text-[9px] font-mono text-gray-500 mt-0.5 block">{item.serialNumber}</span></td>
                         <td className="text-center py-2 font-bold">1</td>
                         {systemSettings.invoiceDisplayMode !== 'total_only' && <td className="text-left py-2 font-black">{item.price}</td>}
                      </tr>
                   ))
                ) : (
                   <tr>
                      <td className="py-2 text-right font-bold">{data.itemName}<br/><span className="text-[9px] font-mono text-gray-500 mt-0.5 block">{data.serialNumber}</span></td>
                      <td className="text-center py-2 font-bold">1</td>
                      {systemSettings.invoiceDisplayMode !== 'total_only' && <td className="text-left py-2 font-black">{data.subtotal}</td>}
                   </tr>
                )}
             </tbody>
          </table>

          <div className="text-[11px] space-y-1.5 font-bold border-b border-black border-dashed pb-4 mb-4 text-right">
             {systemSettings.invoiceDisplayMode !== 'total_only' && (
                <div className="flex justify-between"><span>المجموع الفرعي:</span><span>{data.subtotal}</span></div>
             )}
             {data.discountAmount > 0 && <div className="flex justify-between text-black"><span>الخصم:</span><span>- {data.discountAmount.toFixed(1)}</span></div>}
             {data.taxAmount > 0 && <div className="flex justify-between"><span>الضريبة ({systemSettings.taxRate || 14}%):</span><span>+ {data.taxAmount.toFixed(1)}</span></div>}
             {data.installAmount > 0 && <div className="flex justify-between"><span>رسوم إضافية:</span><span>+ {data.installAmount}</span></div>}
             <div className="flex justify-between border-t border-black pt-2 mt-2 text-[14px] font-black uppercase">
                <span>الصافي المطلوب:</span><span>{data.finalTotal} ج.م</span>
             </div>
          </div>
          <div className="text-center text-[9px] font-bold italic text-gray-700 leading-relaxed">
             <p>{systemSettings.footerText}</p>
          </div>
          <div className="mt-8 flex gap-2 print:hidden">
             <button onClick={() => window.print()} className="flex-1 bg-black text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm"><Printer size={16}/> طباعة</button>
             <button onClick={onBack} className="flex-1 bg-slate-200 text-slate-800 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm"><ArrowRightLeft size={16}/> إغلاق</button>
          </div>
       </div>
    </div>
  );
}

/* ==========================================================================
   📦 5. DASHBOARD VIEW
   ========================================================================== */
function DashboardView({ appUser }) {
  const [stats, setStats] = useState({ totalItems: 0, totalValue: 0, lowStockCount: 0, salesToday: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if(!appUser) return;
    let isMounted = true;

    const fetchDashboardStats = async () => {
       setLoading(true);
       try {
           const invSnap = await getDocs(getCollRef('inventory'));
           let totalQty = 0;
           let totalVal = 0;
           let lowStock = 0;

           invSnap.docs.forEach(doc => {
             const data = doc.data();
             if (!data.isDeleted) {
                if (appUser.permissions?.viewAllWarehouses || data.warehouseId === (appUser.assignedWarehouseId || 'main')) {
                   const qty = Number(data.quantity) || 0;
                   const price = Number(data.price) || 0;
                   totalQty += qty;
                   totalVal += qty * price;
                   if (qty <= (Number(data.minStock) || 2)) lowStock++;
                }
             }
           });

           const today = new Date(); 
           today.setHours(0,0,0,0);
           const salesSnap = await getDocs(query(
             getCollRef('transactions'), 
             where('timestamp', '>=', today)
           ));
           
           let salesToday = 0;
           salesSnap.docs.forEach(doc => {
              const data = doc.data();
              if (data.type === 'sell') {
                 if (appUser.permissions?.viewAllWarehouses || data.warehouseId === (appUser.assignedWarehouseId || 'main')) {
                    salesToday += Number(data.finalTotal || data.total || 0);
                 }
              }
           });

           if (isMounted) {
               setStats({
                  totalItems: totalQty,
                  totalValue: totalVal,
                  lowStockCount: lowStock,
                  salesToday: salesToday
               });
           }
       } catch(e) {
           console.error("Dashboard Stats Fetch Error:", e);
       }
       if (isMounted) setLoading(false);
    };

    fetchDashboardStats();
    return () => { isMounted = false; };
  }, [appUser]); 

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-right">
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
         <h2 className="text-xl font-black text-slate-800">لوحة المؤشرات {loading && <Loader2 className="inline animate-spin text-indigo-500 mr-2" size={18}/>}</h2>
         <div className="bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2">
            <Calendar size={14}/> {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
         </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10" />}
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Package size={22}/></div>
          <div><p className="text-[10px] font-bold text-slate-400 mb-1">إجمالي القطع بالمخزن</p><p className="text-xl font-black text-slate-800">{stats.totalItems.toLocaleString()}</p></div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10" />}
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Wallet size={22}/></div>
          <div><p className="text-[10px] font-bold text-slate-400 mb-1">قيمة المخزون الإجمالية</p><p className="text-xl font-black text-slate-800">{stats.totalValue.toLocaleString()} ج</p></div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10" />}
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Receipt size={22}/></div>
          <div><p className="text-[10px] font-bold text-slate-400 mb-1">مبيعات اليوم</p><p className="text-xl font-black text-slate-800">{stats.salesToday.toLocaleString()} ج</p></div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10" />}
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl"><AlertOctagon size={22}/></div>
          <div><p className="text-[10px] font-bold text-slate-400 mb-1">نواقص تحتاج طلب</p><p className="text-xl font-black text-slate-800">{stats.lowStockCount.toLocaleString()}</p></div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   📦 6. INVENTORY MANAGER
   ========================================================================== */
function InventoryManager({ appUser, warehouses, notify, setGlobalLoading, warehouseMap }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 700);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState({ 
    serialNumber: '', 
    name: '', 
    quantity: 1, 
    price: 0, 
    minStock: 2, 
    warehouseId: appUser?.assignedWarehouseId || 'main' 
  });
  const fileInputRef = useRef(null);
  
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkPercent, setBulkPercent] = useState(0);

  const loadItems = useCallback(async (isNextPage = false) => {
    if (!appUser) return;
    setLoadingData(true);
    try {
      let q = getCollRef('inventory');
      const term = normalizeSearch(debouncedSearch);

      if (term) {
         q = query(q, 
            where('searchKey', '>=', term), 
            where('searchKey', '<=', term + '\uf8ff'),
            orderBy('searchKey')
         );
      } else {
         q = query(q, orderBy('createdAt', 'desc'));
      }

      if (isNextPage && lastDoc) {
         q = query(q, startAfter(lastDoc));
      }

      q = query(q, limit(30));
      const snap = await getDocs(q);
      
      let fetched = snap.docs.map(d => ({id: d.id, ...d.data()}));

      fetched = fetched.filter(i => !i.isDeleted);
      if (!appUser.permissions?.viewAllWarehouses) {
         fetched = fetched.filter(i => i.warehouseId === (appUser.assignedWarehouseId || 'main'));
      }

      if (isNextPage) {
         setItems(prev => [...prev, ...fetched]);
      } else {
         setItems(fetched);
      }

      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 30);
    } catch (e) { 
      console.error(e);
      if (e.message.includes('index')) {
         notify("يرجى مراجعة إعدادات فهارس قاعدة البيانات (Indexes)", "warn");
      } else {
         notify("خطأ في جلب البيانات", "error"); 
      }
    }
    setLoadingData(false);
  }, [debouncedSearch, appUser, lastDoc, notify]);

  useEffect(() => { 
    setLastDoc(null);
    loadItems(false); 
  }, [debouncedSearch, appUser, loadItems]); 

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newItem.serialNumber || !newItem.name) return notify("البيانات غير مكتملة", "warn");
    setGlobalLoading(true);
    const serial = normalizeSerial(newItem.serialNumber);
    const priceNum = Number(newItem.price) || 0;
    const qtyNum = Number(newItem.quantity) || 1;

    try {
      await runTransaction(db, async (t) => {
        const regRef = getDocRef('serial_registry', serial);
        const regSnap = await t.get(regRef);
        if (regSnap.exists()) throw new Error("السيريال مسجل بالفعل لمنتج آخر!");
        
        const warehouseToUse = appUser.permissions?.viewAllWarehouses ? newItem.warehouseId : (appUser.assignedWarehouseId || 'main');
        const docData = { 
          serialNumber: serial, 
          name: newItem.name,
          price: priceNum,
          quantity: qtyNum,
          minStock: Number(newItem.minStock) || 2,
          warehouseId: warehouseToUse,
          searchKey: normalizeSearch(`${newItem.name} ${serial}`), 
          createdAt: serverTimestamp(), 
          isDeleted: false
        };
        t.set(doc(getCollRef('inventory')), docData);
        t.set(regRef, { exists: true, usedAt: serverTimestamp() });
      });
      
      logUserActivity(appUser, 'إضافة صنف', `إضافة ${qtyNum} قطعة من ${newItem.name} (S/N: ${serial})`);
      notify("تم إضافة الصنف بنجاح", "success"); 
      setLastDoc(null);
      loadItems(false); 
      setNewItem({ 
        serialNumber: '', 
        name: '', 
        quantity: 1, 
        price: 0, 
        minStock: 2, 
        warehouseId: appUser?.assignedWarehouseId || 'main' 
      });
    } catch(err) { 
      notify(err.message || "فشل الإضافة", "error"); 
    }
    setGlobalLoading(false);
  };

  const handleEdit = async () => {
    if (!editingItem) return;
    setGlobalLoading(true);
    const priceNum = Number(editingItem.price) || 0;
    const qtyNum = Number(editingItem.quantity) || 0;

    try {
      const { id, ...dataToUpdate } = editingItem;
      await updateDoc(getDocRef('inventory', id), { 
        name: dataToUpdate.name, 
        quantity: qtyNum, 
        price: priceNum,
        minStock: Number(dataToUpdate.minStock),
        searchKey: normalizeSearch(`${dataToUpdate.name} ${dataToUpdate.serialNumber}`)
      });
      
      logUserActivity(appUser, 'تعديل صنف', `تعديل بيانات ${dataToUpdate.name} (S/N: ${dataToUpdate.serialNumber})`);
      setEditingItem(null);
      setItems(prev => prev.map(i => 
        i.id === id ? {
          ...i, 
          name: dataToUpdate.name, 
          quantity: qtyNum, 
          price: priceNum, 
          minStock: dataToUpdate.minStock
        } : i
      ));
      notify("تم تعديل الصنف بنجاح", "success");
    } catch (error) {
      notify("فشل تعديل الصنف", "error");
    }
    setGlobalLoading(false);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`تأكيد حذف ${item.name}؟`)) return;
    setGlobalLoading(true);
    try {
      await updateDoc(getDocRef('inventory', item.id), { isDeleted: true, quantity: 0 });
      logUserActivity(appUser, 'حذف صنف', `تم حذف صنف: ${item.name} (S/N: ${item.serialNumber})`);
      setItems(prev => prev.filter(i => i.id !== item.id));
      notify("تم حذف الصنف", "success");
    } catch (error) {
      notify("فشل حذف الصنف", "error");
    }
    setGlobalLoading(false);
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setGlobalLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split('\n').map(r => r.split(',').map(c => c ? c.trim() : ''));
        const batch = writeBatch(db);
        let count = 0;
        
        for (let i = 1; i < Math.min(rows.length, 300); i++) {
          const [serial, name, qty, price] = rows[i];
          if (serial && name) {
            const normS = normalizeSerial(serial);
            const priceNum = Number(price) || 0;
            const qtyNum = Number(qty) || 1;
            const newRef = doc(getCollRef('inventory'));
            batch.set(newRef, { 
               serialNumber: normS, 
               name, 
               quantity: qtyNum, 
               price: priceNum, 
               minStock: 2,
               warehouseId: appUser.assignedWarehouseId || 'main', 
               searchKey: normalizeSearch(`${name} ${normS}`), 
               createdAt: serverTimestamp(), 
               isDeleted: false 
            });
            const regRef = getDocRef('serial_registry', normS);
            batch.set(regRef, { exists: true, imported: true }, { merge: true });
            count++;
          }
        }
        if(count > 0) {
            await batch.commit();
            logUserActivity(appUser, 'استيراد أصناف', `استيراد ${count} صنف من ملف CSV`);
            notify(`تم استيراد ${count} صنف بنجاح`, "success");
            setLastDoc(null);
            loadItems(false);
        } else {
            notify("ملف الإكسيل فارغ أو التنسيق غير صحيح", "warn");
        }
      } catch (err) { 
        console.error(err);
        notify("خطأ أثناء معالجة ملف الإكسيل", "error"); 
      }
      setGlobalLoading(false);
      e.target.value = null; 
    };
    reader.readAsText(file);
  };

  const handleBulkUpdate = async () => {
     if (!bulkPercent || bulkPercent === 0) return;
     if (!window.confirm(`هل أنت متأكد من تعديل جميع أسعار الأصناف بنسبة ${bulkPercent}%؟`)) return;
     
     setGlobalLoading(true);
     try {
        const q = query(getCollRef('inventory'), where('isDeleted', '==', false));
        const snap = await getDocs(q);
        
        const chunks = [];
        for (let i = 0; i < snap.docs.length; i += 500) {
           chunks.push(snap.docs.slice(i, i + 500));
        }

        for (const chunk of chunks) {
           const batch = writeBatch(db);
           chunk.forEach(d => {
              const currentPrice = Number(d.data().price) || 0;
              const adjustment = currentPrice * (Number(bulkPercent) / 100);
              const newPrice = Math.max(0, Math.round(currentPrice + adjustment)); 
              batch.update(d.ref, { price: newPrice });
           });
           await batch.commit();
        }
        
        logUserActivity(appUser, 'تعديل أسعار مجمع', `تعديل جميع الأسعار بنسبة ${bulkPercent}%`);
        notify("تم تحديث أسعار جميع الأصناف بنجاح", "success");
        setShowBulkUpdate(false);
        setBulkPercent(0);
        setLastDoc(null);
        loadItems(false);
     } catch(e) {
        console.error(e);
        notify("حدث خطأ أثناء تحديث الأسعار", "error");
     }
     setGlobalLoading(false);
  };

  return (
    <div className="space-y-6 text-right animate-in fade-in" dir="rtl">
       {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 border-b pb-3">تعديل بيانات الصنف</h3>
            <div className="space-y-4">
              <label className="block text-right">
                  <span className="text-xs font-bold text-slate-500 mb-1 block">اسم المنتج</span>
                  <input className="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-slate-50 text-sm" value={editingItem.name} onChange={e=>setEditingItem({...editingItem, name:e.target.value})} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 mb-1 block">الكمية</span>
                   <input type="number" min="0" className="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-slate-50 text-center text-sm" value={editingItem.quantity} onChange={e=>setEditingItem({...editingItem, quantity: e.target.value})} />
                </label>
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 mb-1 block">السعر</span>
                   <input type="number" min="0" className="w-full border border-slate-200 p-2.5 rounded-lg font-black outline-none focus:border-indigo-500 bg-slate-50 text-center text-indigo-700 text-sm" value={editingItem.price} onChange={e=>setEditingItem({...editingItem, price: e.target.value})} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 mb-1 block">حد الطلب</span>
                   <input type="number" min="0" className="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-slate-50 text-center text-sm" value={editingItem.minStock} onChange={e=>setEditingItem({...editingItem, minStock: e.target.value})} />
                </label>
              </div>
              <div className="flex gap-2 pt-4">
                <button onClick={handleEdit} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-sm">حفظ التعديل</button>
                <button onClick={()=>setEditingItem(null)} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-200">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

       {showBulkUpdate && appUser.role === 'admin' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-slate-800 flex items-center gap-2"><Percent className="text-indigo-600"/> تحديث الأسعار الشامل</h3>
            <p className="text-xs text-slate-500 mb-6 font-bold">أدخل النسبة المئوية (استخدم علامة - للخصم)</p>
            <div className="space-y-4">
               <div className="relative">
                  <input 
                    type="number" 
                    className="w-full border border-slate-200 p-3 pl-10 rounded-xl font-black outline-none focus:border-indigo-500 text-center text-lg bg-slate-50" 
                    value={bulkPercent} 
                    onChange={e=>setBulkPercent(e.target.value)} 
                    placeholder="مثال: 10 أو -5" 
                    dir="ltr" 
                  />
                  <span className="absolute left-4 top-3.5 text-slate-400 font-black">%</span>
               </div>
               <div className="flex gap-2 pt-2">
                 <button onClick={handleBulkUpdate} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-black shadow-sm transition-colors">تطبيق على الكل</button>
                 <button onClick={()=>setShowBulkUpdate(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">إلغاء</button>
               </div>
            </div>
          </div>
        </div>
       )}

       <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-50 pb-4">
             <h3 className="font-black text-lg flex items-center gap-2 text-slate-800"><Package size={22} className="text-indigo-600"/> إضافة أصناف</h3>
             <div className="flex flex-wrap gap-2 w-full md:w-auto">
                {appUser.role === 'admin' && (
                   <button 
                     onClick={()=>setShowBulkUpdate(true)} 
                     className="flex-1 md:flex-none bg-rose-50 text-rose-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-100 flex items-center justify-center gap-2"
                   >
                     <Percent size={14}/> تعديل الأسعار مجمع
                   </button>
                )}
                <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleCSVImport} />
                <button 
                  onClick={()=>fileInputRef.current.click()} 
                  className="flex-1 md:flex-none bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet size={14}/> استيراد CSV
                </button>
                <button 
                  onClick={()=>exportToCSV(items, 'Inventory_Data')} 
                  className="flex-1 md:flex-none bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center justify-center gap-2"
                >
                  <Download size={14}/> تصدير CSV
                </button>
             </div>
          </div>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">الباركود</label>
                <input 
                  required 
                  className="w-full border border-slate-200 p-2.5 rounded-lg outline-none font-mono focus:border-indigo-500 bg-white text-sm" 
                  value={newItem.serialNumber} 
                  onChange={e=>setNewItem({...newItem, serialNumber:e.target.value})} 
                  placeholder="S/N"
                />
             </div>
             <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">اسم المنتج</label>
                <input 
                  required 
                  className="w-full border border-slate-200 p-2.5 rounded-lg outline-none font-bold focus:border-indigo-500 bg-white text-sm" 
                  value={newItem.name} 
                  onChange={e=>setNewItem({...newItem, name:e.target.value})} 
                  placeholder="وصف المنتج"
                />
             </div>
             {appUser.permissions?.viewAllWarehouses && (
               <div className="md:col-span-1">
                  <label className="text-[10px] font-bold text-slate-500 mb-1 block">الفرع</label>
                  <select 
                    className="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white focus:border-indigo-500 outline-none text-sm" 
                    value={newItem.warehouseId} 
                    onChange={e=>setNewItem({...newItem, warehouseId: e.target.value})}
                  >
                     {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
               </div>
             )}
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">الكمية</label>
                <input 
                  type="number" 
                  min="0" 
                  required 
                  className="w-full border border-slate-200 p-2.5 rounded-lg outline-none text-center font-bold bg-white focus:border-indigo-500 text-sm" 
                  value={newItem.quantity} 
                  onChange={e=>setNewItem({...newItem, quantity: e.target.value})} 
                />
             </div>
             <div className="md:col-span-1 flex gap-2">
                <div className="flex-1">
                   <label className="text-[10px] font-bold text-slate-500 mb-1 block">السعر (ج)</label>
                   <input 
                     type="number" 
                     min="0" 
                     required 
                     className="w-full border border-slate-200 p-2.5 rounded-lg outline-none text-center font-black text-indigo-700 bg-white focus:border-indigo-500 text-sm" 
                     value={newItem.price} 
                     onChange={e=>setNewItem({...newItem, price: e.target.value})} 
                   />
                </div>
                <button type="submit" className="bg-slate-900 text-white px-4 rounded-lg font-bold h-[42px] mt-auto hover:bg-black transition-colors shadow-sm">
                  <Plus size={18}/>
                </button>
             </div>
          </form>
       </div>

       <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b bg-slate-50 flex flex-col sm:flex-row items-center gap-4">
             <div className="relative w-full max-w-sm">
                <Search size={16} className="absolute right-3 top-3 text-slate-400" />
                <input 
                  className="w-full bg-white border border-slate-200 pr-9 p-2.5 rounded-lg outline-none font-bold text-sm focus:border-indigo-500 transition-colors" 
                  placeholder="بحث بالسيرفر (بالاسم أو الباركود)..." 
                  value={search} 
                  onChange={e=>setSearch(e.target.value)} 
                />
             </div>
             {loadingData && <Loader2 className="animate-spin text-indigo-500" size={16}/>}
          </div>
          <div className="overflow-x-auto max-h-[60vh] custom-scrollbar">
             <table className="w-full text-right text-sm">
                <thead className="bg-white border-b border-slate-100 text-slate-500 font-bold sticky top-0 z-10 text-[11px] uppercase tracking-wider">
                   <tr>
                      <th className="p-4">الباركود</th>
                      <th className="p-4">الاسم</th>
                      <th className="p-4 text-center">المخزن</th>
                      <th className="p-4 text-center">الكمية</th>
                      <th className="p-4 text-center">السعر</th>
                      <th className="p-4 text-center">إدارة</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                   {items.length === 0 && !loadingData ? (
                      <tr><td colSpan="6" className="p-10 text-center text-slate-400 font-bold">لا توجد نتائج</td></tr>
                   ) : items.map(i => (
                     <tr key={i.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="p-4 font-mono text-slate-500">{i.serialNumber}</td>
                        <td className="p-4 font-bold text-slate-800">{i.name}</td>
                        <td className="p-4 text-center font-bold text-indigo-500">{warehouseMap[i.warehouseId] || i.warehouseId}</td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-1 rounded-md font-bold ${i.quantity <= (i.minStock||2) ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                            {i.quantity}
                          </span>
                        </td>
                        <td className="p-4 text-center font-black text-emerald-600">{Number(i.price).toLocaleString()} ج</td>
                        <td className="p-4 text-center flex justify-center gap-2">
                           <button 
                             onClick={()=>setEditingItem(i)} 
                             className="p-1.5 bg-white border border-slate-200 text-indigo-600 rounded-md hover:bg-indigo-50 transition-all"
                           >
                             <Edit size={14}/>
                           </button>
                           <button 
                             onClick={()=>handleDelete(i)} 
                             className="p-1.5 bg-white border border-slate-200 text-rose-500 rounded-md hover:bg-rose-50 transition-all"
                           >
                             <Trash2 size={14}/>
                           </button>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
             {hasMore && !loadingData && items.length >= 30 && (
                <div className="p-4 text-center bg-slate-50 border-t border-slate-100">
                   <button 
                     onClick={() => loadItems(true)} 
                     className="text-indigo-600 font-bold text-xs hover:underline flex items-center justify-center gap-1 mx-auto"
                   >
                      تحميل المزيد <ChevronDown size={14}/>
                   </button>
                </div>
             )}
          </div>
       </div>
    </div>
  );
}

/* ==========================================================================
   📦 7. TRANSFER MANAGER
   ========================================================================== */
function TransferManager({ appUser, warehouseMap, notify, setGlobalLoading }) {
  const [activeTab, setActiveTab] = useState('pending'); 
  const [transfers, setTransfers] = useState([]);
  
  const [searchSerial, setSearchSerial] = useState('');
  const [foundMainItem, setFoundMainItem] = useState(null);
  const [reqQty, setReqQty] = useState(1);
  const [rejectingReq, setRejectingReq] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const isMain = appUser.assignedWarehouseId === 'main' || appUser.role === 'admin';
  const currentBranchId = appUser.assignedWarehouseId || 'main';

  useEffect(() => {
      let q = getCollRef('transfers');
      
      if (!isMain) {
          q = query(q, where('toWarehouseId', '==', currentBranchId));
      }

      const unsub = onSnapshot(query(q, orderBy('createdAt', 'desc'), limit(150)), snap => {
         setTransfers(snap.docs.map(d => ({id: d.id, ...d.data()})));
      });
      return () => unsub();
  }, [currentBranchId, isMain]);

  const handleSearchMain = async (e) => {
      e.preventDefault();
      if (!searchSerial.trim()) return;
      setGlobalLoading(true);
      try {
          const searchTerm = normalizeSerial(searchSerial);
          const q = query(
            getCollRef('inventory'), 
            where('serialNumber', '==', searchTerm), 
            where('warehouseId', '==', 'main'), 
            where('isDeleted', '==', false)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
              setFoundMainItem({id: snap.docs[0].id, ...snap.docs[0].data()});
          } else {
              notify("هذا الصنف غير متاح في المخزن الرئيسي حالياً", "warn");
              setFoundMainItem(null);
          }
      } catch (error) {
          console.error(error);
          notify("حدث خطأ أثناء البحث", "error");
      }
      setGlobalLoading(false);
  };

  const handleSubmitRequest = async () => {
      if (!foundMainItem) return;
      if (reqQty <= 0) return notify("الكمية غير صالحة", "warn");
      if (reqQty > foundMainItem.quantity) return notify("الكمية المطلوبة أكبر من المتاح في الرئيسي!", "error");
      
      setGlobalLoading(true);
      try {
          await addDoc(getCollRef('transfers'), {
              serialNumber: foundMainItem.serialNumber,
              itemName: foundMainItem.name,
              requestedQty: Number(reqQty),
              fromWarehouseId: 'main',
              toWarehouseId: currentBranchId,
              status: 'pending', 
              createdAt: serverTimestamp(),
              requestedBy: appUser.name || appUser.email
          });
          
          logUserActivity(appUser, 'طلب تحويل مخزني', `طلب تحويل ${reqQty} قطعة من ${foundMainItem.name}`);
          notify("تم إرسال الطلب للمخزن الرئيسي بنجاح", "success");
          setFoundMainItem(null);
          setSearchSerial('');
          setReqQty(1);
          setActiveTab('history');
      } catch(e) {
          console.error(e);
          notify("فشل إرسال الطلب", "error");
      }
      setGlobalLoading(false);
  };

  const handleApprove = async (req) => {
      if (!window.confirm(`الموافقة على تحويل ${req.requestedQty} قطعة من ${req.itemName} لفرع ${warehouseMap[req.toWarehouseId]}؟`)) return;
      setGlobalLoading(true);
      
      try {
          await runTransaction(db, async (t) => {
              const mainQ = query(
                getCollRef('inventory'), 
                where('serialNumber', '==', req.serialNumber), 
                where('warehouseId', '==', 'main'), 
                where('isDeleted', '==', false)
              );
              const mainSnap = await getDocs(mainQ);
              if (mainSnap.empty) throw new Error("عذراً، هذا الصنف لم يعد موجوداً في الرئيسي");
              const mainItem = mainSnap.docs[0];
              
              if (mainItem.data().quantity < req.requestedQty) throw new Error("عذراً، رصيد المخزن الرئيسي الحالي غير كافٍ لتلبية هذا الطلب!");

              const branchQ = query(
                getCollRef('inventory'), 
                where('serialNumber', '==', req.serialNumber), 
                where('warehouseId', '==', req.toWarehouseId), 
                where('isDeleted', '==', false)
              );
              const branchSnap = await getDocs(branchQ);

              t.update(mainItem.ref, {
                  quantity: increment(-req.requestedQty)
              });

              if (!branchSnap.empty) {
                  const branchItem = branchSnap.docs[0];
                  t.update(branchItem.ref, {
                      quantity: increment(req.requestedQty)
                  });
              } else {
                  const newRef = doc(getCollRef('inventory'));
                  t.set(newRef, {
                      ...mainItem.data(),
                      warehouseId: req.toWarehouseId,
                      quantity: req.requestedQty,
                      createdAt: serverTimestamp()
                  });
              }

              const reqRef = getDocRef('transfers', req.id);
              t.update(reqRef, {
                  status: 'approved',
                  processedAt: serverTimestamp(),
                  processedBy: appUser.name || appUser.email
              });
          });
          
          logUserActivity(appUser, 'موافقة على تحويل مخزني', `تمت الموافقة لفرع ${warehouseMap[req.toWarehouseId]} على ${req.requestedQty} قطعة من ${req.itemName}`);
          notify("تمت الموافقة وتم التحويل المخزني بنجاح!", "success");
      } catch(e) {
          console.error(e);
          notify(e.message || "خطأ أثناء الموافقة", "error");
      }
      setGlobalLoading(false);
  };

  const submitReject = async (e) => {
      e.preventDefault();
      if(!rejectReason.trim()) return notify("يرجى كتابة سبب الرفض", "warn");
      
      setGlobalLoading(true);
      try {
          await updateDoc(getDocRef('transfers', rejectingReq.id), {
              status: 'rejected',
              rejectReason: rejectReason,
              processedAt: serverTimestamp(),
              processedBy: appUser.name || appUser.email
          });
          
          logUserActivity(appUser, 'رفض تحويل مخزني', `رفض طلب فرع ${warehouseMap[rejectingReq.toWarehouseId]} بسبب: ${rejectReason}`);
          notify("تم رفض الطلب بنجاح", "success");
          setRejectingReq(null);
          setRejectReason('');
      } catch(err) {
          console.error(err);
          notify("فشل عملية الرفض", "error");
      }
      setGlobalLoading(false);
  };

  const pendingRequests = transfers.filter(t => t.status === 'pending');
  const processedRequests = transfers.filter(t => t.status !== 'pending');

  return (
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden animate-in fade-in text-right" dir="rtl">
          {rejectingReq && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                      <h3 className="font-black text-xl mb-4 text-slate-800 border-b pb-3 text-rose-600 flex items-center gap-2">
                        <X size={20}/> سبب رفض التحويل
                      </h3>
                      <form onSubmit={submitReject}>
                          <p className="text-sm font-bold text-slate-600 mb-2">أنت تقوم برفض طلب ({rejectingReq.itemName}) لفرع ({warehouseMap[rejectingReq.toWarehouseId]})</p>
                          <textarea 
                              required
                              rows="3"
                              className="w-full border border-slate-200 p-3 rounded-xl focus:border-rose-500 outline-none bg-slate-50 text-sm font-bold resize-none mb-4" 
                              placeholder="اكتب سبب الرفض هنا ليراه الفرع الطالب..."
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                          />
                          <div className="flex gap-2">
                              <button type="submit" className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-md">تأكيد الرفض</button>
                              <button type="button" onClick={()=>{setRejectingReq(null); setRejectReason('');}} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">إلغاء</button>
                          </div>
                      </form>
                  </div>
              </div>
          )}

          <div className="p-6 border-b flex flex-wrap items-center justify-between bg-slate-50 gap-4">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-3">
                 <ArrowRightLeft className="text-indigo-600" size={24}/> 
                 التحويلات المخزنية
              </h2>
              <div className="flex gap-2">
                  <span className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold">{pendingRequests.length} طلبات قيد الانتظار</span>
              </div>
          </div>

          <div className="flex border-b bg-white overflow-x-auto custom-scrollbar">
              <button 
                onClick={()=>setActiveTab('pending')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'pending' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                الطلبات المعلقة
              </button>
              <button 
                onClick={()=>setActiveTab('history')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'history' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                سجل التحويلات
              </button>
              {!isMain && (
                  <button 
                    onClick={()=>setActiveTab('new')} 
                    className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'new' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    طلب قطعة من الرئيسي
                  </button>
              )}
          </div>

          <div className="p-6 max-h-[65vh] overflow-y-auto custom-scrollbar bg-slate-50/50">
              
              {activeTab === 'new' && !isMain && (
                  <div className="max-w-xl mx-auto space-y-6">
                      <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 text-indigo-800 font-bold text-sm leading-relaxed shadow-sm">
                          قم بمسح باركود المنتج لمعرفة مدى توفره في "المخزن الرئيسي" ثم أرسل طلب لتحويله لفرعك.
                      </div>
                      <form onSubmit={handleSearchMain} className="flex flex-col sm:flex-row gap-3">
                          <input 
                              className="flex-1 border border-slate-200 p-3.5 rounded-xl outline-none font-bold text-center tracking-widest text-slate-700 font-mono bg-white focus:border-indigo-500 shadow-sm" 
                              placeholder="الباركود (S/N)..." 
                              value={searchSerial} 
                              onChange={e=>setSearchSerial(e.target.value)} 
                          />
                          <button type="submit" className="bg-indigo-600 text-white px-8 py-3.5 rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                              <Search size={18}/> بحث
                          </button>
                      </form>

                      {foundMainItem && (
                          <div className="bg-white border-2 border-indigo-100 rounded-2xl p-8 shadow-md flex flex-col items-center text-center animate-in zoom-in-95">
                              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
                                  <Package size={32}/>
                              </div>
                              <h3 className="font-black text-xl text-slate-800 mb-1">{foundMainItem.name}</h3>
                              <p className="text-slate-500 font-mono text-sm mb-6">{foundMainItem.serialNumber}</p>
                              
                              <div className="bg-emerald-50 text-emerald-700 px-6 py-2.5 rounded-xl font-black text-sm mb-8 border border-emerald-100 shadow-sm">
                                  الكمية المتاحة بالرئيسي: {foundMainItem.quantity}
                              </div>

                              <div className="flex flex-col w-full max-w-xs gap-2">
                                  <label className="font-bold text-xs text-slate-500 text-right">أدخل الكمية التي تريدها فرعك:</label>
                                  <input 
                                      type="number" 
                                      min="1" 
                                      max={foundMainItem.quantity}
                                      className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none font-black text-center focus:border-indigo-500 text-indigo-700 text-xl bg-slate-50 transition-colors" 
                                      value={reqQty} 
                                      onChange={e=>setReqQty(e.target.value)} 
                                  />
                                  <button onClick={handleSubmitRequest} className="w-full bg-slate-900 text-white py-3.5 mt-4 rounded-xl font-bold hover:bg-black transition-colors shadow-lg active:scale-95 flex justify-center items-center gap-2">
                                      <ArrowRightLeft size={18}/> إرسال طلب التحويل
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
              )}

              {activeTab === 'pending' && (
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-right text-sm">
                              <thead className="bg-slate-50 text-slate-500 font-bold border-b text-[11px] uppercase">
                                  <tr>
                                      <th className="p-4">الفرع الطالب</th>
                                      <th className="p-4">المنتج / الباركود</th>
                                      <th className="p-4 text-center">الكمية</th>
                                      <th className="p-4">بواسطة</th>
                                      <th className="p-4 text-center">الإجراء</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {pendingRequests.length === 0 ? <tr><td colSpan="5" className="p-12 text-center text-slate-400 font-bold text-sm">لا توجد طلبات معلقة حالياً.</td></tr> :
                                      pendingRequests.map(req => (
                                          <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="p-4 font-black text-indigo-700">{warehouseMap[req.toWarehouseId]}</td>
                                              <td className="p-4">
                                                  <p className="font-bold text-slate-800 mb-0.5">{req.itemName}</p>
                                                  <p className="text-[10px] font-mono text-slate-500">{req.serialNumber}</p>
                                              </td>
                                              <td className="p-4 text-center font-black text-lg text-slate-700">{req.requestedQty}</td>
                                              <td className="p-4 text-xs text-slate-500">
                                                  <p className="font-bold text-slate-700 mb-0.5">{req.requestedBy}</p>
                                                  <p className="text-[9px]">{formatDate(req.createdAt)}</p>
                                              </td>
                                              <td className="p-4 text-center">
                                                  {isMain ? (
                                                      <div className="flex justify-center gap-2">
                                                          <button onClick={()=>handleApprove(req)} className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm" title="موافقة وخصم الكمية">
                                                              <Check size={18}/>
                                                          </button>
                                                          <button onClick={()=>setRejectingReq(req)} className="bg-rose-50 text-rose-600 p-2.5 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm" title="رفض">
                                                              <X size={18}/>
                                                          </button>
                                                      </div>
                                                  ) : (
                                                      <span className="bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-amber-100 flex items-center gap-1 w-max mx-auto"><Loader2 size={12} className="animate-spin"/> بالانتظار</span>
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
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-right text-sm">
                              <thead className="bg-slate-50 text-slate-500 font-bold border-b text-[11px] uppercase">
                                  <tr>
                                      <th className="p-4">الفرع</th>
                                      <th className="p-4">المنتج</th>
                                      <th className="p-4 text-center">الكمية</th>
                                      <th className="p-4">الحالة / الملاحظات</th>
                                      <th className="p-4">التاريخ</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {processedRequests.length === 0 ? <tr><td colSpan="5" className="p-12 text-center text-slate-400 font-bold text-sm">لا يوجد سجل للتحويلات بعد.</td></tr> :
                                      processedRequests.map(req => (
                                          <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="p-4 font-bold text-slate-700">{warehouseMap[req.toWarehouseId]}</td>
                                              <td className="p-4">
                                                  <p className="font-bold text-slate-800 mb-0.5">{req.itemName}</p>
                                                  <p className="text-[10px] font-mono text-slate-500">{req.serialNumber}</p>
                                              </td>
                                              <td className="p-4 text-center font-black text-slate-700">{req.requestedQty}</td>
                                              <td className="p-4">
                                                  {req.status === 'approved' ? (
                                                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-bold border border-emerald-100"><Check size={12}/> تمت الموافقة</span>
                                                  ) : (
                                                      <div>
                                                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-3 py-1 rounded-lg text-[10px] font-bold border border-rose-100 mb-1.5"><X size={12}/> مرفوض</span>
                                                          <p className="text-[10px] text-rose-600 font-bold max-w-[200px] truncate" title={req.rejectReason}>السبب: {req.rejectReason}</p>
                                                      </div>
                                                  )}
                                              </td>
                                              <td className="p-4 text-xs text-slate-500">
                                                  <p className="font-bold text-slate-700 mb-0.5">{formatDate(req.processedAt)}</p>
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
      </div>
  );
}

/* ==========================================================================
   📦 8. POS MANAGER
   ========================================================================== */
function POSManager({ appUser, systemSettings, notify, setGlobalLoading, warehouseMap }) { 
  const [search, setSearch] = useState('');
  const [foundItem, setFoundItem] = useState(null);
  const [invoice, setInvoice] = useState({ 
    customerName: '', 
    phone: '', 
    discount: 0, 
    discountType: 'value', 
    taxEnabled: true, 
    installationFeeId: '', 
    technicianName: '' 
  });
  const [invoiceData, setInvoiceData] = useState(null);

  const calculations = useMemo(() => {
    if (!foundItem) return { subtotal: 0, discountAmount: 0, taxAmount: 0, finalTotal: 0, installAmount: 0 };
    const subtotal = Number(foundItem.price) || 0;
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
    
    return { 
       subtotal, 
       discountAmount, 
       taxAmount, 
       installAmount, 
       finalTotal: Math.round(taxableAmount + taxAmount + installAmount) 
    };
  }, [foundItem, invoice, systemSettings]);

  const handleSearch = async (e) => {
     e.preventDefault(); 
     if (!search.trim()) return;
     setGlobalLoading(true);
     try {
        const searchTerm = normalizeSerial(search);
        const q = query(
          getCollRef('inventory'), 
          where('serialNumber', '==', searchTerm), 
          where('isDeleted', '==', false),
          where('quantity', '>', 0) 
        );
        const snap = await getDocs(q);
        if(!snap.empty) {
           const item = {id: snap.docs[0].id, ...snap.docs[0].data()};
           const userWarehouse = appUser.assignedWarehouseId || 'main';
           if (!appUser.permissions?.viewAllWarehouses && item.warehouseId !== userWarehouse) {
              notify(`تنبيه: المنتج غير متاح في فرعك (${warehouseMap[userWarehouse]}).`, "error"); 
              setFoundItem(null);
           } else { 
              setFoundItem(item); 
           }
        } else { 
           notify("الباركود غير صحيح أو الكمية غير متوفرة", "warn"); 
           setFoundItem(null); 
        }
     } catch(err) { 
        console.error(err);
        notify("خطأ في البحث", "error"); 
     }
     setGlobalLoading(false);
  };

  const handleCheckout = async () => {
    if (!foundItem) return notify("لم يتم العثور على منتج", "warn");
    if (!invoice.customerName) return notify("يرجى إدخال اسم العميل لإتمام الفاتورة", "warn");
    if (calculations.finalTotal < 0) return notify("الإجمالي لا يمكن أن يكون سالباً", "error");
    
    setGlobalLoading(true);
    const invId = 'INV-' + Date.now().toString().slice(-8);
    try {
       await runTransaction(db, async (t) => {
          const itemRef = getDocRef('inventory', foundItem.id);
          const itemSnap = await t.get(itemRef);
          if (!itemSnap.exists()) throw new Error("المنتج غير موجود!");
          const currentQty = itemSnap.data().quantity || 0;
          if (currentQty <= 0) throw new Error("عذراً، نفدت الكمية المتاحة من هذا المنتج أثناء العملية!");
          
          const newQty = currentQty - 1;
          t.update(itemRef, { quantity: newQty });
          
          const transactionData = { 
            ...calculations, 
            customerName: invoice.customerName,
            phone: invoice.phone,
            technicianName: invoice.technicianName,
            discount: Number(invoice.discount) || 0,
            discountType: invoice.discountType,
            taxEnabled: invoice.taxEnabled,
            installationFeeId: invoice.installationFeeId || null,
            type: 'sell', 
            itemName: foundItem.name, 
            serialNumber: foundItem.serialNumber, 
            warehouseId: foundItem.warehouseId, 
            operator: appUser.name || appUser.email || 'موظف', 
            invoiceNumber: invId, 
            timestamp: serverTimestamp() 
          };
          
          t.set(doc(getCollRef('transactions')), transactionData);
       });
       
       logUserActivity(appUser, 'إصدار فاتورة', `إصدار فاتورة #${invId} للعميل ${invoice.customerName} بقيمة ${calculations.finalTotal} ج`);

       setInvoiceData({ 
          ...foundItem, 
          ...invoice, 
          ...calculations, 
          itemName: foundItem.name, 
          invoiceNumber: invId, 
          date: new Date().toISOString(),
          operator: appUser.name || appUser.email
       });
       
       setFoundItem(null); 
       setSearch(''); 
       setInvoice({ 
         customerName: '', 
         phone: '', 
         discount: 0, 
         discountType: 'value', 
         taxEnabled: true, 
         installationFeeId: '', 
         technicianName: '' 
       });
       notify("تم البيع بنجاح", "success");
    } catch(e) { 
       notify(e.message || "فشلت عملية البيع", "error"); 
       console.error(e);
    }
    setGlobalLoading(false);
  };

  if (invoiceData) return <InvoiceRenderer data={invoiceData} systemSettings={systemSettings} onBack={()=>setInvoiceData(null)} />;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in" dir="rtl">
       <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 text-right">
          <h2 className="text-2xl font-black mb-8 flex items-center gap-3 text-slate-800">
            <Receipt className="text-indigo-600" size={26}/> نقطة البيع POS
          </h2>
          
          <form onSubmit={handleSearch} className="flex gap-3 mb-8 bg-slate-50 p-3 rounded-xl border border-slate-200">
             <input 
               className="flex-1 border-none bg-transparent p-3 outline-none text-xl font-mono text-center tracking-widest text-slate-700 placeholder-slate-300" 
               placeholder="مرر الباركود..." 
               value={search} 
               onChange={e=>setSearch(e.target.value)} 
               autoFocus 
             />
             <button 
               type="submit" 
               className="bg-indigo-600 text-white px-8 rounded-lg font-bold text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2"
             >
                <Search size={18}/> بحث
             </button>
          </form>

          {foundItem ? (
             <div className="space-y-6 animate-in zoom-in-95">
                <div className="bg-slate-900 p-6 rounded-2xl text-white flex justify-between items-center shadow-md">
                   <div>
                      <h3 className="font-black text-xl mb-1">{foundItem.name}</h3>
                      <p className="text-indigo-300 font-mono text-xs uppercase">{foundItem.serialNumber}</p>
                      <p className="text-xs text-slate-400 mt-2">المخزن: {warehouseMap[foundItem.warehouseId] || foundItem.warehouseId}</p>
                   </div>
                   <div className="bg-white/10 px-6 py-3 rounded-xl">
                      <p className="text-[10px] text-slate-300 uppercase mb-0.5">السعر الأساسي</p>
                      <p className="text-3xl font-black">{foundItem.price} <span className="text-sm font-normal">ج.م</span></p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">العميل</label>
                      <div className="relative">
                         <User className="absolute right-3 top-3 text-slate-400" size={18}/>
                         <input 
                           className="w-full border border-slate-200 pr-10 p-3 rounded-xl font-bold focus:border-indigo-500 outline-none text-sm bg-white" 
                           placeholder="الاسم ثلاثي" 
                           value={invoice.customerName} 
                           onChange={e=>setInvoice({...invoice, customerName:e.target.value})} 
                           required
                         />
                      </div>
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">رقم الهاتف</label>
                      <div className="relative">
                         <Phone className="absolute right-3 top-3 text-slate-400" size={18}/>
                         <input 
                           className="w-full border border-slate-200 pr-10 p-3 rounded-xl font-bold font-mono focus:border-indigo-500 outline-none text-sm bg-white" 
                           placeholder="01X..." 
                           value={invoice.phone} 
                           onChange={e=>setInvoice({...invoice, phone:e.target.value})} 
                         />
                      </div>
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">الفني المختص (اختياري)</label>
                      <select 
                        className="w-full border border-slate-200 p-3 rounded-xl font-bold focus:border-indigo-500 outline-none text-sm bg-white" 
                        value={invoice.technicianName} 
                        onChange={e=>setInvoice({...invoice, technicianName: e.target.value})}
                      >
                         <option value="">-- بدون فني --</option>
                         {(systemSettings.technicians || []).map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                      </select>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-indigo-50/50 p-6 rounded-2xl border border-indigo-50 text-right">
                   <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-1">الخصم</label>
                      <div className="flex bg-white rounded-xl border border-indigo-100 overflow-hidden">
                         <input 
                           type="number" 
                           className="flex-1 p-2.5 outline-none font-bold text-center text-rose-600 text-sm" 
                           value={invoice.discount} 
                           onChange={e=>setInvoice({...invoice, discount: e.target.value})} 
                           min="0" 
                         />
                         <select 
                           className="bg-slate-50 px-3 font-bold text-xs border-r border-slate-100 outline-none" 
                           value={invoice.discountType} 
                           onChange={e=>setInvoice({...invoice, discountType: e.target.value})}
                         >
                            <option value="value">ج.م</option>
                            <option value="percent">%</option>
                         </select>
                      </div>
                   </div>
                   <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-1">التركيب / رسوم إضافية</label>
                      <select 
                        className="w-full p-2.5 border border-indigo-100 rounded-xl bg-white font-bold text-xs outline-none focus:border-indigo-500" 
                        value={invoice.installationFeeId} 
                        onChange={e=>setInvoice({...invoice, installationFeeId: e.target.value})}
                      >
                         <option value="">بدون رسوم إضافية</option>
                         {(systemSettings.installationFees || []).map(f => <option key={f.id} value={f.id}>{f.label} (+{f.value} ج)</option>)}
                      </select>
                   </div>
                   <div className="flex flex-col justify-end">
                      <button 
                        type="button" 
                        onClick={()=>setInvoice({...invoice, taxEnabled: !invoice.taxEnabled})} 
                        className={`p-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 border ${invoice.taxEnabled ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-500'}`}
                      >
                         {invoice.taxEnabled ? <CheckCircle2 size={16}/> : <X size={16}/>} 
                         ضريبة ({systemSettings.taxRate || 14}%)
                      </button>
                   </div>
                </div>

                <div className="bg-emerald-900 text-white p-8 rounded-2xl shadow-lg flex justify-between items-center border-t-4 border-emerald-500">
                   <div className="text-right text-xs font-bold text-emerald-100/70 space-y-1.5">
                      <p>الفرعي: <span className="text-white mr-2">{calculations.subtotal}</span></p>
                      {calculations.discountAmount > 0 && <p className="text-rose-300">الخصم: <span className="mr-2">-{calculations.discountAmount.toFixed(1)}</span></p>}
                      <p>الضريبة: <span className="text-white mr-2">+{calculations.taxAmount.toFixed(1)}</span></p>
                      {calculations.installAmount > 0 && <p>التركيب: <span className="text-white mr-2">+{calculations.installAmount}</span></p>}
                   </div>
                   <div className="text-left">
                      <p className="text-[10px] text-emerald-300 mb-1">الصافي للدفع</p>
                      <span className="text-5xl font-black text-emerald-400 tracking-tighter">
                        {calculations.finalTotal.toLocaleString()} <span className="text-sm font-normal">ج.م</span>
                      </span>
                   </div>
                </div>

                <button 
                  onClick={handleCheckout} 
                  className="w-full bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-emerald-600 transition-colors flex justify-center items-center gap-2"
                >
                   <Printer size={24}/> تأكيد وطباعة
                </button>
             </div>
          ) : (
             <div className="text-center py-20 border-2 border-dashed rounded-2xl bg-slate-50 border-slate-200 text-slate-400 font-bold">
                <Search size={32} className="mx-auto mb-3 opacity-20"/>
                <p className="text-sm">قم بمسح الباركود لظهور بيانات المنتج</p>
             </div>
          )}
       </div>
    </div>
  );
}

/* ==========================================================================
   📦 9. CUSTOMER MANAGER
   ========================================================================== */
function CustomerManager({ systemSettings, notify, setGlobalLoading, appUser }) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 700);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', productCategory: '', productModel: '', issue: '', notes: '' });
  
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);

  const loadCustomers = useCallback(async (isNextPage = false) => {
    setLoadingData(true);
    try {
        let q = getCollRef('customers');
        const term = normalizeSearch(debouncedSearch);

        if (term) {
           q = query(q, 
              where('searchKey', '>=', term), 
              where('searchKey', '<=', term + '\uf8ff'),
              orderBy('searchKey')
           );
        } else {
           q = query(q, orderBy('createdAt', 'desc'));
        }

        if (isNextPage && lastDoc) {
           q = query(q, startAfter(lastDoc));
        }

        q = query(q, limit(30));
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (isNextPage) {
           setCustomers(prev => [...prev, ...fetched]);
        } else {
           setCustomers(fetched);
        }
        
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 30);
    } catch (e) {
        console.error(e);
        if (e.message.includes('index')) {
           notify("يحتاج هذا البحث لتهيئة الفهارس الخاصة بقاعدة البيانات", "warn");
        } else {
           notify("فشل جلب العملاء", "error");
        }
    }
    setLoadingData(false);
  }, [debouncedSearch, lastDoc, notify]);

  useEffect(() => {
    setLastDoc(null);
    loadCustomers(false);
  }, [debouncedSearch, loadCustomers]);

  const handleAddCustomer = async (e) => {
     e.preventDefault();
     if(!newCust.name || !newCust.phone) return notify("الاسم ورقم الهاتف مطلوبان", "warn");
     
     setGlobalLoading(true);
     try {
        await addDoc(getCollRef('customers'), {
           ...newCust,
           createdAt: serverTimestamp(),
           searchKey: normalizeSearch(`${newCust.name} ${newCust.phone}`)
        });
        
        logUserActivity(appUser, 'إضافة عميل', `تسجيل العميل: ${newCust.name}`);
        notify("تم تسجيل العميل بنجاح", "success");
        setShowAddModal(false);
        setNewCust({ name: '', phone: '', productCategory: '', productModel: '', issue: '', notes: '' });
        setLastDoc(null);
        loadCustomers(false); 
     } catch(err) {
        console.error(err);
        notify("حدث خطأ أثناء الحفظ", "error");
     }
     setGlobalLoading(false);
  };

  const availableModels = useMemo(() => {
     if(!newCust.productCategory || !systemSettings.productCategories) return [];
     const cat = systemSettings.productCategories.find(c => c.name === newCust.productCategory);
     return cat ? cat.models : [];
  }, [newCust.productCategory, systemSettings.productCategories]);

  if (invoiceData) {
     return <InvoiceRenderer data={invoiceData} systemSettings={systemSettings} onBack={() => { setInvoiceData(null); setSelectedCustomer(null); }} />;
  }
  
  if (selectedCustomer) {
     return (
        <CustomerProfileView 
           customer={selectedCustomer} 
           onClose={() => setSelectedCustomer(null)}
           systemSettings={systemSettings}
           notify={notify}
           setGlobalLoading={setGlobalLoading}
           appUser={appUser}
           onCheckoutSuccess={(data) => setInvoiceData(data)}
        />
     );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in text-right" dir="rtl">
      
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="font-black text-xl mb-6 text-slate-800 border-b pb-4 flex items-center gap-2">
              <UserCog className="text-indigo-600"/> تسجيل بيانات عميل جديد
            </h3>
            <form onSubmit={handleAddCustomer} className="space-y-4">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">اسم العميل *</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold" 
                       value={newCust.name} 
                       onChange={e=>setNewCust({...newCust, name:e.target.value})} 
                       placeholder="الاسم بالكامل" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">رقم الهاتف *</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold font-mono" 
                       value={newCust.phone} 
                       onChange={e=>setNewCust({...newCust, phone:e.target.value})} 
                       placeholder="01XXXXXXXXX" 
                     />
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-50">
                  <div>
                     <label className="block text-xs font-bold text-indigo-900 mb-1">المنتج (التصنيف)</label>
                     <select 
                       className="w-full border border-indigo-100 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold" 
                       value={newCust.productCategory} 
                       onChange={e=>setNewCust({...newCust, productCategory: e.target.value, productModel: ''})}
                     >
                        <option value="">-- اختر المنتج --</option>
                        {(systemSettings.productCategories || []).map((cat, idx) => (
                           <option key={idx} value={cat.name}>{cat.name}</option>
                        ))}
                     </select>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-indigo-900 mb-1">الموديل</label>
                     <select 
                       disabled={!newCust.productCategory} 
                       className="w-full border border-indigo-100 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold disabled:bg-slate-100 disabled:opacity-60" 
                       value={newCust.productModel} 
                       onChange={e=>setNewCust({...newCust, productModel: e.target.value})}
                     >
                        <option value="">-- اختر الموديل --</option>
                        {availableModels.map((mod, idx) => (
                           <option key={idx} value={mod}>{mod}</option>
                        ))}
                     </select>
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">العطل / المشكلة</label>
                  <textarea 
                    rows="2" 
                    className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold resize-none" 
                    value={newCust.issue} 
                    onChange={e=>setNewCust({...newCust, issue:e.target.value})} 
                    placeholder="وصف المشكلة التي يواجهها العميل..." 
                  />
               </div>
               
               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات إضافية</label>
                  <input 
                    className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold" 
                    value={newCust.notes} 
                    onChange={e=>setNewCust({...newCust, notes:e.target.value})} 
                    placeholder="أي تفاصيل أخرى (العنوان، ميعاد الزيارة...)" 
                  />
               </div>

               <div className="flex gap-3 pt-4 border-t">
                  <button 
                    type="submit" 
                    className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors flex items-center justify-center gap-2"
                  >
                    <Save size={18}/> حفظ البيانات
                  </button>
                  <button 
                    type="button" 
                    onClick={()=>setShowAddModal(false)} 
                    className="px-6 bg-slate-100 text-slate-600 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                  >
                    إلغاء
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}

      <div className="p-5 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50">
         <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
           <Contact className="text-indigo-600" size={20}/> سجل العملاء والصيانة
         </h2>
         <div className="flex gap-2 w-full sm:w-auto">
             <div className="relative flex-1 sm:w-64">
                 <Search className="absolute right-3 top-2.5 text-slate-400" size={16}/>
                 <input 
                   className="w-full border border-slate-200 py-2 pr-9 pl-3 rounded-lg outline-none text-xs font-bold focus:border-indigo-500" 
                   placeholder="بحث بالسيرفر (بالاسم أو الهاتف)..." 
                   value={search} 
                   onChange={e=>setSearch(e.target.value)} 
                 />
             </div>
             {loadingData && <Loader2 className="animate-spin text-indigo-500 mt-2 sm:mt-0" size={16}/>}
             <button 
               onClick={()=>setShowAddModal(true)} 
               className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm whitespace-nowrap"
             >
                <Plus size={14}/> إضافة عميل
             </button>
         </div>
      </div>
      <div className="overflow-x-auto max-h-[70vh] custom-scrollbar">
         <table className="w-full text-right text-sm">
            <thead className="bg-white border-b text-slate-500 font-bold text-[11px] uppercase sticky top-0">
               <tr>
                  <th className="p-4">العميل</th>
                  <th className="p-4">المنتج والموديل</th>
                  <th className="p-4">المشكلة / الملاحظات</th>
                  <th className="p-4 text-center">التاريخ</th>
                  <th className="p-4 text-center">إدارة</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-xs">
               {customers.length === 0 && !loadingData ? 
                 <tr><td colSpan="5" className="p-10 text-center text-slate-400 font-bold">لا توجد سجلات للعملاء</td></tr> : 
                 customers.map((c) => (
                   <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                     <td className="p-4">
                        <p className="font-bold text-slate-800 text-sm mb-1">{c.name}</p>
                        <p className="font-mono text-slate-500 flex items-center gap-1" dir="ltr">
                          <Phone size={12}/> {c.phone}
                        </p>
                     </td>
                     <td className="p-4">
                        {c.productCategory ? (
                           <>
                             <span className="inline-block bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-[10px] font-black mb-1">{c.productCategory}</span>
                             <p className="text-slate-600 font-bold text-[11px]">{c.productModel || 'غير محدد'}</p>
                           </>
                        ) : <span className="text-slate-400">-</span>}
                     </td>
                     <td className="p-4 max-w-xs">
                        <p className="text-rose-600 font-bold text-[11px] truncate mb-1">{c.issue || 'لا يوجد عطل مسجل'}</p>
                        <p className="text-slate-500 text-[10px] truncate">{c.notes}</p>
                     </td>
                     <td className="p-4 text-center text-slate-500 text-[10px] font-bold">{formatDate(c.createdAt)}</td>
                     <td className="p-4 text-center">
                        <button 
                          onClick={() => setSelectedCustomer(c)} 
                          className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-indigo-100 transition-colors border border-indigo-100"
                        >
                          عرض الملف
                        </button>
                     </td>
                   </tr>
                 ))
               }
            </tbody>
         </table>
         {hasMore && !loadingData && customers.length >= 30 && (
             <div className="p-4 text-center bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => loadCustomers(true)} 
                  className="text-indigo-600 font-bold text-xs hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                   تحميل المزيد <ChevronDown size={14}/>
                </button>
             </div>
         )}
      </div>
    </div>
  );
}

/* ==========================================================================
   📦 10. CUSTOMER PROFILE VIEW
   ========================================================================== */
function CustomerProfileView({ customer, onClose, systemSettings, notify, setGlobalLoading, appUser, onCheckoutSuccess }) {
  const [activeTab, setActiveTab] = useState('new_invoice'); 
  const [history, setHistory] = useState([]);
  
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [invoice, setInvoice] = useState({ discount: 0, discountType: 'value', taxEnabled: true, installationFeeId: '', technicianName: '' });

  useEffect(() => {
     if (activeTab === 'history') {
        const fetchHistory = async () => {
            setGlobalLoading(true);
            try {
                const q = query(
                  getCollRef('transactions'), 
                  where('phone', '==', customer.phone), 
                  orderBy('timestamp', 'desc'), 
                  limit(100)
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
                setHistory(data);
            } catch(e) {
                console.error(e);
                notify("فشل جلب السجل، تأكد من الفهارس (Indexes)", "warn");
            }
            setGlobalLoading(false);
        };
        fetchHistory();
     }
  }, [activeTab, customer.phone, setGlobalLoading, notify]);

  const calculations = useMemo(() => {
      const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
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

      return {
         subtotal, discountAmount, taxAmount, installAmount,
         finalTotal: Math.round(taxableAmount + taxAmount + installAmount)
      };
  }, [cart, invoice, systemSettings]);

  const handleSearchItem = async (e) => {
      e.preventDefault();
      if(!search.trim()) return;
      setGlobalLoading(true);
      try {
          const searchTerm = normalizeSerial(search);
          if (cart.find(i => i.serialNumber === searchTerm)) {
              notify("المنتج مضاف بالفعل في الفاتورة", "warn");
              setGlobalLoading(false);
              return;
          }
          const q = query(
            getCollRef('inventory'), 
            where('serialNumber', '==', searchTerm), 
            where('isDeleted', '==', false), 
            where('quantity', '>', 0)
          );
          const snap = await getDocs(q);
          if(!snap.empty) {
              const item = {id: snap.docs[0].id, ...snap.docs[0].data()};
              setCart([...cart, item]);
              setSearch('');
          } else {
              notify("الباركود غير صحيح أو الكمية غير متوفرة", "warn");
          }
      } catch(err) {
          notify("خطأ في البحث", "error");
      }
      setGlobalLoading(false);
  };

  const handleCheckout = async () => {
      if (cart.length === 0) return notify("يرجى إضافة منتج واحد على الأقل", "warn");
      if (calculations.finalTotal < 0) return notify("الإجمالي لا يمكن أن يكون سالباً", "error");

      setGlobalLoading(true);
      const invId = 'INV-' + Date.now().toString().slice(-8);
      try {
         await runTransaction(db, async (t) => {
             const itemRefs = [];
             const itemSnaps = [];
             for (const cartItem of cart) {
                 const ref = getDocRef('inventory', cartItem.id);
                 itemRefs.push(ref);
                 itemSnaps.push(await t.get(ref));
             }

             itemSnaps.forEach((snap, idx) => {
                 if (!snap.exists() || snap.data().quantity < 1) throw new Error(`المنتج ${cart[idx].name} غير متوفر بالكمية المطلوبة!`);
             });

             itemRefs.forEach((ref, idx) => {
                 const currentQty = itemSnaps[idx].data().quantity;
                 const newQty = currentQty - 1;
                 t.update(ref, { quantity: newQty });
             });

             const joinedNames = cart.map(i => i.name).join(' + ');
             const joinedSerials = cart.map(i => i.serialNumber).join(', ');

             t.set(doc(getCollRef('transactions')), {
                 ...calculations,
                 customerName: customer.name,
                 phone: customer.phone,
                 technicianName: invoice.technicianName,
                 type: 'sell',
                 items: cart, 
                 itemName: joinedNames,
                 serialNumber: joinedSerials,
                 operator: appUser.name || appUser.email,
                 invoiceNumber: invId,
                 timestamp: serverTimestamp()
             });
         });
         
         onCheckoutSuccess({
            customerName: customer.name,
            phone: customer.phone,
            ...invoice,
            ...calculations,
            items: cart,
            invoiceNumber: invId,
            date: new Date().toISOString(),
            operator: appUser.name || appUser.email
         });
         
         notify("تم البيع وإصدار الفاتورة بنجاح", "success");
      } catch(e) {
         console.error(e);
         notify(e.message || "حدث خطأ أثناء إتمام العملية", "error");
      }
      setGlobalLoading(false);
  };

  return (
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden animate-in zoom-in-95 text-right flex flex-col max-h-full" dir="rtl">
          <div className="p-6 border-b flex justify-between items-start bg-slate-50">
              <div>
                  <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <UserCog size={24} className="text-indigo-600"/> {customer.name}
                  </h2>
                  <p className="text-slate-500 font-mono mt-2 flex items-center gap-1" dir="ltr">
                    <Phone size={14}/> {customer.phone}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                      {customer.productCategory && 
                        <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold border border-indigo-200">
                          {customer.productCategory} - {customer.productModel}
                        </span>
                      }
                      {customer.issue && 
                        <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-lg text-xs font-bold border border-rose-200">
                          الشكوى: {customer.issue}
                        </span>
                      }
                  </div>
              </div>
              <button onClick={onClose} className="p-2 bg-slate-200 rounded-lg hover:bg-slate-300 text-slate-600 transition-colors">
                <X size={20}/>
              </button>
          </div>

          <div className="flex border-b bg-white">
              <button 
                onClick={()=>setActiveTab('new_invoice')} 
                className={`flex-1 py-4 font-black text-sm transition-colors ${activeTab === 'new_invoice' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                إصدار فاتورة جديدة
              </button>
              <button 
                onClick={()=>setActiveTab('history')} 
                className={`flex-1 py-4 font-black text-sm transition-colors ${activeTab === 'history' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                سجل الفواتير السابقة
              </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              {activeTab === 'new_invoice' && (
                 <div className="space-y-6">
                    <form onSubmit={handleSearchItem} className="flex gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                       <input 
                         className="flex-1 border-none bg-transparent p-2 outline-none text-lg font-mono text-center tracking-widest text-slate-700" 
                         placeholder="مرر باركود المنتج لإضافته..." 
                         value={search} 
                         onChange={e=>setSearch(e.target.value)} 
                         autoFocus 
                       />
                       <button 
                         type="submit" 
                         className="bg-indigo-600 text-white px-6 rounded-lg font-bold text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2"
                       >
                         <Search size={18}/> بحث وإضافة
                       </button>
                    </form>

                    {cart.length > 0 && (
                       <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-right text-xs">
                             <thead className="bg-slate-100 text-slate-600 border-b font-bold">
                               <tr>
                                 <th className="p-3">الصنف</th>
                                 <th className="p-3 text-center">الكمية</th>
                                 <th className="p-3 text-center">السعر</th>
                                 <th className="p-3 text-center">إزالة</th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                {cart.map((item, idx) => (
                                   <tr key={idx} className="bg-white">
                                      <td className="p-3 font-bold text-slate-800">
                                        {item.name} <br/>
                                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 inline-block">{item.serialNumber}</span>
                                      </td>
                                      <td className="p-3 text-center font-bold text-slate-600">1</td>
                                      <td className="p-3 text-center font-black text-indigo-600">{item.price} ج</td>
                                      <td className="p-3 text-center">
                                        <button 
                                          onClick={() => setCart(cart.filter(i => i.serialNumber !== item.serialNumber))} 
                                          className="text-rose-500 p-1.5 bg-rose-50 rounded hover:bg-rose-100 transition-colors"
                                        >
                                          <Trash2 size={16}/>
                                        </button>
                                      </td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                        <div>
                           <label className="block text-xs font-bold text-slate-500 mb-1">الفني المختص (اختياري)</label>
                           <select 
                             className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none font-bold text-sm bg-white" 
                             value={invoice.technicianName} 
                             onChange={e=>setInvoice({...invoice, technicianName: e.target.value})}
                           >
                              <option value="">-- بدون فني --</option>
                              {(systemSettings.technicians || []).map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-indigo-900 mb-1">الخصم</label>
                           <div className="flex bg-white rounded-xl border border-indigo-100 overflow-hidden">
                              <input 
                                type="number" 
                                className="flex-1 p-2.5 outline-none font-bold text-center text-rose-600 text-sm" 
                                value={invoice.discount} 
                                onChange={e=>setInvoice({...invoice, discount: e.target.value})} 
                                min="0" 
                              />
                              <select 
                                className="bg-slate-50 px-3 font-bold text-xs border-r border-slate-100 outline-none" 
                                value={invoice.discountType} 
                                onChange={e=>setInvoice({...invoice, discountType: e.target.value})}
                              >
                                 <option value="value">ج.م</option>
                                 <option value="percent">%</option>
                              </select>
                           </div>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-indigo-900 mb-1">التركيب / رسوم إضافية</label>
                           <select 
                             className="w-full p-2.5 border border-indigo-100 rounded-xl bg-white font-bold text-xs outline-none focus:border-indigo-500" 
                             value={invoice.installationFeeId} 
                             onChange={e=>setInvoice({...invoice, installationFeeId: e.target.value})}
                           >
                              <option value="">بدون رسوم إضافية</option>
                              {(systemSettings.installationFees || []).map(f => <option key={f.id} value={f.id}>{f.label} (+{f.value} ج)</option>)}
                           </select>
                        </div>
                        <div className="lg:col-span-3 flex justify-end">
                           <button 
                             type="button" 
                             onClick={()=>setInvoice({...invoice, taxEnabled: !invoice.taxEnabled})} 
                             className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 border ${invoice.taxEnabled ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-500'}`}
                           >
                              {invoice.taxEnabled ? <CheckCircle2 size={16}/> : <X size={16}/>} 
                              تطبيق الضريبة المضافة ({systemSettings.taxRate || 14}%)
                           </button>
                        </div>
                    </div>

                    <div className="bg-emerald-900 text-white p-6 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center border-t-4 border-emerald-500 gap-4">
                       <div className="text-right text-xs font-bold text-emerald-100/70 flex flex-wrap gap-4 w-full md:w-auto">
                          <p>المجموع: <span className="text-white text-sm">{calculations.subtotal}</span></p>
                          {calculations.discountAmount > 0 && 
                            <p className="text-rose-300">الخصم: <span>-{calculations.discountAmount.toFixed(1)}</span></p>
                          }
                          <p>الضريبة: <span className="text-white">+{calculations.taxAmount.toFixed(1)}</span></p>
                          {calculations.installAmount > 0 && 
                            <p>رسوم: <span className="text-white">+{calculations.installAmount}</span></p>
                          }
                       </div>
                       <div className="text-center md:text-left w-full md:w-auto">
                          <p className="text-[10px] text-emerald-300 mb-0.5">الصافي للدفع</p>
                          <span className="text-4xl font-black text-emerald-400 tracking-tighter">
                            {calculations.finalTotal.toLocaleString()} <span className="text-sm font-normal">ج.م</span>
                          </span>
                       </div>
                    </div>

                    <button 
                      onClick={handleCheckout} 
                      className="w-full bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-emerald-600 transition-colors flex justify-center items-center gap-2"
                    >
                       <Printer size={24}/> إتمام العملية والطباعة
                    </button>
                 </div>
              )}

              {activeTab === 'history' && (
                 <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-right text-xs">
                       <thead className="bg-slate-50 text-slate-500 border-b">
                          <tr>
                            <th className="p-4">رقم الفاتورة</th>
                            <th className="p-4">المنتجات</th>
                            <th className="p-4 text-center">الفني</th>
                            <th className="p-4 text-center">الصافي</th>
                            <th className="p-4">التاريخ</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100 font-medium">
                          {history.length === 0 ? 
                            <tr><td colSpan="5" className="p-10 text-center text-slate-400 font-bold">لا توجد فواتير أو عمليات سابقة لهذا العميل.</td></tr> :
                             history.map(t => (
                                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                   <td className="p-4 font-mono font-black text-indigo-600">{t.invoiceNumber || t.id.slice(0,6)}</td>
                                   <td className="p-4 font-bold text-slate-800 leading-relaxed max-w-xs">{t.itemName}</td>
                                   <td className="p-4 text-center font-bold text-slate-600">{t.technicianName || '-'}</td>
                                   <td className="p-4 text-center font-black text-emerald-600">{Number(t.finalTotal || t.total || 0).toLocaleString()} ج</td>
                                   <td className="p-4 text-slate-500 text-[10px]">{formatDate(t.timestamp)}</td>
                                </tr>
                             ))
                          }
                       </tbody>
                    </table>
                 </div>
              )}
          </div>
      </div>
  );
}

/* ==========================================================================
   📦 11. REPORTS MANAGER
   ========================================================================== */
function ReportsManager() {
  const [transactions, setTransactions] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadReports = useCallback(async (isNextPage = false) => {
    setLoading(true);
    try {
        let q = query(getCollRef('transactions'), orderBy('timestamp', 'desc'));
        if (isNextPage && lastDoc) {
           q = query(q, startAfter(lastDoc));
        }
        q = query(q, limit(30));
        
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (isNextPage) {
           setTransactions(prev => [...prev, ...fetched]);
        } else {
           setTransactions(fetched);
        }
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 30);
    } catch (e) {
        console.error(e);
    }
    setLoading(false);
  }, [lastDoc]);

  useEffect(() => {
    setLastDoc(null);
    loadReports(false);
  }, [loadReports]);

  const handleExport = () => {
    const exportData = transactions.map(t => ({
      'رقم الفاتورة': t.invoiceNumber || '-',
      'التاريخ': formatDate(t.timestamp),
      'الصنف': t.itemName,
      'السيريال': t.serialNumber,
      'العميل': t.customerName,
      'الفني المختص': t.technicianName || '-',
      'الخصم': t.discountAmount || 0,
      'الصافي': t.finalTotal || t.total || 0,
      'البائع': t.operator
    }));
    exportToCSV(exportData, `Sales_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in text-right" dir="rtl">
       <div className="p-5 border-b flex justify-between items-center bg-slate-50">
         <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
           <History className="text-indigo-600" size={20}/> سجل المبيعات
         </h2>
         <div className="flex items-center gap-3">
             {loading && <Loader2 className="animate-spin text-indigo-500" size={16}/>}
             <button 
               onClick={handleExport} 
               className="flex items-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2 rounded-lg text-xs font-bold transition-colors"
             >
                 <Download size={14} /> تصدير إكسيل
             </button>
         </div>
       </div>
       <div className="overflow-x-auto max-h-[70vh] custom-scrollbar">
          <table className="w-full text-right text-xs">
            <thead className="bg-white text-slate-500 font-bold border-b sticky top-0">
              <tr>
                <th className="p-4">الفاتورة</th>
                <th className="p-4">المنتجات</th>
                <th className="p-4 text-center">العميل / الفني</th>
                <th className="p-4 text-center">الصافي</th>
                <th className="p-4">الوقت/البائع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium">
              {transactions.length === 0 && !loading ? 
                <tr><td colSpan="5" className="p-8 text-center text-slate-400">لا توجد حركات</td></tr> :
                transactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="p-4 font-mono font-bold text-indigo-600">{t.invoiceNumber || t.id.slice(0,6)}</td>
                    <td className="p-4 max-w-xs leading-relaxed">
                      <p className="font-bold text-slate-800">{t.itemName}</p>
                    </td>
                    <td className="p-4 text-center">
                       <p className="font-bold text-slate-700">{t.customerName}</p>
                       <p className="text-[9px] font-bold text-indigo-500 mt-1">{t.technicianName ? `م: ${t.technicianName}` : ''}</p>
                    </td>
                    <td className="p-4 text-center font-black text-emerald-600">{Number(t.finalTotal || t.total || 0).toLocaleString()} ج</td>
                    <td className="p-4 text-slate-500 text-[10px]">
                      <p>{formatDate(t.timestamp)}</p>
                      <p className="opacity-70 mt-0.5">{t.operator}</p>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          {hasMore && !loading && transactions.length >= 30 && (
             <div className="p-4 text-center bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => loadReports(true)} 
                  className="text-indigo-600 font-bold text-xs hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                   تحميل المزيد <ChevronDown size={14}/>
                </button>
             </div>
          )}
       </div>
    </div>
  );
}

/* ==========================================================================
   📦 12. SETTINGS MANAGER
   ========================================================================== */
function SettingsManager({ systemSettings, notify, setGlobalLoading }) {
  const [settings, setSettings] = useState(systemSettings);
  const [newFee, setNewFee] = useState({ label: '', value: 0 });
  const [newTechnician, setNewTechnician] = useState('');
  const importFileInputRef = useRef(null);
  
  const [newCategory, setNewCategory] = useState('');
  const [selectedCategoryIdx, setSelectedCategoryIdx] = useState(null);
  const [newModel, setNewModel] = useState('');

  const handleSave = async () => {
    setGlobalLoading(true);
    try { 
       await setDoc(getDocRef('settings', 'general'), settings, { merge: true }); 
       notify("تم حفظ الإعدادات بنجاح", "success"); 
    } catch(e) { 
       console.error(e);
       notify("فشل حفظ الإعدادات", "error"); 
    }
    setGlobalLoading(false);
  };

  const addFee = () => {
     if(!newFee.label || newFee.value <= 0) return notify("يرجى إدخال اسم وقيمة صحيحة", "warn");
     setSettings({...settings, installationFees: [...(settings.installationFees||[]), {...newFee, id:Date.now().toString()}]}); 
     setNewFee({label:'',value:0});
  };

  const addCategory = () => {
      if(!newCategory.trim()) return;
      const cats = settings.productCategories || [];
      if(cats.find(c => c.name === newCategory.trim())) return notify("هذا المنتج موجود بالفعل", "warn");
      setSettings({...settings, productCategories: [...cats, { name: newCategory.trim(), models: [] }]});
      setNewCategory('');
  };

  const deleteCategory = (idx) => {
      const cats = [...(settings.productCategories || [])];
      cats.splice(idx, 1);
      setSettings({...settings, productCategories: cats});
      if(selectedCategoryIdx === idx) setSelectedCategoryIdx(null);
  };

  const addModel = () => {
      if(selectedCategoryIdx === null || !newModel.trim()) return;
      const cats = [...(settings.productCategories || [])];
      if(!cats[selectedCategoryIdx].models.includes(newModel.trim())){
         cats[selectedCategoryIdx].models.push(newModel.trim());
         setSettings({...settings, productCategories: cats});
      }
      setNewModel('');
  };

  const deleteModel = (modelName) => {
      if(selectedCategoryIdx === null) return;
      const cats = [...(settings.productCategories || [])];
      cats[selectedCategoryIdx].models = cats[selectedCategoryIdx].models.filter(m => m !== modelName);
      setSettings({...settings, productCategories: cats});
  };

  const handleExportSystem = async () => {
      if(!window.confirm("سيتم تصدير جميع بيانات النظام في ملف واحد. هل تريد المتابعة؟")) return;
      setGlobalLoading(true);
      try {
          const collectionsToBackup = ['inventory', 'transactions', 'customers', 'employees', 'warehouses', 'serial_registry', 'transfers', 'activity_logs'];
          const backupData = {};
          
          const settingsSnap = await getDoc(getDocRef('settings', 'general'));
          backupData.settings = settingsSnap.exists() ? { general: settingsSnap.data() } : {};

          for (const coll of collectionsToBackup) {
              const snap = await getDocs(getCollRef(coll));
              backupData[coll] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
          }

          const dataStr = JSON.stringify(backupData);
          const blob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Nouval_Backup_${new Date().toISOString().split('T')[0]}.json`;
          link.click();
          notify("تم تصدير النسخة الاحتياطية بنجاح", "success");
      } catch (error) {
          console.error(error);
          notify("حدث خطأ أثناء التصدير", "error");
      }
      setGlobalLoading(false);
  };

  const handleImportSystem = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if(!window.confirm("تحذير خطير: استيراد هذا الملف سيؤدي إلى كتابة البيانات فوق قاعدة البيانات الحالية. هل أنت متأكد تماماً من هذه الخطوة؟")) {
          e.target.value = null;
          return;
      }
      
      setGlobalLoading(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const backupData = JSON.parse(event.target.result);
              
              if (backupData.settings && backupData.settings.general) {
                  await setDoc(getDocRef('settings', 'general'), reviveTimestamps(backupData.settings.general));
              }

              const collectionsToRestore = ['inventory', 'transactions', 'customers', 'employees', 'warehouses', 'serial_registry', 'transfers', 'activity_logs'];
              
              for (const coll of collectionsToRestore) {
                  if (backupData[coll] && Array.isArray(backupData[coll])) {
                      const items = backupData[coll];
                      const chunks = [];
                      for (let i = 0; i < items.length; i += 400) {
                          chunks.push(items.slice(i, i + 400));
                      }
                      
                      for (const chunk of chunks) {
                          const batch = writeBatch(db);
                          chunk.forEach(item => {
                              const { _id, ...data } = item;
                              const revivedData = reviveTimestamps(data);
                              const docRef = _id ? doc(getCollRef(coll), _id) : doc(getCollRef(coll));
                              batch.set(docRef, revivedData);
                          });
                          await batch.commit();
                      }
                  }
              }
              
              notify("تم استيراد البيانات واستعادة النظام بنجاح!", "success");
              setTimeout(() => window.location.reload(), 2000);
          } catch (err) {
              console.error(err);
              notify("حدث خطأ أثناء استيراد البيانات، تأكد من أن الملف سليم.", "error");
          }
          setGlobalLoading(false);
          e.target.value = null;
      };
      reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in text-right" dir="rtl">
       <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-8 border-b pb-4">
             <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
               <Settings className="text-indigo-600" size={24}/> الإعدادات المركزية
             </h2>
             <button 
               onClick={handleSave} 
               className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700 flex items-center gap-2 transition-all active:scale-95"
             >
               <Save size={18}/> حفظ التغييرات
             </button>
          </div>
          
          <div className="space-y-10">
             
             <div className="space-y-4">
                <h3 className="font-bold text-indigo-900 border-r-4 border-indigo-600 pr-3">بيانات النظام وتخصيص الفاتورة</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                   <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">اسم النظام الداخلي</label>
                      <input 
                        className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 text-sm bg-white" 
                        value={settings.systemName} 
                        onChange={e=>setSettings({...settings, systemName:e.target.value})} 
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">الاسم التجاري (للفاتورة)</label>
                      <input 
                        className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 text-sm bg-white" 
                        value={settings.storeName} 
                        onChange={e=>setSettings({...settings, storeName:e.target.value})} 
                      />
                   </div>
                   <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-2">
                        <ImageIcon size={14}/> رابط الشعار (Logo URL)
                      </label>
                      <input 
                        className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 text-sm bg-white font-mono" 
                        placeholder="https://example.com/logo.png" 
                        dir="ltr" 
                        value={settings.invoiceLogo || ''} 
                        onChange={e=>setSettings({...settings, invoiceLogo:e.target.value})} 
                      />
                      <p className="text-[10px] text-slate-400 mt-1">ضع رابط صورة بصيغة PNG أو JPG لتظهر أعلى الفاتورة المطبوعة.</p>
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">نسبة الضريبة الافتراضية (%)</label>
                      <input 
                        type="number" 
                        className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 text-sm bg-white text-center" 
                        value={settings.taxRate || 14} 
                        onChange={e=>setSettings({...settings, taxRate: Number(e.target.value)})} 
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">شكل الفاتورة المطبوعة</label>
                      <select 
                        className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 text-sm bg-white" 
                        value={settings.invoiceDisplayMode || 'detailed'} 
                        onChange={e=>setSettings({...settings, invoiceDisplayMode:e.target.value})}
                      >
                         <option value="detailed">عرض تفصيلي (إظهار سعر كل صنف)</option>
                         <option value="total_only">عرض مجمع (إخفاء أسعار الأصناف، إظهار الإجمالي فقط)</option>
                      </select>
                   </div>
                   <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1">نص الفاتورة (سياسة الاستبدال)</label>
                      <textarea 
                        rows={2} 
                        className="w-full border border-slate-200 p-4 rounded-xl font-bold outline-none focus:border-indigo-500 resize-none text-xs bg-white" 
                        value={settings.footerText} 
                        onChange={e=>setSettings({...settings, footerText:e.target.value})} 
                      />
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                   <h3 className="font-bold text-indigo-900 border-r-4 border-indigo-600 pr-3 mb-4">الرسوم الثابتة (تركيب، شحن)</h3>
                   <div className="flex flex-col sm:flex-row gap-2 mb-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                      <input 
                        className="flex-1 border-none bg-transparent p-2 font-bold outline-none text-xs" 
                        placeholder="مثال: رسوم شحن..." 
                        value={newFee.label} 
                        onChange={e=>setNewFee({...newFee, label:e.target.value})}
                      />
                      <div className="flex items-center gap-2 border-r pr-2">
                         <input 
                           type="number" 
                           min="0" 
                           className="w-16 border-none bg-slate-50 rounded-lg p-2 font-black outline-none text-center text-indigo-600 text-sm" 
                           value={newFee.value} 
                           onChange={e=>setNewFee({...newFee, value:e.target.value})}
                         />
                      </div>
                      <button 
                        onClick={addFee} 
                        className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-black transition-colors text-xs whitespace-nowrap"
                      >
                        إضافة
                      </button>
                   </div>
                   <div className="space-y-2">
                      {(!settings.installationFees || settings.installationFees.length === 0) ? (
                         <p className="text-center text-slate-400 font-bold text-xs py-4">لا توجد رسوم مضافة.</p>
                      ) : settings.installationFees.map(f => (
                         <div key={f.id} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                            <span className="text-slate-700 text-xs font-bold truncate">{f.label}</span>
                            <div className="flex items-center gap-2">
                               <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-black">{f.value} ج</span>
                               <button 
                                 onClick={()=>setSettings({...settings, installationFees: settings.installationFees.filter(x=>x.id!==f.id)})} 
                                 className="text-slate-400 hover:text-rose-500 bg-slate-50 p-1.5 rounded-md"
                               >
                                 <Trash2 size={14}/>
                               </button>
                            </div>
                         </div>
                      ))}
                   </div>
                </div>

                <div className="bg-sky-50/50 p-6 rounded-2xl border border-sky-100">
                   <h3 className="font-bold text-sky-900 border-r-4 border-sky-600 pr-3 mb-4">قائمة الفنيين ومندوبي الصيانة</h3>
                   <div className="flex gap-2 mb-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                      <input 
                        className="flex-1 border-none bg-transparent p-2 font-bold outline-none text-xs" 
                        placeholder="اسم الفني..." 
                        value={newTechnician} 
                        onChange={e=>setNewTechnician(e.target.value)}
                      />
                      <button 
                        onClick={() => {
                            if(!newTechnician.trim()) return;
                            const techs = settings.technicians || [];
                            if(techs.includes(newTechnician.trim())) return notify("هذا الاسم موجود مسبقاً", "warn");
                            setSettings({...settings, technicians: [...techs, newTechnician.trim()]});
                            setNewTechnician('');
                        }} 
                        className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-black transition-colors text-xs whitespace-nowrap"
                      >
                        تسجيل
                      </button>
                   </div>
                   <div className="flex flex-wrap gap-2">
                      {(!settings.technicians || settings.technicians.length === 0) ? (
                         <p className="text-slate-400 font-bold text-xs py-2 w-full text-center">لا يوجد فنيين مسجلين.</p>
                      ) : settings.technicians.map((tech, idx) => (
                         <div key={idx} className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                            <span className="text-xs font-bold text-slate-700">{tech}</span>
                            <button 
                              onClick={()=>setSettings({...settings, technicians: settings.technicians.filter(t => t !== tech)})} 
                              className="text-slate-300 hover:text-rose-500"
                            >
                              <X size={14}/>
                            </button>
                         </div>
                      ))}
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <h3 className="font-bold text-emerald-900 border-r-4 border-emerald-600 pr-3">ربط المنتجات بالموديلات (لصيانة وسجل العملاء)</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                   
                   <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
                      <div className="p-4 border-b bg-slate-50">
                         <h4 className="font-bold text-xs text-slate-600 mb-3">المنتجات (مثال: مكنسة، شاشة)</h4>
                         <div className="flex gap-2">
                            <input 
                              className="flex-1 border border-slate-200 p-2 rounded-lg text-xs font-bold outline-none focus:border-emerald-500" 
                              value={newCategory} 
                              onChange={e=>setNewCategory(e.target.value)} 
                              placeholder="منتج جديد..." 
                            />
                            <button onClick={addCategory} className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700">
                              <Plus size={16}/>
                            </button>
                         </div>
                      </div>
                      <div className="flex-1 overflow-y-auto max-h-64 custom-scrollbar p-2 space-y-1">
                         {(!settings.productCategories || settings.productCategories.length === 0) ? (
                            <p className="text-center text-slate-400 text-[10px] py-4">أضف منتجاً لتبدأ</p>
                         ) : settings.productCategories.map((cat, idx) => (
                            <div 
                              key={idx} 
                              onClick={()=>setSelectedCategoryIdx(idx)} 
                              className={`flex justify-between items-center p-3 rounded-xl cursor-pointer transition-colors border ${selectedCategoryIdx === idx ? 'bg-emerald-50 border-emerald-200' : 'hover:bg-slate-50 border-transparent'}`}
                            >
                               <span className={`text-xs font-bold ${selectedCategoryIdx === idx ? 'text-emerald-800' : 'text-slate-700'}`}>
                                 {cat.name}
                               </span>
                               <button onClick={(e)=>{e.stopPropagation(); deleteCategory(idx);}} className="text-slate-400 hover:text-rose-500">
                                 <Trash2 size={14}/>
                               </button>
                            </div>
                         ))}
                      </div>
                   </div>

                   <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
                      {selectedCategoryIdx === null ? (
                         <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10">
                            <Package size={32} className="mb-2 opacity-20"/>
                            <p className="text-sm font-bold">اختر منتجاً من القائمة اليمنى لإدارة موديلاته</p>
                         </div>
                      ) : (
                         <>
                            <div className="p-4 border-b bg-white flex justify-between items-center">
                               <h4 className="font-bold text-sm text-emerald-700">الموديلات التابعة لـ ({settings.productCategories[selectedCategoryIdx].name})</h4>
                               <div className="flex gap-2 w-1/2">
                                  <input 
                                    className="flex-1 border border-slate-200 p-2 rounded-lg text-xs font-bold outline-none focus:border-emerald-500 bg-slate-50" 
                                    value={newModel} 
                                    onChange={e=>setNewModel(e.target.value)} 
                                    placeholder="رقم/اسم الموديل..." 
                                  />
                                  <button onClick={addModel} className="bg-slate-800 text-white px-3 rounded-lg text-xs font-bold hover:bg-black">
                                    إضافة
                                  </button>
                               </div>
                            </div>
                            <div className="flex-1 p-4">
                               <div className="flex flex-wrap gap-2">
                                  {settings.productCategories[selectedCategoryIdx].models.length === 0 ? (
                                     <p className="text-slate-400 text-xs w-full text-center py-4">لا توجد موديلات مضافة لهذا المنتج.</p>
                                  ) : settings.productCategories[selectedCategoryIdx].models.map((mod, idx) => (
                                     <div key={idx} className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                                        <span className="text-xs font-bold text-slate-700">{mod}</span>
                                        <button onClick={()=>deleteModel(mod)} className="text-slate-300 hover:text-rose-500">
                                          <X size={14}/>
                                        </button>
                                     </div>
                                  ))}
                               </div>
                            </div>
                         </>
                      )}
                   </div>
                </div>
             </div>

             <div className="bg-rose-50/50 p-6 rounded-2xl border border-rose-100 mt-6">
                <h3 className="font-bold text-rose-900 border-r-4 border-rose-600 pr-3 mb-4 flex items-center gap-2">
                    <Database size={18}/> استيراد وتصدير قاعدة البيانات (النسخ الاحتياطي)
                </h3>
                <p className="text-xs text-rose-700 mb-6 font-bold leading-relaxed">هذه الأداة تسمح لك بأخذ نسخة احتياطية من جميع بيانات النظام (الأصناف، العملاء، الفواتير، الموظفين، والإعدادات) لتأمينها أو نقلها، واستعادتها لاحقاً بضغطة زر.</p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                    <button onClick={handleExportSystem} className="flex-1 bg-white border border-rose-200 text-rose-700 py-3.5 rounded-xl font-black text-sm hover:bg-rose-50 hover:border-rose-300 transition-all flex items-center justify-center gap-2 shadow-sm">
                        <DownloadCloud size={20}/> تصدير النظام بالكامل (.json)
                    </button>
                    
                    <input type="file" accept=".json" ref={importFileInputRef} onChange={handleImportSystem} className="hidden" />
                    
                    <button onClick={() => importFileInputRef.current?.click()} className="flex-1 bg-rose-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-rose-700 transition-all flex items-center justify-center gap-2 shadow-md">
                        <UploadCloud size={20}/> استعادة نسخة احتياطية (Import)
                    </button>
                </div>
             </div>

          </div>
       </div>
    </div>
  );
}

/* ==========================================================================
   📦 13. USER MANAGEMENT
   ========================================================================== */
function UserManagement({ appUser, warehouses, notify, setGlobalLoading, onViewProfile }) {
  const [usersList, setUsersList] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', phone: '', pass: '', role: 'user', assignedWarehouseId: 'main' });

  useEffect(() => {
    if (appUser?.role !== 'admin') return;
    const unsub = onSnapshot(getCollRef('employees'), snap => setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [appUser]);

  const handleUpdateUser = async (e) => {
     e.preventDefault(); 
     if (!editingUser) return;
     setGlobalLoading(true);
     try {
        const dataToUpdate = {
            name: editingUser.name,
            phone: editingUser.phone || '',
            role: editingUser.role,
            assignedWarehouseId: editingUser.assignedWarehouseId,
            isDisabled: editingUser.isDisabled || false,
            permissions: editingUser.permissions || {}
        };
        await updateDoc(getDocRef('employees', editingUser.id), dataToUpdate);
        logUserActivity(appUser, 'تعديل بيانات موظف', `تعديل صلاحيات أو بيانات الموظف: ${editingUser.name}`);
        notify("تم حفظ الإعدادات", "success"); 
        setEditingUser(null);
     } catch(e) { 
        console.error(e);
        notify("حدث خطأ في حفظ الإعدادات", "error"); 
     }
     setGlobalLoading(false);
  };

  const handleAddUser = async (e) => {
     e.preventDefault();
     if (!newUser.email || !newUser.pass || !newUser.name) return notify("الرجاء إدخال جميع البيانات المطلوبة", "warn");
     
     setGlobalLoading(true);
     try {
        const emailToSave = newUser.email.trim().toLowerCase();
        const q = query(getCollRef('employees'), where('email', '==', emailToSave));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            notify("المستخدم موجود بالفعل بهذا البريد الإلكتروني!", "error");
            setGlobalLoading(false);
            return;
        }
        
        let defaultPermissions = {};
        if (newUser.role === 'admin') {
            defaultPermissions = ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {});
        } else {
            defaultPermissions = { 
              viewDashboard: true, 
              viewInventory: true, 
              viewPOS: true, 
              viewCustomers: true 
            };
        }

        await addDoc(getCollRef('employees'), {
            email: emailToSave,
            pass: newUser.pass,
            name: newUser.name,
            phone: newUser.phone || '',
            role: newUser.role,
            assignedWarehouseId: newUser.assignedWarehouseId,
            permissions: defaultPermissions,
            isDisabled: false,
            createdAt: serverTimestamp()
        });
        
        logUserActivity(appUser, 'إضافة موظف', `إنشاء حساب للموظف: ${newUser.name}`);
        notify("تم إضافة المستخدم بنجاح", "success");
        setShowAddModal(false);
        setNewUser({ name: '', email: '', phone: '', pass: '', role: 'user', assignedWarehouseId: 'main' });
     } catch (err) {
        console.error(err);
        notify("حدث خطأ أثناء إضافة المستخدم", "error");
     }
     setGlobalLoading(false);
  };

  const handleDeleteUser = async (id, name) => {
     if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${name}" بشكل نهائي؟ لا يمكن التراجع عن هذه الخطوة.`)) return;
     
     setGlobalLoading(true);
     try {
        await deleteDoc(getDocRef('employees', id));
        logUserActivity(appUser, 'حذف موظف', `تم حذف حساب الموظف: ${name}`);
        notify("تم حذف المستخدم بنجاح", "success");
     } catch (e) {
        console.error(e);
        notify("حدث خطأ أثناء الحذف", "error");
     }
     setGlobalLoading(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in text-right" dir="rtl">
       {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="font-black text-xl mb-6 border-b pb-4 flex items-center gap-2">
              <UserCog className="text-indigo-600"/> إعدادات الموظف ({editingUser.email})
            </h3>
            <form onSubmit={handleUpdateUser} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">اسم الموظف</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 p-3 rounded-xl font-bold bg-slate-50 outline-none focus:border-indigo-500" 
                       value={editingUser.name} 
                       onChange={e=>setEditingUser({...editingUser, name:e.target.value})} 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">رقم الهاتف</label>
                     <input 
                       className="w-full border border-slate-200 p-3 rounded-xl font-bold font-mono bg-slate-50 outline-none focus:border-indigo-500" 
                       value={editingUser.phone || ''} 
                       onChange={e=>setEditingUser({...editingUser, phone:e.target.value})} 
                       dir="ltr" 
                     />
                  </div>
               </div>
               
               <div className="grid grid-cols-2 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">الرتبة</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-white outline-none focus:border-indigo-500" 
                      value={editingUser.role} 
                      onChange={e=>setEditingUser({...editingUser, role:e.target.value})}
                    >
                       <option value="user">موظف مبيعات</option>
                       <option value="admin">مدير نظام</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">الفرع المخصص</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-white outline-none focus:border-indigo-500" 
                      value={editingUser.assignedWarehouseId} 
                      onChange={e=>setEditingUser({...editingUser, assignedWarehouseId:e.target.value})}
                    >
                       {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
               </div>
               
               <div>
                  <h4 className="font-bold text-sm text-slate-800 mb-3">الصلاحيات المتاحة</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                     {ALL_PERMISSIONS.map(p => (
                        <label 
                          key={p.key} 
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${editingUser.permissions?.[p.key] ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white opacity-60 hover:opacity-100'}`}
                        >
                           <input 
                             type="checkbox" 
                             className="w-4 h-4 accent-indigo-600" 
                             checked={editingUser.permissions?.[p.key] || false} 
                             onChange={e=>setEditingUser({...editingUser, permissions: {...editingUser.permissions, [p.key]: e.target.checked}})} 
                           />
                           <span className="text-xs font-bold">{p.label}</span>
                        </label>
                     ))}
                  </div>
               </div>

               <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <input 
                        type="checkbox" 
                        id="disableUser" 
                        className="w-4 h-4 accent-rose-600" 
                        checked={editingUser.isDisabled || false} 
                        onChange={e => setEditingUser({...editingUser, isDisabled: e.target.checked})} 
                    />
                    <label htmlFor="disableUser" className="text-sm font-bold text-slate-700 cursor-pointer">تعطيل الحساب (منع الدخول)</label>
                </div>

               <div className="flex gap-3 pt-4">
                 <button type="submit" className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-colors">حفظ التعديلات</button>
                 <button type="button" onClick={()=>setEditingUser(null)} className="flex-1 bg-slate-100 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors">إلغاء</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="font-black text-xl mb-6 border-b pb-4 flex items-center gap-2">
              <UserCog className="text-indigo-600"/> إضافة مستخدم جديد
            </h3>
            <form onSubmit={handleAddUser} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">اسم الموظف *</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 p-3 rounded-xl font-bold bg-slate-50 outline-none focus:border-indigo-500" 
                       value={newUser.name} 
                       onChange={e=>setNewUser({...newUser, name:e.target.value})} 
                       placeholder="الاسم بالكامل" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">رقم الهاتف</label>
                     <input 
                       className="w-full border border-slate-200 p-3 rounded-xl font-bold font-mono bg-slate-50 outline-none focus:border-indigo-500" 
                       value={newUser.phone} 
                       onChange={e=>setNewUser({...newUser, phone:e.target.value})} 
                       placeholder="01XXXXXXXXX" 
                       dir="ltr" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">البريد الإلكتروني *</label>
                     <input 
                       type="email" 
                       required 
                       className="w-full border border-slate-200 p-3 rounded-xl font-bold font-mono bg-slate-50 outline-none focus:border-indigo-500" 
                       value={newUser.email} 
                       onChange={e=>setNewUser({...newUser, email:e.target.value})} 
                       placeholder="employee@domain.com" 
                       dir="ltr" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">كلمة المرور *</label>
                     <input 
                       type="text" 
                       required 
                       className="w-full border border-slate-200 p-3 rounded-xl font-bold font-mono bg-slate-50 outline-none focus:border-indigo-500" 
                       value={newUser.pass} 
                       onChange={e=>setNewUser({...newUser, pass:e.target.value})} 
                       placeholder="كلمة المرور للدخول" 
                       dir="ltr" 
                     />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">الرتبة</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-slate-50 outline-none focus:border-indigo-500" 
                      value={newUser.role} 
                      onChange={e=>setNewUser({...newUser, role:e.target.value})}>
                       <option value="user">موظف مبيعات</option>
                       <option value="admin">مدير نظام</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1">الفرع المخصص</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-slate-50 outline-none focus:border-indigo-500" 
                      value={newUser.assignedWarehouseId} 
                      onChange={e=>setNewUser({...newUser, assignedWarehouseId:e.target.value})}>
                       {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
               </div>
               
               <div className="flex gap-3 pt-4 border-t">
                 <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors flex justify-center items-center gap-2">
                   <Plus size={18}/> إنشاء الحساب
                 </button>
                 <button type="button" onClick={()=>setShowAddModal(false)} className="px-6 bg-slate-100 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors">إلغاء</button>
               </div>
            </form>
          </div>
        </div>
      )}

       <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b bg-slate-50 flex flex-wrap justify-between items-center gap-4">
             <div className="flex items-center gap-3">
                <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
                  <Shield className="text-indigo-600" size={20}/> فريق العمل والصلاحيات
                </h3>
                <div className="bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-lg font-bold text-xs">{usersList.length} مستخدم</div>
             </div>
             <button 
               onClick={()=>setShowAddModal(true)} 
               className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm whitespace-nowrap"
             >
                <Plus size={14}/> إضافة مستخدم
             </button>
          </div>
          <div className="overflow-x-auto">
             <table className="w-full text-right text-sm">
                <thead className="bg-white border-b text-slate-500 font-bold">
                   <tr>
                     <th className="p-5">الموظف</th>
                     <th className="p-5 text-center">الفرع</th>
                     <th className="p-5 text-center">الرتبة</th>
                     <th className="p-5 text-center">الحالة</th>
                     <th className="p-5 text-center">إدارة</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-medium">
                   {usersList.map(u => (
                     <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-5">
                          <p className="text-slate-800 font-bold">{u.name || 'مستخدم جديد'}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-1" dir="ltr">{u.email}</p>
                        </td>
                        <td className="p-5 text-center font-bold text-indigo-600 text-xs">
                          {warehouses.find(w=>w.id===u.assignedWarehouseId)?.name || 'الرئيسي'}
                        </td>
                        <td className="p-5 text-center">
                          <span className={`px-3 py-1 rounded-md text-[10px] font-bold ${u.role==='admin'?'bg-purple-100 text-purple-700':'bg-slate-100 text-slate-600'}`}>
                            {u.role==='admin'?'مدير':'موظف'}
                          </span>
                        </td>
                        <td className="p-5 text-center">
                            {u.isDisabled ? 
                                <span className="px-3 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">موقوف</span> : 
                                <span className="px-3 py-1 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">نشط</span>
                            }
                        </td>
                        <td className="p-5 text-center flex justify-center gap-2">
                            <button 
                              onClick={() => onViewProfile(u)} 
                              className="p-2 bg-sky-50 text-sky-600 rounded-lg hover:bg-sky-600 hover:text-white transition-colors shadow-sm" 
                              title="عرض نشاط الموظف"
                            >
                              <Eye size={16}/>
                            </button>
                            <button 
                              onClick={()=>setEditingUser({...u, permissions: u.permissions || {}})} 
                              className="p-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors shadow-sm" 
                              title="إدارة الصلاحيات والبيانات"
                            >
                              <Settings size={16}/>
                            </button>
                            <button 
                              onClick={()=>handleDeleteUser(u.id, u.name || u.email)} 
                              disabled={appUser.id === u.id} 
                              className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" 
                              title={appUser.id === u.id ? "لا يمكنك حذف حسابك الحالي" : "حذف المستخدم"}
                            >
                              <Trash2 size={16}/>
                            </button>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
}

/* ==========================================================================
   📦 14. WAREHOUSE MANAGER
   ========================================================================== */
function WarehouseManager({ warehouses, notify, setGlobalLoading }) {
   const [name, setName] = useState('');
   
   const handleAdd = async (e) => {
      e.preventDefault(); 
      if(!name) return;
      setGlobalLoading(true);
      try { 
        await addDoc(getCollRef('warehouses'), { name, createdAt: serverTimestamp() }); 
        notify("تم إضافة الفرع بنجاح"); 
        setName(''); 
      } catch(e) { 
        console.error(e);
        notify("فشل الإضافة", "error"); 
      }
      setGlobalLoading(false);
   };

   const handleDelete = async (id) => {
      if (!window.confirm('حذف الفرع؟')) return;
      setGlobalLoading(true);
      try {
        await deleteDoc(getDocRef('warehouses', id));
        notify("تم حذف الفرع", "success");
      } catch(e) {
        console.error(e);
        notify("فشل الحذف", "error");
      }
      setGlobalLoading(false);
   };

   return (
      <div className="space-y-6 text-right" dir="rtl">
         <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="font-black text-xl mb-6 flex items-center gap-2 text-slate-800">
              <Store className="text-indigo-600"/> إدارة فروع ومخازن الشركة
            </h3>
            <form onSubmit={handleAdd} className="flex gap-3">
               <input 
                 required 
                 className="flex-1 border border-slate-200 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 text-sm" 
                 placeholder="أدخل اسم الفرع الجديد (مثال: فرع المعادي)" 
                 value={name} 
                 onChange={e=>setName(e.target.value)} 
               />
               <button className="bg-slate-900 text-white px-8 rounded-xl font-bold shadow-md hover:bg-black transition-colors flex items-center gap-2">
                 <Plus size={18}/> إضافة
               </button>
            </form>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {warehouses.map(w=>(
               <div key={w.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center hover:border-indigo-500 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-400 group-hover:text-indigo-600 transition-colors">
                      <MapPin size={24}/>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{w.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">{w.id==='main'?'المركز الرئيسي':'فرع مبيعات'}</p>
                    </div>
                  </div>
                  {w.id!=='main' && (
                    <button 
                      onClick={()=>handleDelete(w.id)} 
                      className="text-slate-300 hover:text-red-500 p-2 transition-colors"
                    >
                      <Trash2 size={18}/>
                    </button>
                  )}
               </div>
            ))}
         </div>
      </div>
   );
}

/* ==========================================================================
   📦 15. EMPLOYEE PROFILE VIEW
   ========================================================================== */
function EmployeeProfileView({ userToView, warehouseMap }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userToView) return;
    setLoading(true);
    const q = query(
        getCollRef('activity_logs'), 
        where('userId', '==', userToView.id), 
        orderBy('timestamp', 'desc'), 
        limit(50)
    );
    
    const unsub = onSnapshot(q, snap => {
        setActivities(snap.docs.map(d => ({id: d.id, ...d.data()})));
        setLoading(false);
    }, (error) => {
        console.error(error);
        setLoading(false);
    });

    return () => unsub();
  }, [userToView]);

  if (!userToView) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-right animate-in fade-in" dir="rtl">
       <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden">
          <div className="w-24 h-24 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-3xl flex items-center justify-center font-black text-4xl text-white shadow-xl shadow-indigo-200 shrink-0">
            {userToView.name?.charAt(0) || userToView.email?.charAt(0) || '?'}
          </div>
          <div className="flex-1 text-center md:text-right">
            <h2 className="text-3xl font-black text-slate-800 mb-2">{userToView.name}</h2>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm font-bold">
               <span className="text-slate-500 font-mono" dir="ltr">{userToView.email}</span>
               {userToView.phone && <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg">{userToView.phone}</span>}
               <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg">الفرع: {warehouseMap[userToView.assignedWarehouseId] || 'الرئيسي'}</span>
               <span className={`px-3 py-1 rounded-lg ${userToView.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {userToView.role === 'admin' ? 'مدير نظام' : 'موظف'}
               </span>
            </div>
            <p className="mt-4 text-xs text-rose-500 font-bold bg-rose-50 p-3 rounded-xl border border-rose-100 w-fit mx-auto md:mx-0">
                لطلب تعديل بياناتك الشخصية (الاسم، كلمة المرور، أو الفرع)، يرجى الرجوع لمدير النظام.
            </p>
          </div>
       </div>

       <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
           <h3 className="font-black text-xl text-slate-800 flex items-center gap-2 mb-8 border-b pb-4">
              <Activity className="text-indigo-600" size={24}/> سجل نشاطات الموظف (آخر 50 حركة)
           </h3>
           
           {loading ? (
               <div className="flex justify-center p-10"><Loader2 className="animate-spin text-indigo-500" size={32}/></div>
           ) : activities.length === 0 ? (
               <div className="text-center p-12 text-slate-400 font-bold border-2 border-dashed border-slate-100 rounded-2xl">
                   لا توجد نشاطات مسجلة لهذا الموظف حتى الآن.
               </div>
           ) : (
               <div className="relative border-r-2 border-indigo-100 pr-6 ml-2 space-y-6">
                   {activities.map((act) => (
                       <div key={act.id} className="relative">
                           <span className="absolute -right-[33px] top-1.5 w-4 h-4 bg-white border-2 border-indigo-400 rounded-full"></span>
                           <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors">
                               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                   <span className="font-black text-sm text-indigo-900">{act.action}</span>
                                   <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-200 w-fit">
                                       {formatDate(act.timestamp)}
                                   </span>
                               </div>
                               <p className="text-xs font-bold text-slate-600 leading-relaxed">{act.details}</p>
                           </div>
                       </div>
                   ))}
               </div>
           )}
       </div>
    </div>
  );
}

/* ==========================================================================
   🚀 16. MAIN APP ROUTER & WRAPPER
   ========================================================================== */

export default function App() {
  const [appUser, setAppUser] = useState(null);
  const [fbReady, setFbReady] = useState(false);
  
  const [currentView, setCurrentView] = useState('dashboard');
  const [viewedUser, setViewedUser] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  const [warehouses, setWarehouses] = useState([{id: 'main', name: 'المخزن الرئيسي'}]);
  const [warehouseMap, setWarehouseMap] = useState({'main': 'المخزن الرئيسي'});
  const [systemSettings, setSystemSettings] = useState({ 
    systemName: 'نوڤال ERP', 
    storeName: 'نوڤال للإلكترونيات', 
    invoiceLogo: '',
    invoiceDisplayMode: 'detailed',
    taxRate: 14,
    footerText: 'شكراً لتعاملكم معنا.', 
    installationFees: [],
    productCategories: [],
    technicians: []
  });

  const notify = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline); 
    window.addEventListener('offline', handleOffline);
    
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  useEffect(() => {
    const initAuth = async () => {
       try {
           await signInAnonymously(auth);
       } catch(e) {
           console.error("Firebase Auth Initialization Failed", e);
       } finally {
           setFbReady(true);
       }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!appUser || !fbReady) return;

    const unsubS = onSnapshot(getDocRef('settings', 'general'), (d) => {
       if (d.exists()) {
           setSystemSettings(prev => ({...prev, ...d.data()}));
       } else {
           setDoc(getDocRef('settings', 'general'), systemSettings).catch(console.error);
       }
    }, (error) => {
        console.error("Error fetching settings:", error);
        notify("فشل في تحميل الإعدادات", "error");
    });

    const unsubW = onSnapshot(getCollRef('warehouses'), (s) => {
       const whs = [{id: 'main', name: 'المخزن الرئيسي'}];
       s.docs.forEach(d => whs.push({id:d.id, ...d.data()}));
       setWarehouses(whs);
       const m = {}; 
       whs.forEach(w => m[w.id] = w.name); 
       setWarehouseMap(m);
    }, (error) => {
        console.error("Error fetching warehouses:", error);
    });

    return () => { 
        unsubS(); 
        unsubW(); 
    };
  }, [appUser, fbReady, notify]); 

  const handleLogout = () => {
     setAppUser(null);
     setCurrentView('dashboard');
  };

  const openProfileView = (user) => {
      setViewedUser(user);
      setCurrentView('user_profile');
      setIsMobileOpen(false);
  };

  if (!appUser) {
    return (
      <>
        <LoginScreen 
          fbReady={fbReady} 
          onLoginSuccess={setAppUser} 
          systemSettings={systemSettings} 
          notify={notify} 
        />
        <div className="fixed top-6 left-6 z-[200] flex flex-col gap-2">
          {notifications.map(n => (
             <div 
               key={n.id} 
               className={`p-4 rounded-xl shadow-lg text-white font-bold text-xs animate-in slide-in-from-left-5 border-l-4 flex items-center gap-2 ${n.type==='error' || n.type==='warn' ? 'bg-slate-900 border-red-500' : 'bg-slate-900 border-emerald-500'}`}
             >
                {n.type === 'error' || n.type === 'warn' ? <AlertTriangle size={16} className="text-red-500"/> : <CheckCircle2 size={16} className="text-emerald-500"/>}
                {n.msg}
             </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden text-right selection:bg-indigo-100" dir="rtl">
      
      <div className="fixed top-6 left-6 z-[200] flex flex-col gap-2">
        {notifications.map(n => (
           <div 
             key={n.id} 
             className={`p-4 rounded-xl shadow-lg text-white font-bold text-xs animate-in slide-in-from-left-5 border-l-4 flex items-center gap-2 ${n.type==='error' || n.type==='warn' ? 'bg-slate-900 border-red-500' : 'bg-slate-900 border-emerald-500'}`}
           >
              {n.type === 'error' || n.type === 'warn' ? <AlertTriangle size={16} className="text-red-500"/> : <CheckCircle2 size={16} className="text-emerald-500"/>}
              {n.msg}
           </div>
        ))}
      </div>

      {globalLoading && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[300] flex items-center justify-center">
            <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3 font-bold text-indigo-700 animate-in zoom-in-95">
               <Loader2 className="w-8 h-8 animate-spin" /> 
               <span className="text-sm">جاري المعالجة...</span>
            </div>
         </div>
      )}

      <>
        {isMobileOpen && <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsMobileOpen(false)} />}
        <aside className={`fixed lg:static inset-y-0 right-0 z-50 w-64 bg-[#0f172a] text-slate-300 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out print:hidden ${isMobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
          <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/50">
             <div className="flex items-center gap-3">
               <div className="p-1.5 bg-indigo-600 rounded-lg text-white"><Package size={18}/></div>
               <span className="font-black text-white truncate">{systemSettings.systemName}</span>
             </div>
          </div>
          <nav className="p-4 flex-1 space-y-1 overflow-y-auto custom-scrollbar">
             <p className="px-3 text-[10px] font-bold text-slate-500 uppercase mb-2 mt-2">القائمة</p>
             {[
               { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, permission: 'viewDashboard' },
               { id: 'inventory', label: 'إدارة المخزون', icon: Package, permission: 'viewInventory' },
               { id: 'transfers', label: 'التحويلات المخزنية', icon: ArrowRightLeft, permission: 'viewInventory' },
               { id: 'transactions', label: 'نقطة البيع POS', icon: Receipt, permission: 'viewPOS' },
               { id: 'customers', label: 'سجل العملاء', icon: Users, permission: 'viewCustomers' },
               { id: 'reports', label: 'التقارير والمبيعات', icon: History, permission: 'viewReports' }
             ].map(item => {
                if (item.permission && !appUser.permissions?.[item.permission] && appUser.role !== 'admin') {
                    return null;
                }
                return (
                    <button 
                      key={item.id} 
                      onClick={()=>{setCurrentView(item.id); setIsMobileOpen(false);}} 
                      className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-colors font-bold text-xs ${currentView === item.id ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-800 hover:text-white text-slate-400'}`}
                    >
                      <item.icon size={16} className={currentView === item.id ? 'text-white' : 'opacity-70'}/> {item.label}
                    </button>
                );
             })}
             
             {appUser.role === 'admin' && (
                <>
                   <p className="px-3 text-[10px] font-bold text-slate-500 uppercase mb-2 mt-6">الإدارة</p>
                   {[
                     { id: 'warehouses', label: 'إدارة الفروع', icon: Store },
                     { id: 'users', label: 'الموظفين والصلاحيات', icon: UserCog }, 
                     { id: 'settings', label: 'الإعدادات المركزية', icon: Settings }
                   ].map(item => (
                      <button 
                        key={item.id} 
                        onClick={()=>{setCurrentView(item.id); setIsMobileOpen(false);}} 
                        className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-colors font-bold text-xs ${currentView === item.id ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-800 hover:text-white text-slate-400'}`}
                      >
                        <item.icon size={16} className={currentView === item.id ? 'text-white' : 'opacity-70'}/> {item.label}
                      </button>
                   ))}
                </>
             )}
          </nav>
          <div className="p-4 border-t border-slate-800 bg-slate-900/50">
             <button 
               onClick={() => openProfileView(appUser)} 
               className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-right group"
             >
               <div className="w-8 h-8 rounded-md bg-indigo-500 flex items-center justify-center font-black text-white text-xs">
                 {appUser.name?.charAt(0) || appUser.email?.charAt(0)}
               </div>
               <div className="flex-1 overflow-hidden">
                 <p className="text-xs font-bold text-white truncate">{appUser.name || appUser.email}</p>
                 <p className="text-[9px] text-slate-400 truncate uppercase group-hover:text-indigo-300 transition-colors">حسابي ونشاطاتي</p>
               </div>
            </button>
            <button 
              onClick={handleLogout} 
              className="w-full px-4 py-2 bg-red-500/10 text-red-400 font-bold flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white rounded-lg transition-colors text-xs"
            >
              <LogOut size={14} /> خروج
            </button>
          </div>
        </aside>
      </>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10 print:hidden">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileOpen(true)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-md">
              <Menu size={20}/>
            </button>
            <h2 className="font-bold text-slate-800 text-sm hidden sm:block">مرحباً بعودتك 👋</h2>
          </div>
          <div className="flex items-center gap-3 font-bold">
             <span className={`text-[9px] uppercase px-2 py-1 rounded border ${isOnline ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
               {isOnline ? 'متصل' : 'أوفلاين'}
             </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
           <div className="max-w-6xl mx-auto h-full pb-10 print:pb-0">
              {currentView === 'dashboard' && <DashboardView appUser={appUser} />}
              {currentView === 'inventory' && <InventoryManager appUser={appUser} warehouses={warehouses} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} />}
              {currentView === 'transfers' && <TransferManager appUser={appUser} warehouseMap={warehouseMap} notify={notify} setGlobalLoading={setGlobalLoading} />}
              {currentView === 'transactions' && <POSManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} />}
              {currentView === 'customers' && <CustomerManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} />}
              {currentView === 'reports' && <ReportsManager />}
              {currentView === 'settings' && appUser.role === 'admin' && <SettingsManager systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} />}
              {currentView === 'warehouses' && appUser.role === 'admin' && <WarehouseManager warehouses={warehouses} notify={notify} setGlobalLoading={setGlobalLoading} />}
              {currentView === 'users' && appUser.role === 'admin' && <UserManagement appUser={appUser} warehouses={warehouses} notify={notify} setGlobalLoading={setGlobalLoading} onViewProfile={openProfileView} />}
              {currentView === 'user_profile' && <EmployeeProfileView userToView={viewedUser} warehouseMap={warehouseMap} />}
           </div>
        </main>
      </div>
    </div>
  );
}