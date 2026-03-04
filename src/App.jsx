import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

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
  ChevronDown, Database, UploadCloud, DownloadCloud, Check, Activity, Eye,
  Home, Map, Building, FileText, Printer as PrinterIcon, Copy, Grid,
  Filter, RefreshCw, UsersRound, UserCheck, UserX, UserPlus, Briefcase,
  HardHat, Headphones, Settings as SettingsIcon, GitBranch, GitMerge,
  AlertCircle, CheckCircle, XCircle, Clock, ThumbsUp, ThumbsDown,
  MessageSquare, Flag, Star, Award, Crown, ShieldCheck, BarChart3,
  TrendingUp, TrendingDown, PieChart, LineChart, DownloadCloud as DownloadIcon,
  RefreshCcw, WifiOff
} from 'lucide-react';

// ==========================================================================
// 🔥 FIREBASE CONFIGURATION
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBrRvCAWdC_SOjBqSFPXyav-3ifE80UoLU",
  authDomain: "nouval-system.firebaseapp.com",
  projectId: "nouval-system",
  storageBucket: "nouval-system.firebasestorage.app",
  messagingSenderId: "194279959532",
  appId: "1:194279959532:web:578f5894f58102d4872ec9"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const getCollRef = (collName) => collection(db, collName);
const getDocRef = (collName, docId) => doc(db, collName, docId);

// ==========================================================================
// 📦 الثوابت والبيانات
// ==========================================================================
const USER_ROLES = [
  { key: 'admin', label: 'مدير النظام', level: 100, icon: Crown, color: 'purple' },
  { key: 'main_warehouse_manager', label: 'مسؤول المخزن الرئيسي', level: 90, icon: ShieldCheck, color: 'indigo' },
  { key: 'warehouse_manager', label: 'مسؤول مخزن', level: 80, icon: Shield, color: 'blue' },
  { key: 'accountant', label: 'محاسب', level: 60, icon: Calculator, color: 'emerald' },
  { key: 'maintenance_center', label: 'مركز صيانة', level: 50, icon: Wrench, color: 'orange' },
  { key: 'technician', label: 'فني صيانة', level: 40, icon: HardHat, color: 'amber' },
  { key: 'call_center', label: 'كول سنتر', level: 30, icon: Headphones, color: 'cyan' },
  { key: 'sales', label: 'موظف مبيعات', level: 20, icon: User, color: 'slate' }
];

const ALL_PERMISSIONS = [
  { key: 'viewDashboard', label: 'لوحة التحكم والمؤشرات', category: 'عام' },
  { key: 'viewInventory', label: 'إدارة المخزون والأصناف', category: 'مخزون' },
  { key: 'viewPOS', label: 'نقطة البيع وإصدار الفواتير', category: 'مبيعات' },
  { key: 'viewReports', label: 'التقارير وسجل المبيعات', category: 'تقارير' },
  { key: 'viewCustomers', label: 'سجل بيانات العملاء', category: 'عملاء' },
  { key: 'viewAllWarehouses', label: 'صلاحية رؤية كافة الفروع', category: 'فروع' },
  { key: 'manageSettings', label: 'إدارة الإعدادات المركزية', category: 'إدارة' },
  { key: 'manageUsers', label: 'إدارة المستخدمين والصلاحيات', category: 'إدارة' },
  { key: 'approveTransfers', label: 'الموافقة على التحويلات المخزنية', category: 'مخزون' },
  { key: 'viewTransfers', label: 'مشاهدة التحويلات المخزنية', category: 'مخزون' },
  { key: 'createTransfer', label: 'إنشاء طلب تحويل', category: 'مخزون' },
  { key: 'viewLowStock', label: 'مشاهدة النواقص', category: 'مخزون' },
  { key: 'manageWarehouses', label: 'إدارة الفروع والمخازن', category: 'إدارة' },
  { key: 'assignUsersToWarehouse', label: 'تعيين المستخدمين للفروع', category: 'إدارة' },
  { key: 'manageInvoiceTemplate', label: 'إدارة قالب الفاتورة', category: 'إعدادات' },
  { key: 'viewAllCustomers', label: 'مشاهدة كل العملاء', category: 'عملاء' },
  { key: 'assignTechnician', label: 'تعيين فني للعميل', category: 'عملاء' },
  { key: 'assignCallCenter', label: 'تعيين كول سنتر للعميل', category: 'عملاء' },
  { key: 'assignMaintenanceCenter', label: 'تعيين مركز صيانة للعميل', category: 'عملاء' },
  { key: 'viewInventoryValue', label: 'رؤية قيمة المخزون', category: 'مخزون' },
  { key: 'viewCharts', label: 'رؤية الرسوم البيانية', category: 'تقارير' },
  { key: 'manageTickets', label: 'إدارة تذاكر الصيانة', category: 'عملاء' },
  { key: 'addSpareParts', label: 'إضافة قطع غيار للتذكرة', category: 'عملاء' }
];

const ROLE_DEFAULT_PERMISSIONS = {
  admin: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {}),
  
  main_warehouse_manager: {
    viewDashboard: true,
    viewInventory: true,
    viewReports: true,
    viewAllWarehouses: true,
    viewTransfers: true,
    approveTransfers: true,
    viewLowStock: true,
    viewPOS: false,
    viewCustomers: false,
    manageSettings: false,
    manageUsers: false,
    createTransfer: false,
    manageWarehouses: false,
    assignUsersToWarehouse: false,
    viewInventoryValue: true,
    viewCharts: true,
    manageTickets: false,
    addSpareParts: false
  },
  
  warehouse_manager: {
    viewDashboard: true,
    viewInventory: true,
    viewReports: true,
    viewTransfers: true,
    createTransfer: true,
    viewLowStock: true,
    viewPOS: false,
    viewCustomers: false,
    viewAllWarehouses: false,
    approveTransfers: false,
    manageSettings: false,
    manageUsers: false,
    viewInventoryValue: true,
    viewCharts: true,
    manageTickets: false,
    addSpareParts: false
  },
  
  technician: {
    viewDashboard: true,
    viewCustomers: true,
    viewLowStock: true,
    viewPOS: false,
    viewInventory: false,
    viewReports: false,
    viewTransfers: false,
    viewAllWarehouses: false,
    assignTechnician: false,
    assignCallCenter: false,
    assignMaintenanceCenter: false,
    viewInventoryValue: false,
    viewCharts: true,
    manageTickets: true,
    addSpareParts: true
  },
  
  maintenance_center: {
    viewDashboard: true,
    viewCustomers: true,
    viewLowStock: true,
    viewInventory: true,
    viewPOS: false,
    viewReports: false,
    viewTransfers: false,
    viewAllWarehouses: false,
    assignMaintenanceCenter: false,
    assignTechnician: true,
    assignCallCenter: true,
    viewInventoryValue: true,
    viewCharts: true,
    manageTickets: true,
    addSpareParts: true
  },
  
  call_center: {
    viewDashboard: true,
    viewCustomers: true,
    viewPOS: false,
    viewInventory: false,
    viewReports: false,
    viewTransfers: false,
    viewAllWarehouses: false,
    assignCallCenter: false,
    assignTechnician: true,
    assignMaintenanceCenter: true,
    viewInventoryValue: false,
    viewCharts: true,
    manageTickets: true,
    addSpareParts: false
  },
  
  sales: {
    viewDashboard: true,
    viewInventory: true,
    viewPOS: true,
    viewCustomers: true,
    viewReports: false,
    viewTransfers: false,
    viewLowStock: true,
    viewAllWarehouses: false,
    viewInventoryValue: true,
    viewCharts: true,
    manageTickets: false,
    addSpareParts: false
  },
  
  accountant: {
    viewDashboard: true,
    viewReports: true,
    viewPOS: false,
    viewInventory: false,
    viewCustomers: false,
    viewTransfers: false,
    viewLowStock: false,
    viewInventoryValue: true,
    viewCharts: true,
    manageTickets: false,
    addSpareParts: false
  }
};

const EGYPT_GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'الشرقية', 'القليوبية',
  'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد',
  'الإسماعيلية', 'السويس', 'شمال سيناء', 'جنوب سيناء', 'بني سويف',
  'الفيوم', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
  'مطروح', 'الوادي الجديد', 'البحر الأحمر'
].sort();

const TICKET_STATUSES = [
  { value: 'created', label: 'إنشاء', color: 'gray' },
  { value: 'received_maintenance', label: 'تم استلام الجهاز وهو تحت الصيانة', color: 'blue' },
  { value: 'waiting_customer_approval_cost', label: 'في انتظار موافقة العميل على التكلفة', color: 'yellow' },
  { value: 'waiting_spare_parts', label: 'انتظار قطع الغيار', color: 'orange' },
  { value: 'delivered_to_customer', label: 'تم التسليم للعميل', color: 'green' },
  { value: 'rejected_by_customer', label: 'مرفوض من قبل العميل', color: 'red' },
  { value: 'closed', label: 'مغلق', color: 'gray' },
  { value: 'maintenance_after_approval', label: 'تحت الصيانة بعد موافقة العميل', color: 'blue' },
  { value: 'sent_to_factory', label: 'تم الارسال الى المصنع للصيانة', color: 'purple' },
  { value: 'factory_maintenance_done', label: 'تمت الصيانة في المصنع', color: 'green' },
  { value: 'sent_from_factory', label: 'تم الارسال من المصنع بعد الانتهاء', color: 'green' },
  { value: 'factory_rejected', label: 'تم رفض الصيانة من المصنع', color: 'red' },
  { value: 'spare_parts_unavailable', label: 'قطع الغيار غير متوفرة', color: 'red' },
  { value: 'rejected_and_delivered', label: 'مرفوض وتم التسليم', color: 'red' },
  { value: 'customer_approved_cost', label: 'العميل موافق على التكلفة', color: 'green' },
  { value: 'contacted_customer', label: 'تم التواصل مع العميل لاستلام الجهاز', color: 'blue' },
  { value: 'shipped_asc', label: 'تم الشحن ASC', color: 'indigo' },
  { value: 'delivered_asc', label: 'تم التسليم ASC', color: 'green' },
  { value: 'damaged_disposed', label: 'اتلاف و اهلاك', color: 'gray' },
  { value: 'waiting_shipping_company', label: 'انتظار ارسال شركة الشحن', color: 'yellow' }
];

const ticketStatusOptions = TICKET_STATUSES.map(status => ({
  value: status.value,
  label: status.label
}));

// ==========================================================================
// 🛠️ دوال مساعدة
// ==========================================================================
const normalizeSearch = (str) => {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/\s+/g, ' ');
};

