import React, { useState, useEffect, useCallback } from 'react';
import { signInAnonymously } from 'firebase/auth';
import {
  collection, getDoc, doc, onSnapshot
} from 'firebase/firestore';
import {
  LayoutDashboard,
  Package,
  Users,
  Receipt,
  Wallet,
  ArrowRightLeft,
  LogOut,
  AlertTriangle,
  Settings,
  Store,
  History,
  AlertOctagon,
  Loader2,
  Menu,
  UserCog,
  CheckCircle2,
  Shield,
  ChevronDown,
  FileText,
  MessageSquare,
  ShieldCheck,
  Sun,
  Moon,
  Webhook,
  RotateCcw
} from 'lucide-react';
import { LoginScreen } from './components/auth/LoginScreen';
import { ThemeProvider } from './components/common/ThemeProvider';
import { USER_ROLES } from './constants/roles';
import { auth, db } from './firebase/config';
import { showError, showInfo, showSuccess, showWarning } from './utils/alerts';
import { onMessageListener, requestNotificationPermission } from './utils/messaging';
import {} from './utils/offlineDb';
import { syncManager } from './utils/syncManager';
import { clearUserFromStorage, loadUserFromStorage, saveUserToStorage } from './utils/userStorage';

// 🛠️ FIX (أداء): الصفحات دي كانت كلها بتتحمّل مع أول تحميل للتطبيق حتى
// لو المستخدم فاتح شاشة واحدة بس (مثلاً الداشبورد). دلوقتي كل صفحة بتتحمّل
// (code-split) لما المستخدم يفتحها فعليًا لأول مرة، فحجم أول تحميل للتطبيق
// بيقل بشكل كبير، وده بيقلل الوقت اللي بياخده فتح النظام خصوصًا على نت بطيء
// أو لما عدد كبير من المستخدمين يفتحوا النظام في نفس الوقت.
const lazyPage = (loader, exportName) =>
  React.lazy(() => loader().then((m) => ({ default: m[exportName] })));

const DashboardView = lazyPage(() => import('./components/dashboard/DashboardView'), 'DashboardView');
const InventoryManager = lazyPage(() => import('./components/inventory/InventoryManager'), 'InventoryManager');
const LowStockView = lazyPage(() => import('./components/inventory/LowStockView'), 'LowStockView');
const EnhancedTransferManager = lazyPage(() => import('./components/transfers/EnhancedTransferManager'), 'EnhancedTransferManager');
const POSManager = lazyPage(() => import('./components/pos/POSManager'), 'POSManager');
const EnhancedCustomerManager = lazyPage(() => import('./components/customers/EnhancedCustomerManager'), 'EnhancedCustomerManager');
const ReturnsManager = lazyPage(() => import('./components/returns/ReturnsManager'), 'ReturnsManager');
const ReturnsWarehouseManager = lazyPage(() => import('./components/returns/ReturnsWarehouseManager'), 'ReturnsWarehouseManager');
const EnhancedTicketManager = lazyPage(() => import('./components/tickets/EnhancedTicketManager'), 'EnhancedTicketManager');
const InvoicesManager = lazyPage(() => import('./components/invoicesArchive/InvoicesManager'), 'InvoicesManager');
const ReportsManager = lazyPage(() => import('./components/reports/ReportsManager'), 'ReportsManager');
const FinanceManager = lazyPage(() => import('./components/finance/FinanceManager'), 'FinanceManager');
const WarrantyAlertsView = lazyPage(() => import('./components/warranty/WarrantyAlertsView'), 'WarrantyAlertsView');
const SettingsManager = lazyPage(() => import('./components/settings/SettingsManager'), 'SettingsManager');
const EnhancedWarehouseManager = lazyPage(() => import('./components/warehouses/EnhancedWarehouseManager'), 'EnhancedWarehouseManager');
const EnhancedUserManagement = lazyPage(() => import('./components/users/EnhancedUserManagement'), 'EnhancedUserManagement');
const EmployeeProfileView = lazyPage(() => import('./components/users/EmployeeProfileView'), 'EmployeeProfileView');
const ResetPasswordScreen = lazyPage(() => import('./components/auth/ResetPasswordScreen'), 'ResetPasswordScreen');

