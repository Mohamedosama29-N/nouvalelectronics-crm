import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, addDoc, getDocs, doc, query, where, serverTimestamp, orderBy, onSnapshot, limit, writeBatch, startAfter
} from 'firebase/firestore';
import {
  Users,
  Download,
  Plus,
  Search,
  Save,
  Contact,
  MapPin,
  Loader2,
  UserCog,
  X,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  Eye,
  Trash as TrashIcon
} from 'lucide-react';
import { CustomerProfileView } from './CustomerProfileView';
import { InvoiceRenderer } from '../pos/InvoiceRenderer';
import { EGYPT_GOVERNORATES } from '../../constants/misc';
import { db } from '../../firebase/config';
import { useDebounce } from '../../hooks/useDebounce';
import { tagManager } from '../../utils/TagManager';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { parseCSV } from '../../utils/csvParser';
import { exportToExcel } from '../../utils/exportUtils';
import { formatDate } from '../../utils/format';
import { exportToPDF } from '../../utils/pdfExport';
import { buildQueryTokens, buildSearchTokens, normalizePhone, normalizeSearch } from '../../utils/search';
import { validators } from '../../utils/validators';

export function EnhancedCustomerManager({ systemSettings, notify, setGlobalLoading, appUser }) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 700);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  
  const [newCust, setNewCust] = useState({ 
    name: '', 
    phone: '', 
    email: '',
    productCategory: '', 
    productModel: '', 
    issue: '', 
    notes: '',
    governorate: '',
    city: '',
    address: '',
    assignedTechnician: '',
    assignedMaintenanceCenter: '',
    assignedCallCenter: '',
    birthDate: '',
    idNumber: '',
    tags: []
  });
  
  const [technicians, setTechnicians] = useState([]);
  const [maintenanceCenters, setMaintenanceCenters] = useState([]);
  const [callCenters, setCallCenters] = useState([]);
  
  const CUSTOMERS_PAGE_SIZE = 30;
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  // 🆕 ترقيم صفحات حقيقي + تحديث لحظي (onSnapshot) بدل "تحميل المزيد" مع
  // getDocs مرة واحدة - عشان أي تغيير في العملاء (حتى لو حصل من مكان تاني
  // في التطبيق زي إنشاء تذكرة لعميل جديد) يبان هنا فورًا من غير ما تعمل رفريش
  const [currentCustomersPage, setCurrentCustomersPage] = useState(1);
  const customersPageCursorsRef = useRef({ 1: null });
  const [loadingData, setLoadingData] = useState(false);
  
  const [customerTickets, setCustomerTickets] = useState([]);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [filterCity, setFilterCity] = useState('');
  const [filterGovernorate, setFilterGovernorate] = useState('');
  const [filterTechnician, setFilterTechnician] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [availableTags, setAvailableTags] = useState([]);

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
    const loadTags = async () => {
      await tagManager.loadTags();
      const tags = tagManager.getTagsByCategory('customer');
      setAvailableTags(tags.map(t => t.name));
    };
    loadTags();
  }, []);

  // 🛠️ FIX: كان بيستخدم getDocs (تحميل مرة واحدة بس)، فأي تعديل/إضافة/حذف
  // عميل من مكان تاني (زي تسجيل عميل جديد أثناء عمل تذكرة) كان مش بيبان هنا
  // إلا لو عملت رفريش يدوي للصفحة. onSnapshot بيخلي القائمة تتحدث لحظيًا.
  useEffect(() => {
    setLoadingData(true);
    let constraints = [];

    // ✅ التحكم في البيانات حسب صلاحيات المستخدم
    if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
      constraints.push(where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
    }

    const custQueryTokens = buildQueryTokens(debouncedSearch);
    if (custQueryTokens.length > 0) {
      constraints.push(where('searchTokens', 'array-contains-any', custQueryTokens));
    } else {
      constraints.push(orderBy("name"));
    }

    const cursor = customersPageCursorsRef.current[currentCustomersPage];
    if (currentCustomersPage > 1 && cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(CUSTOMERS_PAGE_SIZE));

    const q = query(collection(db, 'customers'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      let fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // تدقيق محلي: array-contains-any بيرجع تطابق "أي" كلمة (OR)، فهنا بنتأكد
      // إن كل كلمات البحث موجودة فعلاً (AND)، ومع دعم العملاء القدام اللي
      // معندهمش searchTokens لسه (رجوع لـ searchKey القديم كحل احتياطي)
      if (custQueryTokens.length > 0) {
        fetched = fetched.filter(c => {
          const haystack = (c.searchTokens && c.searchTokens.length > 0)
            ? c.searchTokens.join(' ')
            : normalizeSearch(c.searchKey || `${c.name || ''} ${c.phone || ''} ${c.email || ''}`);
          return custQueryTokens.every(tok => haystack.includes(tok));
        });
      }

      // الفلاتر المحلية
      if (filterGovernorate) fetched = fetched.filter(c => c.governorate === filterGovernorate);
      if (filterCity) fetched = fetched.filter(c => c.city?.includes(filterCity));
      if (filterTechnician) fetched = fetched.filter(c => c.assignedTechnician === filterTechnician);
      if (filterTag) fetched = fetched.filter(c => c.tags?.includes(filterTag));

      setCustomers(fetched);
      setHasMore(snap.docs.length === CUSTOMERS_PAGE_SIZE);
      const lastVisible = snap.docs[snap.docs.length - 1] || null;
      setLastDoc(lastVisible);
      if (snap.docs.length === CUSTOMERS_PAGE_SIZE) {
        customersPageCursorsRef.current[currentCustomersPage + 1] = lastVisible;
      }
      setLoadingData(false);
    }, (error) => {
      console.error(error);
      showError("فشل جلب العملاء: " + error.message);
      setLoadingData(false);
    });

    return () => unsub();
  }, [appUser, debouncedSearch, filterGovernorate, filterCity, filterTechnician, filterTag, currentCustomersPage]);

  // أي تغيير في الفلاتر أو البحث يرجّعنا لأول صفحة
  useEffect(() => {
    customersPageCursorsRef.current = { 1: null };
    setCurrentCustomersPage(1);
  }, [debouncedSearch, filterGovernorate, filterCity, filterTechnician, filterTag]);

  const toggleSelectItem = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === customers.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(customers.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      showError("لم يتم تحديد أي عملاء للحذف");
      return;
    }

    if (bulkDeleteConfirm !== 'حذف') {
      showError("يرجى كتابة 'حذف' لتأكيد العملية");
      return;
    }

    const confirmed = await showConfirm(
      'تأكيد الحذف المجمع',
      `هل أنت متأكد من حذف ${selectedItems.size} عميل بشكل نهائي؟`,
      'warning',
      'نعم، احذف الكل'
    );

    if (!confirmed) return;

    setGlobalLoading(true);
    try {
      const itemsToDelete = Array.from(selectedItems);
      const chunks = [];
      
      for (let i = 0; i < itemsToDelete.length; i += 400) {
        chunks.push(itemsToDelete.slice(i, i + 400));
      }

      let deleted = 0;
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        chunk.forEach(customerId => {
          const ref = doc(db, 'customers', customerId);
          batch.delete(ref);
        });

        await batch.commit();
        deleted += chunk.length;
      }

      await logUserActivity(appUser, 'حذف مجمع عملاء', `تم حذف ${deleted} عميل`);
      showSuccess(`تم حذف ${deleted} عميل بنجاح`);
      
      setSelectedItems(new Set());
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirm('');
      // 🆕 مفيش داعي لإعادة تحميل يدوي بعد كده - الـ onSnapshot الحي هيحدّث القائمة تلقائيًا
      customersPageCursorsRef.current = { 1: null };
      setCurrentCustomersPage(1);
      
    } catch (error) {
      console.error("Bulk delete error:", error);
      showError("حدث خطأ أثناء الحذف المجمع");
    }
    setGlobalLoading(false);
  };

  const handleAddCustomer = async (e) => {
     e.preventDefault();
     
     const errors = validators.customer(newCust);
     if (errors.length > 0) {
       showError(errors.join('\n'));
       return;
     }
     
     setGlobalLoading(true);
     try {
        // ✨ FIX: توحيد رقم الهاتف قبل التخزين، ومنع إنشاء عميل مكرر
        // بنفس الرقم بصيغة مختلفة (مسافات، +20، 0020...)
        const normalizedPhone = normalizePhone(newCust.phone);
        const dupCheck = await getDocs(query(collection(db, 'customers'), where('phone', '==', normalizedPhone)));
        if (!dupCheck.empty) {
          showError(`يوجد عميل مسجّل بالفعل بنفس رقم الهاتف: ${dupCheck.docs[0].data().name}`);
          setGlobalLoading(false);
          return;
        }

        if (newCust.tags && newCust.tags.length > 0) {
          for (const tag of newCust.tags) {
            await tagManager.incrementUsage(tag);
          }
        }
        
        const customerData = {
           ...newCust,
           phone: normalizedPhone,
           createdAt: serverTimestamp(),
           createdBy: appUser.id,
           createdByName: appUser.name,
           searchKey: normalizeSearch(`${newCust.name} ${normalizedPhone} ${newCust.email || ''} ${(newCust.tags || []).join(' ')}`),
           searchTokens: buildSearchTokens(newCust.name, normalizedPhone, newCust.email, ...(newCust.tags || [])),
           addressFull: newCust.governorate && newCust.city && newCust.address 
             ? `${newCust.governorate} - ${newCust.city} - ${newCust.address}`
             : '',
           totalPurchases: 0,
           lastPurchase: null,
           ticketsCount: 0
        };

        await addDoc(collection(db, 'customers'), customerData);
        
        await logUserActivity(appUser, 'إضافة عميل', `تسجيل العميل: ${newCust.name}`);
        showSuccess("تم تسجيل العميل بنجاح");
        setShowAddModal(false);
        setNewCust({ 
          name: '', phone: '', email: '', productCategory: '', productModel: '', issue: '', notes: '',
          governorate: '', city: '', address: '', assignedTechnician: '', assignedMaintenanceCenter: '', 
          assignedCallCenter: '', birthDate: '', idNumber: '', tags: []
        });
        setLastDoc(null);
        // 🆕 مفيش داعي لإعادة تحميل يدوي - الـ onSnapshot الحي هيضيف العميل الجديد تلقائيًا
        customersPageCursorsRef.current = { 1: null };
        setCurrentCustomersPage(1);
     } catch(err) {
        console.error(err);
        if (err.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ أثناء الحفظ: " + err.message);
        }
     }
     setGlobalLoading(false);
  };

  const handleImportCustomers = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showError("حجم الملف كبير جداً. الحد الأقصى 10MB");
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const data = parseCSV(text);
        let success = 0;
        let failed = 0;

        if (data.length > 15000) {
          showError("عدد العملاء كبير جداً. الحد الأقصى 15000 عميل");
          e.target.value = null;
          return;
        }

        const chunks = [];
        for (let i = 0; i < data.length; i += 400) {
          chunks.push(data.slice(i, i + 400));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          
          for (const row of chunk) {
            try {
              if (!row.name || !row.phone) {
                failed++;
                continue;
              }

              const tags = row.tags ? row.tags.split(',').map(t => t.trim()) : [];

              const customerData = {
                name: row.name,
                phone: row.phone,
                email: row.email || '',
                governorate: row.governorate || '',
                city: row.city || '',
                address: row.address || '',
                notes: row.notes || '',
                tags,
                createdAt: serverTimestamp(),
                createdBy: appUser.id,
                createdByName: appUser.name,
                searchKey: normalizeSearch(`${row.name} ${row.phone} ${tags.join(' ')}`),
                searchTokens: buildSearchTokens(row.name, row.phone, ...tags)
              };

              const newRef = doc(collection(db, 'customers'));
              batch.set(newRef, customerData);
              success++;
            } catch {
              failed++;
            }
          }

          await batch.commit();
        }

        showSuccess(`تم استيراد ${success} عميل بنجاح، فشل ${failed}`);
        setLastDoc(null);
        // 🆕 مفيش داعي لإعادة تحميل يدوي - الـ onSnapshot الحي هيحدّث القائمة تلقائيًا
        customersPageCursorsRef.current = { 1: null };
        setCurrentCustomersPage(1);
      } catch (error) {
        console.error("Import error:", error);
        showError("خطأ في قراءة الملف");
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handleExportCustomers = async (format = 'xlsx') => {
    const exportData = customers.map(c => ({
      'الاسم': c.name,
      'الهاتف': c.phone,
      'البريد الإلكتروني': c.email || '',
      'المحافظة': c.governorate || '',
      'المدينة': c.city || '',
      'العنوان': c.address || '',
      'الوسوم': (c.tags || []).join(', '),
      'آخر شراء': formatDate(c.lastPurchase),
      'عدد المشتريات': c.totalPurchases || 0,
      'عدد التذاكر': c.ticketsCount || 0
    }));

    if (exportData.length === 0) {
      showError("لا توجد بيانات للتصدير");
      return;
    }

    // 🆕 FIX: تصدير Excel كان مش موجود خالص للعملاء (بس PDF)، وExcel أنسب
    // بكتير للتقارير والتحليل من PDF. خليت xlsx هي الافتراضية، وسايب PDF
    // كخيار لمين محتاجه للطباعة.
    if (format === 'xlsx') {
      if (exportToExcel(exportData, `Customers_${new Date().toISOString().split('T')[0]}`, 'العملاء')) {
        showSuccess("تم تصدير ملف Excel بنجاح");
      } else {
        showError("حدث خطأ أثناء التصدير");
      }
    } else {
      await exportToPDF(
        exportData,
        'تقرير العملاء',
        ['الاسم', 'الهاتف', 'البريد الإلكتروني', 'المحافظة', 'المدينة', 'العنوان', 'الوسوم', 'آخر شراء', 'عدد المشتريات', 'عدد التذاكر']
      );
      showSuccess("تم تصدير PDF بنجاح");
    }
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
           technicians={technicians}
           maintenanceCenters={maintenanceCenters}
           callCenters={callCenters}
        />
     );
  }

  const cities = [...new Set(customers.map(c => c.city).filter(Boolean))];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden text-right" dir="rtl">
      
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <UserCog className="text-teal-600"/> تسجيل بيانات عميل جديد
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24}/>
              </button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اسم العميل *</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-teal-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                       value={newCust.name} 
                       onChange={e=>setNewCust({...newCust, name:e.target.value})} 
                       placeholder="الاسم بالكامل" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم الهاتف *</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-teal-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold font-mono" 
                       value={newCust.phone} 
                       onChange={e=>setNewCust({...newCust, phone:e.target.value})} 
                       placeholder="01XXXXXXXXX" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">البريد الإلكتروني</label>
                     <input 
                       type="email"
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-teal-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                       value={newCust.email} 
                       onChange={e=>setNewCust({...newCust, email:e.target.value})} 
                       placeholder="example@domain.com" 
                     />
                  </div>
               </div>

               <div className="bg-sky-50 dark:bg-sky-900/30 p-4 rounded-xl border border-sky-100 dark:border-sky-800">
                  <h4 className="font-bold text-sm text-sky-900 dark:text-sky-300 mb-3 flex items-center gap-2">
                    <MapPin size={16}/> عنوان العميل
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-sky-800 dark:text-sky-400 mb-1">المحافظة</label>
                        <select 
                          className="w-full border border-sky-200 dark:border-sky-800 p-3 rounded-xl focus:border-teal-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold"
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
                        <label className="block text-xs font-bold text-sky-800 dark:text-sky-400 mb-1">المدينة / المركز</label>
                        <input 
                          className="w-full border border-sky-200 dark:border-sky-800 p-3 rounded-xl focus:border-teal-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold" 
                          value={newCust.city} 
                          onChange={e=>setNewCust({...newCust, city:e.target.value})} 
                          placeholder="مثال: مدينة نصر" 
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-sky-800 dark:text-sky-400 mb-1">العنوان بالتفصيل</label>
                        <input 
                          className="w-full border border-sky-200 dark:border-sky-800 p-3 rounded-xl focus:border-teal-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold" 
                          value={newCust.address} 
                          onChange={e=>setNewCust({...newCust, address:e.target.value})} 
                          placeholder="الشارع - العمارة - الشقة" 
                        />
                     </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl border border-teal-100 dark:border-teal-800">
                  <div>
                     <label className="block text-xs font-bold text-teal-900 dark:text-teal-300 mb-1">المنتج (التصنيف)</label>
                     <select 
                       className="w-full border border-teal-100 dark:border-teal-800 p-3 rounded-xl focus:border-teal-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold" 
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
                     <label className="block text-xs font-bold text-teal-900 dark:text-teal-300 mb-1">الموديل</label>
                     <select 
                       disabled={!newCust.productCategory} 
                       className="w-full border border-teal-100 dark:border-teal-800 p-3 rounded-xl focus:border-teal-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:opacity-60" 
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

              <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800">
  <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-300 mb-3 flex items-center gap-2">
    <Users size={16}/> تعيين المسؤولين
  </h4>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
     
    {/* الفني المختص - ✅ من الإعدادات (systemSettings.technicians) */}
    <div>
      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-400 mb-1">الفني المختص</label>
      <select 
        className="w-full border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl focus:border-teal-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold"
        value={newCust.assignedTechnician}
        onChange={e => setNewCust({...newCust, assignedTechnician: e.target.value})}
      >
        <option value="">-- غير محدد --</option>
        {/* ✅ استخدام systemSettings.technicians من الإعدادات */}
        {(systemSettings.technicians || []).map((tech, idx) => (
          <option key={idx} value={tech}>{tech}</option>
        ))}
      </select>
    </div>
    
    {/* ✅ مركز الصيانة - معدل ليأخذ البيانات من systemSettings.maintenanceCenters */}
    <div>
      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-400 mb-1">مركز الصيانة</label>
      <select 
        className="w-full border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl focus:border-teal-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold"
        value={newCust.assignedMaintenanceCenter}
        onChange={e => setNewCust({...newCust, assignedMaintenanceCenter: e.target.value})}
      >
        <option value="">-- غير محدد --</option>
        {(systemSettings.maintenanceCenters || []).map(center => (
          <option key={center.value || center} value={center.value || center}>
            {center.name || center}
          </option>
        ))}
      </select>
    </div>
    
    {/* الكول سنتر - يبقى كما هو من الموظفين */}
    <div>
      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-400 mb-1">الكول سنتر</label>
      <select 
        className="w-full border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl focus:border-teal-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold"
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

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">تاريخ الميلاد</label>
                     <input 
                       type="date"
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-teal-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                       value={newCust.birthDate} 
                       onChange={e=>setNewCust({...newCust, birthDate: e.target.value})} 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم الهوية</label>
                     <input 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-teal-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                       value={newCust.idNumber} 
                       onChange={e=>setNewCust({...newCust, idNumber: e.target.value})} 
                       placeholder="رقم البطاقة" 
                     />
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الوسوم</label>
                  <input 
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-teal-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                    value={newCust.tags?.join(', ')} 
                    onChange={e=>setNewCust({...newCust, tags: e.target.value.split(',').map(t => t.trim())})} 
                    placeholder="وسم1, وسم2, وسم3" 
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">العطل / المشكلة</label>
                  <textarea 
                    rows="2" 
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-teal-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold resize-none" 
                    value={newCust.issue} 
                    onChange={e=>setNewCust({...newCust, issue:e.target.value})} 
                    placeholder="وصف المشكلة التي يواجهها العميل..." 
                  />
               </div>
               
               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات إضافية</label>
                  <textarea 
                    rows="2"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-teal-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold resize-none" 
                    value={newCust.notes} 
                    onChange={e=>setNewCust({...newCust, notes:e.target.value})} 
                    placeholder="أي تفاصيل أخرى..." 
                  />
               </div>

               <div className="flex gap-3 pt-4 border-t">
                  <button 
                    type="submit" 
                    className="flex-1 bg-teal-600 text-white py-3.5 rounded-xl font-bold hover:bg-teal-700 shadow-md transition-colors flex items-center justify-center gap-2"
                  >
                    <Save size={18}/> حفظ البيانات
                  </button>
                  <button 
                    type="button" 
                    onClick={()=>setShowAddModal(false)} 
                    className="px-6 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3.5 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    إلغاء
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}

      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <TrashIcon size={20}/> حذف مجمع للعملاء
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              أنت على وشك حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> عميل بشكل نهائي.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
              هذا الإجراء لا يمكن التراجع عنه. لتأكيد الحذف، اكتب "حذف" في الحقل أدناه.
            </p>
            
            <input
              type="text"
              className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-rose-500 mb-4 bg-white dark:bg-slate-900"
              placeholder="اكتب 'حذف' للتأكيد"
              value={bulkDeleteConfirm}
              onChange={e => setBulkDeleteConfirm(e.target.value)}
            />
            
            <div className="flex gap-2">
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteConfirm !== 'حذف'}
                className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                تأكيد الحذف
              </button>
              <button
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setBulkDeleteConfirm('');
                }}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-5 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 dark:bg-slate-900/50">
         <div className="flex items-center gap-2">
           <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
             <Contact className="text-teal-600" size={20}/> سجل العملاء
           </h2>
           <span className="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-3 py-1 rounded-lg text-xs">
             {customers.length} عميل
           </span>
         </div>
         
         <div className="flex flex-wrap gap-2 w-full md:w-auto">
             {selectedItems.size > 0 && appUser.permissions?.deleteCustomer && (
               <button 
                 onClick={() => setShowBulkDeleteModal(true)} 
                 className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center justify-center gap-2"
               >
                 <TrashIcon size={14}/> حذف {selectedItems.size} عميل
               </button>
             )}
             
             <div className="relative flex-1 md:w-48">
                 <Search className="absolute right-3 top-2.5 text-slate-400" size={16}/>
                 <input 
                   className="w-full border border-slate-200 dark:border-slate-700 py-2 pr-9 pl-3 rounded-lg outline-none text-xs font-bold focus:border-teal-500 bg-white dark:bg-slate-900" 
                   placeholder="بحث..." 
                   value={search} 
                   onChange={e=>setSearch(e.target.value)} 
                 />
             </div>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900"
               value={filterGovernorate}
               onChange={e => setFilterGovernorate(e.target.value)}
             >
               <option value="">كل المحافظات</option>
               {EGYPT_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
             </select>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900"
               value={filterCity}
               onChange={e => setFilterCity(e.target.value)}
             >
               <option value="">كل المدن</option>
               {cities.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900"
               value={filterTechnician}
               onChange={e => setFilterTechnician(e.target.value)}
             >
               <option value="">كل الفنيين</option>
               {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
             </select>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900"
               value={filterTag}
               onChange={e => setFilterTag(e.target.value)}
             >
               <option value="">كل الوسوم</option>
               {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
             </select>
             
             {loadingData && <Loader2 className="animate-spin text-teal-500 mt-2 sm:mt-0" size={16}/>}
             
             <input
               type="file"
               id="importCustomers"
               accept=".csv"
               className="hidden"
               onChange={handleImportCustomers}
             />
             <button 
               onClick={() => document.getElementById('importCustomers').click()}
               className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2"
             >
                <UploadCloud size={14}/> استيراد
             </button>
             
             <button 
               onClick={() => handleExportCustomers('xlsx')}
               className="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900/50 flex items-center gap-2"
             >
                <Download size={14}/> تصدير Excel
             </button>

             <button 
               onClick={() => handleExportCustomers('pdf')}
               className="bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-900/50 flex items-center gap-2"
             >
                <Download size={14}/> PDF
             </button>
             
             <button 
               onClick={()=>setShowAddModal(true)} 
               className="bg-teal-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-teal-700 flex items-center gap-2 shadow-sm whitespace-nowrap"
             >
                <Plus size={14}/> إضافة عميل
             </button>
         </div>
      </div>

      <div className="overflow-x-auto max-h-[70vh] custom-scrollbar">
         <table className="w-full text-right text-sm">
            <thead className="bg-white dark:bg-slate-900 border-b text-slate-500 dark:text-slate-400 font-bold text-[11px] uppercase sticky top-0">
               <tr>
                  <th className="p-4 w-10">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-teal-600"
                      checked={selectedItems.size === customers.length && customers.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-4">العميل</th>
                  <th className="p-4">الهاتف</th>
                  <th className="p-4">المنتج</th>
                  <th className="p-4">المحافظة</th>
                  <th className="p-4">المدينة</th>
                  <th className="p-4">المسؤولون</th>
                  <th className="p-4">الوسوم</th>
                  <th className="p-4 text-center">المشتريات</th>
                  <th className="p-4 text-center">التذاكر</th>
                  <th className="p-4 text-center">إدارة</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700 font-medium text-xs">
               {customers.length === 0 && !loadingData ? 
                 <tr><td colSpan="11" className="p-10 text-center text-slate-400">لا توجد سجلات للعملاء</td></tr> : 
                 customers.map((c) => (
                   <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                     <td className="p-4">
                       <input 
                         type="checkbox" 
                         className="w-4 h-4 accent-teal-600"
                         checked={selectedItems.has(c.id)}
                         onChange={() => toggleSelectItem(c.id)}
                       />
                     </td>
                     <td className="p-4">
                        <p className="font-bold text-slate-800 dark:text-white text-sm mb-1">{c.name}</p>
                        {c.email && <p className="text-[9px] text-slate-400">{c.email}</p>}
                     </td>
                     <td className="p-4 font-mono text-slate-600 dark:text-slate-400" dir="ltr">{c.phone}</td>
                     <td className="p-4">
                        {c.productCategory ? (
                           <>
                             <span className="inline-block bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-2 py-1 rounded text-[9px] font-black mb-1">{c.productCategory}</span>
                             <p className="text-slate-600 dark:text-slate-400 text-[10px]">{c.productModel || '-'}</p>
                           </>
                        ) : <span className="text-slate-400">-</span>}
                     </td>
                     <td className="p-4 text-slate-600 dark:text-slate-400">{c.governorate || '-'}</td>
                     <td className="p-4 text-slate-600 dark:text-slate-400">{c.city || '-'}</td>
                     <td className="p-4">
                        <div className="space-y-1">
                           {c.assignedTechnician && <span className="inline-block bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded text-[8px] font-bold ml-1">فني</span>}
                           {c.assignedMaintenanceCenter && <span className="inline-block bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded text-[8px] font-bold ml-1">صيانة</span>}
                           {c.assignedCallCenter && <span className="inline-block bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded text-[8px] font-bold">كول سنتر</span>}
                        </div>
                     </td>
                     <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {(c.tags || []).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded text-[8px] font-bold">
                              {tag}
                            </span>
                          ))}
                        </div>
                     </td>
                     <td className="p-4 text-center">
                       <span className="font-bold text-teal-600 dark:text-teal-400">{c.totalPurchases || 0}</span>
                     </td>
                     <td className="p-4 text-center">
                       <span className="font-bold text-amber-600 dark:text-amber-400">{c.ticketsCount || 0}</span>
                     </td>
                     <td className="p-4 text-center">
                        <button 
                          onClick={() => setSelectedCustomer(c)} 
                          className="bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 px-3 py-1.5 rounded-lg font-bold text-[10px] hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors border border-teal-100 dark:border-teal-800 flex items-center gap-1 mx-auto"
                        >
                          <Eye size={12}/> عرض
                        </button>
                     </td>
                   </tr>
                 ))
               }
            </tbody>
         </table>
         {/* 🆕 ترقيم صفحات حقيقي بدل "تحميل المزيد" */}
         {!loadingData && (customers.length > 0 || currentCustomersPage > 1) && (
             <div className="p-4 flex items-center justify-center gap-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
                <button
                  onClick={() => setCurrentCustomersPage(p => Math.max(1, p - 1))}
                  disabled={currentCustomersPage <= 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronRight size={14}/> السابق
                </button>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 px-2">
                  صفحة {currentCustomersPage}
                </span>
                <button
                  onClick={() => setCurrentCustomersPage(p => p + 1)}
                  disabled={!hasMore}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  التالي <ChevronLeft size={14}/>
                </button>
             </div>
         )}
      </div>
    </div>
  );
}

// ==========================================================================
// 👤 عرض ملف العميل المحسن مع السجل الكامل والتذاكر
// ==========================================================================