const normalizeSerial = (str) => {
  if (!str) return '';
  return String(str).trim().toUpperCase();
};

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const exportToCSV = (data, filename) => {
  if (!data || !data.length) return false;
  try {
    const headers = Object.keys(data[0]);
    const csvContent = [
      "\uFEFF" + headers.join(','),
      ...data.map(row => 
        headers.map(f => {
          const val = row[f];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
          if (val instanceof Date) return `"${val.toLocaleString()}"`;
          return val;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
    return true;
  } catch (error) {
    console.error("Export error:", error);
    return false;
  }
};

const formatDate = (timestamp) => {
  if (!timestamp) return '-';
  try {
    if (timestamp?.toDate) {
      return timestamp.toDate().toLocaleString('ar-EG', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleString('ar-EG');
    }
    return new Date(timestamp).toLocaleString('ar-EG');
  } catch (error) {
    return '-';
  }
};

const logUserActivity = async (user, action, details) => {
  if (!user) return;
  try {
    await addDoc(collection(db, 'activity_logs'), {
      userId: user.id,
      userName: user.name || user.email,
      userRole: user.role,
      action: action,
      details: details,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("Activity Log Error:", err);
  }
};

const getRoleIcon = (roleKey) => {
  const role = USER_ROLES.find(r => r.key === roleKey);
  return role?.icon || User;
};

const getRoleColor = (roleKey) => {
  const role = USER_ROLES.find(r => r.key === roleKey);
  return role?.color || 'slate';
};

// ==========================================================================
// 🧾 دوال مساعدة لتحليل CSV
// ==========================================================================
const parseCSV = (text) => {
  try {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = [];
      let current = '';
      let inQuotes = false;
      const line = lines[i];
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));
      
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      results.push(row);
    }
    
    return results;
  } catch (error) {
    console.error('CSV Parse Error:', error);
    return [];
  }
};

// ==========================================================================
// 📊 مكونات الرسوم البيانية
// ==========================================================================
function SimpleBarChart({ data, height = 200 }) {
  if (!data || data.length === 0) {
    return <div className="text-center text-slate-400 py-8">لا توجد بيانات</div>;
  }
  
  const maxValue = Math.max(...data.map(d => Number(d.value) || 0), 1);
  
  return (
    <div className="w-full h-full flex items-end justify-around gap-2">
      {data.map((item, index) => {
        const value = Number(item.value) || 0;
        const barHeight = (value / maxValue) * (height - 40);
        
        return (
          <div key={index} className="flex flex-col items-center flex-1">
            <div className="w-full bg-indigo-100 rounded-t-lg relative group">
              <div 
                className="bg-indigo-600 rounded-t-lg transition-all duration-300 hover:bg-indigo-700"
                style={{ height: `${Math.max(barHeight, 4)}px` }}
              >
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {value.toLocaleString()} ج
                </div>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-600 mt-2 text-center truncate w-full" title={item.name}>
              {item.name?.length > 8 ? item.name.slice(0,6) + '...' : item.name || '-'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SimplePieChart({ data, height = 200 }) {
  if (!data || data.length === 0) {
    return <div className="text-center text-slate-400 py-8">لا توجد بيانات</div>;
  }
  
  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d'];
  const total = data.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  
  if (total === 0) {
    return <div className="text-center text-slate-400 py-8">لا توجد بيانات</div>;
  }
  
  let startAngle = 0;
  
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <div className="relative" style={{ width: height, height }}>
        <svg viewBox="0 0 100 100">
          {data.map((item, index) => {
            const percentage = (Number(item.count) || 0) / total;
            const angle = percentage * 360;
            
            if (angle === 0) return null;
            
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = ((startAngle + angle) * Math.PI) / 180;
            
            const x1 = 50 + 40 * Math.cos(startRad);
            const y1 = 50 + 40 * Math.sin(startRad);
            const x2 = 50 + 40 * Math.cos(endRad);
            const y2 = 50 + 40 * Math.sin(endRad);
            
            const largeArcFlag = angle > 180 ? 1 : 0;
            
            const path = (
              <path
                key={index}
                d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                fill={colors[index % colors.length]}
                className="hover:opacity-80 transition-opacity cursor-pointer"
              >
                <title>{`${item.name || 'قسم'}: ${item.count} (${Math.round(percentage * 100)}%)`}</title>
              </path>
            );
            
            startAngle += angle;
            return path;
          })}
        </svg>
      </div>
      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }}></div>
            <span className="text-xs font-bold text-slate-600">{item.name || 'قسم'}</span>
            <span className="text-xs font-black text-slate-800">{item.count}</span>
            <span className="text-[10px] text-slate-400">({Math.round(((Number(item.count) || 0) / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================================================
// 🔐 شاشة تسجيل الدخول
// ==========================================================================
function LoginScreen({ fbReady, onLoginSuccess, systemSettings, notify, onRetry, isConnecting, firebaseError }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!fbReady) {
      setError("يرجى الانتظار حتى يتم الاتصال بالخادم...");
      return notify("يرجى الانتظار حتى يتم الاتصال بالخادم...", "warn");
    }
    if (!email || !pass) {
      setError("الرجاء إدخال البريد الإلكتروني وكلمة المرور");
      return notify("الرجاء إدخال البريد الإلكتروني وكلمة المرور", "warn");
    }
    
    setLoading(true);
    try {
      const q = query(collection(db, 'employees'), where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        const allUsers = await getDocs(collection(db, 'employees'));
        if (allUsers.empty) {
          const newAdmin = {
            email: email.trim().toLowerCase(),
            pass: pass,
            name: 'مدير النظام',
            role: 'admin',
            assignedWarehouseId: 'main',
            permissions: ROLE_DEFAULT_PERMISSIONS.admin,
            createdAt: serverTimestamp()
          };
          const docRef = await addDoc(collection(db, 'employees'), newAdmin);
          onLoginSuccess({ id: docRef.id, ...newAdmin, permissions: newAdmin.permissions });
          notify("مرحباً! تم تفعيل حسابك كمدير للنظام بنجاح.", "success");
        } else {
          setError("هذا البريد الإلكتروني غير مسجل في النظام.");
          notify("هذا البريد الإلكتروني غير مسجل في النظام.", "error");
        }
      } else {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        if (userData.isDisabled) {
           setError("عذراً، هذا الحساب موقوف من قبل الإدارة.");
           notify("عذراً، هذا الحساب موقوف من قبل الإدارة.", "error");
        } else if (userData.pass === pass) {
           onLoginSuccess({ id: userDoc.id, ...userData, permissions: userData.permissions || {} });
           notify(`أهلاً بك مجدداً يا ${userData.name}`, "success");
           await logUserActivity({ id: userDoc.id, ...userData }, 'تسجيل دخول', 'قام بتسجيل الدخول إلى النظام');
        } else {
           setError("كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.");
           notify("كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.", "error");
        }
      }
    } catch (err) {
      console.error(err);
      let errorMessage = "فشل الاتصال بقاعدة البيانات. تأكد من جودة الإنترنت.";
      
      if (err.code === 'permission-denied') {
        errorMessage = "خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase Console.";
      } else if (err.code === 'unavailable') {
        errorMessage = "خدمة Firebase غير متاحة حالياً. حاول مرة أخرى.";
      } else if (err.code === 'not-found') {
        errorMessage = "لم يتم العثور على قاعدة البيانات. تأكد من إعدادات Firebase.";
      }
      
      setError(errorMessage);
      notify(errorMessage, "error");
    }
    setLoading(false);
  };

  if (isConnecting) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f172a] p-4 text-right" dir="rtl">
        <div className="bg-white p-10 rounded-[2rem] w-full max-w-md shadow-2xl text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-lg font-bold text-slate-800">جاري الاتصال بقاعدة البيانات...</p>
          <p className="text-sm text-slate-500 mt-2">يرجى الانتظار</p>
        </div>
      </div>
    );
  }

  if (firebaseError) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f172a] p-4 text-right" dir="rtl">
        <div className="bg-white p-10 rounded-[2rem] w-full max-w-md shadow-2xl">
          <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-black text-center text-slate-800 mb-2">خطأ في الاتصال</h2>
          <p className="text-center text-slate-600 mb-6">{firebaseError}</p>
          <div className="space-y-3">
            <button 
              onClick={onRetry}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} /> إعادة المحاولة
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[#0f172a] p-4 text-right" dir="rtl">
      <div className="bg-white p-10 rounded-[2rem] w-full max-w-md shadow-2xl relative border-t-[6px] border-indigo-600">
        <div className="flex justify-center mb-6">
           <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
             <Package size={40}/>
           </div>
        </div>
        <h1 className="text-2xl font-black text-center text-slate-800 mb-1">{systemSettings?.systemName || 'نوڤال ERP'}</h1>
        <p className="text-center text-slate-500 text-[10px] mb-8 font-bold uppercase tracking-widest">Enterprise Management Portal</p>
        
        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative font-bold">
            <Mail className="absolute right-4 top-3.5 text-slate-400" size={18}/>
            <input 
              className="w-full border-2 border-slate-100 pr-12 p-3 rounded-xl focus:border-indigo-500 outline-none text-right bg-slate-50 font-bold text-slate-700 text-sm transition-all" 
              placeholder="البريد الإلكتروني للموظف" 
              value={email} 
              onChange={e=>setEmail(e.target.value)} 
              type="email" 
              required 
              dir="ltr"
              disabled={loading}
            />
          </div>
          <div className="relative font-bold">
            <Lock className="absolute right-4 top-3.5 text-slate-400" size={18}/>
            <input 
              className="w-full border-2 border-slate-100 pr-12 p-3 rounded-xl focus:border-indigo-500 outline-none text-right bg-slate-50 font-bold text-slate-700 text-sm transition-all" 
              type="password" 
              placeholder="كلمة المرور" 
              value={pass} 
              onChange={e=>setPass(e.target.value)} 
              required 
              dir="ltr"
              disabled={loading}
            />
          </div>
          <button 
            disabled={loading || !fbReady} 
            className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 flex justify-center items-center gap-2 mt-6 text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
             {loading || !fbReady ? <Loader2 className="animate-spin" size={20}/> : <><LogIn size={20}/> تسجيل الدخول بأمان</>}
          </button>
        </form>
      </div>
    </div>
  );
}
// ==========================================================================
// 🧾 مكون عرض الفاتورة
// ==========================================================================
function InvoiceRenderer({ data, systemSettings, onBack }) {
  useEffect(() => { 
    const timer = setTimeout(() => window.print(), 800); 
    return () => clearTimeout(timer);
  }, [data]);
  
  const template = systemSettings.invoiceTemplate || {
    showLogo: true,
    showStoreName: true,
    showCustomerInfo: true,
    showItems: true,
    showPrices: true,
    showDiscount: true,
    showTax: true,
    showFees: true,
    showFooter: true,
    fontSize: 'normal',
    paperSize: '80mm'
  };

  const getPaperWidth = () => {
    switch(template.paperSize) {
      case '58mm': return 'max-w-[58mm]';
      case '80mm': return 'max-w-[80mm]';
      case 'A4': return 'max-w-[210mm]';
      default: return 'max-w-[80mm]';
    }
  };

  const getFontSize = () => {
    switch(template.fontSize) {
      case 'small': return 'text-xs';
      case 'large': return 'text-lg';
      default: return 'text-sm';
    }
  };

  const formatCurrency = (value) => {
    return Number(value || 0).toLocaleString() + ' ج.م';
  };

  return (
    <div className="flex justify-center p-6 bg-slate-100 min-h-full" dir="rtl">
       <div className={`bg-white ${getPaperWidth()} w-full p-6 text-black border shadow-lg print:shadow-none print:border-none print:m-0 ${getFontSize()}`}>
          
          {template.showLogo && systemSettings.invoiceLogo && (
            <div className="text-center mb-4">
              <img src={systemSettings.invoiceLogo} alt="Logo" className="max-h-16 mx-auto" crossOrigin="anonymous" />
            </div>
          )}

          {template.showStoreName && (
            <div className="text-center border-b border-black border-dashed pb-4 mb-4">
               <h1 className="font-black text-xl">{systemSettings.storeName}</h1>
               <p className="text-[11px] font-bold mt-1">فاتورة مبيعات #{data.invoiceNumber}</p>
               <p className="text-[10px] mt-1 text-gray-600">{formatDate(data.date)}</p>
            </div>
          )}

          {template.showCustomerInfo && (
            <div className="text-[11px] mb-4 space-y-1.5 font-bold text-right">
               <div className="flex justify-between"><span>العميل:</span><span>{data.customerName}</span></div>
               <div className="flex justify-between"><span>الهاتف:</span><span dir="ltr">{data.phone || '-'}</span></div>
               {data.technicianName && <div className="flex justify-between"><span>الفني المختص:</span><span>{data.technicianName}</span></div>}
               {data.ticketId && <div className="flex justify-between"><span>رقم التذكرة:</span><span>{data.ticketId}</span></div>}
               <div className="flex justify-between text-gray-600"><span>الكاشير:</span><span>{data.operator}</span></div>
            </div>
          )}

          {template.showItems && (
            <table className="w-full text-[11px] border-y border-black border-dashed py-2 mb-4 text-right">
               <thead>
                  <tr className="font-bold border-b border-gray-300">
                     <th className="pb-2">الصنف</th>
                     <th className="pb-2 text-center">كمية</th>
                     {template.showPrices && <th className="pb-2 text-left">السعر</th>}
                  </tr>
               </thead>
               <tbody>
                  {data.items && data.items.length > 0 ? (
                     data.items.map((item, idx) => (
                        <tr key={idx}>
                           <td className="py-2 text-right font-bold">
                             {item.name}
                             <br/>
                             <span className="text-[9px] font-mono text-gray-500 mt-0.5 block">{item.serialNumber}</span>
                           </td>
                           <td className="text-center py-2 font-bold">{item.quantity || 1}</td>
                           {template.showPrices && <td className="text-left py-2 font-black">{formatCurrency(item.price)}</td>}
                        </tr>
                     ))
                  ) : (
                     <tr>
                        <td className="py-2 text-right font-bold">
                          {data.itemName}
                          <br/>
                          <span className="text-[9px] font-mono text-gray-500 mt-0.5 block">{data.serialNumber}</span>
                        </td>
                        <td className="text-center py-2 font-bold">1</td>
                        {template.showPrices && <td className="text-left py-2 font-black">{formatCurrency(data.subtotal)}</td>}
                     </tr>
                  )}
               </tbody>
            </table>
          )}

          <div className="text-[11px] space-y-1.5 font-bold border-b border-black border-dashed pb-4 mb-4 text-right">
             {template.showPrices && (
                <div className="flex justify-between"><span>المجموع الفرعي:</span><span>{formatCurrency(data.subtotal)}</span></div>
             )}
             {template.showDiscount && data.discountAmount > 0 && 
                <div className="flex justify-between text-black"><span>الخصم:</span><span>- {formatCurrency(data.discountAmount)}</span></div>
             }
             {template.showTax && data.taxAmount > 0 && 
                <div className="flex justify-between"><span>الضريبة ({systemSettings.taxRate || 14}%):</span><span>+ {formatCurrency(data.taxAmount)}</span></div>
             }
             {template.showFees && data.installAmount > 0 && 
                <div className="flex justify-between"><span>رسوم إضافية:</span><span>+ {formatCurrency(data.installAmount)}</span></div>
             }
             <div className="flex justify-between border-t border-black pt-2 mt-2 text-[14px] font-black">
                <span>الصافي المطلوب:</span><span>{formatCurrency(data.finalTotal)}</span>
             </div>
          </div>

          {template.showFooter && (
            <div className="text-center text-[9px] font-bold italic text-gray-700 leading-relaxed">
               <p>{systemSettings.footerText || 'شكراً لتعاملكم معنا'}</p>
            </div>
          )}

          <div className="mt-8 flex gap-2 print:hidden">
             <button onClick={() => window.print()} className="flex-1 bg-black text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm">
               <Printer size={16}/> طباعة
             </button>
             <button onClick={onBack} className="flex-1 bg-slate-200 text-slate-800 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm">
               <ArrowRightLeft size={16}/> إغلاق
             </button>
          </div>
       </div>
    </div>
  );
}

// ==========================================================================
// 📝 مدير قالب الفاتورة
// ==========================================================================
function InvoiceTemplateManager({ systemSettings, setSettings, notify }) {
  const [template, setTemplate] = useState(systemSettings.invoiceTemplate || {
    showLogo: true,
    showStoreName: true,
    showCustomerInfo: true,
    showItems: true,
    showPrices: true,
    showDiscount: true,
    showTax: true,
    showFees: true,
    showFooter: true,
    fontSize: 'normal',
    paperSize: '80mm'
  });

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'settings', 'general'), {
        invoiceTemplate: template
      }, { merge: true });
      setSettings({...systemSettings, invoiceTemplate: template});
      notify("تم حفظ قالب الفاتورة بنجاح", "success");
    } catch (error) {
      console.error("Error saving template:", error);
      notify("حدث خطأ أثناء حفظ القالب", "error");
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100">
      <h3 className="font-black text-lg mb-6 text-slate-800 flex items-center gap-2">
        <PrinterIcon className="text-indigo-600" size={20}/> تخصيص شكل الفاتورة
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="font-bold text-sm text-slate-600 border-b pb-2">عناصر الفاتورة</h4>
          
          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showLogo} onChange={e => setTemplate({...template, showLogo: e.target.checked})} />
            <span className="text-xs font-bold">عرض الشعار</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showStoreName} onChange={e => setTemplate({...template, showStoreName: e.target.checked})} />
            <span className="text-xs font-bold">عرض اسم المتجر</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showCustomerInfo} onChange={e => setTemplate({...template, showCustomerInfo: e.target.checked})} />
            <span className="text-xs font-bold">عرض معلومات العميل</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showItems} onChange={e => setTemplate({...template, showItems: e.target.checked})} />
            <span className="text-xs font-bold">عرض الأصناف</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showPrices} onChange={e => setTemplate({...template, showPrices: e.target.checked})} />
            <span className="text-xs font-bold">عرض الأسعار</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showDiscount} onChange={e => setTemplate({...template, showDiscount: e.target.checked})} />
            <span className="text-xs font-bold">عرض الخصم</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showTax} onChange={e => setTemplate({...template, showTax: e.target.checked})} />
            <span className="text-xs font-bold">عرض الضريبة</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showFees} onChange={e => setTemplate({...template, showFees: e.target.checked})} />
            <span className="text-xs font-bold">عرض الرسوم الإضافية</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showFooter} onChange={e => setTemplate({...template, showFooter: e.target.checked})} />
            <span className="text-xs font-bold">عرض تذييل الفاتورة</span>
          </label>
        </div>

        <div className="space-y-4">
          <h4 className="font-bold text-sm text-slate-600 border-b pb-2">إعدادات الطباعة</h4>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2">حجم الخط</label>
            <select className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 text-sm bg-white" value={template.fontSize} onChange={e => setTemplate({...template, fontSize: e.target.value})}>
              <option value="small">صغير</option>
              <option value="normal">عادي</option>
              <option value="large">كبير</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2">حجم الورق</label>
            <select className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 text-sm bg-white" value={template.paperSize} onChange={e => setTemplate({...template, paperSize: e.target.value})}>
              <option value="58mm">58 مم (فاتورة صغيرة)</option>
              <option value="80mm">80 مم (فاتورة عادية)</option>
              <option value="A4">A4</option>
            </select>
          </div>

          <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <h5 className="font-bold text-xs text-indigo-900 mb-2">معاينة سريعة</h5>
            <div className="bg-white p-3 rounded-lg text-[10px]">
              <p className="font-black text-center">{systemSettings.storeName}</p>
              {template.showItems && (
                <div className="border-t border-dashed my-2 pt-2">
                  <p>منتج 1 ........ 100 ج</p>
                  <p>منتج 2 ........ 200 ج</p>
                </div>
              )}
              {template.showPrices && <p className="font-black mt-2">الإجمالي: 300 ج</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={handleSave} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2">
          <Save size={16}/> حفظ قالب الفاتورة
        </button>
      </div>
    </div>
  );
}