function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
    </div>
  );
}

export default function App() {
  const [appUser, setAppUser] = useState(null);
  const [fbReady, setFbReady] = useState(false);
  const [firebaseError, setFirebaseError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(true);
  
const [currentView, setCurrentView] = useState(() => {
  // محاولة استعادة الصفحة من localStorage
  const savedView = localStorage.getItem('nouval_current_view');
  return savedView || 'dashboard';
});

// حفظ الصفحة الحالية في localStorage عند تغييرها
useEffect(() => {
  localStorage.setItem('nouval_current_view', currentView);
}, [currentView]);


  const [viewedUser, setViewedUser] = useState(null);
  // ✨ ميزة جديدة: ربط التذكرة بالفاتورة - بيانات مؤقتة بتتنقل من شاشة
  // التذاكر لشاشة نقطة البيع لما يتم إنشاء فاتورة من تذكرة صيانة
  const [pendingTicketInvoice, setPendingTicketInvoice] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]);

  const [notifications, setNotifications] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  
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
      showPaymentMethod: true,
      showNotes: true,
      showTechnician: true,
      fontSize: 'normal',
      paperSize: '80mm'
    },
    taxRate: 14,
    footerText: 'شكراً لتعاملكم معنا.', 
    installationFees: [],
    productCategories: [],
    technicians: [],
    maintenanceCenters: [],
    // ✨ ميزة جديدة: تنبيهات النواقص التلقائية (بريد/واتساب عبر Webhook)
    lowStockAlerts: {
      enabled: false,
      webhookUrl: '',
      frequencyHours: 24
    },
    // ✨ ميزة جديدة: إشعار العميل تلقائيًا عند تغيير حالة تذكرته
    ticketNotifications: {
      enabled: false,
      webhookUrl: ''
    },
    // ✨ ميزة جديدة: تنبيه اقتراب انتهاء ضمان المنتجات المباعة
    warrantyAlerts: {
      enabled: false,
      webhookUrl: '',
      daysBeforeExpiry: 30
    },
    // ✨ ميزة جديدة: تسجيل خروج تلقائي بعد فترة خمول (بالدقائق)
    autoLogoutMinutes: 30,
    // ✨ ميزة جديدة: تتبع SLA للتذاكر (المدة المستهدفة للحل حسب الأولوية بالساعات)
    ticketSLA: {
      high: 4,
      medium: 24,
      low: 72
    },
    // ✨ ميزة جديدة: رابط خدمة إرسال البريد الإلكتروني (كان الرابط قبل كده وهمي وثابت)
    emailWebhookUrl: ''
  });

  // تفعيل/إلغاء الوضع الداكن
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const notify = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  const testFirebaseConnection = useCallback(async () => {
    try {
      setIsConnecting(true);
      setFirebaseError(null);
      
      await getDoc(doc(db,'settings','general'));
      if (import.meta.env.DEV) console.log("Firebase connection successful");
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

  // استعادة المستخدم من localStorage عند تحميل التطبيق
  useEffect(() => {
    const savedUser = loadUserFromStorage();
    if (savedUser) {
      setAppUser(savedUser);
    }

  }, []);

  useEffect(() => {
    testFirebaseConnection();
  }, []);

  const retryConnection = async () => {
    await testFirebaseConnection();
  };

  // مراقبة حالة الاتصال بالإنترنت
  // 🛠️ FIX (نقطة #3): كان فيه بنية تحتية كاملة لـ "المزامنة لما الاتصال
  // يرجع" (offlineDB, syncManager, قائمة انتظار) لكن ولا عملية إضافة/تعديل/
  // حذف واحدة في التطبيق فعليًا بتستخدمها - كل الكتابات بتروح مباشرة لـ
  // Firestore وتفشل بصمت لو الاتصال مقطوع، والبيانات بتضيع. المؤشر
  // "متصل/غير متصل" في الواجهة كان بيوهم المستخدم إن في حماية حقيقية.
  // لحد ما نوصّل كل شاشات الكتابة فعليًا بنظام المزامنة (شغل كبير محتاج
  // اختبار دقيق لكل شاشة على حدة)، الأصح دلوقتي إننا نكون صريحين وننبّه
  // المستخدم بوضوح وقت انقطاع النت بدل ما نسيبه يفتكر إن حفظه هيتأجل تلقائيًا.
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncManager.syncAll().then(result => {
        if (result.synced > 0) {
          showSuccess(`تمت مزامنة ${result.synced} عملية بنجاح`);
        }
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      showWarning(
        "أنت غير متصل بالإنترنت الآن. أي عملية إضافة أو تعديل أو حذف ستفشل ولن تُحفظ تلقائياً حتى يعود الاتصال، فيرجى الانتظار قبل المتابعة.",
        "انقطع الاتصال بالإنترنت"
      );
    };
    
    window.addEventListener('online', handleOnline); 
    window.addEventListener('offline', handleOffline);
    
    syncManager.startAutoSync();
    
    onMessageListener().then(payload => {
      showInfo(payload.notification.body, payload.notification.title);
    });
    
    const handleNavigateToLowStock = (e) => {
      setLowStockItems(e.detail);
      setCurrentView('lowstock');
      setIsMobileOpen(false);
    };
    
    const handleNavigateToTickets = () => {
      setCurrentView('tickets');
      setIsMobileOpen(false);
    };
    
    const handleNavigateToReports = () => {
      setCurrentView('reports');
      setIsMobileOpen(false);
    };
    
    const handleCreateTransferFromLowStock = () => {
      setCurrentView('transfers');
      setIsMobileOpen(false);
    };
    
    window.addEventListener('navigateToLowStock', handleNavigateToLowStock);
    window.addEventListener('navigateToTickets', handleNavigateToTickets);
    window.addEventListener('navigateToReports', handleNavigateToReports);
    window.addEventListener('createTransferFromLowStock', handleCreateTransferFromLowStock);
    
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('navigateToLowStock', handleNavigateToLowStock);
        window.removeEventListener('navigateToTickets', handleNavigateToTickets);
        window.removeEventListener('navigateToReports', handleNavigateToReports);
        window.removeEventListener('createTransferFromLowStock', handleCreateTransferFromLowStock);
    };
  }, []);

  const handleNavigateToInventory = (view = 'inventory') => {
  setCurrentView(view);
  setIsMobileOpen(false);
};

  const handleGenerateInvoiceFromTicket = (ticket) => {
    // 🛠️ FIX: كان بيتم تجاهل بيانات التذكرة بالكامل (العميل، قطع الغيار)
    // ومجرد الانتقال لشاشة نقطة البيع فاضية - يعني الكاشير كان مضطر
    // يدخل كل حاجة يدوي تاني من الأول. دلوقتي بننقل البيانات فعليًا.
    setPendingTicketInvoice(ticket);
    setCurrentView('transactions');
    showSuccess(`تم تجهيز فاتورة للتذكرة ${ticket.ticketNumber} - راجع بيانات العميل وقطع الغيار في نقطة البيع`);
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

    requestNotificationPermission(appUser.id);

    const unsubS = onSnapshot(doc(db, 'settings', 'general'), (d) => {
       if (d.exists()) {
           setSystemSettings(prev => ({...prev, ...d.data()}));
       }
    }, (error) => {
        console.error("Error fetching settings:", error);
        showError("فشل في تحميل الإعدادات");
    });

    const unsubW = onSnapshot(collection(db, 'warehouses'), (s) => {
       const whs = [{id: 'main', name: 'المخزن الرئيسي'}];
       s.docs.forEach(d => {
         const data = d.data();
         // 🛠️ FIX: بعض مستندات المخازن القديمة كان اسمها متخزن جوه
         // managers.name بدل حقل name مباشر - فكانت بتظهر فاضية في كل
         // مكان (الهيدر، طلبات التحويل، قايمة تعيين الموظفين، التصدير).
         whs.push({ id: d.id, ...data, name: data.name || data.managers?.name || `فرع (${d.id.slice(0, 6)})` });
       });
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
  }, [appUser, fbReady, firebaseError]);

  const handleLogout = () => {
     clearUserFromStorage();
     setAppUser(null);
     setCurrentView('dashboard');
     showSuccess("تم تسجيل الخروج بنجاح");
  };

  // ✨ ميزة جديدة: تسجيل خروج تلقائي بعد فترة خمول (مفيد للأجهزة المشتركة
  // زي كاشير الفروع، عشان الجلسة متفضلش مفتوحة لو حد نسي يعمل تسجيل خروج)
  useEffect(() => {
    const minutes = Number(systemSettings?.autoLogoutMinutes) || 0;
    if (!appUser || minutes <= 0) return;

    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        showWarning("تم تسجيل خروجك تلقائيًا بسبب عدم النشاط لفترة طويلة");
        handleLogout();
      }, minutes * 60 * 1000);
    };

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(evt => window.addEventListener(evt, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      activityEvents.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [appUser, systemSettings?.autoLogoutMinutes]);

  const openProfileView = (user) => {
      setViewedUser(user);
      setCurrentView('user_profile');
      setIsMobileOpen(false);
  };

  // 🆕 لو الرابط فيه ?resetToken=، نعرض شاشة تحديد كلمة سر جديدة بدل أي
  // حاجة تانية - قبل حتى شاشة تسجيل الدخول العادية.
  const resetToken = new URLSearchParams(window.location.search).get('resetToken');
  if (resetToken) {
    return (
      <React.Suspense fallback={<PageLoadingFallback />}>
        <ResetPasswordScreen
          token={resetToken}
          onDone={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('resetToken');
            window.history.replaceState({}, '', url.toString());
            window.location.reload();
          }}
        />
      </React.Suspense>
    );
  }

  if (!appUser) {
    return (
      <>
        <LoginScreen 
          fbReady={fbReady} 
          onLoginSuccess={(user) => {
            setAppUser(user);
            saveUserToStorage(user);
          }} 
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
               className={`p-4 rounded-xl shadow-lg text-white font-bold text-xs flex items-center gap-2 border-l-4 ${
                 n.type === 'error' || n.type === 'warn' 
                   ? 'bg-rose-600 border-rose-800' 
                   : n.type === 'success' 
                   ? 'bg-emerald-600 border-emerald-800'
                   : 'bg-blue-600 border-blue-800'
               }`}
             >
                {n.type === 'error' || n.type === 'warn' 
                  ? <AlertTriangle size={16} className="text-white"/> 
                  : <CheckCircle2 size={16} className="text-white"/>
                }
                {n.msg}
             </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <ThemeProvider>
      <div className={`flex h-screen bg-slate-50 dark:bg-slate-900 font-sans overflow-hidden text-right selection:bg-teal-100 dark:selection:bg-teal-900 transition-colors duration-200`} dir="rtl">
        
        {/* منطقة الإشعارات */}
        <div className="fixed top-6 left-6 z-[200] flex flex-col gap-2">
          {notifications.map(n => (
             <div 
               key={n.id} 
               className={`p-4 rounded-xl shadow-lg text-white font-bold text-xs flex items-center gap-2 border-l-4 animate-in slide-in-from-left-5 ${
                 n.type === 'error' || n.type === 'warn' 
                   ? 'bg-rose-600 border-rose-800' 
                   : n.type === 'success' 
                   ? 'bg-emerald-600 border-emerald-800'
                   : 'bg-blue-600 border-blue-800'
               }`}
             >
                {n.type === 'error' || n.type === 'warn' 
                  ? <AlertTriangle size={16} className="text-white"/> 
                  : <CheckCircle2 size={16} className="text-white"/>
                }
                {n.msg}
             </div>
          ))}
        </div>

        {/* مؤشر التحميل العالمي */}
        {globalLoading && (
           <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[300] flex items-center justify-center">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3 font-bold text-teal-700 dark:text-teal-400">
                 <Loader2 className="w-8 h-8 animate-spin" /> 
                 <span className="text-sm">جاري المعالجة...</span>
              </div>
           </div>
        )}

        {/* القائمة الجانبية للموبايل */}
        {isMobileOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-opacity" 
            onClick={() => setIsMobileOpen(false)} 
          />
        )}
        
        {/* Sidebar */}
        <aside className={`fixed lg:static inset-y-0 right-0 z-50 w-64 bg-gradient-to-b from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-slate-300 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out print:hidden ${
          isMobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}>
          <div className="h-16 flex items-center px-6 border-b border-slate-700 bg-slate-950/50">
             <div className="flex items-center gap-3">
               <div className="p-1.5 bg-teal-600 rounded-lg text-white shadow-lg">
                 <Package size={18}/>
               </div>
               <span className="font-black text-white truncate">{systemSettings.systemName}</span>
             </div>
          </div>
          
          <nav className="p-4 flex-1 space-y-1 overflow-y-auto custom-scrollbar">
             <p className="px-3 text-[10px] font-bold text-slate-500 uppercase mb-2 mt-2">القائمة الرئيسية</p>
             
             {[
               { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, permission: 'viewDashboard' },
               { id: 'inventory', label: 'إدارة المخزون', icon: Package, permission: 'viewInventory' },
               { id: 'transfers', label: 'التحويلات المخزنية', icon: ArrowRightLeft, permission: 'viewTransfers' },
               { id: 'transactions', label: 'نقطة البيع', icon: Receipt, permission: 'viewPOS' },
               { id: 'customers', label: 'سجل العملاء', icon: Users, permission: 'viewCustomers' },
               { id: 'tickets', label: 'تذاكر الصيانة', icon: MessageSquare, permission: 'manageTickets' },
               { id: 'invoices', label: 'أرشيف الفواتير', icon: FileText, permission: 'viewInvoices' },
               { id: 'reports', label: 'التقارير', icon: History, permission: 'viewReports' },
               { id: 'finance', label: 'الملف المالي', icon: Wallet, permission: 'viewFinance' },
               { id: 'lowstock', label: 'النواقص', icon: AlertOctagon, permission: 'viewLowStock' },
               { id: 'warranty_alerts', label: 'تنبيهات الضمان', icon: ShieldCheck, permission: 'viewReports' }
             ].map(item => {
                if (item.permission && !appUser.permissions?.[item.permission] && appUser.role !== 'admin') {
                    return null;
                }
                return (
                    <button 
                      key={item.id} 
                      onClick={()=>{setCurrentView(item.id); setIsMobileOpen(false);}} 
                      className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
                        currentView === item.id 
                          ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' 
                          : 'hover:bg-slate-800 hover:text-white text-slate-400'
                      }`}
                    >
                      <item.icon size={18} className={currentView === item.id ? 'text-white' : 'opacity-70'}/> 
                      <span className="flex-1 text-right">{item.label}</span>
                      {currentView === item.id && <ChevronDown size={14} className="rotate-270"/>}
                    </button>
                );
             })}
             
             {/* عرض قسم الإدارة للمستخدمين الذين لديهم صلاحيات إدارية */}
{(appUser.role === 'admin' || 
  appUser.permissions?.manageSettings || 
  appUser.permissions?.manageWarehouses || 
  appUser.permissions?.manageUsers ||
  appUser.permissions?.viewSettings ||
  appUser.permissions?.editSystemSettings ||
  appUser.permissions?.editInvoiceTemplate ||
  appUser.permissions?.manageTechniciansList ||
  appUser.permissions?.manageFeesAndCategories ||
  appUser.permissions?.manageProductModels ||
  appUser.permissions?.manageFaultCodes ||
  appUser.permissions?.manageMaintenanceCenters ||
  appUser.permissions?.manageBranchesList) && (
   <>
      <p className="px-3 text-[10px] font-bold text-slate-500 uppercase mb-2 mt-6">الإدارة</p>
      
      



      {/* ✅ زر إدارة المرتجعات */}
      {(appUser.permissions?.viewReturns || appUser.role === 'admin') && (
        <button
          onClick={() => {
            setCurrentView('returns');
            setIsMobileOpen(false);
          }}
          className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
            currentView === 'returns'
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
              : 'hover:bg-slate-800 hover:text-white text-slate-400'
          }`}
        >
          <RotateCcw size={18} className={currentView === 'returns' ? 'text-white' : 'opacity-70'} />
          <span className="flex-1 text-right">إدارة المرتجعات</span>
        </button>
      )}

      {/* زر إدارة الفروع */}
      {(appUser.role === 'admin' || appUser.permissions?.manageWarehouses) && (
        <button 
          onClick={()=>{setCurrentView('warehouses'); setIsMobileOpen(false);}} 
          className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
            currentView === 'warehouses' 
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' 
              : 'hover:bg-slate-800 hover:text-white text-slate-400'
          }`}
        >
          <Store size={18} className={currentView === 'warehouses' ? 'text-white' : 'opacity-70'}/> 
          <span className="flex-1 text-right">إدارة الفروع</span>
        </button>
      )}
      
      {/* زر الموظفين والصلاحيات */}
      {(appUser.role === 'admin' || appUser.permissions?.manageUsers) && (
        <button 
          onClick={()=>{setCurrentView('users'); setIsMobileOpen(false);}} 
          className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
            currentView === 'users' 
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' 
              : 'hover:bg-slate-800 hover:text-white text-slate-400'
          }`}
        >
          <UserCog size={18} className={currentView === 'users' ? 'text-white' : 'opacity-70'}/> 
          <span className="flex-1 text-right">الموظفين والصلاحيات</span>
        </button>
      )}


      {/* ✅ زر مخزن المرتجعات */}
{(appUser.permissions?.viewReturnsWarehouse || appUser.role === 'admin') && (
  <button
    onClick={() => {
      setCurrentView('returns_warehouse');
      setIsMobileOpen(false);
    }}
    className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
      currentView === 'returns_warehouse'
        ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
        : 'hover:bg-slate-800 hover:text-white text-slate-400'
    }`}
  >
    <RotateCcw size={18} className={currentView === 'returns_warehouse' ? 'text-white' : 'opacity-70'} />
    <span className="flex-1 text-right">مخزن المرتجعات</span>
  </button>
)}
      
      {/* زر الإعدادات المركزية */}
      {(appUser.role === 'admin' || 
        appUser.permissions?.viewSettings || 
        appUser.permissions?.manageSettings ||
        appUser.permissions?.editSystemSettings ||
        appUser.permissions?.editInvoiceTemplate ||
        appUser.permissions?.manageTechniciansList ||
        appUser.permissions?.manageFeesAndCategories ||
        appUser.permissions?.manageProductModels ||
        appUser.permissions?.manageFaultCodes ||
        appUser.permissions?.manageMaintenanceCenters ||
        appUser.permissions?.manageBranchesList) && (
        <button 
          onClick={()=>{setCurrentView('settings'); setIsMobileOpen(false);}} 
          className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
            currentView === 'settings' 
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' 
              : 'hover:bg-slate-800 hover:text-white text-slate-400'
          }`}
        >
          <Settings size={18} className={currentView === 'settings' ? 'text-white' : 'opacity-70'}/> 
          <span className="flex-1 text-right">الإعدادات المركزية</span>
        </button>
      )}
   </>
)}
          </nav>
          
          {/* ملف المستخدم في sidebar */}
          <div className="p-4 border-t border-slate-700 bg-slate-900/50">
             <button 
               onClick={() => openProfileView(appUser)} 
               className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-right group"
             >
               <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center font-black text-white text-sm shadow-lg">
                 {appUser.name?.charAt(0) || appUser.email?.charAt(0)}
               </div>
               <div className="flex-1 overflow-hidden">
                 <p className="text-sm font-bold text-white truncate">{appUser.name || appUser.email}</p>
                 <p className="text-[10px] text-slate-400 truncate group-hover:text-teal-300 transition-colors">
                   {appUser.role === 'admin' ? 'مدير النظام' : USER_ROLES.find(r => r.key === appUser.role)?.label || 'موظف'}
                 </p>
               </div>
            </button>
            
            {/* زر الوضع الداكن */}
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="w-full px-4 py-2 bg-slate-800 text-slate-300 font-bold flex items-center justify-center gap-2 hover:bg-slate-700 rounded-lg transition-colors text-sm mb-2"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              {darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
            </button>
            
            <button 
              onClick={handleLogout} 
              className="w-full px-4 py-2 bg-red-500/10 text-red-400 font-bold flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white rounded-lg transition-colors text-sm"
            >
              <LogOut size={16} /> خروج
            </button>
          </div>
        </aside>

        {/* المحتوى الرئيسي */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Header */}
          <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 sticky top-0 z-10 print:hidden shadow-sm">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsMobileOpen(true)} className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md">
                <Menu size={20}/>
              </button>
              <h2 className="font-bold text-slate-800 dark:text-white text-sm hidden sm:block">
                {currentView === 'dashboard' && 'مرحباً بعودتك 👋'}
                {currentView === 'inventory' && 'إدارة المخزون'}
                {currentView === 'transfers' && 'التحويلات المخزنية'}
                {currentView === 'transactions' && 'نقطة البيع'}
                {currentView === 'customers' && 'إدارة العملاء'}
                {currentView === 'tickets' && 'تذاكر الصيانة'}
                {currentView === 'invoices' && 'أرشيف الفواتير'}
                {currentView === 'reports' && 'التقارير'}
                {currentView === 'finance' && 'الملف المالي'}
                {currentView === 'lowstock' && 'النواقص'}
                {currentView === 'warranty_alerts' && 'تنبيهات الضمان'}
                {currentView === 'settings' && 'الإعدادات المركزية'}
                {currentView === 'warehouses' && 'إدارة الفروع'}
                {currentView === 'users' && 'إدارة المستخدمين'}
                {currentView === 'user_profile' && 'الملف الشخصي'}
              </h2>
            </div>
            <div className="flex items-center gap-3 font-bold">
               <div className="flex items-center gap-2" title={isOnline ? '' : 'تحذير: أي تعديل الآن لن يُحفظ تلقائياً، يرجى الانتظار حتى يعود الاتصال'}>
                 <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                 <span className={`text-[9px] uppercase px-2 py-1 rounded border ${
                   isOnline 
                     ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' 
                     : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800'
                 }`}>
                   {isOnline ? 'متصل' : 'غير متصل'}
                 </span>
               </div>
               <div className="h-6 w-px bg-slate-200 dark:bg-slate-700"></div>
               <span className="text-sm font-bold text-teal-600 dark:text-teal-400">{warehouseMap[appUser.assignedWarehouseId]}</span>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
             <div className="max-w-7xl mx-auto h-full pb-10 print:pb-0">
                
                {/* الصفحات المختلفة - كل صفحة بتتحمّل عند الحاجة فقط (React.lazy) */}
                <React.Suspense fallback={<PageLoadingFallback />}>
                {currentView === 'dashboard' && <DashboardView appUser={appUser} warehouses={warehouses} onNavigateToInventory={handleNavigateToInventory} notify={notify} systemSettings={systemSettings} />}
                
                {currentView === 'inventory' && appUser.permissions?.viewInventory && 
                  <InventoryManager appUser={appUser} warehouses={warehouses} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} />
                }
                
                {currentView === 'transfers' && appUser.permissions?.viewTransfers && 
                  <EnhancedTransferManager appUser={appUser} warehouseMap={warehouseMap} notify={notify} setGlobalLoading={setGlobalLoading} />
                }
                
                {currentView === 'transactions' && appUser.permissions?.viewPOS && 
                  <POSManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} prefillFromTicket={pendingTicketInvoice} onConsumeTicketPrefill={() => setPendingTicketInvoice(null)} />
                }
                
                {currentView === 'customers' && appUser.permissions?.viewCustomers && 
                  <EnhancedCustomerManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} />
                }

                {/* ✅ صفحة إدارة المرتجعات */}
                {currentView === 'returns' && (appUser.permissions?.viewReturns || appUser.role === 'admin') && (
                  <ReturnsManager
                    appUser={appUser}
                    systemSettings={systemSettings}
                    notify={notify}
                    setGlobalLoading={setGlobalLoading}
                    warehouses={warehouses}
                    warehouseMap={warehouseMap}
                  />
                )}
                
                {currentView === 'tickets' && appUser.permissions?.manageTickets && 
                  <EnhancedTicketManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} onGenerateInvoice={handleGenerateInvoiceFromTicket} />
                }
                
               {currentView === 'invoices' && appUser.permissions?.viewInvoices && 
                  <InvoicesManager 
                     appUser={appUser}
                     systemSettings={systemSettings}
                     notify={notify}
                     setGlobalLoading={setGlobalLoading}
                  />
                }

                {/* ✅ صفحة مخزن المرتجعات */}
{currentView === 'returns_warehouse' && (appUser.permissions?.viewReturnsWarehouse || appUser.role === 'admin') && (
  <ReturnsWarehouseManager
    appUser={appUser}
    notify={notify}
    setGlobalLoading={setGlobalLoading}
  />
)}

                {currentView === 'reports' && appUser.permissions?.viewReports && 
                  <ReportsManager notify={notify} appUser={appUser} />
                }

                {currentView === 'finance' && (appUser.permissions?.viewFinance || appUser.role === 'admin') && 
                  <FinanceManager appUser={appUser} />
                }
                
                {currentView === 'lowstock' && appUser.permissions?.viewLowStock && 
                  <LowStockView lowStockItems={lowStockItems} appUser={appUser} warehouseMap={warehouseMap} systemSettings={systemSettings} />
                }

                {currentView === 'warranty_alerts' && (appUser.permissions?.viewReports || appUser.role === 'admin') && 
                  <WarrantyAlertsView systemSettings={systemSettings} appUser={appUser} />
                }
                
                {currentView === 'settings' && (appUser.role === 'admin' || 
                  appUser.permissions?.viewSettings || 
                  appUser.permissions?.manageSettings ||
                  appUser.permissions?.editSystemSettings ||
                  appUser.permissions?.editInvoiceTemplate ||
                  appUser.permissions?.manageTechniciansList ||
                  appUser.permissions?.manageFeesAndCategories ||
                  appUser.permissions?.manageProductModels ||
                  appUser.permissions?.manageFaultCodes ||
                  appUser.permissions?.manageMaintenanceCenters ||
                  appUser.permissions?.manageBranchesList) && 
                  <SettingsManager 
                     systemSettings={systemSettings}
                     setSettings={setSystemSettings}
                     notify={notify}
                     setGlobalLoading={setGlobalLoading}
                     appUser={appUser}
                  />
                }
                
                {currentView === 'warehouses' && appUser.role === 'admin' && 
                  <EnhancedWarehouseManager warehouses={warehouses} appUser={appUser} notify={notify} setGlobalLoading={setGlobalLoading} />
                }
                
                {currentView === 'users' && appUser.role === 'admin' && 
                  <EnhancedUserManagement appUser={appUser} warehouses={warehouses} notify={notify} setGlobalLoading={setGlobalLoading} onViewProfile={openProfileView} />
                }
                
                {currentView === 'user_profile' && 
                  <EmployeeProfileView userToView={viewedUser} warehouseMap={warehouseMap} />
                }

                {/* رسالة عدم الصلاحية */}
                {currentView !== 'dashboard' && 
                 currentView !== 'user_profile' && 
                 !['inventory','transfers','transactions','customers','invoices','tickets','reports','finance','lowstock','settings','warehouses','users'].includes(currentView) && 
                 appUser.role !== 'admin' && 
                 !appUser.permissions?.[`view${currentView.charAt(0).toUpperCase() + currentView.slice(1)}`] && (
                  <div className="flex flex-col items-center justify-center h-96 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <Shield size={64} className="text-slate-300 dark:text-slate-600 mb-4 opacity-50"/>
                    <h2 className="text-xl font-bold mb-2">عذراً، لا تملك صلاحية الوصول</h2>
                    <p className="text-sm">هذه الصفحة غير متاحة لدورك الحالي</p>
                  </div>
                )}
                </React.Suspense>
             </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}

// تحديث InvoicesManager مع فلاتر متقدمة
