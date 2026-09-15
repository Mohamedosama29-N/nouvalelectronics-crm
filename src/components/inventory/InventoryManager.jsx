import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, addDoc, getDocs, doc, updateDoc, query, where, serverTimestamp, orderBy, limit, writeBatch, startAfter, getCountFromServer
} from 'firebase/firestore';
import {
  Package,
  AlertTriangle,
  Download,
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  Percent,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  RefreshCw,
  DownloadCloud as DownloadIcon,
  RefreshCcw,
  Trash as TrashIcon
} from 'lucide-react';
import { VirtualTable } from '../common/VirtualTable';
import { db } from '../../firebase/config';
import { useDebounce } from '../../hooks/useDebounce';
import { tagManager } from '../../utils/TagManager';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showInfo, showSuccess, showWarning } from '../../utils/alerts';
import { parseCSV } from '../../utils/csvParser';
import { exportToCSV, exportToExcel } from '../../utils/exportUtils';
import { buildInventorySearchTokens, buildQueryTokens, buildSearchTokens, normalizePhone, normalizeSearch, normalizeSerial, sanitizeDocId } from '../../utils/search';
import { validators } from '../../utils/validators';

export function InventoryManager({ appUser, warehouses, setGlobalLoading, warehouseMap }) {
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
    warehouseId: appUser?.assignedWarehouseId || 'main',
    category: 'عام',
    location: '',
    tags: [],
    notes: ''
  });
  const fileInputRef = useRef(null);
  
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  // 📄 FIX: تحويل التمرير المتراكم ("تحميل المزيد") لصفحات حقيقية بأرقام
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState([null]); // pageCursors[i] = مؤشر بداية الصفحة i+1
  const [totalCount, setTotalCount] = useState(0); // 🔢 العدد الفعلي للأصناف المطابقة للفلاتر (مش القطع)
  
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkPercent, setBulkPercent] = useState(0);
  
  const [importProgress, setImportProgress] = useState({ total: 0, processed: 0, status: '' });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  
  const [searchFilters, setSearchFilters] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

//تعديل السيرش - serach serial upadte//
  // دالة لتحديث كل الأصناف (مرة واحدة فقط)
const fixSearchKeys = async () => {
  setGlobalLoading(true);
  try {
    let count = 0;

    // مصفوفة الكوليكشنز اللي محتاجة ترقية searchTokens، وكل واحدة
    // وطريقة بناء التوكنز الخاصة بيها من حقولها
    // ✨ FIX: بعض الأصناف/العملاء/التذاكر القديمة اتضافت من غير حقل isDeleted
    // خالص. أغلب استعلامات السيستم بتستخدم where('isDeleted','==',false)
    // (مطابقة صارمة)، فأي مستند من غير الحقل ده بيختفي من كل حتة (المخزون،
    // البحث، الجرد، النقل...) رغم إنه مش محذوف فعليًا. هنا بنضيفه بقيمة
    // false لأي مستند ناقصه، من غير ما نلمس المستندات اللي فعلاً isDeleted:true.
    const withDeletedFlag = (data, extra = {}) =>
      data.isDeleted === undefined ? { ...extra, isDeleted: false } : extra;

    const jobs = [
      {
        name: 'inventory',
        tokensOf: (data) => buildInventorySearchTokens(data.name, data.serialNumber, data.category, ...(data.tags || [])),
        extraFieldsOf: (data) => withDeletedFlag(data)
      },
      {
        name: 'customers',
        // ✨ FIX: توحيد رقم الهاتف للعملاء القدام كمان (إزالة مسافات/بادئات دولية مختلفة)
        tokensOf: (data) => buildSearchTokens(data.name, normalizePhone(data.phone), data.email, ...(data.tags || [])),
        extraFieldsOf: (data) => withDeletedFlag(data, { phone: normalizePhone(data.phone) })
      },
      {
        name: 'tickets',
        tokensOf: (data) => buildSearchTokens(
          data.customerName, data.customerPhone, data.ticketNumber,
          data.assignedTechnician, data.assignedMaintenanceCenter, data.device, data.deviceSerial
        ),
        extraFieldsOf: (data) => withDeletedFlag(data)
      }
    ];

    for (const job of jobs) {
      const snap = await getDocs(collection(db, job.name));
      // ⚠️ FIX: Firestore بيحدد الـ batch الواحد بـ 500 عملية كحد أقصى.
      // مجموعة فيها أكتر من 500 مستند كانت هتخلي batch.commit() يفشل بالكامل.
      // هنا بنقسّم العملية لدفعات من 450.
      const docs = snap.docs;
      const chunkSize = 450;
      for (let i = 0; i < docs.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + chunkSize);
        chunk.forEach(docSnap => {
          const data = docSnap.data();
          batch.update(docSnap.ref, { searchTokens: job.tokensOf(data), ...job.extraFieldsOf(data) });
          count++;
        });
        await batch.commit();
      }
    }

    showSuccess(`✅ تم تحديث فهارس البحث لـ ${count} مستند (مخزون + عملاء + تذاكر)`);
    loadItems(1); // إعادة تحميل بيانات المخزون
    loadTotalCount();
  } catch (error) {
    console.error('Error:', error);
    showError('❌ فشل التحديث');
  }
  setGlobalLoading(false);
};


  // تحميل الوسوم
  useEffect(() => {
    const loadTags = async () => {
      await tagManager.loadTags();
      const allTags = tagManager.searchTags('');
      setAvailableTags(allTags.map(t => t.name));
    };
    loadTags();
  }, []);

  // ==========================================================================