// ==========================================================================
// 📊 لوحة التحكم
// ==========================================================================
function DashboardView({ appUser, warehouses, onNavigateToInventory, notify }) {
  const [stats, setStats] = useState({ totalItems: 0, totalValue: 0, lowStockCount: 0, salesToday: 0 });
  const [ticketStats, setTicketStats] = useState({ today: 0, week: 0, month: 0, closed: 0, waitingApproval: 0 });
  const [loading, setLoading] = useState(true);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [warehouseSales, setWarehouseSales] = useState([]);
  const [ticketsByStatus, setTicketsByStatus] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [showInventoryValue, setShowInventoryValue] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if(!appUser) return;
    let isMounted = true;

    const fetchDashboardStats = async () => {
       setLoading(true);
       setError(null);
       try {
           let invSnap;
           try {
             invSnap = await getDocs(collection(db, 'inventory'));
           } catch (err) {
             console.warn("Inventory access error:", err);
             invSnap = { docs: [] };
           }
           
           let totalQty = 0;
           let totalVal = 0;
           let lowStock = 0;
           let lowStockList = [];

           invSnap.docs.forEach(doc => {
             const data = doc.data();
             if (!data.isDeleted) {
                if (appUser.permissions?.viewAllWarehouses || data.warehouseId === (appUser.assignedWarehouseId || 'main')) {
                   const qty = Number(data.quantity) || 0;
                   const price = Number(data.price) || 0;
                   const minStock = Number(data.minStock) || 2;
                   
                   totalQty += qty;
                   totalVal += qty * price;
                   
                   if (qty <= minStock) {
                     lowStock++;
                     lowStockList.push({
                       id: doc.id,
                       name: data.name,
                       serialNumber: data.serialNumber,
                       quantity: qty,
                       minStock: minStock,
                       warehouseId: data.warehouseId
                     });
                   }
                }
             }
           });

           setShowInventoryValue(appUser.permissions?.viewInventoryValue || false);

           let salesToday = 0;
           try {
             const today = new Date(); 
             today.setHours(0,0,0,0);
             const salesSnap = await getDocs(query(
               collection(db, 'transactions'), 
               where('timestamp', '>=', today)
             ));
             
             salesSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.type === 'sell') {
                   if (appUser.permissions?.viewAllWarehouses || data.warehouseId === (appUser.assignedWarehouseId || 'main')) {
                      salesToday += Number(data.finalTotal || data.total || 0);
                   }
                }
             });
           } catch (err) {
             console.warn("Sales access error:", err);
           }

           let todayTickets = 0, weekTickets = 0, monthTickets = 0, closedTickets = 0, waitingApprovalTickets = 0;
           let statusCount = {};
           
           try {
             const ticketsSnap = await getDocs(collection(db, 'tickets'));
             
             const now = new Date();
             const today = new Date(now.setHours(0,0,0,0));
             const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
             const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
             
             ticketsSnap.docs.forEach(doc => {
                const data = doc.data();
                const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                
                if (createdDate >= today) todayTickets++;
                if (createdDate >= weekAgo) weekTickets++;
                if (createdDate >= monthAgo) monthTickets++;
                
                if (data.status === 'delivered_to_customer' || data.status === 'closed') {
                  closedTickets++;
                }
                
                if (data.status === 'waiting_customer_approval_cost') {
                  waitingApprovalTickets++;
                }
                
                statusCount[data.status] = (statusCount[data.status] || 0) + 1;
             });
           } catch (err) {
             console.warn("Tickets access error:", err);
           }
           
           const chartData = Object.entries(statusCount).map(([status, count]) => ({
             name: TICKET_STATUSES.find(s => s.value === status)?.label || status,
             count,
             status
           })).sort((a, b) => b.count - a.count).slice(0, 5);

           let warehouseSalesData = [];
           try {
             const now = new Date();
             const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
             const salesLastMonth = await getDocs(query(
               collection(db, 'transactions'), 
               where('timestamp', '>=', thirtyDaysAgo),
               where('type', '==', 'sell')
             ));
             
             const salesByWarehouse = {};
             salesLastMonth.docs.forEach(doc => {
                const data = doc.data();
                const warehouseId = data.warehouseId;
                if (!salesByWarehouse[warehouseId]) {
                  salesByWarehouse[warehouseId] = 0;
                }
                salesByWarehouse[warehouseId] += Number(data.finalTotal || data.total || 0);
             });
             
             Object.entries(salesByWarehouse).forEach(([warehouseId, total]) => {
                warehouseSalesData.push({
                  name: warehouses.find(w => w.id === warehouseId)?.name || warehouseId,
                  value: total
                });
             });
           } catch (err) {
             console.warn("Warehouse sales access error:", err);
           }

           let recentActs = [];
           try {
             const activitiesSnap = await getDocs(query(
               collection(db, 'activity_logs'),
               orderBy('timestamp', 'desc'),
               limit(10)
             ));
             recentActs = activitiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
           } catch (err) {
             console.warn("Activities access error:", err);
           }

           if (isMounted) {
               setStats({
                  totalItems: totalQty,
                  totalValue: totalVal,
                  lowStockCount: lowStock,
                  salesToday: salesToday
               });
               setTicketStats({
                 today: todayTickets,
                 week: weekTickets,
                 month: monthTickets,
                 closed: closedTickets,
                 waitingApproval: waitingApprovalTickets
               });
               setLowStockItems(lowStockList);
               setTicketsByStatus(chartData);
               setWarehouseSales(warehouseSalesData);
               setRecentActivities(recentActs);
           }
       } catch(e) {
           console.error("Dashboard Stats Fetch Error:", e);
           setError(e.message);
           if (isMounted) {
             notify("حدث خطأ في تحميل بيانات لوحة التحكم. تأكد من إعدادات قواعد الأمان.", "error");
           }
       }
       if (isMounted) setLoading(false);
    };

    fetchDashboardStats();
    return () => { isMounted = false; };
  }, [appUser, warehouses, notify]);

  const handleStatClick = (type) => {
    if (type === 'inventory') {
      onNavigateToInventory();
    } else if (type === 'lowstock') {
      window.dispatchEvent(new CustomEvent('navigateToLowStock', { detail: lowStockItems }));
    } else if (type === 'tickets') {
      window.dispatchEvent(new CustomEvent('navigateToTickets'));
    }
  };

  return (
    <div className="space-y-6 text-right">
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
         <h2 className="text-xl font-black text-slate-800">لوحة المؤشرات {loading && <Loader2 className="inline animate-spin text-indigo-500 mr-2" size={18}/>}</h2>
         <div className="bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2">
            <Calendar size={14}/> {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
         </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-700 text-sm font-bold flex items-center gap-2">
          <AlertTriangle size={20} />
          <div>
            <p>خطأ في تحميل البيانات: {error}</p>
            <p className="text-xs mt-1">تأكد من إعدادات قواعد الأمان في Firebase Console.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button 
          onClick={() => handleStatClick('inventory')}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all hover:border-indigo-300 relative overflow-hidden group text-right"
        >
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10" />}
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-100 transition-colors"><Package size={22}/></div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-slate-400 mb-1">إجمالي القطع بالمخزن</p>
            <p className="text-xl font-black text-slate-800">{stats.totalItems.toLocaleString()}</p>
            <p className="text-[9px] text-indigo-500 font-bold mt-1">اضغط لعرض التفاصيل</p>
          </div>
        </button>

        {showInventoryValue && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow relative overflow-hidden">
            {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10" />}
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Wallet size={22}/></div>
            <div><p className="text-[10px] font-bold text-slate-400 mb-1">قيمة المخزون الإجمالية</p><p className="text-xl font-black text-slate-800">{stats.totalValue.toLocaleString()} ج</p></div>
          </div>
        )}

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow relative overflow-hidden">
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10" />}
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Receipt size={22}/></div>
          <div><p className="text-[10px] font-bold text-slate-400 mb-1">مبيعات اليوم</p><p className="text-xl font-black text-slate-800">{stats.salesToday.toLocaleString()} ج</p></div>
        </div>

        <button 
          onClick={() => handleStatClick('lowstock')}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all hover:border-rose-300 relative overflow-hidden group text-right"
        >
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10" />}
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl group-hover:bg-rose-100 transition-colors"><AlertOctagon size={22}/></div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-slate-400 mb-1">نواقص تحتاج طلب</p>
            <p className="text-xl font-black text-slate-800">{stats.lowStockCount.toLocaleString()}</p>
            {stats.lowStockCount > 0 && (
              <p className="text-[9px] text-rose-500 font-bold mt-1">اضغط لعرض التفاصيل</p>
            )}
          </div>
        </button>
      </div>

      {appUser.permissions?.manageTickets && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-2xl border border-blue-100">
            <p className="text-xs font-bold text-blue-800 mb-1">تذاكر اليوم</p>
            <p className="text-3xl font-black text-blue-600">{ticketStats.today}</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-5 rounded-2xl border border-green-100">
            <p className="text-xs font-bold text-green-800 mb-1">تذاكر الأسبوع</p>
            <p className="text-3xl font-black text-green-600">{ticketStats.week}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-5 rounded-2xl border border-purple-100">
            <p className="text-xs font-bold text-purple-800 mb-1">تذاكر الشهر</p>
            <p className="text-3xl font-black text-purple-600">{ticketStats.month}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-100">
            <p className="text-xs font-bold text-amber-800 mb-1">بانتظار موافقة العميل</p>
            <p className="text-3xl font-black text-amber-600">{ticketStats.waitingApproval}</p>
          </div>
        </div>
      )}

      {appUser.permissions?.viewCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          
          {ticketsByStatus.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="font-black text-lg mb-4 text-slate-800 flex items-center gap-2">
                <PieChart className="text-indigo-600" size={20}/> توزيع حالات التذاكر
              </h3>
              <SimplePieChart data={ticketsByStatus} height={200} />
            </div>
          )}

          {warehouseSales.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="font-black text-lg mb-4 text-slate-800 flex items-center gap-2">
                <BarChart3 className="text-indigo-600" size={20}/> مبيعات المخازن (آخر 30 يوم)
              </h3>
              <SimpleBarChart data={warehouseSales} height={200} />
            </div>
          )}

          {appUser.permissions?.manageTickets && (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2">
              <h3 className="font-black text-lg mb-4 text-slate-800 flex items-center gap-2">
                <TrendingUp className="text-green-600" size={20}/> أداء الصيانة
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-emerald-50 p-4 rounded-xl text-center">
                  <p className="text-2xl font-black text-emerald-600">{ticketStats.closed}</p>
                  <p className="text-xs font-bold text-emerald-800">تم إصلاحها وتسليمها</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-xl text-center">
                  <p className="text-2xl font-black text-amber-600">{ticketStats.waitingApproval}</p>
                  <p className="text-xs font-bold text-amber-800">بانتظار موافقة العميل</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl text-center">
                  <p className="text-2xl font-black text-blue-600">{ticketStats.month}</p>
                  <p className="text-xs font-bold text-blue-800">إجمالي التذاكر الشهر</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2">
            <h3 className="font-black text-lg mb-4 text-slate-800 flex items-center gap-2">
              <Activity className="text-indigo-600" size={20}/> آخر النشاطات
            </h3>
            <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
              {recentActivities.length > 0 ? (
                recentActivities.map(act => (
                  <div key={act.id} className="flex items-start gap-3 p-2 border-b border-slate-50 last:border-0">
                    <div className="w-2 h-2 mt-2 rounded-full bg-indigo-400"></div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-800">{act.action}</p>
                      <p className="text-[10px] text-slate-500">{act.details}</p>
                      <p className="text-[8px] text-slate-400 mt-1">{formatDate(act.timestamp)} - {act.userName}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-400 py-4">لا توجد نشاطات حديثة</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ==========================================================================
// 📦 مدير المخزون
// ==========================================================================
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
  
  const [importProgress, setImportProgress] = useState({ total: 0, processed: 0, status: '' });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importErrors, setImportErrors] = useState([]);

  const loadItems = useCallback(async (isNextPage = false) => {
    if (!appUser) return;
    setLoadingData(true);
    try {
      let q = collection(db, 'inventory');
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
      if (e.code === 'permission-denied') {
         notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
      } else if (e.message.includes('index')) {
         notify("يرجى مراجعة إعدادات فهارس قاعدة البيانات (Indexes)", "warn");
      } else {
         notify("خطأ في جلب البيانات: " + e.message, "error"); 
      }
    }
    setLoadingData(false);
  }, [debouncedSearch, appUser, lastDoc, notify]);

  useEffect(() => { 
    setLastDoc(null);
    loadItems(false); 
  }, [debouncedSearch, appUser]);

  const downloadTemplate = () => {
    const template = [
      {
        serialNumber: 'SN123456',
        name: 'اسم المنتج',
        quantity: '10',
        price: '1000',
        minStock: '2',
        warehouseId: 'main'
      }
    ];
    exportToCSV(template, 'inventory_import_template');
    notify("تم تحميل قالب الاستيراد", "success");
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const data = parseCSV(text);
        const errors = [];
        const validData = [];

        data.forEach((row, index) => {
          if (!row.serialNumber || !row.name) {
            errors.push(`الصف ${index + 2}: السيريال أو الاسم مطلوب`);
            return;
          }

          const serial = normalizeSerial(row.serialNumber);
          const quantity = parseInt(row.quantity) || 1;
          const price = parseFloat(row.price) || 0;
          const minStock = parseInt(row.minStock) || 2;

          if (quantity < 0) {
            errors.push(`الصف ${index + 2}: الكمية غير صالحة`);
            return;
          }

          if (price < 0) {
            errors.push(`الصف ${index + 2}: السعر غير صالح`);
            return;
          }

          validData.push({
            serialNumber: serial,
            name: row.name,
            quantity,
            price,
            minStock,
            warehouseId: appUser.assignedWarehouseId || 'main'
          });
        });

        if (errors.length > 0) {
          setImportErrors(errors);
          setImportData([]);
        } else {
          setImportData(validData);
          setImportErrors([]);
          setShowImportModal(true);
        }
      } catch (error) {
        notify("خطأ في قراءة الملف: " + error.message, "error");
      }
    };

    reader.readAsText(file);
    e.target.value = null;
  };

  const handleImportConfirm = async () => {
    if (importData.length === 0) return;

    setShowImportModal(false);
    setGlobalLoading(true);
    setImportProgress({ total: importData.length, processed: 0, status: 'جاري الاستيراد...' });

    try {
      const chunks = [];
      for (let i = 0; i < importData.length; i += 400) {
        chunks.push(importData.slice(i, i + 400));
      }

      let processed = 0;
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        for (const item of chunk) {
          const newRef = doc(collection(db, 'inventory'));
          batch.set(newRef, {
            ...item,
            searchKey: normalizeSearch(`${item.name} ${item.serialNumber}`),
            createdAt: serverTimestamp(),
            isDeleted: false
          });

          const regRef = doc(db, 'serial_registry', item.serialNumber);
          batch.set(regRef, { exists: true, imported: true }, { merge: true });
        }

        await batch.commit();
        processed += chunk.length;
        setImportProgress({ total: importData.length, processed, status: `تم استيراد ${processed} من ${importData.length}` });
      }

      await logUserActivity(appUser, 'استيراد أصناف', `استيراد ${importData.length} صنف من ملف CSV`);
      notify(`تم استيراد ${importData.length} صنف بنجاح`, "success");
      setLastDoc(null);
      loadItems(false);
    } catch (err) {
      console.error(err);
      if (err.code === 'permission-denied') {
        notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
      } else {
        notify("حدث خطأ أثناء الاستيراد: " + err.message, "error");
      }
    }

    setGlobalLoading(false);
    setImportProgress({ total: 0, processed: 0, status: '' });
    setImportData([]);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newItem.serialNumber || !newItem.name) return notify("البيانات غير مكتملة", "warn");
    setGlobalLoading(true);
    const serial = normalizeSerial(newItem.serialNumber);
    const priceNum = Number(newItem.price) || 0;
    const qtyNum = Number(newItem.quantity) || 1;

    try {
      await runTransaction(db, async (t) => {
        const regRef = doc(db, 'serial_registry', serial);
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
        t.set(doc(collection(db, 'inventory')), docData);
        t.set(regRef, { exists: true, usedAt: serverTimestamp() });
      });
      
      await logUserActivity(appUser, 'إضافة صنف', `إضافة ${qtyNum} قطعة من ${newItem.name} (S/N: ${serial})`);
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
      await updateDoc(doc(db, 'inventory', id), { 
        name: dataToUpdate.name, 
        quantity: qtyNum, 
        price: priceNum,
        minStock: Number(dataToUpdate.minStock),
        searchKey: normalizeSearch(`${dataToUpdate.name} ${dataToUpdate.serialNumber}`),
        updatedAt: serverTimestamp()
      });
      
      await logUserActivity(appUser, 'تعديل صنف', `تعديل بيانات ${dataToUpdate.name} (S/N: ${dataToUpdate.serialNumber})`);
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
      if (error.code === 'permission-denied') {
        notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
      } else {
        notify("فشل تعديل الصنف: " + error.message, "error");
      }
    }
    setGlobalLoading(false);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`تأكيد حذف ${item.name}؟`)) return;
    setGlobalLoading(true);
    try {
      await updateDoc(doc(db, 'inventory', item.id), { isDeleted: true, quantity: 0, deletedAt: serverTimestamp() });
      await logUserActivity(appUser, 'حذف صنف', `تم حذف صنف: ${item.name} (S/N: ${item.serialNumber})`);
      setItems(prev => prev.filter(i => i.id !== item.id));
      notify("تم حذف الصنف", "success");
    } catch (error) {
      if (error.code === 'permission-denied') {
        notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
      } else {
        notify("فشل حذف الصنف: " + error.message, "error");
      }
    }
    setGlobalLoading(false);
  };

  const handleBulkUpdate = async () => {
    if (!bulkPercent || bulkPercent === 0) {
      notify("الرجاء إدخال نسبة مئوية صحيحة", "warn");
      return;
    }
    
    if (!window.confirm(`هل أنت متأكد من تعديل جميع أسعار الأصناف بنسبة ${bulkPercent}%؟\n\nملاحظة: هذا التعديل سيؤثر على جميع الأصناف في جميع المخازن.`)) {
      return;
    }
    
    setGlobalLoading(true);
    setImportProgress({ total: 0, processed: 0, status: 'جاري تحديث الأسعار...' });
    
    try {
      const q = query(
        collection(db, 'inventory'), 
        where('isDeleted', '==', false)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        notify("لا توجد أصناف للتحديث", "warn");
        setGlobalLoading(false);
        return;
      }
      
      const totalItems = snap.docs.length;
      setImportProgress({ total: totalItems, processed: 0, status: 'جاري تحديث الأسعار...' });
      
      const chunks = [];
      for (let i = 0; i < snap.docs.length; i += 400) {
        chunks.push(snap.docs.slice(i, i + 400));
      }
      
      let processed = 0;
      let updatedCount = 0;
      
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        chunk.forEach(d => {
          const data = d.data();
          const currentPrice = Number(data.price) || 0;
          
          const adjustment = currentPrice * (Number(bulkPercent) / 100);
          const newPrice = Math.max(0, Math.round(currentPrice + adjustment));
          
          if (newPrice !== currentPrice) {
            batch.update(d.ref, { 
              price: newPrice,
              updatedAt: serverTimestamp()
            });
            updatedCount++;
          }
        });
        
        await batch.commit();
        processed += chunk.length;
        setImportProgress({ total: totalItems, processed, status: `تم تحديث ${processed} من ${totalItems}` });
      }
      
      await logUserActivity(appUser, 'تعديل أسعار مجمع', `تعديل جميع الأسعار بنسبة ${bulkPercent}%، تم تحديث ${updatedCount} صنف`);
      
      if (updatedCount === 0) {
        notify("لم يتم تحديث أي صنف - الأسعار لم تتغير", "info");
      } else {
        notify(`تم تحديث أسعار ${updatedCount} صنف بنجاح`, "success");
      }
      
      setShowBulkUpdate(false);
      setBulkPercent(0);
      setLastDoc(null);
      loadItems(false);
      
    } catch(e) {
      console.error("Bulk update error:", e);
      if (e.code === 'permission-denied') {
        notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
      } else {
        notify("حدث خطأ أثناء تحديث الأسعار: " + e.message, "error");
      }
    } finally {
      setGlobalLoading(false);
      setImportProgress({ total: 0, processed: 0, status: '' });
    }
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="font-black text-lg mb-2 text-slate-800">معاينة بيانات الاستيراد</h3>
            <p className="text-xs text-slate-500 mb-4">عدد العناصر: {importData.length}</p>
            
            <div className="overflow-x-auto mb-4 max-h-60">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2">السيريال</th>
                    <th className="p-2">الاسم</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-center">السعر</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {importData.slice(0, 10).map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-mono">{item.serialNumber}</td>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-center">{item.price}</td>
                    </tr>
                  ))}
                  {importData.length > 10 && (
                    <tr><td colSpan="4" className="p-2 text-center text-slate-400">... و {importData.length - 10} عناصر أخرى</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={handleImportConfirm} 
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                تأكيد الاستيراد ({importData.length})
              </button>
              <button 
                onClick={() => { setShowImportModal(false); setImportData([]); }} 
                className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {importErrors.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <AlertTriangle size={20}/> أخطاء في ملف الاستيراد
            </h3>
            <div className="bg-rose-50 p-4 rounded-xl mb-4 max-h-60 overflow-y-auto">
              {importErrors.map((err, idx) => (
                <p key={idx} className="text-xs text-rose-700 mb-1">• {err}</p>
              ))}
            </div>
            <button 
              onClick={() => setImportErrors([])} 
              className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-colors"
            >
              فهمت
            </button>
          </div>
        </div>
      )}

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
            <h3 className="font-black text-lg mb-2 text-slate-800 flex items-center gap-2">
              <Percent className="text-indigo-600"/> تحديث الأسعار الشامل
            </h3>
            <p className="text-xs text-slate-500 mb-6 font-bold">
              أدخل النسبة المئوية (استخدم علامة - للخصم)
            </p>
            
            {importProgress.status && (
              <div className="mb-4 p-3 bg-indigo-50 rounded-lg">
                <p className="text-xs font-bold text-indigo-700 mb-2">{importProgress.status}</p>
                {importProgress.total > 0 && (
                  <div className="w-full bg-indigo-100 rounded-full h-2">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(importProgress.processed / importProgress.total) * 100}%` }}
                    ></div>
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-4">
               <div className="relative">
                  <input 
                    type="number" 
                    className="w-full border border-slate-200 p-3 pl-10 rounded-xl font-black outline-none focus:border-indigo-500 text-center text-lg bg-slate-50" 
                    value={bulkPercent} 
                    onChange={e => {
                      const val = e.target.value;
                      setBulkPercent(val === '' ? 0 : Number(val));
                    }} 
                    placeholder="مثال: 10 أو -5" 
                    dir="ltr" 
                    disabled={importProgress.status !== ''}
                  />
                  <span className="absolute left-4 top-3.5 text-slate-400 font-black">%</span>
               </div>
               
               <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                 <p className="text-[10px] text-amber-800 font-bold flex items-center gap-1">
                   <AlertTriangle size={12}/>
                   تنبيه: هذا التعديل سيؤثر على جميع الأصناف في جميع المخازن
                 </p>
               </div>
               
               <div className="flex gap-2 pt-2">
                 <button 
                   onClick={handleBulkUpdate} 
                   disabled={importProgress.status !== '' || !bulkPercent}
                   className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-black shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   {importProgress.status ? 'جاري التحديث...' : 'تطبيق على الكل'}
                 </button>
                 <button 
                   onClick={() => {
                     setShowBulkUpdate(false);
                     setBulkPercent(0);
                     setImportProgress({ total: 0, processed: 0, status: '' });
                   }} 
                   disabled={importProgress.status !== ''}
                   className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
                 >
                   إلغاء
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-50 pb-4">
             <h3 className="font-black text-lg flex items-center gap-2 text-slate-800"><Package size={22} className="text-indigo-600"/> إدارة المخزون</h3>
             <div className="flex flex-wrap gap-2 w-full md:w-auto">
                {appUser.role === 'admin' && (
                   <button 
                     onClick={()=>setShowBulkUpdate(true)} 
                     className="flex-1 md:flex-none bg-rose-50 text-rose-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-100 flex items-center justify-center gap-2"
                   >
                     <Percent size={14}/> تعديل الأسعار مجمع
                   </button>
                )}
                
                <button 
                  onClick={downloadTemplate}
                  className="flex-1 md:flex-none bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center justify-center gap-2"
                >
                  <DownloadIcon size={14}/> تحميل قالب
                </button>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".csv" 
                  onChange={handleFileSelect} 
                />
                <button 
                  onClick={()=>fileInputRef.current.click()} 
                  className="flex-1 md:flex-none bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center justify-center gap-2"
                >
                  <UploadCloud size={14}/> استيراد CSV
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

// ==========================================================================
// 📦 عرض النواقص
// ==========================================================================
function LowStockView({ lowStockItems, appUser, warehouseMap }) {
  const [items, setItems] = useState(lowStockItems || []);
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');

  useEffect(() => {
    if (!lowStockItems || lowStockItems.length === 0) {
      const fetchLowStock = async () => {
        try {
          const invSnap = await getDocs(collection(db, 'inventory'));
          let lowList = [];
          
          invSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!data.isDeleted) {
              if (appUser.permissions?.viewAllWarehouses || data.warehouseId === (appUser.assignedWarehouseId || 'main')) {
                const qty = Number(data.quantity) || 0;
                const minStock = Number(data.minStock) || 2;
                if (qty <= minStock) {
                  lowList.push({
                    id: doc.id,
                    name: data.name,
                    serialNumber: data.serialNumber,
                    quantity: qty,
                    minStock: minStock,
                    warehouseId: data.warehouseId,
                    price: data.price
                  });
                }
              }
            }
          });
          setItems(lowList);
        } catch (error) {
          console.error("Error fetching low stock:", error);
        }
      };
      fetchLowStock();
    } else {
      setItems(lowStockItems);
    }
  }, [lowStockItems, appUser]);

  const filteredItems = selectedWarehouse === 'all' 
    ? items 
    : items.filter(i => i.warehouseId === selectedWarehouse);

  const warehouses = [...new Set(items.map(i => i.warehouseId))];

  const handleCreateTransfer = (item) => {
    window.dispatchEvent(new CustomEvent('createTransferFromLowStock', { detail: item }));
  };

  const handleExport = () => {
    exportToCSV(filteredItems, 'Low_Stock_Report');
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <AlertOctagon className="text-rose-500" size={24}/> 
            الأصناف التي وصلت لحد الطلب
          </h2>
          
          <div className="flex gap-3">
            <select 
              className="border border-slate-200 p-2 rounded-lg text-sm font-bold bg-white focus:border-indigo-500 outline-none"
              value={selectedWarehouse}
              onChange={e => setSelectedWarehouse(e.target.value)}
            >
              <option value="all">كل المخازن</option>
              {warehouses.map(w => (
                <option key={w} value={w}>{warehouseMap[w] || w}</option>
              ))}
            </select>
            
            <button 
              onClick={handleExport} 
              disabled={filteredItems.length === 0}
              className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={14}/> تصدير
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs">
              <tr>
                <th className="p-4">الباركود</th>
                <th className="p-4">المنتج</th>
                <th className="p-4 text-center">المخزن</th>
                <th className="p-4 text-center">الكمية الحالية</th>
                <th className="p-4 text-center">حد الطلب</th>
                <th className="p-4 text-center">الحالة</th>
                <th className="p-4 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredItems.length === 0 ? (
                <tr><td colSpan="7" className="p-8 text-center text-slate-400 font-bold">لا توجد أصناف وصلت لحد الطلب</td></tr>
              ) : filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono text-slate-500">{item.serialNumber}</td>
                  <td className="p-4 font-bold text-slate-800">{item.name}</td>
                  <td className="p-4 text-center font-bold text-indigo-600">{warehouseMap[item.warehouseId] || item.warehouseId}</td>
                  <td className="p-4 text-center font-black text-rose-600">{item.quantity}</td>
                  <td className="p-4 text-center font-bold text-slate-600">{item.minStock}</td>
                  <td className="p-4 text-center">
                    <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                      ناقص
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => handleCreateTransfer(item)}
                      className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors border border-indigo-100 flex items-center gap-1 mx-auto"
                    >
                      <Plus size={12}/> طلب تحويل
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

// ==========================================================================
// 📊 مدير التقارير
// ==========================================================================
function ReportsManager({ notify }) {
  const [transactions, setTransactions] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadReports = useCallback(async (isNextPage = false) => {
    setLoading(true);
    setError(null);
    try {
        let q = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'));
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
        console.error("Error loading reports:", e);
        setError(e.message);
        if (e.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("حدث خطأ أثناء تحميل التقارير", "error");
        }
    }
    setLoading(false);
  }, [lastDoc, notify]);

  useEffect(() => {
    setLastDoc(null);
    loadReports(false);
  }, []);

  const handleExport = () => {
    if (!transactions || transactions.length === 0) {
      notify("لا توجد بيانات للتصدير", "warn");
      return;
    }
    
    try {
      const exportData = transactions.map(t => ({
        'رقم الفاتورة': t.invoiceNumber || '-',
        'التاريخ': formatDate(t.timestamp),
        'الصنف': t.itemName || '-',
        'السيريال': t.serialNumber || '-',
        'العميل': t.customerName || '-',
        'الفني المختص': t.technicianName || '-',
        'الخصم': t.discountAmount || 0,
        'الصافي': t.finalTotal || t.total || 0,
        'البائع': t.operator || '-'
      }));
      exportToCSV(exportData, `Sales_${new Date().toISOString().split('T')[0]}`);
      notify("تم تصدير الملف بنجاح", "success");
    } catch (err) {
      console.error("Export error:", err);
      notify("حدث خطأ أثناء التصدير", "error");
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-right" dir="rtl">
       <div className="p-5 border-b flex justify-between items-center bg-slate-50">
         <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
           <History className="text-indigo-600" size={20}/> سجل المبيعات
         </h2>
         <div className="flex items-center gap-3">
             {loading && <Loader2 className="animate-spin text-indigo-500" size={16}/>}
             <button 
               onClick={handleExport} 
               disabled={transactions.length === 0}
               className="flex items-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
             >
                 <Download size={14} /> تصدير إكسيل
             </button>
         </div>
       </div>
       
       {error && (
         <div className="p-4 bg-rose-50 border-b border-rose-200 text-rose-700 text-sm font-bold flex items-center gap-2">
           <AlertTriangle size={16} />
           خطأ في تحميل البيانات: {error}. تأكد من إعدادات قواعد الأمان في Firebase.
         </div>
       )}
       
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
// ==========================================================================
// 📦 مدير التحويلات المحسن
// ==========================================================================
function EnhancedTransferManager({ appUser, warehouseMap, notify, setGlobalLoading }) {
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

  const currentWarehouseId = appUser.assignedWarehouseId || 'main';
  const isMainWarehouse = currentWarehouseId === 'main' || appUser.role === 'admin';
  const canApprove = appUser.role === 'main_warehouse_manager' || appUser.role === 'admin';

  useEffect(() => {
    let q = collection(db, 'transfers');
    
    if (!appUser.permissions?.viewAllWarehouses) {
      if (isMainWarehouse) {
        q = query(q, where('fromWarehouseId', '==', 'main'), orderBy('createdAt', 'desc'));
      } else {
        q = query(q, where('toWarehouseId', '==', currentWarehouseId), orderBy('createdAt', 'desc'));
      }
    } else {
      q = query(q, orderBy('createdAt', 'desc'));
    }

    const unsub = onSnapshot(query(q, limit(150)), snap => {
       const fetched = snap.docs.map(d => ({id: d.id, ...d.data()}));
       setTransfers(fetched);
    });

    const invUnsub = onSnapshot(
      query(collection(db, 'inventory'), where('warehouseId', '==', currentWarehouseId), where('isDeleted', '==', false)),
      snap => {
        setInventory(snap.docs.map(d => ({id: d.id, ...d.data()})));
      }
    );

    return () => { unsub(); invUnsub(); };
  }, [appUser, currentWarehouseId, isMainWarehouse]);

  useEffect(() => {
    if (selectedWarehouse === 'all') {
      setFilteredTransfers(transfers);
    } else {
      setFilteredTransfers(transfers.filter(t => t.toWarehouseId === selectedWarehouse));
    }
  }, [transfers, selectedWarehouse]);

  const handleSearchProduct = (e) => {
    e.preventDefault();
    if (!searchProduct.trim() || inventory.length === 0) return;
    
    const term = normalizeSearch(searchProduct);
    const found = inventory.find(i => 
      i.serialNumber?.toLowerCase().includes(term) || 
      i.name?.toLowerCase().includes(term)
    );
    
    if (found) {
      setSelectedProduct(found);
      setSearchProduct('');
    } else {
      notify("لم يتم العثور على المنتج في مخزنك", "warn");
    }
  };

  const handleSubmitRequest = async () => {
      if (!selectedProduct) return notify("اختر منتجاً أولاً", "warn");
      if (!toWarehouseId) return notify("اختر المخزن المرسل إليه", "warn");
      if (reqQty <= 0) return notify("الكمية غير صالحة", "warn");
      if (reqQty > selectedProduct.quantity) return notify("الكمية المطلوبة أكبر من المتاح في مخزنك!", "error");
      
      setGlobalLoading(true);
      try {
          await addDoc(collection(db, 'transfers'), {
              serialNumber: selectedProduct.serialNumber,
              itemName: selectedProduct.name,
              requestedQty: Number(reqQty),
              fromWarehouseId: currentWarehouseId,
              toWarehouseId: toWarehouseId,
              status: 'pending', 
              createdAt: serverTimestamp(),
              requestedBy: appUser.name || appUser.email,
              requestedById: appUser.id,
              notes: ''
          });
          
          await logUserActivity(appUser, 'طلب تحويل مخزني', `طلب تحويل ${reqQty} قطعة من ${selectedProduct.name} إلى ${warehouseMap[toWarehouseId]}`);
          notify("تم إرسال طلب التحويل بنجاح", "success");
          setSelectedProduct(null);
          setSearchProduct('');
          setReqQty(1);
          setToWarehouseId('');
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
              const fromQ = query(
                collection(db, 'inventory'), 
                where('serialNumber', '==', req.serialNumber), 
                where('warehouseId', '==', req.fromWarehouseId), 
                where('isDeleted', '==', false)
              );
              const fromSnap = await getDocs(fromQ);
              if (fromSnap.empty) throw new Error("المنتج غير موجود في المخزن المرسل!");
              const fromItem = fromSnap.docs[0];
              
              if (fromItem.data().quantity < req.requestedQty) throw new Error("الكمية غير كافية!");

              const toQ = query(
                collection(db, 'inventory'), 
                where('serialNumber', '==', req.serialNumber), 
                where('warehouseId', '==', req.toWarehouseId), 
                where('isDeleted', '==', false)
              );
              const toSnap = await getDocs(toQ);

              t.update(fromItem.ref, {
                  quantity: increment(-req.requestedQty)
              });

              if (!toSnap.empty) {
                  const toItem = toSnap.docs[0];
                  t.update(toItem.ref, {
                      quantity: increment(req.requestedQty)
                  });
              } else {
                  const newRef = doc(collection(db, 'inventory'));
                  t.set(newRef, {
                      ...fromItem.data(),
                      warehouseId: req.toWarehouseId,
                      quantity: req.requestedQty,
                      createdAt: serverTimestamp()
                  });
              }

              const reqRef = doc(db, 'transfers', req.id);
              t.update(reqRef, {
                  status: 'approved',
                  processedAt: serverTimestamp(),
                  processedBy: appUser.name || appUser.email,
                  processedById: appUser.id
              });
          });
          
          await logUserActivity(appUser, 'موافقة على تحويل مخزني', `تمت الموافقة لفرع ${warehouseMap[req.toWarehouseId]} على ${req.requestedQty} قطعة من ${req.itemName}`);
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
          await updateDoc(doc(db, 'transfers', rejectingReq.id), {
              status: 'rejected',
              rejectReason: rejectReason,
              processedAt: serverTimestamp(),
              processedBy: appUser.name || appUser.email,
              processedById: appUser.id
          });
          
          await logUserActivity(appUser, 'رفض تحويل مخزني', `رفض طلب فرع ${warehouseMap[rejectingReq.toWarehouseId]} بسبب: ${rejectReason}`);
          notify("تم رفض الطلب بنجاح", "success");
          setRejectingReq(null);
          setRejectReason('');
      } catch(err) {
          console.error(err);
          notify("فشل عملية الرفض", "error");
      }
      setGlobalLoading(false);
  };

  const pendingRequests = filteredTransfers.filter(t => t.status === 'pending');
  const processedRequests = filteredTransfers.filter(t => t.status !== 'pending');
  const uniqueWarehouses = [...new Set(transfers.map(t => t.toWarehouseId))];

  return (
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden text-right" dir="rtl">
          {rejectingReq && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
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
                 نظام التحويلات بين المخازن
              </h2>
              <div className="flex gap-2">
                  <select 
                    className="border border-slate-200 p-2 rounded-lg text-sm font-bold bg-white focus:border-indigo-500 outline-none"
                    value={selectedWarehouse}
                    onChange={e => setSelectedWarehouse(e.target.value)}
                  >
                    <option value="all">كل الفروع</option>
                    {uniqueWarehouses.map(w => (
                      <option key={w} value={w}>{warehouseMap[w] || w}</option>
                    ))}
                  </select>
                  <span className="bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-xs font-bold">
                    {pendingRequests.length} طلبات قيد الانتظار
                  </span>
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
              {appUser.permissions?.createTransfer && (
                  <button 
                    onClick={()=>setActiveTab('new')} 
                    className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'new' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    طلب تحويل جديد
                  </button>
              )}
          </div>

          <div className="p-6 max-h-[65vh] overflow-y-auto custom-scrollbar bg-slate-50/50">
              
              {activeTab === 'new' && (
                  <div className="max-w-xl mx-auto space-y-6">
                      <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 text-indigo-800 font-bold text-sm leading-relaxed shadow-sm">
                          ابحث عن المنتج في مخزنك واختر الكمية والمخزن المرسل إليه
                      </div>
                      
                      <form onSubmit={handleSearchProduct} className="flex gap-3">
                          <input 
                              className="flex-1 border border-slate-200 p-3 rounded-xl outline-none font-bold text-right bg-white focus:border-indigo-500" 
                              placeholder="ابحث بالاسم أو السيريال..." 
                              value={searchProduct} 
                              onChange={e=>setSearchProduct(e.target.value)} 
                          />
                          <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-indigo-700">
                              <Search size={18}/>
                          </button>
                      </form>

                      {selectedProduct && (
                          <div className="bg-white border-2 border-indigo-100 rounded-2xl p-6 shadow-md space-y-4">
                              <div className="flex justify-between items-center">
                                  <h3 className="font-black text-lg text-slate-800">{selectedProduct.name}</h3>
                                  <button onClick={() => setSelectedProduct(null)} className="text-slate-400 hover:text-rose-500">
                                      <X size={18}/>
                                  </button>
                              </div>
                              <p className="text-slate-500 font-mono text-sm">{selectedProduct.serialNumber}</p>
                              <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl font-bold text-sm">
                                  المتاح في مخزنك: {selectedProduct.quantity}
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">الكمية المطلوبة</label>
                                      <input 
                                          type="number" 
                                          min="1" 
                                          max={selectedProduct.quantity}
                                          className="w-full border border-slate-200 p-3 rounded-xl font-bold text-center" 
                                          value={reqQty} 
                                          onChange={e=>setReqQty(e.target.value)} 
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">المخزن المرسل إليه</label>
                                      <select 
                                          className="w-full border border-slate-200 p-3 rounded-xl font-bold bg-white"
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

                              <button 
                                  onClick={handleSubmitRequest} 
                                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-colors flex items-center justify-center gap-2"
                              >
                                  <ArrowRightLeft size={18}/> إرسال طلب التحويل
                              </button>
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
                                      <th className="p-4">من مخزن</th>
                                      <th className="p-4">إلى مخزن</th>
                                      <th className="p-4">المنتج</th>
                                      <th className="p-4 text-center">الكمية</th>
                                      <th className="p-4">بواسطة</th>
                                      <th className="p-4 text-center">الإجراء</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {pendingRequests.length === 0 ? <tr><td colSpan="6" className="p-12 text-center text-slate-400 font-bold text-sm">لا توجد طلبات معلقة</td></tr> :
                                      pendingRequests.map(req => (
                                          <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="p-4 font-black text-indigo-700">{warehouseMap[req.fromWarehouseId]}</td>
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
                                                  {canApprove ? (
                                                      <div className="flex justify-center gap-2">
                                                          <button onClick={()=>handleApprove(req)} className="bg-emerald-50 text-emerald-600 p-2 rounded-xl hover:bg-emerald-500 hover:text-white" title="موافقة">
                                                              <Check size={18}/>
                                                          </button>
                                                          <button onClick={()=>setRejectingReq(req)} className="bg-rose-50 text-rose-600 p-2 rounded-xl hover:bg-rose-500 hover:text-white" title="رفض">
                                                              <X size={18}/>
                                                          </button>
                                                      </div>
                                                  ) : (
                                                      <span className="bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-amber-100 flex items-center gap-1 w-max mx-auto">
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
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-right text-sm">
                              <thead className="bg-slate-50 text-slate-500 font-bold border-b text-[11px] uppercase">
                                  <tr>
                                      <th className="p-4">من مخزن</th>
                                      <th className="p-4">إلى مخزن</th>
                                      <th className="p-4">المنتج</th>
                                      <th className="p-4 text-center">الكمية</th>
                                      <th className="p-4">الحالة</th>
                                      <th className="p-4">التاريخ</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {processedRequests.length === 0 ? <tr><td colSpan="6" className="p-12 text-center text-slate-400 font-bold text-sm">لا يوجد سجل للتحويلات</td></tr> :
                                      processedRequests.map(req => (
                                          <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="p-4 font-bold text-slate-700">{warehouseMap[req.fromWarehouseId]}</td>
                                              <td className="p-4 font-bold text-slate-700">{warehouseMap[req.toWarehouseId]}</td>
                                              <td className="p-4">
                                                  <p className="font-bold text-slate-800 mb-0.5">{req.itemName}</p>
                                                  <p className="text-[10px] font-mono text-slate-500">{req.serialNumber}</p>
                                              </td>
                                              <td className="p-4 text-center font-black text-slate-700">{req.requestedQty}</td>
                                              <td className="p-4">
                                                  {req.status === 'approved' ? (
                                                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-bold">
                                                          <Check size={12}/> تمت الموافقة
                                                      </span>
                                                  ) : (
                                                      <div>
                                                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-2 py-1 rounded-lg text-[10px] font-bold">
                                                              <X size={12}/> مرفوض
                                                          </span>
                                                          <p className="text-[9px] text-rose-600 mt-1">{req.rejectReason}</p>
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

// ==========================================================================
// 👥 مدير العملاء المحسن
// ==========================================================================
function EnhancedCustomerManager({ systemSettings, notify, setGlobalLoading, appUser }) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 700);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCust, setNewCust] = useState({ 
    name: '', 
    phone: '', 
    productCategory: '', 
    productModel: '', 
    issue: '', 
    notes: '',
    governorate: '',
    city: '',
    address: '',
    assignedTechnician: '',
    assignedMaintenanceCenter: '',
    assignedCallCenter: ''
  });
  
  const [technicians, setTechnicians] = useState([]);
  const [maintenanceCenters, setMaintenanceCenters] = useState([]);
  const [callCenters, setCallCenters] = useState([]);
  
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const techs = await getDocs(query(collection(db, 'employees'), where('role', '==', 'technician'), where('isDisabled', '==', false)));
        setTechnicians(techs.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const centers = await getDocs(query(collection(db, 'employees'), where('role', '==', 'maintenance_center'), where('isDisabled', '==', false)));
        setMaintenanceCenters(centers.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const calls = await getDocs(query(collection(db, 'employees'), where('role', '==', 'call_center'), where('isDisabled', '==', false)));
        setCallCenters(calls.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching employees:", error);
      }
    };
    fetchEmployees();
  }, []);

  const loadCustomers = useCallback(async (isNextPage = false) => {
    setLoadingData(true);
    try {
        let q = collection(db, 'customers');
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
        if (e.code === 'permission-denied') {
           notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else if (e.message.includes('index')) {
           notify("يحتاج هذا البحث لتهيئة الفهارس الخاصة بقاعدة البيانات", "warn");
        } else {
           notify("فشل جلب العملاء: " + e.message, "error");
        }
    }
    setLoadingData(false);
  }, [debouncedSearch, lastDoc, notify]);

  useEffect(() => {
    setLastDoc(null);
    loadCustomers(false);
  }, [debouncedSearch]);

  const handleAddCustomer = async (e) => {
     e.preventDefault();
     if(!newCust.name || !newCust.phone) return notify("الاسم ورقم الهاتف مطلوبان", "warn");
     
     setGlobalLoading(true);
     try {
        const customerData = {
           ...newCust,
           createdAt: serverTimestamp(),
           createdBy: appUser.id,
           createdByName: appUser.name,
           searchKey: normalizeSearch(`${newCust.name} ${newCust.phone}`),
           addressFull: newCust.governorate && newCust.city && newCust.address 
             ? `${newCust.governorate} - ${newCust.city} - ${newCust.address}`
             : ''
        };

        await addDoc(collection(db, 'customers'), customerData);
        
        await logUserActivity(appUser, 'إضافة عميل', `تسجيل العميل: ${newCust.name}`);
        notify("تم تسجيل العميل بنجاح", "success");
        setShowAddModal(false);
        setNewCust({ 
          name: '', phone: '', productCategory: '', productModel: '', issue: '', notes: '',
          governorate: '', city: '', address: '', assignedTechnician: '', assignedMaintenanceCenter: '', assignedCallCenter: ''
        });
        setLastDoc(null);
        loadCustomers(false); 
     } catch(err) {
        console.error(err);
        if (err.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("حدث خطأ أثناء الحفظ: " + err.message, "error");
        }
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-right" dir="rtl">
      
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="font-black text-xl mb-6 text-slate-800 border-b pb-4 flex items-center gap-2">
              <UserCog className="text-indigo-600"/> تسجيل بيانات عميل جديد
            </h3>
            <form onSubmit={handleAddCustomer} className="space-y-6">
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

               <div className="bg-sky-50/50 p-4 rounded-xl border border-sky-100">
                  <h4 className="font-bold text-sm text-sky-900 mb-3 flex items-center gap-2">
                    <MapPin size={16}/> عنوان العميل
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-sky-800 mb-1">المحافظة</label>
                        <select 
                          className="w-full border border-sky-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold"
                          value={newCust.governorate}
                          onChange={e => setNewCust({...newCust, governorate: e.target.value})}
                        >
                           <option value="">-- اختر المحافظة --</option>
                           {EGYPT_GOVERNORATES.map(gov => (
                             <option key={gov} value={gov}>{gov}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-sky-800 mb-1">المدينة / المركز</label>
                        <input 
                          className="w-full border border-sky-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold" 
                          value={newCust.city} 
                          onChange={e=>setNewCust({...newCust, city:e.target.value})} 
                          placeholder="مثال: مدينة نصر" 
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-sky-800 mb-1">العنوان بالتفصيل</label>
                        <input 
                          className="w-full border border-sky-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold" 
                          value={newCust.address} 
                          onChange={e=>setNewCust({...newCust, address:e.target.value})} 
                          placeholder="الشارع - العمارة - الشقة" 
                        />
                     </div>
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

               <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                  <h4 className="font-bold text-sm text-emerald-900 mb-3 flex items-center gap-2">
                    <Users size={16}/> تعيين المسؤولين
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-emerald-800 mb-1">الفني المختص</label>
                        <select 
                          className="w-full border border-emerald-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold"
                          value={newCust.assignedTechnician}
                          onChange={e => setNewCust({...newCust, assignedTechnician: e.target.value})}
                        >
                           <option value="">-- غير محدد --</option>
                           {technicians.map(t => (
                             <option key={t.id} value={t.id}>{t.name}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-emerald-800 mb-1">مركز الصيانة</label>
                        <select 
                          className="w-full border border-emerald-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold"
                          value={newCust.assignedMaintenanceCenter}
                          onChange={e => setNewCust({...newCust, assignedMaintenanceCenter: e.target.value})}
                        >
                           <option value="">-- غير محدد --</option>
                           {maintenanceCenters.map(m => (
                             <option key={m.id} value={m.id}>{m.name}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-emerald-800 mb-1">الكول سنتر</label>
                        <select 
                          className="w-full border border-emerald-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold"
                          value={newCust.assignedCallCenter}
                          onChange={e => setNewCust({...newCust, assignedCallCenter: e.target.value})}
                        >
                           <option value="">-- غير محدد --</option>
                           {callCenters.map(c => (
                             <option key={c.id} value={c.id}>{c.name}</option>
                           ))}
                        </select>
                     </div>
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
                    placeholder="أي تفاصيل أخرى..." 
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
                  <th className="p-4">العنوان</th>
                  <th className="p-4">المسؤولون</th>
                  <th className="p-4 text-center">التاريخ</th>
                  <th className="p-4 text-center">إدارة</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-xs">
               {customers.length === 0 && !loadingData ? 
                 <tr><td colSpan="6" className="p-10 text-center text-slate-400 font-bold">لا توجد سجلات للعملاء</td></tr> : 
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
                        {c.governorate ? (
                           <>
                             <p className="text-slate-800 font-bold text-[11px]">{c.governorate}</p>
                             <p className="text-slate-500 text-[10px] truncate">{c.city} - {c.address}</p>
                           </>
                        ) : <span className="text-slate-400">-</span>}
                     </td>
                     <td className="p-4">
                        <div className="space-y-1">
                           {c.assignedTechnician && <span className="inline-block bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[8px] font-bold ml-1">فني</span>}
                           {c.assignedMaintenanceCenter && <span className="inline-block bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-[8px] font-bold ml-1">صيانة</span>}
                           {c.assignedCallCenter && <span className="inline-block bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded text-[8px] font-bold">كول سنتر</span>}
                        </div>
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
// ==========================================================================
// 👤 عرض ملف العميل
// ==========================================================================
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
                  collection(db, 'transactions'), 
                  where('phone', '==', customer.phone), 
                  orderBy('timestamp', 'desc'), 
                  limit(100)
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
                setHistory(data);
            } catch(e) {
                console.error(e);
                if (e.code === 'permission-denied') {
                  notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
                } else {
                  notify("فشل جلب السجل: " + e.message, "error");
                }
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
            collection(db, 'inventory'), 
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
                 const ref = doc(db, 'inventory', cartItem.id);
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

             t.set(doc(collection(db, 'transactions')), {
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
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden text-right flex flex-col max-h-full" dir="rtl">
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
                  <div className="mt-3 text-xs text-slate-500">
                    <p>المحافظة: {customer.governorate || '-'}</p>
                    <p>المدينة: {customer.city || '-'}</p>
                    <p>العنوان: {customer.address || '-'}</p>
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

// ==========================================================================
// 🎫 مدير التذاكر المحسن
// ==========================================================================
function EnhancedTicketManager({ systemSettings, notify, setGlobalLoading, appUser, warehouseMap, onGenerateInvoice }) {
  const [tickets, setTickets] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 700);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [spareParts, setSpareParts] = useState([]);
  const [showSparePartsModal, setShowSparePartsModal] = useState(false);
  
  const [technicians, setTechnicians] = useState([]);
  const [maintenanceCenters, setMaintenanceCenters] = useState([]);
  const [callCenters, setCallCenters] = useState([]);
  
  const [newTicket, setNewTicket] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    deviceType: '',
    deviceModel: '',
    issue: '',
    status: 'created',
    assignedTechnician: '',
    assignedMaintenanceCenter: '',
    assignedCallCenter: '',
    estimatedCost: 0,
    notes: '',
    spareParts: []
  });

  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const techs = await getDocs(query(collection(db, 'employees'), where('role', '==', 'technician'), where('isDisabled', '==', false)));
        setTechnicians(techs.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const centers = await getDocs(query(collection(db, 'employees'), where('role', '==', 'maintenance_center'), where('isDisabled', '==', false)));
        setMaintenanceCenters(centers.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const calls = await getDocs(query(collection(db, 'employees'), where('role', '==', 'call_center'), where('isDisabled', '==', false)));
        setCallCenters(calls.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching employees:", error);
      }
    };
    fetchEmployees();
  }, []);

  useEffect(() => {
    loadTickets(false);
  }, [debouncedSearch, filterStatus]);

  const loadTickets = useCallback(async (isNextPage = false) => {
    setLoadingData(true);
    try {
        let q = collection(db, 'tickets');
        
        if (filterStatus !== 'all') {
          q = query(q, where('status', '==', filterStatus));
        }
        
        q = query(q, orderBy('createdAt', 'desc'));

        if (isNextPage && lastDoc) {
           q = query(q, startAfter(lastDoc));
        }

        q = query(q, limit(30));
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (isNextPage) {
           setTickets(prev => [...prev, ...fetched]);
        } else {
           setTickets(fetched);
        }
        
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 30);
    } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
           notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else if (e.message.includes('index')) {
           notify("يحتاج هذا البحث لتهيئة الفهارس الخاصة بقاعدة البيانات", "warn");
        } else {
           notify("فشل جلب التذاكر: " + e.message, "error");
        }
    }
    setLoadingData(false);
  }, [filterStatus, lastDoc, notify]);

  const handleAddTicket = async (e) => {
     e.preventDefault();
     if(!newTicket.customerName || !newTicket.customerPhone) return notify("اسم العميل ورقم الهاتف مطلوبان", "warn");
     
     setGlobalLoading(true);
     try {
        const ticketData = {
           ...newTicket,
           ticketNumber: 'TKT-' + Date.now().toString().slice(-8),
           createdAt: serverTimestamp(),
           createdBy: appUser.id,
           createdByName: appUser.name,
           updatedAt: serverTimestamp(),
           spareParts: [],
           totalCost: 0,
           history: [{
             status: 'created',
             timestamp: serverTimestamp(),
             by: appUser.name
           }]
        };

        const docRef = await addDoc(collection(db, 'tickets'), ticketData);
        
        await logUserActivity(appUser, 'إضافة تذكرة صيانة', `تذكرة جديدة للعميل: ${newTicket.customerName}`);
        notify("تم إنشاء تذكرة الصيانة بنجاح", "success");
        setShowAddModal(false);
        setNewTicket({
          customerId: '', customerName: '', customerPhone: '', deviceType: '', deviceModel: '',
          issue: '', status: 'created', assignedTechnician: '', assignedMaintenanceCenter: '',
          assignedCallCenter: '', estimatedCost: 0, notes: '', spareParts: []
        });
        setLastDoc(null);
        loadTickets(false); 
     } catch(err) {
        console.error(err);
        if (err.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("حدث خطأ أثناء الحفظ: " + err.message, "error");
        }
     }
     setGlobalLoading(false);
  };

  const handleUpdateStatus = async (ticketId, newStatus) => {
    setGlobalLoading(true);
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const ticketSnap = await getDoc(ticketRef);
      const currentTicket = ticketSnap.data();

      const history = currentTicket.history || [];
      history.push({
        status: newStatus,
        timestamp: serverTimestamp(),
        by: appUser.name
      });

      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
        history
      });

      await logUserActivity(appUser, 'تحديث حالة تذكرة', `تغيير حالة التذكرة ${ticketId} إلى ${newStatus}`);
      notify("تم تحديث حالة التذكرة", "success");
    } catch (err) {
      console.error(err);
      if (err.code === 'permission-denied') {
        notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
      } else {
        notify("فشل تحديث الحالة: " + err.message, "error");
      }
    }
    setGlobalLoading(false);
  };

  const handleAddSparePart = async (ticketId, part) => {
    setGlobalLoading(true);
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const ticketSnap = await getDoc(ticketRef);
      const currentTicket = ticketSnap.data();

      const spareParts = currentTicket.spareParts || [];
      const newPart = {
        ...part,
        id: Date.now().toString(),
        addedAt: serverTimestamp(),
        addedBy: appUser.name
      };

      spareParts.push(newPart);

      const totalCost = (currentTicket.totalCost || 0) + (part.price * part.quantity);

      await updateDoc(ticketRef, {
        spareParts,
        totalCost,
        updatedAt: serverTimestamp()
      });

      await logUserActivity(appUser, 'إضافة قطعة غيار', `إضافة ${part.name} للتذكرة ${ticketId}`);
      notify("تم إضافة قطعة الغيار", "success");
    } catch (err) {
      console.error(err);
      if (err.code === 'permission-denied') {
        notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
      } else {
        notify("فشل إضافة قطعة الغيار: " + err.message, "error");
      }
    }
    setGlobalLoading(false);
  };

  const handleGenerateInvoice = (ticket) => {
    onGenerateInvoice(ticket);
  };

  const StatusSelect = ({ value, onChange, ticketId }) => (
    <SimpleSelect
      options={ticketStatusOptions}
      value={value}
      onChange={(selected) => onChange(ticketId, selected.value)}
      placeholder="اختر الحالة..."
      className="w-40"
    />
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-right" dir="rtl">
      
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="font-black text-xl mb-6 text-slate-800 border-b pb-4 flex items-center gap-2">
              <MessageSquare className="text-indigo-600"/> إنشاء تذكرة صيانة جديدة
            </h3>
            <form onSubmit={handleAddTicket} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">اسم العميل *</label>
                  <input required className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold" value={newTicket.customerName} onChange={e=>setNewTicket({...newTicket, customerName:e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">رقم الهاتف *</label>
                  <input required className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold" value={newTicket.customerPhone} onChange={e=>setNewTicket({...newTicket, customerPhone:e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">نوع الجهاز</label>
                  <input className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold" value={newTicket.deviceType} onChange={e=>setNewTicket({...newTicket, deviceType:e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">الموديل</label>
                  <input className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold" value={newTicket.deviceModel} onChange={e=>setNewTicket({...newTicket, deviceModel:e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">المشكلة</label>
                <textarea rows="2" className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold resize-none" value={newTicket.issue} onChange={e=>setNewTicket({...newTicket, issue:e.target.value})} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">التكلفة التقديرية</label>
                  <input type="number" min="0" className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold" value={newTicket.estimatedCost} onChange={e=>setNewTicket({...newTicket, estimatedCost: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">الفني المختص</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold" value={newTicket.assignedTechnician} onChange={e=>setNewTicket({...newTicket, assignedTechnician:e.target.value})}>
                    <option value="">-- اختر --</option>
                    {technicians.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">مركز الصيانة</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white text-sm font-bold" value={newTicket.assignedMaintenanceCenter} onChange={e=>setNewTicket({...newTicket, assignedMaintenanceCenter:e.target.value})}>
                    <option value="">-- اختر --</option>
                    {maintenanceCenters.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات إضافية</label>
                <input className="w-full border border-slate-200 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 text-sm font-bold" value={newTicket.notes} onChange={e=>setNewTicket({...newTicket, notes:e.target.value})} />
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors flex items-center justify-center gap-2">
                  <Save size={18}/> إنشاء التذكرة
                </button>
                <button type="button" onClick={()=>setShowAddModal(false)} className="px-6 bg-slate-100 text-slate-600 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSparePartsModal && selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 border-b pb-3 flex items-center gap-2">
              <Package size={20} className="text-indigo-600"/> إضافة قطع غيار للتذكرة #{selectedTicket.ticketNumber}
            </h3>
            
            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-bold">العميل: {selectedTicket.customerName}</p>
              
              <div className="bg-slate-50 p-4 rounded-xl">
                <p className="text-center text-slate-500 text-sm">
                  قريباً - إضافة قطع الغيار
                </p>
              </div>
              
              <div className="flex gap-2 pt-4">
                <button onClick={() => setShowSparePartsModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-200">إغلاق</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-5 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50">
         <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
           <MessageSquare className="text-indigo-600" size={20}/> تذاكر الصيانة
         </h2>
         <div className="flex gap-2 w-full sm:w-auto">
             <div className="relative flex-1 sm:w-48">
                 <Search className="absolute right-3 top-2.5 text-slate-400" size={16}/>
                 <input 
                   className="w-full border border-slate-200 py-2 pr-9 pl-3 rounded-lg outline-none text-xs font-bold focus:border-indigo-500" 
                   placeholder="بحث..." 
                   value={search} 
                   onChange={e=>setSearch(e.target.value)} 
                 />
             </div>
             
             <select 
               className="border border-slate-200 p-2 rounded-lg text-xs font-bold bg-white focus:border-indigo-500 outline-none"
               value={filterStatus}
               onChange={e => setFilterStatus(e.target.value)}
             >
               <option value="all">كل الحالات</option>
               {TICKET_STATUSES.map(s => (
                 <option key={s.value} value={s.value}>{s.label}</option>
               ))}
             </select>
             
             {loadingData && <Loader2 className="animate-spin text-indigo-500 mt-2 sm:mt-0" size={16}/>}
             <button 
               onClick={()=>setShowAddModal(true)} 
               className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm whitespace-nowrap"
             >
                <Plus size={14}/> تذكرة جديدة
             </button>
         </div>
      </div>

      <div className="overflow-x-auto max-h-[70vh] custom-scrollbar">
         <table className="w-full text-right text-sm">
            <thead className="bg-white border-b text-slate-500 font-bold text-[11px] uppercase sticky top-0">
               <tr>
                  <th className="p-4">رقم التذكرة</th>
                  <th className="p-4">العميل</th>
                  <th className="p-4">الجهاز</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4">قطع الغيار</th>
                  <th className="p-4 text-center">التكلفة</th>
                  <th className="p-4">آخر تحديث</th>
                  <th className="p-4 text-center">إجراءات</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-xs">
               {tickets.length === 0 && !loadingData ? 
                 <tr><td colSpan="8" className="p-10 text-center text-slate-400 font-bold">لا توجد تذاكر</td></tr> : 
                 tickets.map((t) => {
                   const statusInfo = TICKET_STATUSES.find(s => s.value === t.status) || { label: t.status, color: 'gray' };
                   return (
                   <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                     <td className="p-4 font-mono font-bold text-indigo-600">{t.ticketNumber || t.id.slice(0,8)}</td>
                     <td className="p-4">
                        <p className="font-bold text-slate-800">{t.customerName}</p>
                        <p className="text-[10px] text-slate-500">{t.customerPhone}</p>
                     </td>
                     <td className="p-4">
                        <p className="font-bold text-slate-800">{t.deviceType || '-'}</p>
                        <p className="text-[10px] text-slate-500">{t.deviceModel || ''}</p>
                     </td>
                     <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold inline-block bg-${statusInfo.color}-100 text-${statusInfo.color}-700 border border-${statusInfo.color}-200`}>
                          {statusInfo.label}
                        </span>
                     </td>
                     <td className="p-4">
                        <span className="font-bold text-slate-800">{t.spareParts?.length || 0}</span>
                     </td>
                     <td className="p-4 text-center font-black text-emerald-600">{t.totalCost || 0} ج</td>
                     <td className="p-4 text-slate-500 text-[10px]">{formatDate(t.updatedAt || t.createdAt)}</td>
                     <td className="p-4 text-center">
                        <div className="flex justify-center gap-1">
                           <StatusSelect 
                             value={t.status} 
                             onChange={handleUpdateStatus} 
                             ticketId={t.id}
                           />
                           {appUser.permissions?.addSpareParts && (
                             <button 
                               onClick={() => { setSelectedTicket(t); setShowSparePartsModal(true); }} 
                               className="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"
                               title="إضافة قطع غيار"
                             >
                               <Package size={14}/>
                             </button>
                           )}
                           <button 
                             onClick={() => handleGenerateInvoice(t)} 
                             className="p-1.5 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100"
                             title="إصدار فاتورة"
                           >
                             <Receipt size={14}/>
                           </button>
                        </div>
                     </td>
                   </tr>
                 )})}
            </tbody>
         </table>
         {hasMore && !loadingData && tickets.length >= 30 && (
             <div className="p-4 text-center bg-slate-50 border-t border-slate-100">
                <button onClick={() => loadTickets(true)} className="text-indigo-600 font-bold text-xs hover:underline flex items-center justify-center gap-1 mx-auto">
                   تحميل المزيد <ChevronDown size={14}/>
                </button>
             </div>
         )}
      </div>
    </div>
  );
}
// ==========================================================================
// 👥 إدارة المستخدمين المحسنة
// ==========================================================================
function EnhancedUserManagement({ appUser, warehouses, notify, setGlobalLoading, onViewProfile }) {
  const [usersList, setUsersList] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    pass: '', 
    role: 'sales', 
    assignedWarehouseId: 'main' 
  });
  const [permissionsByCategory, setPermissionsByCategory] = useState({});

  useEffect(() => {
    if (appUser?.role !== 'admin') return;
    const unsub = onSnapshot(collection(db, 'employees'), snap => setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [appUser]);

  useEffect(() => {
    const categories = {};
    ALL_PERMISSIONS.forEach(p => {
      if (!categories[p.category]) {
        categories[p.category] = [];
      }
      categories[p.category].push(p);
    });
    setPermissionsByCategory(categories);
  }, []);

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
        await updateDoc(doc(db, 'employees', editingUser.id), dataToUpdate);
        await logUserActivity(appUser, 'تعديل بيانات موظف', `تعديل صلاحيات أو بيانات الموظف: ${editingUser.name}`);
        notify("تم حفظ الإعدادات", "success"); 
        setEditingUser(null);
     } catch(e) { 
        console.error(e);
        if (e.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("حدث خطأ في حفظ الإعدادات: " + e.message, "error"); 
        }
     }
     setGlobalLoading(false);
  };

  const handleAddUser = async (e) => {
     e.preventDefault();
     if (!newUser.email || !newUser.pass || !newUser.name) return notify("الرجاء إدخال جميع البيانات المطلوبة", "warn");
     
     setGlobalLoading(true);
     try {
        const emailToSave = newUser.email.trim().toLowerCase();
        const q = query(collection(db, 'employees'), where('email', '==', emailToSave));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            notify("المستخدم موجود بالفعل بهذا البريد الإلكتروني!", "error");
            setGlobalLoading(false);
            return;
        }
        
        const defaultPermissions = ROLE_DEFAULT_PERMISSIONS[newUser.role] || {};

        await addDoc(collection(db, 'employees'), {
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
        
        await logUserActivity(appUser, 'إضافة موظف', `إنشاء حساب للموظف: ${newUser.name} بدور ${newUser.role}`);
        notify("تم إضافة المستخدم بنجاح", "success");
        setShowAddModal(false);
        setNewUser({ 
          name: '', 
          email: '', 
          phone: '', 
          pass: '', 
          role: 'sales', 
          assignedWarehouseId: 'main' 
        });
     } catch (err) {
        console.error(err);
        if (err.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("حدث خطأ أثناء إضافة المستخدم: " + err.message, "error");
        }
     }
     setGlobalLoading(false);
  };

  const handleDeleteUser = async (id, name) => {
     if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${name}" بشكل نهائي؟ لا يمكن التراجع عن هذه الخطوة.`)) return;
     
     setGlobalLoading(true);
     try {
        await deleteDoc(doc(db, 'employees', id));
        await logUserActivity(appUser, 'حذف موظف', `تم حذف حساب الموظف: ${name}`);
        notify("تم حذف المستخدم بنجاح", "success");
     } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("حدث خطأ أثناء الحذف: " + e.message, "error");
        }
     }
     setGlobalLoading(false);
  };

  const handleToggleAllPermissions = (user, category, checked) => {
    const newPermissions = { ...user.permissions };
    permissionsByCategory[category].forEach(p => {
      newPermissions[p.key] = checked;
    });
    setEditingUser({ ...user, permissions: newPermissions });
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
       {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
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
                      onChange={e => {
                        const newRole = e.target.value;
                        const defaultPermissions = ROLE_DEFAULT_PERMISSIONS[newRole] || {};
                        setEditingUser({ 
                          ...editingUser, 
                          role: newRole,
                          permissions: defaultPermissions
                        });
                      }}
                    >
                       {USER_ROLES.map(role => (
                         <option key={role.key} value={role.key}>{role.label}</option>
                       ))}
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
                  <h4 className="font-bold text-lg text-slate-800 mb-4">الصلاحيات المتاحة</h4>
                  
                  {Object.entries(permissionsByCategory).map(([category, perms]) => (
                    <div key={category} className="mb-6 bg-white border border-slate-100 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3 pb-2 border-b">
                        <h5 className="font-bold text-indigo-700">{category}</h5>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleAllPermissions(editingUser, category, true)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                          >
                            تحديد الكل
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleAllPermissions(editingUser, category, false)}
                            className="text-xs text-slate-500 hover:text-slate-700 font-bold"
                          >
                            إلغاء الكل
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                         {perms.map(p => (
                            <label 
                              key={p.key} 
                              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${editingUser.permissions?.[p.key] ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                               <input 
                                 type="checkbox" 
                                 className="w-4 h-4 accent-indigo-600" 
                                 checked={editingUser.permissions?.[p.key] || false} 
                                 onChange={e => setEditingUser({
                                   ...editingUser, 
                                   permissions: {
                                     ...editingUser.permissions, 
                                     [p.key]: e.target.checked
                                   }
                                 })} 
                               />
                               <span className="text-xs font-bold">{p.label}</span>
                            </label>
                         ))}
                      </div>
                    </div>
                  ))}
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
                       {USER_ROLES.map(role => (
                         <option key={role.key} value={role.key}>{role.label}</option>
                       ))}
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
               
               <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                 <p className="text-xs text-indigo-800 font-bold">
                   سيتم منح المستخدم الصلاحيات الافتراضية حسب الدور المختار، ويمكنك تعديلها لاحقاً من صفحة تعديل المستخدم.
                 </p>
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
                   {usersList.map(u => {
                     const RoleIcon = getRoleIcon(u.role);
                     const roleColor = getRoleColor(u.role);
                     return (
                       <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-5">
                            <div className="flex items-center gap-2">
                              <RoleIcon size={16} className={`text-${roleColor}-600`}/>
                              <div>
                                <p className="text-slate-800 font-bold">{u.name || 'مستخدم جديد'}</p>
                                <p className="text-[10px] font-mono text-slate-400 mt-1" dir="ltr">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-5 text-center font-bold text-indigo-600 text-xs">
                            {warehouses.find(w=>w.id===u.assignedWarehouseId)?.name || 'الرئيسي'}
                          </td>
                          <td className="p-5 text-center">
                            <span className={`px-3 py-1 rounded-md text-[10px] font-bold bg-${roleColor}-100 text-${roleColor}-700`}>
                              {USER_ROLES.find(r => r.key === u.role)?.label || u.role}
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
                     );
                   })}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
}

// ==========================================================================
// 🏪 مدير الفروع المحسن
// ==========================================================================
function EnhancedWarehouseManager({ warehouses, appUser, notify, setGlobalLoading }) {
   const [name, setName] = useState('');
   const [selectedWarehouse, setSelectedWarehouse] = useState(null);
   const [assignedUsers, setAssignedUsers] = useState([]);
   const [allUsers, setAllUsers] = useState([]);
   const [editingWarehouse, setEditingWarehouse] = useState(null);
   const [inventory, setInventory] = useState([]);
   const [showInventory, setShowInventory] = useState(false);

   useEffect(() => {
     if (selectedWarehouse) {
       const fetchData = async () => {
         try {
           const usersSnap = await getDocs(query(collection(db, 'employees'), where('isDisabled', '==', false)));
           const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
           setAllUsers(users);
           
           const assigned = users.filter(u => u.assignedWarehouseId === selectedWarehouse.id);
           setAssignedUsers(assigned);

           const invSnap = await getDocs(query(collection(db, 'inventory'), where('warehouseId', '==', selectedWarehouse.id), where('isDeleted', '==', false)));
           setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
         } catch (error) {
           console.error("Error fetching warehouse data:", error);
           if (error.code === 'permission-denied') {
             notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
           }
         }
       };
       fetchData();
     }
   }, [selectedWarehouse, notify]);

   const handleAdd = async (e) => {
      e.preventDefault(); 
      if(!name) return;
      setGlobalLoading(true);
      try { 
        await addDoc(collection(db, 'warehouses'), { 
          name, 
          createdAt: serverTimestamp(),
          managers: [],
          users: []
        }); 
        notify("تم إضافة الفرع بنجاح"); 
        setName(''); 
      } catch(e) { 
        console.error(e);
        if (e.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("فشل الإضافة: " + e.message, "error"); 
        }
      }
      setGlobalLoading(false);
   };

   const handleDelete = async (id) => {
      if (!window.confirm('حذف الفرع؟')) return;
      setGlobalLoading(true);
      try {
        await deleteDoc(doc(db, 'warehouses', id));
        notify("تم حذف الفرع", "success");
        setSelectedWarehouse(null);
      } catch(e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("فشل الحذف: " + e.message, "error");
        }
      }
      setGlobalLoading(false);
   };

   const handleUpdateWarehouse = async () => {
      if (!editingWarehouse) return;
      setGlobalLoading(true);
      try {
        await updateDoc(doc(db, 'warehouses', editingWarehouse.id), {
          name: editingWarehouse.name
        });
        notify("تم تحديث اسم الفرع", "success");
        setEditingWarehouse(null);
        if (selectedWarehouse) {
          setSelectedWarehouse({...selectedWarehouse, name: editingWarehouse.name});
        }
      } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("فشل التحديث: " + e.message, "error");
        }
      }
      setGlobalLoading(false);
   };

   const handleAssignUser = async (userId, assign) => {
      setGlobalLoading(true);
      try {
        await updateDoc(doc(db, 'employees', userId), {
          assignedWarehouseId: assign ? selectedWarehouse.id : 'main'
        });
        notify(assign ? "تم تعيين المستخدم للفرع" : "تم إلغاء تعيين المستخدم", "success");
        
        setAssignedUsers(prev => assign 
          ? [...prev, allUsers.find(u => u.id === userId)]
          : prev.filter(u => u.id !== userId)
        );
      } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("فشل تحديث تعيين المستخدم: " + e.message, "error");
        }
      }
      setGlobalLoading(false);
   };

   return (
      <div className="space-y-6 text-right" dir="rtl">
         <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="font-black text-xl mb-6 flex items-center gap-2 text-slate-800">
              <Store className="text-indigo-600"/> إضافة فرع جديد
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

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
               <div className="p-4 border-b bg-slate-50">
                  <h4 className="font-bold text-slate-600 text-sm">الفروع المتاحة</h4>
               </div>
               <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {warehouses.map(w => (
                     <button
                       key={w.id}
                       onClick={() => setSelectedWarehouse(w)}
                       className={`w-full p-4 text-right hover:bg-slate-50 transition-colors flex justify-between items-center ${selectedWarehouse?.id === w.id ? 'bg-indigo-50 border-r-4 border-indigo-600' : ''}`}
                     >
                        <div className="flex items-center gap-3">
                           <MapPin size={18} className={selectedWarehouse?.id === w.id ? 'text-indigo-600' : 'text-slate-400'}/>
                           <span className="font-bold text-slate-800">{w.name}</span>
                        </div>
                        {w.id === 'main' && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-1 rounded-full">رئيسي</span>
                        )}
                     </button>
                  ))}
               </div>
            </div>

            <div className="lg:col-span-2 bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
               {selectedWarehouse ? (
                  <div className="p-6">
                     <div className="flex justify-between items-start mb-6">
                        <div>
                           <h3 className="text-xl font-black text-slate-800 mb-2">{selectedWarehouse.name}</h3>
                           <p className="text-xs text-slate-500">آخر تحديث: {formatDate(selectedWarehouse.createdAt)}</p>
                        </div>
                        {appUser.role === 'admin' && (
                          <div className="flex gap-2">
                             <button
                               onClick={() => setEditingWarehouse(selectedWarehouse)}
                               className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors"
                               title="تعديل اسم الفرع"
                             >
                                <Edit size={16}/>
                             </button>
                             {selectedWarehouse.id !== 'main' && (
                               <button
                                 onClick={() => handleDelete(selectedWarehouse.id)}
                                 className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-colors"
                                 title="حذف الفرع"
                               >
                                  <Trash2 size={16}/>
                               </button>
                             )}
                          </div>
                        )}
                     </div>

                     {editingWarehouse && editingWarehouse.id === selectedWarehouse.id && (
                       <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                         <h4 className="font-bold text-sm text-indigo-900 mb-3">تعديل اسم الفرع</h4>
                         <div className="flex gap-2">
                           <input
                             className="flex-1 border border-indigo-200 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white"
                             value={editingWarehouse.name}
                             onChange={e => setEditingWarehouse({...editingWarehouse, name: e.target.value})}
                           />
                           <button onClick={handleUpdateWarehouse} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700">
                              <Save size={16}/>
                           </button>
                           <button onClick={() => setEditingWarehouse(null)} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-200">
                              <X size={16}/>
                           </button>
                         </div>
                       </div>
                     )}

                     <div className="flex border-b mb-4">
                        <button 
                          onClick={() => setShowInventory(false)}
                          className={`px-4 py-2 text-sm font-bold ${!showInventory ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}
                        >
                          المستخدمون
                        </button>
                        <button 
                          onClick={() => setShowInventory(true)}
                          className={`px-4 py-2 text-sm font-bold ${showInventory ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}
                        >
                          المخزون ({inventory.length})
                        </button>
                     </div>

                     {!showInventory ? (
                       <div className="space-y-4">
                          <h4 className="font-bold text-slate-700 flex items-center gap-2">
                            <Users size={18} className="text-indigo-600"/>
                            المستخدمون المسؤولون عن هذا الفرع
                          </h4>

                          {assignedUsers.length > 0 ? (
                            <div className="space-y-2">
                              {assignedUsers.map(user => {
                                const RoleIcon = getRoleIcon(user.role);
                                return (
                                  <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-3">
                                      <RoleIcon size={16} className={`text-${getRoleColor(user.role)}-600`}/>
                                      <div>
                                        <p className="font-bold text-slate-800">{user.name}</p>
                                        <p className="text-[10px] text-slate-500">{user.email}</p>
                                      </div>
                                    </div>
                                    {appUser.role === 'admin' && (
                                      <button
                                        onClick={() => handleAssignUser(user.id, false)}
                                        className="text-rose-500 hover:text-rose-700 p-1.5"
                                        title="إلغاء التعيين"
                                      >
                                        <UserX size={16}/>
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-slate-400 text-xs p-4 text-center border border-dashed rounded-xl">
                              لا يوجد مستخدمون معينون لهذا الفرع
                            </p>
                          )}

                          {appUser.role === 'admin' && (
                            <>
                              <h4 className="font-bold text-slate-700 mt-6 mb-3">تعيين مستخدمين جدد</h4>
                              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                {allUsers
                                  .filter(u => u.assignedWarehouseId !== selectedWarehouse.id && !u.isDisabled)
                                  .map(user => {
                                    const RoleIcon = getRoleIcon(user.role);
                                    return (
                                      <div key={user.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 transition-colors">
                                        <div className="flex items-center gap-3">
                                          <RoleIcon size={16} className={`text-${getRoleColor(user.role)}-600`}/>
                                          <div>
                                            <p className="font-bold text-slate-800">{user.name}</p>
                                            <p className="text-[10px] text-slate-500">{user.email}</p>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => handleAssignUser(user.id, true)}
                                          className="text-indigo-600 hover:text-indigo-800 p-1.5"
                                          title="تعيين للفرع"
                                        >
                                          <UserPlus size={16}/>
                                        </button>
                                      </div>
                                    );
                                  })}
                              </div>
                            </>
                          )}
                       </div>
                     ) : (
                       <div className="space-y-4">
                          <h4 className="font-bold text-slate-700 flex items-center gap-2">
                            <Package size={18} className="text-indigo-600"/>
                            مخزون الفرع
                          </h4>
                          {inventory.length > 0 ? (
                            <div className="overflow-x-auto max-h-96 custom-scrollbar">
                              <table className="w-full text-right text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-bold text-xs">
                                  <tr>
                                    <th className="p-2">السيريال</th>
                                    <th className="p-2">المنتج</th>
                                    <th className="p-2 text-center">الكمية</th>
                                    <th className="p-2 text-center">السعر</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {inventory.map(item => (
                                    <tr key={item.id}>
                                      <td className="p-2 font-mono text-xs">{item.serialNumber}</td>
                                      <td className="p-2 font-bold">{item.name}</td>
                                      <td className="p-2 text-center">{item.quantity}</td>
                                      <td className="p-2 text-center">{item.price} ج</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-slate-400 text-xs p-8 text-center border border-dashed rounded-xl">
                              لا يوجد مخزون في هذا الفرع
                            </p>
                          )}
                       </div>
                     )}
                  </div>
               ) : (
                 <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                    <Store size={48} className="mb-3 opacity-20"/>
                    <p className="font-bold">اختر فرعاً من القائمة لإدارة تفاصيله</p>
                 </div>
               )}
            </div>
         </div>
      </div>
   );
}

// ==========================================================================
// ⚙️ صفحة الإعدادات
// ==========================================================================
function SettingsManager({ systemSettings, setSettings, notify, setGlobalLoading }) {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setLocalSettings] = useState(systemSettings);
  
  const handleSave = async () => {
    setGlobalLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), settings, { merge: true });
      setSettings(settings);
      notify("تم حفظ الإعدادات بنجاح", "success");
    } catch (error) {
      console.error("Error saving settings:", error);
      notify("حدث خطأ في حفظ الإعدادات", "error");
    }
    setGlobalLoading(false);
  };

  const addCategory = () => {
    const newCategories = [...(settings.productCategories || [])];
    newCategories.push({ name: '', models: [] });
    setLocalSettings({...settings, productCategories: newCategories});
  };

  const addFee = () => {
    const newFees = [...(settings.installationFees || [])];
    newFees.push({ id: Date.now().toString(), label: '', value: 0 });
    setLocalSettings({...settings, installationFees: newFees});
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-right" dir="rtl">
      <div className="p-6 border-b bg-slate-50">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
          <Settings className="text-indigo-600" size={24}/> الإعدادات المركزية
        </h2>
      </div>

      <div className="flex border-b bg-white">
        <button 
          onClick={() => setActiveTab('general')} 
          className={`px-6 py-4 font-black text-sm ${activeTab === 'general' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500'}`}
        >
          عام
        </button>
        <button 
          onClick={() => setActiveTab('categories')} 
          className={`px-6 py-4 font-black text-sm ${activeTab === 'categories' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500'}`}
        >
          التصنيفات
        </button>
        <button 
          onClick={() => setActiveTab('fees')} 
          className={`px-6 py-4 font-black text-sm ${activeTab === 'fees' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500'}`}
        >
          الرسوم
        </button>
        <button 
          onClick={() => setActiveTab('invoice')} 
          className={`px-6 py-4 font-black text-sm ${activeTab === 'invoice' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500'}`}
        >
          الفاتورة
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'general' && (
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">اسم النظام</label>
              <input 
                className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500"
                value={settings.systemName || ''}
                onChange={e => setLocalSettings({...settings, systemName: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">اسم المتجر</label>
              <input 
                className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500"
                value={settings.storeName || ''}
                onChange={e => setLocalSettings({...settings, storeName: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">نسبة الضريبة (%)</label>
              <input 
                type="number"
                className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500"
                value={settings.taxRate || 14}
                onChange={e => setLocalSettings({...settings, taxRate: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">تذييل الفاتورة</label>
              <textarea 
                rows="2"
                className="w-full border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500"
                value={settings.footerText || ''}
                onChange={e => setLocalSettings({...settings, footerText: e.target.value})}
              />
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-6">
            {settings.productCategories?.map((cat, idx) => (
              <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="flex gap-3 mb-3">
                  <input 
                    className="flex-1 border border-slate-200 p-2 rounded-lg font-bold outline-none focus:border-indigo-500"
                    placeholder="اسم التصنيف (مثال: تكييف)"
                    value={cat.name}
                    onChange={e => {
                      const newCats = [...settings.productCategories];
                      newCats[idx].name = e.target.value;
                      setLocalSettings({...settings, productCategories: newCats});
                    }}
                  />
                  <button 
                    onClick={() => {
                      const newCats = settings.productCategories.filter((_, i) => i !== idx);
                      setLocalSettings({...settings, productCategories: newCats});
                    }}
                    className="px-3 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100"
                  >
                    <Trash2 size={18}/>
                  </button>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">الموديلات (افصل بينها بفاصلة)</label>
                  <input 
                    className="w-full border border-slate-200 p-2 rounded-lg font-bold outline-none focus:border-indigo-500"
                    placeholder="مثال: 1.5 حصان, 2.25 حصان, انفرتر"
                    value={cat.models?.join(', ') || ''}
                    onChange={e => {
                      const newCats = [...settings.productCategories];
                      newCats[idx].models = e.target.value.split(',').map(m => m.trim()).filter(m => m);
                      setLocalSettings({...settings, productCategories: newCats});
                    }}
                  />
                </div>
              </div>
            ))}
            <button 
              onClick={addCategory}
              className="w-full py-3 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-600 font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={18}/> إضافة تصنيف جديد
            </button>
          </div>
        )}

        {activeTab === 'fees' && (
          <div className="space-y-4 max-w-md">
            {settings.installationFees?.map((fee, idx) => (
              <div key={fee.id} className="flex gap-3">
                <input 
                  className="flex-1 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500"
                  placeholder="اسم الرسم (مثال: تركيب)"
                  value={fee.label}
                  onChange={e => {
                    const newFees = [...settings.installationFees];
                    newFees[idx].label = e.target.value;
                    setLocalSettings({...settings, installationFees: newFees});
                  }}
                />
                <input 
                  type="number"
                  className="w-24 border border-slate-200 p-3 rounded-xl font-bold text-center outline-none focus:border-indigo-500"
                  placeholder="القيمة"
                  value={fee.value}
                  onChange={e => {
                    const newFees = [...settings.installationFees];
                    newFees[idx].value = Number(e.target.value);
                    setLocalSettings({...settings, installationFees: newFees});
                  }}
                />
                <button 
                  onClick={() => {
                    const newFees = settings.installationFees.filter((_, i) => i !== idx);
                    setLocalSettings({...settings, installationFees: newFees});
                  }}
                  className="px-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100"
                >
                  <Trash2 size={18}/>
                </button>
              </div>
            ))}
            <button 
              onClick={addFee}
              className="w-full py-3 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-600 font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={18}/> إضافة رسم جديد
            </button>
          </div>
        )}

        {activeTab === 'invoice' && (
          <InvoiceTemplateManager 
            systemSettings={settings}
            setSettings={setLocalSettings}
            notify={notify}
          />
        )}

        <div className="mt-8 pt-6 border-t flex justify-end">
          <button 
            onClick={handleSave}
            className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <Save size={18}/> حفظ الإعدادات
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// 👤 عرض ملف الموظف
// ==========================================================================
function EmployeeProfileView({ userToView, warehouseMap }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userToView) return;
    setLoading(true);
    const q = query(
        collection(db, 'activity_logs'), 
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

  const RoleIcon = getRoleIcon(userToView.role);
  const roleColor = getRoleColor(userToView.role);

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-right" dir="rtl">
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
               <span className={`px-3 py-1 rounded-lg bg-${roleColor}-100 text-${roleColor}-700 flex items-center gap-1`}>
                 <RoleIcon size={14}/> {USER_ROLES.find(r => r.key === userToView.role)?.label || userToView.role}
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

// ==========================================================================
// 🏪 نقطة البيع POS
// ==========================================================================
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
          collection(db, 'inventory'), 
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
        if (err.code === 'permission-denied') {
          notify("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase", "error");
        } else {
          notify("خطأ في البحث: " + err.message, "error"); 
        }
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
          const itemRef = doc(db, 'inventory', foundItem.id);
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
          
          t.set(doc(collection(db, 'transactions')), transactionData);
       });
       
       await logUserActivity(appUser, 'إصدار فاتورة', `إصدار فاتورة #${invId} للعميل ${invoice.customerName} بقيمة ${calculations.finalTotal} ج`);

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
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
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
             <div className="space-y-6">
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

// ==========================================================================
// 🚀 المكون الرئيسي للتطبيق
// ==========================================================================
export default function App() {
  const [appUser, setAppUser] = useState(null);
  const [fbReady, setFbReady] = useState(false);
  const [firebaseError, setFirebaseError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(true);
  
  const [currentView, setCurrentView] = useState('dashboard');
  const [viewedUser, setViewedUser] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]);

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
    invoiceTemplate: {
      showLogo: true,
      showStoreName: true,
      showCustomerInfo: true,
      showItems: true,
      showPrices: true,
      showDiscount: true,
      showTax: true,
      showFees: true,
      showFooter: true,
      fontSize: 'normal',
      paperSize: '80mm'
    },
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

  const testFirebaseConnection = useCallback(async () => {
    try {
      setIsConnecting(true);
      setFirebaseError(null);
      
      await getDocs(collection(db, 'settings'));
      console.log("Firebase connection successful");
      return true;
    } catch (error) {
      console.error("Firebase connection error:", error);
      let errorMessage = "فشل الاتصال بقاعدة البيانات.";
      
      if (error.code === 'permission-denied') {
        errorMessage = "خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase Console.";
      } else if (error.code === 'unavailable') {
        errorMessage = "خدمة Firebase غير متاحة حالياً.";
      } else if (error.code === 'not-found') {
        errorMessage = "لم يتم العثور على قاعدة البيانات.";
      } else {
        errorMessage = error.message;
      }
      
      setFirebaseError(errorMessage);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  useEffect(() => {
    testFirebaseConnection();
  }, []);

  const retryConnection = async () => {
    await testFirebaseConnection();
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline); 
    window.addEventListener('offline', handleOffline);
    
    const handleNavigateToLowStock = (e) => {
      setLowStockItems(e.detail);
      setCurrentView('lowstock');
    };
    
    const handleNavigateToTickets = (e) => {
      setCurrentView('tickets');
    };
    
    const handleCreateTransferFromLowStock = (e) => {
      setCurrentView('transfers');
    };
    
    window.addEventListener('navigateToLowStock', handleNavigateToLowStock);
    window.addEventListener('navigateToTickets', handleNavigateToTickets);
    window.addEventListener('createTransferFromLowStock', handleCreateTransferFromLowStock);
    
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('navigateToLowStock', handleNavigateToLowStock);
        window.removeEventListener('navigateToTickets', handleNavigateToTickets);
        window.removeEventListener('createTransferFromLowStock', handleCreateTransferFromLowStock);
    };
  }, []);

  const handleNavigateToInventory = () => {
    setCurrentView('inventory');
  };

  const handleGenerateInvoiceFromTicket = (ticket) => {
    setCurrentView('transactions');
    notify(`تم تحويل التذكرة ${ticket.ticketNumber} إلى فاتورة`, "success");
  };
  
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
    if (!appUser || !fbReady || firebaseError) return;

    const unsubS = onSnapshot(doc(db, 'settings', 'general'), (d) => {
       if (d.exists()) {
           setSystemSettings(prev => ({...prev, ...d.data()}));
       }
    }, (error) => {
        console.error("Error fetching settings:", error);
        notify("فشل في تحميل الإعدادات", "error");
    });

    const unsubW = onSnapshot(collection(db, 'warehouses'), (s) => {
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
  }, [appUser, fbReady, firebaseError, notify]);

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
          onRetry={retryConnection}
          isConnecting={isConnecting}
          firebaseError={firebaseError}
        />
        <div className="fixed top-6 left-6 z-[200] flex flex-col gap-2">
          {notifications.map(n => (
             <div 
               key={n.id} 
               className={`p-4 rounded-xl shadow-lg text-white font-bold text-xs flex items-center gap-2 border-l-4 ${n.type==='error' || n.type==='warn' ? 'bg-slate-900 border-red-500' : 'bg-slate-900 border-emerald-500'}`}
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
             className={`p-4 rounded-xl shadow-lg text-white font-bold text-xs flex items-center gap-2 border-l-4 ${n.type==='error' || n.type==='warn' ? 'bg-slate-900 border-red-500' : 'bg-slate-900 border-emerald-500'}`}
           >
              {n.type === 'error' || n.type === 'warn' ? <AlertTriangle size={16} className="text-red-500"/> : <CheckCircle2 size={16} className="text-emerald-500"/>}
              {n.msg}
           </div>
        ))}
      </div>

      {globalLoading && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[300] flex items-center justify-center">
            <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3 font-bold text-indigo-700">
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
               { id: 'transfers', label: 'التحويلات المخزنية', icon: ArrowRightLeft, permission: 'viewTransfers' },
               { id: 'transactions', label: 'نقطة البيع POS', icon: Receipt, permission: 'viewPOS' },
               { id: 'customers', label: 'سجل العملاء', icon: Users, permission: 'viewCustomers' },
               { id: 'tickets', label: 'تذاكر الصيانة', icon: MessageSquare, permission: 'manageTickets' },
               { id: 'reports', label: 'التقارير والمبيعات', icon: History, permission: 'viewReports' },
               { id: 'lowstock', label: 'النواقص', icon: AlertOctagon, permission: 'viewLowStock' }
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
                     { id: 'warehouses', label: 'إدارة الفروع', icon: Store, permission: 'manageWarehouses' },
                     { id: 'users', label: 'الموظفين والصلاحيات', icon: UserCog, permission: 'manageUsers' }, 
                     { id: 'settings', label: 'الإعدادات المركزية', icon: Settings, permission: 'manageSettings' }
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
                 <p className="text-[9px] text-slate-400 truncate group-hover:text-indigo-300 transition-colors">حسابي ونشاطاتي</p>
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
              {currentView === 'dashboard' && <DashboardView appUser={appUser} warehouses={warehouses} onNavigateToInventory={handleNavigateToInventory} notify={notify} />}
              {currentView === 'inventory' && <InventoryManager appUser={appUser} warehouses={warehouses} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} />}
              {currentView === 'transfers' && <EnhancedTransferManager appUser={appUser} warehouseMap={warehouseMap} notify={notify} setGlobalLoading={setGlobalLoading} />}
              {currentView === 'transactions' && <POSManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} />}
              {currentView === 'customers' && <EnhancedCustomerManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} />}
              {currentView === 'tickets' && <EnhancedTicketManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} onGenerateInvoice={handleGenerateInvoiceFromTicket} />}
              {currentView === 'reports' && <ReportsManager notify={notify} />}
              {currentView === 'lowstock' && <LowStockView lowStockItems={lowStockItems} appUser={appUser} warehouseMap={warehouseMap} />}
              {currentView === 'settings' && appUser.role === 'admin' && <SettingsManager systemSettings={systemSettings} setSettings={setSystemSettings} notify={notify} setGlobalLoading={setGlobalLoading} />}
              {currentView === 'warehouses' && appUser.role === 'admin' && <EnhancedWarehouseManager warehouses={warehouses} appUser={appUser} notify={notify} setGlobalLoading={setGlobalLoading} />}
              {currentView === 'users' && appUser.role === 'admin' && <EnhancedUserManagement appUser={appUser} warehouses={warehouses} notify={notify} setGlobalLoading={setGlobalLoading} onViewProfile={openProfileView} />}
              {currentView === 'user_profile' && <EmployeeProfileView userToView={viewedUser} warehouseMap={warehouseMap} />}
           </div>
        </main>
      </div>
    </div>
  );
}
// في أول App.jsx بعد الاستيرادات
import { seedDatabase } from "./scripts/seedDatabase";

// في useEffect بعد ما يتأكد أن المستخدم دخل
useEffect(() => {
  if (appUser) {
    seedDatabase(); // شغلها مرة واحدة
  }
}, [appUser]);