// 📦 تحميل بيانات المخزون مع صفحات حقيقية (Pagination) وبحث متقدم
// ==========================================================================
const loadItems = useCallback(async (page = 1) => {
  if (!appUser) return;
  setLoadingData(true);

  try {
    // ✅ بناء الاستعلام مع الفلاتر
    let constraints = [];
    
    // 1️⃣ فلترة حسب الصلاحيات (المخزن المخصص للمستخدم)
    if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
      constraints.push(where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
    }
    
    // 2️⃣ استبعاد الأصناف المحذوفة
    constraints.push(where('isDeleted', '==', false));
    
    // 3️⃣ البحث المتقدم (باستخدام searchTokens - يدعم البحث بالاسم أو
    // السريال أو التصنيف أو أي تاج، مش بس أول كلمة في النص)
    const queryTokens = buildQueryTokens(debouncedSearch);
    if (queryTokens.length > 0) {
      constraints.push(where('searchTokens', 'array-contains-any', queryTokens));
    } else {
      // ترتيب حسب الاسم إذا لم يكن هناك بحث
      constraints.push(orderBy('name'));
    }

    // 4️⃣ 📄 FIX: صفحات حقيقية بدل التحميل التراكمي - نستخدم مؤشر بداية
    // الصفحة المطلوبة (لو سبق زيارتها) بدل ما نضيف كل دفعة على اللي قبلها
    const cursor = pageCursors[page - 1];
    if (page > 1 && cursor) {
      constraints.push(startAfter(cursor));
    }
    constraints.push(limit(PAGE_SIZE));

    // 5️⃣ تنفيذ الاستعلام
    let q = query(collection(db, 'inventory'), ...constraints);
    const snap = await getDocs(q);
    
    let fetched = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    // 6️⃣ تنقية محلية إضافية بعد جلب Firestore:
    // array-contains-any بيرجع أي صنف فيه "ولو كلمة واحدة" من كلمات البحث (OR)،
    // فهنا بنتأكد إن كل كلمات البحث فعلاً موجودة في الصنف (AND) لدقة أعلى،
    // مع دعم الأصناف القديمة اللي لسه معندهاش searchTokens (باستخدام searchKey القديم).
    if (queryTokens.length > 0) {
      fetched = fetched.filter(i => {
        const haystack = (i.searchTokens && i.searchTokens.length > 0)
          ? i.searchTokens.join(' ')
          : normalizeSearch(i.searchKey || `${i.name || ''} ${i.serialNumber || ''} ${i.category || ''}`);
        return queryTokens.every(tok => haystack.includes(tok));
      });
    }

    // 7️⃣ فلاتر محلية إضافية (لأنها لا تدعمها Firebase مباشرة)
    if (searchFilters.warehouse) {
      fetched = fetched.filter(i => i.warehouseId === searchFilters.warehouse);
    }
    if (searchFilters.category) {
      fetched = fetched.filter(i => i.category === searchFilters.category);
    }
    if (selectedTags.length > 0) {
      fetched = fetched.filter(i => 
        selectedTags.some(tag => (i.tags || []).includes(tag))
      );
    }

    // 8️⃣ 📄 استبدال محتوى الصفحة الحالية بدل التراكم فوق بعضه
    setItems(fetched);

    // 9️⃣ حفظ مؤشر بداية الصفحة التالية (لو لسه معندناش مؤشر ليها)
    const lastVisible = snap.docs[snap.docs.length - 1] || null;
    setPageCursors(prev => {
      const next = [...prev];
      next[page] = lastVisible;
      return next;
    });
    setHasMore(snap.docs.length === PAGE_SIZE);
    setCurrentPage(page);
    
  } catch (e) {
    console.error("Error loading inventory:", e);
    if (e.code === 'permission-denied') {
      showError("❌ خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
    } else if (e.message.includes('index')) {
      showError("⚠️ يحتاج هذا البحث إلى تهيئة فهارس Firebase. انتظر دقيقة ثم حاول مرة أخرى.");
    } else {
      showError("❌ فشل تحميل المخزون: " + e.message);
    }
  }
  setLoadingData(false);
}, [appUser, debouncedSearch, searchFilters, selectedTags, pageCursors]);

// 🔢 FIX: العدد الفعلي لعدد "الأصناف" (المستندات المطابقة للبحث/الصلاحيات)
// مش مجموع الكميات، ومش بس عدد الأصناف المحمّلة في الصفحة الحالية
const loadTotalCount = useCallback(async () => {
  if (!appUser) return;
  try {
    let constraints = [];
    if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
      constraints.push(where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
    }
    constraints.push(where('isDeleted', '==', false));
    const queryTokens = buildQueryTokens(debouncedSearch);
    if (queryTokens.length > 0) {
      constraints.push(where('searchTokens', 'array-contains-any', queryTokens));
    }
    const countSnap = await getCountFromServer(query(collection(db, 'inventory'), ...constraints));
    setTotalCount(countSnap.data().count);
  } catch (e) {
    console.error('Error counting inventory:', e);
  }
}, [appUser, debouncedSearch]);


useEffect(() => {

  setPageCursors([null]);
  loadItems(1);
  loadTotalCount();

}, [debouncedSearch, appUser, searchFilters, selectedTags]);

  useEffect(() => {
    const uniqueCategories = [...new Set(items.map(item => item.category).filter(Boolean))];
    setCategories(uniqueCategories);
  }, [items]);

  // دوال التحديد المتعدد
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
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(i => i.id)));
    }
  };

  // دالة الحذف المجمع
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      showError("لم يتم تحديد أي أصناف للحذف");
      return;
    }

    if (bulkDeleteConfirm !== 'حذف') {
      showError("يرجى كتابة 'حذف' لتأكيد العملية");
      return;
    }

    const confirmed = await showConfirm(
      'تأكيد الحذف المجمع',
      `هل أنت متأكد من حذف ${selectedItems.size} صنف بشكل نهائي؟`,
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
        
        chunk.forEach(itemId => {
          const ref = doc(db, 'inventory', itemId);
          batch.delete(ref);
        });

        await batch.commit();
        deleted += chunk.length;
      }

      await logUserActivity(appUser, 'حذف مجمع', `تم حذف ${deleted} صنف من المخزون`);
      showSuccess(`تم حذف ${deleted} صنف بنجاح`);
      
      setSelectedItems(new Set());
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirm('');
      setLastDoc(null);
      setPageCursors([null]);
      loadItems(1);
      loadTotalCount();
      
    } catch (error) {
      console.error("Bulk delete error:", error);
      showError("حدث خطأ أثناء الحذف المجمع");
    }
    setGlobalLoading(false);
  };

  // دالة التحقق من السيريال
  const checkSerialAvailability = async (serial) => {

  const normalized = normalizeSerial(serial);

  const q = query(
    collection(db,'inventory'),
    where('serialNumber','==',normalized),
    where('isDeleted','==',false)
  );

  const snap = await getDocs(q);

  return snap.empty;

};

  // دالة الاستيراد المحسنة مع Web Worker
  const handleImportConfirm = async () => {
    if (importData.length === 0) return;

    setShowImportModal(false);
    setGlobalLoading(true);
    
    const totalItems = importData.length;

    // ⚠️ FIX: كل صنف بيتكتب في عمليتين منفصلتين جوه نفس الـ batch
    // (مستند inventory + مستند serial_registry). Firestore بيسمح بحد أقصى
    // 500 عملية لكل writeBatch. كان BATCH_SIZE = 400 صنف يعني 800 عملية
    // فعليًا لكل دفعة - أكبر من الحد المسموح، فكل commit كان بيفشل بالكامل
    // بصمت (يتحسب "فشل" جوه catch) رغم ظهور رسالة "نجاح" في الآخر.
    // 200 صنف × عمليتين = 400 عملية، في أمان تحت الحد الأقصى (500).
    const BATCH_SIZE = 200;

    setImportProgress({ 
      total: totalItems, 
      processed: 0, 
      failed: 0,
      status: 'بدء الاستيراد...',
      currentBatch: 0,
      totalBatches: Math.ceil(totalItems / BATCH_SIZE)
    });

    // ⚠️ FIX: رسالة "تم الاستيراد بنجاح" كانت بتعتمد على processed/failed
    // الجاية من الـ Worker نفسه - وده بس بيعرف إنه "جهّز" البيانات وبعتها،
    // مش إنها اتحفظت فعليًا في Firestore (الحفظ الفعلي بيحصل هنا في الـ
    // main thread بعد كده). فكانت ممكن تظهر "نجاح" حتى لو فشل الحفظ الفعلي.
    // هنا بنتابع نتيجة كل commit فعلي بنفسنا، ونستنى كل الدفعات المعلّقة
    // قبل ما نوري رسالة النهاية، ونعرض العدد الحقيقي المتحفظ فعلاً.
    const realCounts = { processed: 0, failed: 0 };
    const pendingCommits = [];

    try {
      const worker = new Worker('/workers/inventoryImportWorker.js');
      
      worker.postMessage({
        data: importData,
        batchSize: BATCH_SIZE,
        userId: appUser.id,
        userName: appUser.name
      });

      worker.onmessage = async (e) => {
        const { type, processed, failed, total, batch, batchIndex, totalBatches, error } = e.data;
        
        if (type === 'batch') {
          const commitPromise = (async () => {
            try {
              const firestoreBatch = writeBatch(db);
              
              for (const item of batch) {
                const newRef = doc(collection(db, 'inventory'));
                firestoreBatch.set(newRef, {
                  ...item,
                  searchKey: normalizeSearch(`${item.name} ${item.serialNumber} ${item.category} ${(item.tags || []).join(' ')}`),
                  searchTokens: buildInventorySearchTokens(item.name, item.serialNumber, item.category, ...(item.tags || [])),
                  createdAt: serverTimestamp(),
                  isDeleted: false,
                  importedBy: appUser.name,
                  importedAt: serverTimestamp()
                });

                const safeSerialId = sanitizeDocId(item.serialNumber);
                if (safeSerialId) {
                  const regRef = doc(db, 'serial_registry', safeSerialId);
                  firestoreBatch.set(regRef, { 
                    exists: true, 
                    imported: true,
                    importedAt: serverTimestamp() 
                  }, { merge: true });
                }
              }
              
              await firestoreBatch.commit();
              realCounts.processed += batch.length;
              
              setImportProgress(prev => ({
                ...prev,
                processed: prev.processed + batch.length,
                currentBatch: batchIndex + 1,
                status: `جاري الاستيراد... ${Math.round(((batchIndex + 1) / totalBatches) * 100)}% (${batchIndex + 1}/${totalBatches})`
              }));
              
            } catch (err) {
              console.error('Error saving batch:', err);
              realCounts.failed += batch.length;
              setImportProgress(prev => ({
                ...prev,
                failed: prev.failed + batch.length,
                status: `خطأ في الدفعة ${batchIndex + 1}`
              }));
            }
          })();
          pendingCommits.push(commitPromise);
          
        } else if (type === 'progress') {
          setImportProgress(prev => ({
            ...prev,
            processed,
            failed,
            status: `معالجة البيانات... ${processed}/${total}`
          }));
          
        } else if (type === 'complete') {
          // ⏳ لازم نستنى كل الدفعات المعلّقة تخلص فعليًا قبل ما نعرض رسالة
          // النهاية، عشان الرقم اللي هيتعرض يبقى حقيقي مش وهمي
          await Promise.allSettled(pendingCommits);

          await logUserActivity(appUser, 'استيراد أصناف', `استيراد ${realCounts.processed} صنف (فشل ${realCounts.failed})`);
          
          if (realCounts.failed === 0) {
            showSuccess(`✅ تم استيراد ${realCounts.processed} صنف بنجاح فعليًا في قاعدة البيانات`);
          } else {
            showWarning(`⚠️ اتحفظ فعليًا ${realCounts.processed} صنف، وفشل حفظ ${realCounts.failed} صنف (راجع Console لتفاصيل الخطأ)`);
          }
          
          setLastDoc(null);
          await loadItems(1);
          loadTotalCount();
          
          setGlobalLoading(false);
          worker.terminate();
          
        } else if (type === 'error') {
          showError(`❌ خطأ في الاستيراد: ${error}`);
          setGlobalLoading(false);
          worker.terminate();
        }
      };

      worker.onerror = (error) => {
        console.error("Worker error:", error);
        showError("حدث خطأ في عملية الاستيراد");
        setGlobalLoading(false);
        worker.terminate();
      };
      
    } catch (err) {
      console.error("Import error:", err);
      showError("حدث خطأ أثناء الاستيراد: " + err.message);
      setGlobalLoading(false);
    }

    setImportData([]);
  };

  // دالة معالجة الملف المحسنة
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      showWarning(`حجم الملف كبير (${(file.size / (1024*1024)).toFixed(2)} MB). قد يستغرق الاستيراد بعض الوقت.`);
    }

    setGlobalLoading(true);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        
        let data;
        if (text.length > 500000) {
          const csvWorker = new Worker('/workers/csvParser.js');
          csvWorker.postMessage(text);
          data = await new Promise((resolve) => {
            csvWorker.onmessage = (e) => {
              resolve(e.data);
              csvWorker.terminate();
            };
          });
        } else {
          data = parseCSV(text);
        }
        
        processParsedData(data);
        
      } catch (error) {
        console.error("File parse error:", error);
        showError("خطأ في قراءة الملف: " + error.message);
        setGlobalLoading(false);
      }
    };
    
    const processParsedData = (rawData) => {
      // 🧹 استبعاد الصفوف الفارغة تمامًا (زي الصفوف الفاضية اللي بتتصدّر
      // من Excel أحيانًا لحد آخر صف في الشيت) قبل أي فحص للعدد أو الصحة
      const data = rawData.filter(row =>
        Object.values(row || {}).some(v => String(v ?? '').trim() !== '')
      );

      if (data.length > 50000) {
        showError("عدد الأصناف كبير جداً. الحد الأقصى 50000 صنف");
        e.target.value = null;
        setGlobalLoading(false);
        return;
      }

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

        if (quantity < 0 || price < 0) {
          errors.push(`الصف ${index + 2}: قيم غير صالحة`);
          return;
        }

        validData.push({
          serialNumber: serial,
          name: row.name,
          quantity,
          price,
          minStock: parseInt(row.minStock) || 2,
          category: row.category || 'عام',
          location: row.location || '',
          tags: row.tags ? row.tags.split(',').map(t => t.trim()) : [],
          notes: row.notes || '',
          warehouseId: appUser.assignedWarehouseId || 'main'
        });
      });

      if (errors.length > 0) {
        setImportErrors(errors);
        setImportData([]);
        showWarning(`تم العثور على ${errors.length} خطأ في الملف`);
      } else {
        setImportData(validData);
        setImportErrors([]);
        setShowImportModal(true);
        showSuccess(`تم تحميل ${validData.length} صنف بنجاح`);
      }
      
      setGlobalLoading(false);
      e.target.value = null;
    };

    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = [
      {
        serialNumber: 'SN123456',
        name: 'اسم المنتج',
        quantity: '10',
        price: '1000',
        minStock: '2',
        category: 'عام',
        location: 'رف A1',
        tags: 'الكترونيات,استيراد',
        notes: 'ملاحظات',
        warehouseId: 'main'
      }
    ];
    exportToCSV(template, 'inventory_import_template');
    showSuccess("تم تحميل قالب الاستيراد");
  };

  // دالة الإضافة المحسنة
  const handleAdd = async (e) => {
    e.preventDefault();
    
    const errors = validators.inventory(newItem);
    if (errors.length > 0) {
      showError(errors.join('\n'));
      return;
    }

    setGlobalLoading(true);
    const serial = normalizeSerial(newItem.serialNumber);
    const priceNum = Number(newItem.price) || 0;
    const qtyNum = Number(newItem.quantity) || 1;

    try {
      const isAvailable = await checkSerialAvailability(serial);
      
      if (!isAvailable) {
        throw new Error("السيريال مستخدم بالفعل في صنف نشط!");
      }
      
      const warehouseToUse = appUser.permissions?.viewAllWarehouses ? newItem.warehouseId : (appUser.assignedWarehouseId || 'main');
      
      if (newItem.tags && newItem.tags.length > 0) {
        for (const tag of newItem.tags) {
          await tagManager.incrementUsage(tag);
        }
      }
      
      const serialNormalized = normalizeSerial(serial);

    const docData = { 
      serialNumber: serialNormalized,
      name: newItem.name,
      price: priceNum,
      quantity: qtyNum,
      minStock: Number(newItem.minStock) || 2,
      category: newItem.category || 'عام',
      location: newItem.location || '',
      tags: newItem.tags || [],
      notes: newItem.notes || '',
      warehouseId: warehouseToUse,
      searchKey: normalizeSearch(`${newItem.name} ${serialNormalized} ${newItem.category} ${(newItem.tags || []).join(' ')}`),
      searchTokens: buildInventorySearchTokens(newItem.name, serialNormalized, newItem.category, ...(newItem.tags || [])),
      createdAt: serverTimestamp(),
      isDeleted: false
    };

    await addDoc(collection(db, 'inventory'), docData);

    await logUserActivity(
      appUser,
      'إضافة صنف',
      `إضافة ${qtyNum} قطعة من ${newItem.name} (S/N: ${serialNormalized})`
    );

    showSuccess("تم إضافة الصنف بنجاح");

    setLastDoc(null);
    setPageCursors([null]);
    loadItems(1);
    loadTotalCount();

    setNewItem({ 
      serialNumber: '',
      name: '',
      quantity: 1,
      price: 0,
      minStock: 2,
      category: 'عام',
      location: '',
      tags: [],
      notes: '',
      warehouseId: appUser?.assignedWarehouseId || 'main'
    });
    } catch(err) { 
      showError(err.message || "فشل الإضافة"); 
    }
    setGlobalLoading(false);
  };

  const handleEdit = async () => {
    if (!editingItem) return;
    
    const errors = validators.inventory(editingItem);
    if (errors.length > 0) {
      showError(errors.join('\n'));
      return;
    }

    setGlobalLoading(true);
    const priceNum = Number(editingItem.price) || 0;
    const qtyNum = Number(editingItem.quantity) || 0;

    try {
      const { id, ...dataToUpdate } = editingItem;
      // ✨ ميزة جديدة: تتبع تغييرات السعر بشكل صريح (سجل تعديلات الأسعار)
      const originalItem = items.find(i => i.id === id);
      const priceChanged = originalItem && Number(originalItem.price) !== priceNum;

      await updateDoc(doc(db, 'inventory', id), { 
        name: dataToUpdate.name, 
        quantity: qtyNum, 
        price: priceNum,
        category: dataToUpdate.category,
        location: dataToUpdate.location,
        tags: dataToUpdate.tags,
        notes: dataToUpdate.notes,
        minStock: Number(dataToUpdate.minStock),
        searchKey: normalizeSearch(`${dataToUpdate.name} ${dataToUpdate.serialNumber} ${dataToUpdate.category} ${(dataToUpdate.tags || []).join(' ')}`),
        searchTokens: buildInventorySearchTokens(dataToUpdate.name, dataToUpdate.serialNumber, dataToUpdate.category, ...(dataToUpdate.tags || [])),
        updatedAt: serverTimestamp()
      });
      
      await logUserActivity(appUser, 'تعديل صنف', `تعديل بيانات ${dataToUpdate.name} (S/N: ${dataToUpdate.serialNumber})`);

      if (priceChanged) {
        await logUserActivity(
          appUser,
          'تعديل سعر',
          `تغيير سعر ${dataToUpdate.name} (S/N: ${dataToUpdate.serialNumber}) من ${originalItem.price} إلى ${priceNum}`
        );
      }

      setEditingItem(null);
      setItems(prev => prev.map(i => 
        i.id === id ? {
          ...i, 
          name: dataToUpdate.name, 
          quantity: qtyNum, 
          price: priceNum, 
          category: dataToUpdate.category,
          location: dataToUpdate.location,
          tags: dataToUpdate.tags,
          notes: dataToUpdate.notes,
          minStock: dataToUpdate.minStock
        } : i
      ));
      showSuccess("تم تعديل الصنف بنجاح");
    } catch (error) {
      if (error.code === 'permission-denied') {
        showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
      } else {
        showError("فشل تعديل الصنف: " + error.message);
      }
    }
    setGlobalLoading(false);
  };

  // دالة حذف الصنف المحسنة
  const handleDeleteItem = async (item) => {
    const confirmed = await showConfirm(
      'تأكيد حذف الصنف',
      `هل أنت متأكد من حذف "${item.name}"؟`,
      'warning',
      'نعم، احذف'
    );
    
    if (!confirmed) return;
    
    setGlobalLoading(true);
    try {
      await updateDoc(doc(db, 'inventory', item.id), { 
        isDeleted: true, 
        quantity: 0, 
        deletedAt: serverTimestamp(),
        deletedBy: appUser.name
      });
      
      await logUserActivity(appUser, 'حذف صنف', `تم حذف صنف: ${item.name} (S/N: ${item.serialNumber})`);
      setItems(prev => prev.filter(i => i.id !== item.id));
      showSuccess(`✅ تم حذف "${item.name}" بنجاح`);
      
    } catch (error) {
      console.error("Delete error:", error);
      if (error.code === 'permission-denied') {
        showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
      } else {
        showError("فشل حذف الصنف: " + error.message);
      }
    }
    setGlobalLoading(false);
  };

  const handleBulkUpdate = async () => {
    if (!bulkPercent || bulkPercent === 0) {
      showError("الرجاء إدخال نسبة مئوية صحيحة");
      return;
    }
    
    const confirmed = await showConfirm(
      'تحديث الأسعار الشامل',
      `هل أنت متأكد من تعديل جميع أسعار الأصناف بنسبة ${bulkPercent}%؟`
    );
    
    if (!confirmed) return;
    
    setGlobalLoading(true);
    setImportProgress({ total: 0, processed: 0, status: 'جاري تحديث الأسعار...' });
    
    try {
      const q = query(
        collection(db, 'inventory'), 
        where('isDeleted', '==', false)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        showError("لا توجد أصناف للتحديث");
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
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      await logUserActivity(appUser, 'تعديل أسعار مجمع', `تعديل جميع الأسعار بنسبة ${bulkPercent}%، تم تحديث ${updatedCount} صنف`);
      
      if (updatedCount === 0) {
        showInfo("لم يتم تحديث أي صنف - الأسعار لم تتغير");
      } else {
        showSuccess(`تم تحديث أسعار ${updatedCount} صنف بنجاح`);
      }
      
      setShowBulkUpdate(false);
      setBulkPercent(0);
      setLastDoc(null);
      loadItems(currentPage);
      
    } catch(e) {
      console.error("Bulk update error:", e);
      if (e.code === 'permission-denied') {
        showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
      } else {
        showError("حدث خطأ أثناء تحديث الأسعار: " + e.message);
      }
    } finally {
      setGlobalLoading(false);
      setImportProgress({ total: 0, processed: 0, status: '' });
    }
  };

  // تعريف أعمدة الجدول للـ Virtual Scrolling
  const tableColumns = [
    {
      field: 'select',
      width: '5%',
      render: (item) => (
        <input 
          type="checkbox" 
          className="w-4 h-4 accent-indigo-600"
          checked={selectedItems.has(item.id)}
          onChange={() => toggleSelectItem(item.id)}
        />
      )
    },
    {
      field: 'serialNumber',
      width: '10%',
      render: (item) => <span className="font-mono text-slate-500 dark:text-slate-400">{item.serialNumber}</span>
    },
    {
      field: 'name',
      width: '15%',
      render: (item) => <span className="font-bold text-slate-800 dark:text-white">{item.name}</span>
    },
    {
      field: 'category',
      width: '8%',
      render: (item) => <span className="text-slate-600 dark:text-slate-400">{item.category || 'عام'}</span>
    },
    {
      field: 'warehouse',
      width: '8%',
      render: (item) => <span className="font-bold text-indigo-500">{warehouseMap[item.warehouseId] || item.warehouseId}</span>
    },
    {
      field: 'location',
      width: '8%',
      render: (item) => <span className="text-slate-500 dark:text-slate-400">{item.location || '-'}</span>
    },
    {
      field: 'quantity',
      width: '6%',
      render: (item) => (
        <span className={`px-2 py-1 rounded-md font-bold ${
          item.quantity <= (item.minStock||2) 
            ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' 
            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
        }`}>
          {item.quantity}
        </span>
      )
    },
    {
      field: 'price',
      width: '8%',
      render: (item) => <span className="font-black text-emerald-600 dark:text-emerald-400">{item.price.toLocaleString()} ج</span>
    },
    {
      field: 'value',
      width: '8%',
      render: (item) => <span className="font-black text-indigo-600 dark:text-indigo-400">{(item.price * item.quantity).toLocaleString()} ج</span>
    },
    {
      field: 'tags',
      width: '10%',
      render: (item) => (
        <div className="flex flex-wrap gap-1">
          {item.tags?.slice(0, 2).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-[8px] font-bold">
              {tag}
            </span>
          ))}
          {(item.tags?.length || 0) > 2 && (
            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-[8px] font-bold">
              +{item.tags.length - 2}
            </span>
          )}
        </div>
      )
    },
    {
      field: 'actions',
      width: '8%',
      render: (item) => (
        <div className="flex justify-center gap-2">
          <button 
            onClick={()=>setEditingItem(item)} 
            className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
            title="تعديل"
          >
            <Edit size={14}/>
          </button>
          {appUser.permissions?.deleteInventoryItem && (
            <button 
              onClick={()=>handleDeleteItem(item)} 
              className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-500 dark:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all"
              title="حذف"
            >
              <Trash2 size={14}/>
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* مودال الحذف المجمع */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <TrashIcon size={20}/> حذف مجمع للمخزون
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              أنت على وشك حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> صنف بشكل نهائي.
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

      {/* مودال الاستيراد */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-4xl shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="font-black text-lg mb-2 text-slate-800 dark:text-white">معاينة بيانات الاستيراد</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">عدد العناصر: {importData.length}</p>
            
            <div className="overflow-x-auto mb-4 max-h-60">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <th className="p-2">السيريال</th>
                    <th className="p-2">الاسم</th>
                    <th className="p-2">التصنيف</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-center">السعر</th>
                    <th className="p-2">الموقع</th>
                    <th className="p-2">الوسوم</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {importData.slice(0, 10).map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-mono">{item.serialNumber}</td>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.category}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-center">{item.price}</td>
                      <td className="p-2">{item.location}</td>
                      <td className="p-2">{(item.tags || []).join(', ')}</td>
                    </tr>
                  ))}
                  {importData.length > 10 && (
                    <tr><td colSpan="7" className="p-2 text-center text-slate-400">... و {importData.length - 10} عناصر أخرى</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-lg mb-4">
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                سيتم استيراد {importData.length} صنف. قد تستغرق العملية بضع دقائق.
              </p>
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
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {importErrors.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <AlertTriangle size={20}/> أخطاء في ملف الاستيراد
            </h3>
            <div className="bg-rose-50 dark:bg-rose-900/30 p-4 rounded-xl mb-4 max-h-60 overflow-y-auto">
              {importErrors.map((err, idx) => (
                <p key={idx} className="text-xs text-rose-700 dark:text-rose-300 mb-1">• {err}</p>
              ))}
            </div>
            <button 
              onClick={() => setImportErrors([])} 
              className="w-full bg-slate-900 dark:bg-slate-700 text-white py-3 rounded-xl font-bold hover:bg-black dark:hover:bg-slate-600 transition-colors"
            >
              فهمت
            </button>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">تعديل بيانات الصنف</h3>
            <div className="space-y-4">
              <label className="block text-right">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">اسم المنتج</span>
                  <input className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" value={editingItem.name} onChange={e=>setEditingItem({...editingItem, name:e.target.value})} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">الكمية</span>
                   <input type="number" min="0" className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-center text-sm" value={editingItem.quantity} onChange={e=>setEditingItem({...editingItem, quantity: e.target.value})} />
                </label>
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">السعر</span>
                   <input type="number" min="0" className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-black outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-center text-indigo-700 dark:text-indigo-400 text-sm" value={editingItem.price} onChange={e=>setEditingItem({...editingItem, price: e.target.value})} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">حد الطلب</span>
                   <input type="number" min="0" className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-center text-sm" value={editingItem.minStock} onChange={e=>setEditingItem({...editingItem, minStock: e.target.value})} />
                </label>
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">التصنيف</span>
                   <input className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" value={editingItem.category} onChange={e=>setEditingItem({...editingItem, category: e.target.value})} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">الموقع</span>
                   <input className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" value={editingItem.location} onChange={e=>setEditingItem({...editingItem, location: e.target.value})} placeholder="رف A1" />
                </label>
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">الوسوم</span>
                   <input className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" value={editingItem.tags?.join(', ')} onChange={e=>setEditingItem({...editingItem, tags: e.target.value.split(',').map(t => t.trim())})} placeholder="وسم1, وسم2" />
                </label>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                <textarea
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm resize-none"
                  value={editingItem.notes}
                  onChange={e => setEditingItem({...editingItem, notes: e.target.value})}
                  rows="2"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button onClick={handleEdit} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-sm">حفظ التعديل</button>
                <button onClick={()=>setEditingItem(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkUpdate && appUser.role === 'admin' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-slate-800 dark:text-white flex items-center gap-2">
              <Percent className="text-indigo-600"/> تحديث الأسعار الشامل
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 font-bold">
              أدخل النسبة المئوية (استخدم علامة - للخصم)
            </p>
            
            {importProgress.status && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 w-full max-w-md shadow-2xl text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
                  <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">
                    استيراد البيانات
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    {importProgress.status}
                  </p>
                  
                  {importProgress.total > 0 && (
                    <>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 mb-2">
                        <div 
                          className="bg-indigo-600 h-4 rounded-full transition-all duration-300"
                          style={{ width: `${(importProgress.processed / importProgress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-500">
                        {importProgress.processed} من {importProgress.total} عنصر
                        {importProgress.failed > 0 && ` (فشل ${importProgress.failed})`}
                      </p>
                      {importProgress.totalBatches > 1 && (
                        <p className="text-xs text-indigo-500 mt-2">
                          الدفعة {importProgress.currentBatch} من {importProgress.totalBatches}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            
            <div className="space-y-4">
               <div className="relative">
                  <input 
                    type="number" 
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 pl-10 rounded-xl font-black outline-none focus:border-indigo-500 text-center text-lg bg-white dark:bg-slate-900" 
                    value={bulkPercent} 
                    onChange={e => {
                      const val = e.target.value;
                      setBulkPercent(val === '' ? 0 : Number(val));
                    }} 
                    placeholder="مثال: 10 أو -5" 
                    dir="ltr" 
                    disabled={importProgress.status !== ''}
                  />
                  <span className="absolute left-4 top-3.5 text-slate-400 dark:text-slate-500 font-black">%</span>
               </div>
               
               <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg border border-amber-100 dark:border-amber-800">
                 <p className="text-[10px] text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1">
                   <AlertTriangle size={12}/>
                   تنبيه: هذا التعديل سيؤثر على جميع الأصناف في جميع المخازن
                 </p>
               </div>
               
               <div className="flex gap-2 pt-2">
                 <button 
                   onClick={handleBulkUpdate} 
                   disabled={importProgress.status !== '' || !bulkPercent}
                   className="flex-1 bg-slate-900 dark:bg-slate-700 text-white py-3 rounded-xl font-bold text-sm hover:bg-black dark:hover:bg-slate-600 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                   className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                 >
                   إلغاء
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* رأس الصفحة */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-50 dark:border-slate-700 pb-4">
             <div className="flex items-center gap-2">
               <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2">
                 <Package size={22} className="text-indigo-600"/> إدارة المخزون
               </h3>
               <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg text-xs font-bold">
                 {totalCount.toLocaleString('ar-EG')} صنف
               </span>
             </div>
             
             <div className="flex flex-wrap gap-2 w-full md:w-auto">
                {appUser.role === 'admin' && (
                  <button
                    onClick={fixSearchKeys}
                    title="يشغّل مرة واحدة لتحديث فهارس البحث لكل الأصناف والعملاء والتذاكر القديمة"
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-purple-700"
                  >
                    <RefreshCw size={14} /> تحديث فهارس البحث (شامل)
                  </button>
                )}
                {selectedItems.size > 0 && appUser.permissions?.bulkDeleteInventory && (
                  <button 
                    onClick={() => setShowBulkDeleteModal(true)} 
                    className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center justify-center gap-2"
                  >
                    <TrashIcon size={14}/> حذف {selectedItems.size} صنف
                  </button>
                )}
                
                {appUser.role === 'admin' && (
                   <button 
                     onClick={()=>setShowBulkUpdate(true)} 
                     className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/50 flex items-center justify-center gap-2"
                   >
                     <Percent size={14}/> تعديل الأسعار
                   </button>
                )}
                
                <button 
                  onClick={downloadTemplate}
                  className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center justify-center gap-2"
                >
                  <DownloadIcon size={14}/> قالب
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
                  className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center justify-center gap-2"
                >
                  <UploadCloud size={14}/> استيراد
                </button>
                
                <button 
                  onClick={()=>exportToCSV(items, 'Inventory_Data')} 
                  className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center justify-center gap-2"
                >
                  <Download size={14}/> تصدير CSV
                </button>

                <button 
                  onClick={()=>exportToExcel(items, 'Inventory_Data', 'المخزون')} 
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center justify-center gap-2"
                >
                  <Download size={14}/> تصدير Excel
                </button>
             </div>
          </div>

          {/* نموذج الإضافة */}
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-8 gap-3 items-end bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">الباركود</label>
                <input 
                  required 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none font-mono focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" 
                  value={newItem.serialNumber} 
                  onChange={e=>setNewItem({...newItem, serialNumber:e.target.value})} 
                  placeholder="S/N"
                />
             </div>
             <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">اسم المنتج</label>
                <input 
                  required 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none font-bold focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" 
                  value={newItem.name} 
                  onChange={e=>setNewItem({...newItem, name:e.target.value})} 
                  placeholder="وصف المنتج"
                />
             </div>
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">التصنيف</label>
                <input 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none font-bold focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" 
                  value={newItem.category} 
                  onChange={e=>setNewItem({...newItem, category:e.target.value})} 
                  placeholder="عام"
                />
             </div>
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">الوسوم</label>
                <input 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none font-bold focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" 
                  value={newItem.tags?.join(', ')} 
                  onChange={e=>setNewItem({...newItem, tags: e.target.value.split(',').map(t => t.trim())})} 
                  placeholder="وسم1, وسم2"
                />
             </div>
             {appUser.permissions?.viewAllWarehouses && (
               <div className="md:col-span-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">الفرع</label>
                  <select 
                    className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold bg-white dark:bg-slate-900 focus:border-indigo-500 outline-none text-sm" 
                    value={newItem.warehouseId} 
                    onChange={e=>setNewItem({...newItem, warehouseId: e.target.value})}
                  >
                     {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
               </div>
             )}
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">الكمية</label>
                <input 
                  type="number" 
                  min="0" 
                  required 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none text-center font-bold bg-white dark:bg-slate-900 focus:border-indigo-500 text-sm" 
                  value={newItem.quantity} 
                  onChange={e=>setNewItem({...newItem, quantity: e.target.value})} 
                />
             </div>
             <div className="md:col-span-1 flex gap-2">
                <div className="flex-1">
                   <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">السعر</label>
                   <input 
                     type="number" 
                     min="0" 
                     required 
                     className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none text-center font-black text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 focus:border-indigo-500 text-sm" 
                     value={newItem.price} 
                     onChange={e=>setNewItem({...newItem, price: e.target.value})} 
                   />
                </div>
                <button type="submit" id="add-item-button" className="bg-slate-900 dark:bg-indigo-600 text-white px-4 rounded-lg font-bold h-[42px] mt-auto hover:bg-black dark:hover:bg-indigo-700 transition-colors shadow-sm">
                  <Plus size={18}/>
                </button>
             </div>
          </form>
       </div>

       {/* قسم البحث والفلترة */}
       <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b bg-slate-50 dark:bg-slate-900/50">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute right-3 top-3 text-slate-400" />
                <input 
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 pr-9 p-2.5 rounded-lg outline-none font-bold text-sm focus:border-indigo-500 transition-colors" 
                  placeholder="بحث بالسيريال أو الاسم أو التصنيف..." 
                  value={search} 
                  onChange={e=>setSearch(e.target.value)} 
                  id="inventory-search"
                />
              </div>
              
              <select 
                className="border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
                value={searchFilters.warehouse || ''}
                onChange={e => setSearchFilters({...searchFilters, warehouse: e.target.value})}
              >
                <option value="">كل المخازن</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              
              <select 
                className="border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
                value={searchFilters.category || ''}
                onChange={e => setSearchFilters({...searchFilters, category: e.target.value})}
              >
                <option value="">كل التصنيفات</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              
              <select 
                className="border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
                value={selectedTags.join(',')}
                onChange={e => setSelectedTags(e.target.value ? e.target.value.split(',') : [])}
              >
                <option value="">كل الوسوم</option>
                {availableTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              
              <button
                onClick={() => {
                  setSearchFilters({});
                  setSelectedTags([]);
                  setSearch('');
                }}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                <RefreshCcw size={16} />
              </button>
              
              {loadingData && <Loader2 className="animate-spin text-indigo-500 mt-2" size={16}/>}
            </div>
          </div>

          {/* الجدول مع Virtual Scrolling */}
          <div className="overflow-hidden" style={{ height: '600px' }}>
            {items.length === 0 && !loadingData ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Package size={48} className="mb-3 opacity-20"/>
                <p className="font-bold">لا توجد نتائج</p>
              </div>
            ) : (
              <>
                <div className="flex bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 font-bold text-xs sticky top-0 z-10">
                  {tableColumns.map((col, idx) => (
                    <div key={idx} className="p-3" style={{ width: col.width }}>
                      {idx === 0 && (
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 accent-indigo-600"
                          checked={selectedItems.size === items.length && items.length > 0}
                          onChange={toggleSelectAll}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <VirtualTable 
                  data={items}
                  columns={tableColumns}
                  height={550}
                  rowHeight={50}
                />
              </>
            )}
          </div>

          {/* 📄 FIX: صفحات حقيقية بدل "تحميل المزيد" التراكمي */}
          {items.length > 0 && (
            <div className="p-3 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex-wrap gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
                عرض {((currentPage - 1) * PAGE_SIZE) + 1} - {((currentPage - 1) * PAGE_SIZE) + items.length} من {totalCount.toLocaleString('ar-EG')} صنف
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => loadItems(currentPage - 1)}
                  disabled={currentPage <= 1 || loadingData}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="الصفحة السابقة"
                >
                  <ChevronRight size={16} />
                </button>
                <span className="px-3 py-1.5 text-xs font-black text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg min-w-[90px] text-center">
                  {loadingData ? <Loader2 size={12} className="animate-spin inline"/> : `صفحة ${currentPage} من ${Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}`}
                </span>
                <button
                  onClick={() => loadItems(currentPage + 1)}
                  disabled={!hasMore || loadingData}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="الصفحة التالية"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}
       </div>
    </div>
  );
}
// ==========================================================================
// 📦 عرض النواقص المحسن
// ==========================================================================
