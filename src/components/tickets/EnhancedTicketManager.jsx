import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, addDoc, getDocs, getDoc, doc, updateDoc, query, where, serverTimestamp, orderBy, onSnapshot, increment, limit, writeBatch, startAfter
} from 'firebase/firestore';
import {
  Package,
  Users,
  Receipt,
  Download,
  Plus,
  Edit,
  Trash2,
  User,
  Save,
  Printer,
  History,
  Bell,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Edit2,
  CalendarDays,
  Tag,
  Link2 as LinkIcon,
  Headphones,
  MessageSquare,
  Webhook,
  RotateCcw,
  Wrench as WrenchIcon,
  FileText as FileTextIcon,
  Search
} from 'lucide-react';
import { StatusSelectComp } from './StatusSelectComp';
import { EGYPT_GOVERNORATES } from '../../constants/misc';
import { TICKET_STATUSES } from '../../constants/tickets';
import { db } from '../../firebase/config';
import { useDebounce } from '../../hooks/useDebounce';
import { showConfirm, showError, showInfo, showSuccess } from '../../utils/alerts';
import { sendWebhookNotification } from '../../utils/communications';
import { exportToExcel } from '../../utils/exportUtils';
import { formatDate, formatDateOnly, getCurrentTimeHHMM } from '../../utils/format';
import { buildQueryTokens, buildSearchTokens, normalizePhone, normalizeSearch } from '../../utils/search';
import { getNextTicketNumber, getTicketSLAInfo } from '../../utils/ticketHelpers';

export function EnhancedTicketManager({ systemSettings, setGlobalLoading, appUser, warehouseMap, onGenerateInvoice }) {
  const [tickets, setTickets] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 700);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showSparePartsModal, setShowSparePartsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [ticketHistory, setTicketHistory] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignData, setAssignData] = useState({ technician: '', center: '', callCenter: '' });
  const [showFullTicketModal, setShowFullTicketModal] = useState(false);
  const [fullTicketView, setFullTicketView] = useState(null);
  const [ticketComments, setTicketComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // STATE لإدارة التعديل
  const [editingTicket, setEditingTicket] = useState(null);
  const [editFormData, setEditFormData] = useState({
    id: '', ticketNumber: '', customerName: '', customerPhone: '', secondPhone: '', landline: '',
    customerEmail: '', customerAddress: '', governorate: '', city: '', device: '', deviceType: '',
    deviceModel: '', deviceSerial: '', issue: '', status: '', priority: '', warrantyStatus: '',
    warrantyPeriod: '', ticketType: '', source: '', nearestBranch: '', assignedTechnician: '',
    assignedMaintenanceCenter: '', assignedCallCenter: '', estimatedCost: 0, estimatedDuration: '',
    notes: '', tags: [], sparePartsWithCost: '', sparePartsWithoutCost: '', invoiceDate: '',
    deliveryDate: '', maintenanceEndDate: '', maintenanceEndTime: '',
    deliveryTime: '',
    followUpAccessibility: 0,
  followUpMaintenanceTime: 0,
  followUpCenterDealing: 0,
  followUpDeliveryProcedures: 0,
  followUpRepurchase: '',
  followUpNotes: '',
  followUpDate: '',
  followUpBy: ''
});
  

  // النظام الجديد (5 مستويات)
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedMainFaultId, setSelectedMainFaultId] = useState('');
  const [selectedSubFaultId, setSelectedSubFaultId] = useState('');
  // 🆕 نص البحث في خانة "المنتج" - بقت قابلة للكتابة بدل السكرول في ليستة طويلة
  const [productSearchInput, setProductSearchInput] = useState('');
  
  const [products, setProducts] = useState([]);
  const [models, setModels] = useState([]);
  const [mainFaults, setMainFaults] = useState([]);
  const [subFaults, setSubFaults] = useState([]);

  // 🆕 نفس نظام الأكواد المرتبطة (منتج → موديل → كود رئيسي → كود فرعي)
  // بس لسياق التعديل، منفصل عن سياق إنشاء تذكرة جديدة عشان متتعارضش
  // القوائم مع بعض لو الاتنين اتفتحوا في لحظات مختلفة.
  const [editProductSearchInput, setEditProductSearchInput] = useState('');
  const [editSelectedProductId, setEditSelectedProductId] = useState('');
  const [editSelectedModelId, setEditSelectedModelId] = useState('');
  const [editSelectedMainFaultId, setEditSelectedMainFaultId] = useState('');
  const [editSelectedSubFaultId, setEditSelectedSubFaultId] = useState('');
  const [editModels, setEditModels] = useState([]);
  const [editMainFaults, setEditMainFaults] = useState([]);
  const [editSubFaults, setEditSubFaults] = useState([]);

  // 🆕 البحث عن قطع غيار حقيقية من المخزون لإضافتها للتذكرة (بدل خانة
  // نص حرة)، عشان تتربط فعليًا بالفاتورة لاحقًا وتتخصم من المخزون صح.
  const [sparePartSearch, setSparePartSearch] = useState('');
  const [sparePartResults, setSparePartResults] = useState([]);
  const [searchingSpareParts, setSearchingSpareParts] = useState(false);

  // باقي الـ State
  const [technicians, setTechnicians] = useState([]);
  const [maintenanceCenters, setMaintenanceCenters] = useState([]);
  const [callCenters, setCallCenters] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  const [filterWarranty, setFilterWarranty] = useState('all');
  const [filterTicketType, setFilterTicketType] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  
  // ✅ إضافة فلتر جديد لمركز الصيانة
  const [filterMaintenanceCenter, setFilterMaintenanceCenter] = useState('all');
  
  // بيانات التذكرة الجديدة
  // 🆕 قطع غيار بيتم اختيارها وقت إنشاء التذكرة نفسها (قبل ما التذكرة
  // تتحفظ أصلًا) - بتتضاف فعليًا لما التذكرة تتحفظ، بدل ما تنتظر لحد ما
  // تفتح التذكرة تاني بعد الحفظ.
  const [newTicketSpareParts, setNewTicketSpareParts] = useState([]);

  const [newTicket, setNewTicket] = useState({
    customerId: '', customerName: '', customerPhone: '', secondPhone: '', landline: '',
    customerEmail: '', customerAddress: '', governorate: '', city: '',
    device: '', deviceType: '', deviceModel: '', deviceSerial: '',
    mainFaultCode: '', mainFaultDescription: '',
    subFaultCode: '', subFaultDescription: '',
    // 🆕 إمكانية إضافة أكتر من كود عطل رئيسي/فرعي لنفس التذكرة - الأول
    // بيتسجل في mainFaultCode/subFaultCode (زي القديم)، والباقي هنا
    additionalFaults: [],
    productCode: '',
    issue: '', status: 'created', priority: 'medium',
    warrantyStatus: '', warrantyPeriod: '', ticketType: '', source: '', nearestBranch: '',
    assignedTechnician: '', assignedMaintenanceCenter: '', assignedCallCenter: '',
    estimatedCost: 0, estimatedDuration: '', notes: '', spareParts: [], tags: [],
    sparePartsWithCost: '', sparePartsWithoutCost: '',
    invoiceDate: '', deliveryDate: '', maintenanceEndDate: '', maintenanceEndTime: '',
    deliveryTime: '',
    followUp: {
    accessibility: 0,        // سهولة الوصول الى الشركة (1-10)
    maintenanceTime: 0,      // تقييم وقت الصيانة (1-10)
    centerDealing: 0,        // التعامل داخل مركز الصيانة (1-10)
    deliveryProcedures: 0,   // سهولة اجراءات التسليم والاستلام (1-10)
    repurchase: ''          // شراء منتجات نوفال مرة أخرى (yes/no)
  },
  
  followUpNotes: '',        // ملاحظات إضافية عن التقييم
  followUpDate: '',         // تاريخ التقييم
  followUpBy: ''            // من قام بالتقييم
});
  

  const TICKETS_PAGE_SIZE = 30;
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  // 🆕 ترقيم صفحات حقيقي بدل "تحميل المزيد" - بنخزن مؤشر (cursor) لكل صفحة
  // زرناها عشان نقدر نرجع لأي صفحة سابقة بسرعة من غير ما نعيد تحميلها من الأول
  const [currentTicketsPage, setCurrentTicketsPage] = useState(1);
  const ticketsPageCursorsRef = useRef({ 1: null });
  const [totalTicketsCount, setTotalTicketsCount] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [exportingTickets, setExportingTickets] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  // ✨ ميزة جديدة: فلترة التذاكر المتأخرة عن SLA فقط
  const displayedTickets = useMemo(() => {
    if (!showOverdueOnly) return tickets;
    return tickets.filter(t => getTicketSLAInfo(t, systemSettings?.ticketSLA)?.level === 'overdue');
  }, [tickets, showOverdueOnly, systemSettings?.ticketSLA]);
  // قائمة دايمًا بالتذاكر المتأخرة (مش متأثرة بفلتر العرض) - لاستخدامها في زرار إرسال التنبيه
  const overdueTickets = useMemo(() => {
    return tickets.filter(t => getTicketSLAInfo(t, systemSettings?.ticketSLA)?.level === 'overdue');
  }, [tickets, systemSettings?.ticketSLA]);
  const [filterTechnician, setFilterTechnician] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // ========== الثوابت ==========
  const WARRANTY_PERIODS = [
    { value: '6_months', label: '6 شهور' }, { value: '1_year', label: 'سنة' },
    { value: '2_years', label: 'سنتين' }, { value: '3_years', label: '3 سنوات' },
    { value: '5_years', label: '5 سنوات' }
  ];

  const TICKET_TYPES = [
    { value: 'complaint', label: 'شكوى' }, { value: 'inquiry', label: 'استفسار' },
    { value: 'spare_parts', label: 'قطع غيار' }, { value: 'replacement', label: 'طلب استبدال' },
    { value: 'purchase', label: 'طلب شراء' }, { value: 'after_sales', label: 'ما بعد البيع' },
    { value: 'maintenance', label: 'صيانة' }
  ];

  const TICKET_SOURCES = [
    { value: 'hotline', label: 'HOTLINE' }, { value: 'facebook', label: 'Facebook' },
    { value: 'whatsapp', label: 'WhatsApp' }, { value: 'friend_referral', label: 'اقتراح صديق' },
    { value: 'store_visit', label: 'زيارة المتجر' }, { value: 'phone_call', label: 'مكالمة هاتفية' }
  ];

  const WARRANTY_OPTIONS = [
    { value: 'in_warranty', label: 'داخل الضمان' }, { value: 'out_of_warranty', label: 'خارج الضمان' },
    { value: 'unidentified', label: 'غير معرف' }, { value: 'repair_invoice', label: 'فاتورة اصلاح' }
  ];

  const BRANCH_OPTIONS = systemSettings?.branches || [{ value: 'main', label: 'الفرع الرئيسي' }];

  // ========== تحميل المنتجات والموديلات وأكواد الأعطال ==========
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error loading products:", error);
      }
    };
    loadProducts();
  }, []);

  useEffect(() => {
    if (!selectedProductId) {
      setModels([]);
      setSelectedModelId('');
      return;
    }
    const q = query(collection(db, 'models'), where('productId', '==', selectedProductId));
    const unsub = onSnapshot(q, (snap) => {
      setModels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedProductId]);

  useEffect(() => {
    if (!selectedModelId) {
      setMainFaults([]);
      setSelectedMainFaultId('');
      return;
    }
    const q = query(collection(db, 'mainFaultCodes'), where('modelId', '==', selectedModelId));
    const unsub = onSnapshot(q, (snap) => {
      setMainFaults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedModelId]);

  useEffect(() => {
    if (!selectedMainFaultId) {
      setSubFaults([]);
      setSelectedSubFaultId('');
      return;
    }
    const q = query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', selectedMainFaultId));
    const unsub = onSnapshot(q, (snap) => {
      setSubFaults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedMainFaultId]);

  // 🆕 نفس سلسلة تحميل موديل/كود رئيسي/كود فرعي، بس لسياق التعديل
  useEffect(() => {
    if (!editSelectedProductId) {
      setEditModels([]);
      setEditSelectedModelId('');
      return;
    }
    const q = query(collection(db, 'models'), where('productId', '==', editSelectedProductId));
    const unsub = onSnapshot(q, (snap) => {
      setEditModels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [editSelectedProductId]);

  useEffect(() => {
    if (!editSelectedModelId) {
      setEditMainFaults([]);
      setEditSelectedMainFaultId('');
      return;
    }
    const q = query(collection(db, 'mainFaultCodes'), where('modelId', '==', editSelectedModelId));
    const unsub = onSnapshot(q, (snap) => {
      setEditMainFaults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [editSelectedModelId]);

  useEffect(() => {
    if (!editSelectedMainFaultId) {
      setEditSubFaults([]);
      setEditSelectedSubFaultId('');
      return;
    }
    const q = query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', editSelectedMainFaultId));
    const unsub = onSnapshot(q, (snap) => {
      setEditSubFaults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [editSelectedMainFaultId]);

  const handleEditSelectSubFault = (subFaultId) => {
    const selected = editSubFaults.find(f => f.id === subFaultId);
    if (selected) {
      setEditSelectedSubFaultId(subFaultId);
      const mainFault = editMainFaults.find(m => m.id === editSelectedMainFaultId);
      setEditFormData(prev => ({
        ...prev,
        mainFaultCode: mainFault?.code || '',
        mainFaultDescription: mainFault?.description || '',
        subFaultCode: selected.code,
        subFaultDescription: selected.description,
        productCode: selected.productCode || prev.productCode,
        issue: `${selected.code} - ${selected.description}`
      }));
    }
  };

  // 🆕 بحث عن قطعة غيار حقيقية في المخزون لإضافتها للتذكرة
  const handleSearchSparePart = async (e) => {
    if (e) e.preventDefault();
    const term = normalizeSearch(sparePartSearch);
    if (!term) return;
    setSearchingSpareParts(true);
    try {
      const tokens = buildQueryTokens(term);
      const snap = await getDocs(query(
        collection(db, 'inventory'),
        where('isDeleted', '==', false),
        where('searchTokens', 'array-contains-any', tokens.length ? tokens : [term]),
        limit(10)
      ));
      setSparePartResults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      showError('فشل البحث عن قطع الغيار');
    }
    setSearchingSpareParts(false);
  };

  // 🆕 محاولة استرجاع اختيار المنتج/الموديل/الكود اللي اتسجل وقت إنشاء
  // التذكرة، عشان القوائم المرتبطة تفتح جاهزة بدل ما تبدأ فاضية كل مرة.
  const initEditFaultSelection = async (ticket) => {
    setEditSelectedProductId('');
    setEditSelectedModelId('');
    setEditSelectedMainFaultId('');
    setEditSelectedSubFaultId('');
    setEditProductSearchInput(ticket.device || '');
    if (!ticket.mainFaultCode) return;

    try {
      const mainSnap = await getDocs(query(collection(db, 'mainFaultCodes'), where('code', '==', ticket.mainFaultCode)));
      if (mainSnap.empty) return;
      const mainDoc = mainSnap.docs[0];
      const modelId = mainDoc.data().modelId;
      if (!modelId) return;

      const modelSnap = await getDocs(query(collection(db, 'models'), where('__name__', '==', modelId)));
      const productId = modelSnap.empty ? '' : modelSnap.docs[0].data().productId;

      if (productId) setEditSelectedProductId(productId);
      setEditSelectedModelId(modelId);
      setEditSelectedMainFaultId(mainDoc.id);

      if (ticket.subFaultCode) {
        const subSnap = await getDocs(query(
          collection(db, 'subFaultCodes'),
          where('mainFaultId', '==', mainDoc.id),
          where('code', '==', ticket.subFaultCode)
        ));
        if (!subSnap.empty) setEditSelectedSubFaultId(subSnap.docs[0].id);
      }
    } catch (error) {
      // مش مشكلة كبيرة لو فشلت الاسترجاع التلقائي - المستخدم يقدر يختار يدوي
      console.error('Failed to restore fault code selection:', error);
    }
  };

  const handleSelectSubFault = (subFaultId) => {
    const selected = subFaults.find(f => f.id === subFaultId);
    if (selected) {
      setSelectedSubFaultId(subFaultId);
      const mainFault = mainFaults.find(m => m.id === selectedMainFaultId);
      setNewTicket(prev => ({
        ...prev,
        mainFaultCode: mainFault?.code || '',
        mainFaultDescription: mainFault?.description || '',
        subFaultCode: selected.code,
        subFaultDescription: selected.description,
        productCode: selected.productCode || '',
        issue: `${selected.code} - ${selected.description}`
      }));
    }
  };

  // 🆕 إدارة قطع الغيار المختارة وقت إنشاء التذكرة (لسه محلية، هتتحفظ
  // فعليًا مع التذكرة نفسها لما تتحفظ)
  const handleAddNewTicketSparePart = (item) => {
    if (newTicketSpareParts.some(p => p.id === item.id)) {
      showError('القطعة دي مضافة بالفعل');
      return;
    }
    setNewTicketSpareParts(prev => [...prev, {
      id: item.id,
      serialNumber: item.serialNumber,
      name: item.name,
      quantity: 1,
      price: Number(item.price) || 0,
    }]);
    setSparePartResults([]);
    setSparePartSearch('');
  };

  const handleRemoveNewTicketSparePart = (itemId) => {
    setNewTicketSpareParts(prev => prev.filter(p => p.id !== itemId));
  };

  const handleNewTicketSparePartQtyChange = (itemId, qty) => {
    setNewTicketSpareParts(prev => prev.map(p => p.id === itemId ? { ...p, quantity: Math.max(1, Number(qty) || 1) } : p));
  };

  // 🆕 إضافة كود عطل رئيسي/فرعي إضافي لنفس التذكرة (ممكن يكون فيها أكتر
  // من عطل واحد)، بدون ما نفقد اختيار العطل الأول اللي اتسجل في الحقول
  // الأساسية mainFaultCode/subFaultCode
  const handleAddAnotherFault = () => {
    if (!selectedSubFaultId) {
      showError('اختار كود عطل فرعي الأول');
      return;
    }
    const selected = subFaults.find(f => f.id === selectedSubFaultId);
    const mainFault = mainFaults.find(m => m.id === selectedMainFaultId);
    if (!selected || !mainFault) return;

    const newFault = {
      mainFaultCode: mainFault.code,
      mainFaultDescription: mainFault.description,
      subFaultCode: selected.code,
      subFaultDescription: selected.description
    };

    setNewTicket(prev => {
      // لو الحقول الأساسية فاضية، سجّل العطل ده فيها بدل ما يتحط في القائمة
      if (!prev.mainFaultCode) {
        return { ...prev, ...newFault, productCode: selected.productCode || prev.productCode };
      }
      // لو مكرر (نفس الكود الفرعي) متضيفوش تاني
      if (prev.additionalFaults.some(f => f.subFaultCode === newFault.subFaultCode)) {
        showError('كود العطل ده مضاف بالفعل');
        return prev;
      }
      return { ...prev, additionalFaults: [...prev.additionalFaults, newFault] };
    });

    // نصفّي اختيار الكود الفرعي بس (نسيب المنتج/الموديل عشان يقدر يختار عطل تاني بسهولة)
    setSelectedMainFaultId('');
    setSelectedSubFaultId('');
  };

  const handleRemoveAdditionalFault = (subFaultCode) => {
    setNewTicket(prev => ({
      ...prev,
      additionalFaults: prev.additionalFaults.filter(f => f.subFaultCode !== subFaultCode)
    }));
  };

  const resetSelections = () => {
    setSelectedProductId('');
    setSelectedModelId('');
    setSelectedMainFaultId('');
    setSelectedSubFaultId('');
    setProductSearchInput('');
  };

  // ========== جلب العملاء ==========
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const snap = await getDocs(collection(db, "customers"));
        setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error loading customers:", error);
      }
    };
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const term = normalizeSearch(customerSearch);
    return customers.filter(c => 
      normalizeSearch(c.name || '').includes(term) || 
      normalizeSearch(c.phone || '').includes(term)
    ).slice(0, 8);
  }, [customerSearch, customers]);

  const selectCustomer = (customer) => {
    setNewTicket({
      ...newTicket,
      customerId: customer.id,
      customerName: customer.name || '',
      customerPhone: customer.phone || '',
      secondPhone: customer.secondPhone || '',
      customerEmail: customer.email || '',
      customerAddress: customer.address || '',
      landline: customer.landline || '',
      governorate: customer.governorate || '',
      city: customer.city || ''
    });
    setCustomerSearch('');
    setShowCustomerDropdown(false);
    showSuccess(`تم تحميل بيانات العميل: ${customer.name}`);
  };

  // ========== جلب الفنيين ومراكز الصيانة من systemSettings ==========
  useEffect(() => {
    setTechnicians(systemSettings?.technicians || []);
    
    const centers = (systemSettings?.maintenanceCenters || []).map(center => 
      typeof center === 'string' ? { id: center, name: center, value: center } : center
    );
    setMaintenanceCenters(centers);
    
    const fetchCallCenters = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'employees'), 
          where('role', '==', 'call_center'), 
          where('isDisabled', '==', false)
        ));
        setCallCenters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching call centers:", error);
        setCallCenters([]);
      }
    };
    fetchCallCenters();
  }, [systemSettings]);

  // ========== تحميل التذاكر ==========
  // ==========================================================================
// 📦 تحميل التذاكر مع صلاحيات متقدمة وفلتر مركز الصيانة
// 🆕 FIX: بدل "تحميل المزيد" اللي بتراكم كل التذاكر في الذاكرة، دلوقتي
// بنحمّل صفحة واحدة بس (30 تذكرة) في كل مرة، ونحتفظ بمؤشر (cursor) لكل
// صفحة اتزارت عشان المستخدم يقدر يتنقل بين الصفحات (التالي/السابق) بسرعة
// ==========================================================================
const loadTickets = useCallback(async (targetPage = 1) => {
  setLoadingData(true);
  try {
    let constraints = [orderBy('updatedAt', 'desc')];

    // ✅ التحكم في البيانات حسب صلاحيات المستخدم
    // إذا كان المستخدم لديه صلاحية viewAllTickets أو هو أدمن، يرى كل التذاكر
    // وإلا يرى فقط تذاكر مركزه المخصص
    const canViewAllTickets = appUser.role === 'admin' || appUser.permissions?.viewAllTickets === true;
    
    if (!canViewAllTickets) {
      constraints.push(where('assignedCenter', '==', appUser.assignedWarehouseId || 'main'));
    }

    // الفلاتر المحددة من قبل المستخدم
    if (filterStatus !== 'all') constraints.push(where('status', '==', filterStatus));
    if (filterPriority !== 'all') constraints.push(where('priority', '==', filterPriority));

    // 🛠️ FIX: البحث كان بيتفلتر محليًا بعد تحميل 30 تذكرة بس (آخر صفحة)،
    // فأي تذكرة أقدم مش موجودة في الـ 30 دول كانت تختفي من نتائج البحث
    // حتى لو مطابقة تمامًا. دلوقتي البحث بيستخدم searchTokens على مستوى
    // Firestore نفسه، فبيشمل كل التذاكر مش بس الصفحة المحمّلة حاليًا.
    const ticketQueryTokens = buildQueryTokens(debouncedSearch);
    if (ticketQueryTokens.length > 0) {
      constraints.push(where('searchTokens', 'array-contains-any', ticketQueryTokens));
    }

    const cursorForPage = ticketsPageCursorsRef.current[targetPage];
    if (targetPage > 1 && cursorForPage) constraints.push(startAfter(cursorForPage));
    constraints.push(limit(TICKETS_PAGE_SIZE));

    let q = query(collection(db, 'tickets'), ...constraints);
    const snap = await getDocs(q);
    let fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // تدقيق AND محلي (array-contains-any بيرجّع تطابق أي كلمة OR)، ودعم
    // التذاكر القديمة اللي معندهاش searchTokens لسه (fallback للحقول الأصلية)
    if (ticketQueryTokens.length > 0) {
      fetched = fetched.filter(t => {
        const haystack = (t.searchTokens && t.searchTokens.length > 0)
          ? t.searchTokens.join(' ')
          : normalizeSearch(`${t.customerName || ''} ${t.customerPhone || ''} ${t.ticketNumber || ''} ${t.assignedTechnician || ''} ${t.assignedMaintenanceCenter || ''} ${t.device || ''} ${t.deviceSerial || ''} ${t.deviceModel || ''} ${t.productCode || ''} ${t.issue || ''} ${t.notes || ''}`);
        return ticketQueryTokens.every(tok => haystack.includes(tok));
      });
    }

    // الفلاتر المحلية
    if (filterWarranty !== 'all') {
      fetched = fetched.filter(t => t.warrantyStatus === filterWarranty);
    }
    if (filterTicketType !== 'all') {
      fetched = fetched.filter(t => t.ticketType === filterTicketType);
    }
    if (filterSource !== 'all') {
      fetched = fetched.filter(t => t.source === filterSource);
    }
    if (filterBranch !== 'all') {
      fetched = fetched.filter(t => t.nearestBranch === filterBranch);
    }
    if (filterTechnician !== 'all') {
      fetched = fetched.filter(t => t.assignedTechnician === filterTechnician);
    }
    
    // ✅ فلتر جديد: مركز الصيانة
    if (filterMaintenanceCenter !== 'all') {
      fetched = fetched.filter(t => t.assignedMaintenanceCenter === filterMaintenanceCenter);
    }
    
    // فلترة التاريخ
    if (dateRange.from) {
      const fromDate = new Date(dateRange.from);
      fromDate.setHours(0, 0, 0, 0);
      fetched = fetched.filter(t => {
        const d = t.createdAt?.toDate?.() || new Date(t.createdAt);
        return d >= fromDate;
      });
    }
    if (dateRange.to) {
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      fetched = fetched.filter(t => {
        const d = t.createdAt?.toDate?.() || new Date(t.createdAt);
        return d <= toDate;
      });
    }

    // ✅ كل صفحة بتستبدل التذاكر المعروضة بدل ما تتراكم فوق بعض
    setTickets(fetched);
    setCurrentTicketsPage(targetPage);

    const lastVisible = snap.docs[snap.docs.length - 1] || null;
    setLastDoc(lastVisible);
    setHasMore(snap.docs.length === TICKETS_PAGE_SIZE);
    // نخزّن مؤشر بداية الصفحة الجاية عشان نقدر نروح لها لاحقًا (ref مش state
    // عشان منعملش recreate لـ loadTickets نفسها كل مرة، ده كان ممكن يسبب loop)
    if (snap.docs.length === TICKETS_PAGE_SIZE) {
      ticketsPageCursorsRef.current[targetPage + 1] = lastVisible;
    }
  } catch (e) {
    console.error(e);
    showError("فشل جلب التذاكر: " + e.message);
  }
  setLoadingData(false);
}, [appUser, debouncedSearch, filterStatus, filterPriority, filterWarranty, 
    filterTicketType, filterSource, filterBranch, filterTechnician, filterMaintenanceCenter, dateRange]);

  useEffect(() => {
    ticketsPageCursorsRef.current = { 1: null };
    loadTickets(1);
  }, [loadTickets]);

  // 🛠️ FIX: بدل ما التصدير ياخد بس الـ 30 تذكرة الظاهرة في الصفحة الحالية،
  // دلوقتي بيجيب كل التذاكر المطابقة لنفس الفلاتر المطبّقة حاليًا من قاعدة
  // البيانات مباشرة (مش من الصفحة المعروضة بس)، بنفس منطق الفلترة المستخدم
  // في loadTickets بالظبط، وبيلف على كل الصفحات لحد ما يجيب الكل.
  const buildTicketExportRow = (t) => {
    const sla = getTicketSLAInfo(t, systemSettings?.ticketSLA);
    const partsWithCost = Array.isArray(t.spareParts)
      ? t.spareParts.filter(p => Number(p.cost) > 0).map(p => `${p.name || p.itemName || '-'} (${p.cost} ج)`).join(' | ')
      : (t.sparePartsWithCost || '-');
    const partsWithoutCost = Array.isArray(t.spareParts)
      ? t.spareParts.filter(p => !Number(p.cost)).map(p => p.name || p.itemName || '-').join(' | ')
      : (t.sparePartsWithoutCost || '-');
    return {
      'رقم التذكرة': t.ticketNumber || t.id,
      'اسم العميل': t.customerName || '-',
      'الهاتف': t.customerPhone || '-',
      'هاتف إضافي': t.secondPhone || '-',
      'أرضي': t.landline || '-',
      'البريد الإلكتروني': t.customerEmail || '-',
      'المحافظة': t.governorate || '-',
      'المدينة': t.city || '-',
      'العنوان': t.customerAddress || '-',
      'الجهاز': t.device || t.deviceType || '-',
      'الموديل': t.deviceModel || '-',
      'السيريال': t.deviceSerial || '-',
      'كود المنتج': t.productCode || '-',
      'كود العطل الرئيسي': t.mainFaultCode || '-',
      'وصف العطل الرئيسي': t.mainFaultDescription || '-',
      'كود العطل الفرعي': t.subFaultCode || '-',
      'وصف العطل الفرعي': t.subFaultDescription || '-',
      // 🆕 أكواد الأعطال الإضافية (لو التذكرة فيها أكتر من عطل واحد)
      'أكواد أعطال إضافية': (t.additionalFaults || []).map(f => `${f.mainFaultCode}-${f.subFaultCode}`).join(' | ') || '-',
      'وصف المشكلة': t.issue || '-',
      'الحالة': TICKET_STATUSES.find(s => s.value === t.status)?.label || t.status,
      'الأولوية': t.priority === 'high' ? 'عالية' : t.priority === 'medium' ? 'متوسطة' : t.priority === 'low' ? 'منخفضة' : (t.priority || '-'),
      'نوع التذكرة': t.ticketType || '-',
      'المصدر': t.source || '-',
      'أقرب فرع': t.nearestBranch || '-',
      'حالة الضمان': t.warrantyStatus || '-',
      'فترة الضمان': WARRANTY_PERIODS?.find?.(w => w.value === t.warrantyPeriod)?.label || t.warrantyPeriod || '-',
      'الفني المسؤول': t.assignedTechnician || '-',
      'مركز الصيانة': t.assignedMaintenanceCenter || '-',
      'الكول سنتر': t.assignedCallCenter || '-',
      'التكلفة التقديرية': t.estimatedCost || 0,
      'المدة التقديرية': t.estimatedDuration || '-',
      'قطع غيار بتكلفة': partsWithCost || '-',
      'قطع غيار بدون تكلفة': partsWithoutCost || '-',
      'تاريخ الفاتورة': t.invoiceDate || '-',
      'تاريخ انتهاء الصيانة': t.maintenanceEndDate || '-',
      'وقت انتهاء الصيانة': t.maintenanceEndTime || '-',
      'تاريخ التسليم': t.deliveryDate || '-',
      'وقت التسليم': t.deliveryTime || '-',
      'تاريخ الإنشاء': formatDate(t.createdAt),
      'آخر تحديث': formatDate(t.updatedAt),
      'حالة SLA': sla ? (sla.level === 'overdue' ? 'متأخرة' : sla.level === 'due_soon' ? 'قريبة من الموعد' : sla.level === 'completed' ? 'منتهية' : 'في الموعد') : '-',
      'الوقت المستهدف (ساعة)': sla?.targetHours ?? '-',
      'تقييم: سهولة الوصول': t.followUp?.accessibility || '-',
      'تقييم: وقت الصيانة': t.followUp?.maintenanceTime || '-',
      'تقييم: التعامل بالمركز': t.followUp?.centerDealing || '-',
      'تقييم: إجراءات التسليم': t.followUp?.deliveryProcedures || '-',
      'الشراء مرة أخرى': t.followUp?.repurchase === 'yes' ? 'نعم' : t.followUp?.repurchase === 'no' ? 'لا' : '-',
      'ملاحظات المتابعة': t.followUpNotes || '-',
      'الوسوم': Array.isArray(t.tags) ? t.tags.join(', ') : (t.tags || '-'),
      'ملاحظات': t.notes || '-'
    };
  };

  const handleExportAllFilteredTickets = async () => {
    setExportingTickets(true);
    try {
      const canViewAllTickets = appUser.role === 'admin' || appUser.permissions?.viewAllTickets === true;
      const ticketQueryTokens = buildQueryTokens(debouncedSearch);

      let allFetched = [];
      let cursor = null;
      const BATCH_SIZE = 300;
      const MAX_BATCHES = 30; // سقف أمان (٩٠٠٠ تذكرة) عشان متعلقش المتصفح لو البيانات ضخمة جدًا

      for (let i = 0; i < MAX_BATCHES; i++) {
        let constraints = [orderBy('updatedAt', 'desc')];
        if (!canViewAllTickets) {
          constraints.push(where('assignedCenter', '==', appUser.assignedWarehouseId || 'main'));
        }
        if (filterStatus !== 'all') constraints.push(where('status', '==', filterStatus));
        if (filterPriority !== 'all') constraints.push(where('priority', '==', filterPriority));
        if (ticketQueryTokens.length > 0) {
          constraints.push(where('searchTokens', 'array-contains-any', ticketQueryTokens));
        }
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(BATCH_SIZE));

        const snap = await getDocs(query(collection(db, 'tickets'), ...constraints));
        const batch = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        allFetched = [...allFetched, ...batch];
        cursor = snap.docs[snap.docs.length - 1] || null;
        if (snap.docs.length < BATCH_SIZE) break;
      }

      // نفس فلاتر البحث والفلاتر المحلية المطبّقة في الجدول بالظبط
      let filtered = allFetched;
      if (ticketQueryTokens.length > 0) {
        filtered = filtered.filter(t => {
          const haystack = (t.searchTokens && t.searchTokens.length > 0)
            ? t.searchTokens.join(' ')
            : normalizeSearch(`${t.customerName || ''} ${t.customerPhone || ''} ${t.ticketNumber || ''} ${t.assignedTechnician || ''} ${t.assignedMaintenanceCenter || ''} ${t.device || ''} ${t.deviceSerial || ''} ${t.deviceModel || ''} ${t.productCode || ''} ${t.issue || ''} ${t.notes || ''}`);
          return ticketQueryTokens.every(tok => haystack.includes(tok));
        });
      }
      if (filterWarranty !== 'all') filtered = filtered.filter(t => t.warrantyStatus === filterWarranty);
      if (filterTicketType !== 'all') filtered = filtered.filter(t => t.ticketType === filterTicketType);
      if (filterSource !== 'all') filtered = filtered.filter(t => t.source === filterSource);
      if (filterBranch !== 'all') filtered = filtered.filter(t => t.nearestBranch === filterBranch);
      if (filterTechnician !== 'all') filtered = filtered.filter(t => t.assignedTechnician === filterTechnician);
      if (filterMaintenanceCenter !== 'all') filtered = filtered.filter(t => t.assignedMaintenanceCenter === filterMaintenanceCenter);
      if (showOverdueOnly) {
        filtered = filtered.filter(t => getTicketSLAInfo(t, systemSettings?.ticketSLA)?.level === 'overdue');
      }
      if (dateRange.from) {
        const fromDate = new Date(dateRange.from); fromDate.setHours(0, 0, 0, 0);
        filtered = filtered.filter(t => (t.createdAt?.toDate?.() || new Date(t.createdAt)) >= fromDate);
      }
      if (dateRange.to) {
        const toDate = new Date(dateRange.to); toDate.setHours(23, 59, 59, 999);
        filtered = filtered.filter(t => (t.createdAt?.toDate?.() || new Date(t.createdAt)) <= toDate);
      }

      if (filtered.length === 0) {
        showError("لا توجد تذاكر مطابقة للفلاتر الحالية للتصدير");
      } else {
        const exportData = filtered.map(buildTicketExportRow);
        if (exportToExcel(exportData, `Tickets_Detailed_${new Date().toISOString().split('T')[0]}`, 'تذاكر الصيانة')) {
          showSuccess(`تم تصدير التقرير التفصيلي بنجاح (${exportData.length} تذكرة)`);
        } else {
          showError("حدث خطأ أثناء التصدير");
        }
      }
    } catch (e) {
      console.error("Export all tickets error:", e);
      showError("حدث خطأ أثناء جلب وتصدير كل التذاكر: " + e.message);
    }
    setExportingTickets(false);
  };

  // ========== دوال التحديد ==========
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
    if (selectedItems.size === tickets.length && tickets.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(tickets.map(t => t.id)));
    }
  };

  // ========== فتح التذكرة كاملة ==========
  const openFullTicket = (ticket) => {
  // ✅ كل الخصائص داخل setFullTicketView
  setFullTicketView({
    ...ticket,
    followUp: ticket.followUp || {
      accessibility: 0,
      maintenanceTime: 0,
      centerDealing: 0,
      deliveryProcedures: 0,
      repurchase: ''
    },
    followUpNotes: ticket.followUpNotes || '',
    followUpDate: ticket.followUpDate || '',
    followUpBy: ticket.followUpBy || ''
  });
  
  setTicketComments(ticket.comments || []);
  setNewComment('');
  setEditingCommentId(null);
  setEditingCommentText('');
  setShowFullTicketModal(true);
};
  // ========== التعليقات ==========
  const addComment = async () => {
    if (!newComment.trim() || !fullTicketView) return;
    
    const comment = {
      id: Date.now().toString(),
      text: newComment,
      createdAt: new Date().toISOString(),
      createdBy: appUser.name,
      createdById: appUser.id
    };
    
    const updated = [...ticketComments, comment];
    setTicketComments(updated);
    setNewComment('');
    
    try {
      await updateDoc(doc(db, 'tickets', fullTicketView.id), { 
        comments: updated, 
        updatedAt: serverTimestamp() 
      });
      showSuccess("تم إضافة التعليق");
    } catch(e) { 
      console.error(e); 
      showError("فشل إضافة التعليق"); 
    }
  };

  const editComment = async (commentId) => {
    if (!editingCommentText.trim() || !fullTicketView) return;
    
    const updated = ticketComments.map(c => 
      c.id === commentId ? { ...c, text: editingCommentText, editedAt: new Date().toISOString() } : c
    );
    
    setTicketComments(updated);
    setEditingCommentId(null);
    setEditingCommentText('');
    
    try {
      await updateDoc(doc(db, 'tickets', fullTicketView.id), { 
        comments: updated, 
        updatedAt: serverTimestamp() 
      });
      showSuccess("تم تعديل التعليق");
    } catch(e) { 
      console.error(e); 
      showError("فشل تعديل التعليق");
    }
  };

  const deleteComment = async (commentId) => {
    const confirmed = await showConfirm('تأكيد الحذف', 'هل أنت متأكد من حذف هذا التعليق؟');
    if (!confirmed) return;
    
    const updated = ticketComments.filter(c => c.id !== commentId);
    setTicketComments(updated);
    
    try {
      await updateDoc(doc(db, 'tickets', fullTicketView.id), { 
        comments: updated, 
        updatedAt: serverTimestamp() 
      });
      showSuccess("تم حذف التعليق");
    } catch(e) { 
      console.error(e); 
      showError("فشل حذف التعليق");
    }
  };

  // ========== إضافة تذكرة ==========
  const handleAddTicket = async (e) => {
    e.preventDefault();
    
    if (!newTicket.customerName || !newTicket.customerPhone) {
      showError("اسم العميل ورقم الهاتف مطلوبان");
      return;
    }

    setGlobalLoading(true);
    
    try {
      let customerId = newTicket.customerId;
      const normalizedTicketPhone = normalizePhone(newTicket.customerPhone);
      
      if (!customerId && normalizedTicketPhone) {
        const q = query(collection(db, "customers"), where("phone", "==", normalizedTicketPhone));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          customerId = snap.docs[0].id;
        } else {
          const newCustomerRef = await addDoc(collection(db, "customers"), {
            name: newTicket.customerName,
            phone: normalizedTicketPhone,
            secondPhone: normalizePhone(newTicket.secondPhone) || '',
            landline: newTicket.landline || '',
            email: newTicket.customerEmail || "",
            address: newTicket.customerAddress || '',
            governorate: newTicket.governorate || '',
            city: newTicket.city || '',
            createdAt: serverTimestamp(),
            searchKey: normalizeSearch(`${newTicket.customerName} ${normalizedTicketPhone}`),
            searchTokens: buildSearchTokens(newTicket.customerName, normalizedTicketPhone),
            ticketsCount: 0
          });
          customerId = newCustomerRef.id;
        }
      }

      const fullIssue = newTicket.issue || 
        (newTicket.subFaultCode ? `${newTicket.subFaultCode} - ${newTicket.subFaultDescription}` : '');

      const generatedTicketNumber = await getNextTicketNumber();

      const ticketData = {
        ...newTicket,
        customerId,
        issue: fullIssue,
        ticketNumber: generatedTicketNumber,
        // 🛠️ FIX: البحث كان بيغطي بس اسم العميل/الهاتف/رقم التذكرة/الفني/
        // المركز/الجهاز/السيريال. أي بحث بكود المنتج أو الموديل أو وصف
        // العطل أو الملاحظات كان مش بيلاقي حاجة رغم إنها موجودة فعليًا.
        searchTokens: buildSearchTokens(
          newTicket.customerName, newTicket.customerPhone, generatedTicketNumber,
          newTicket.assignedTechnician, newTicket.assignedMaintenanceCenter,
          newTicket.device, newTicket.deviceSerial, newTicket.deviceModel,
          newTicket.productCode, newTicket.mainFaultCode, newTicket.mainFaultDescription,
          newTicket.subFaultCode, newTicket.subFaultDescription, fullIssue, newTicket.notes
        ),
        assignedCenter: appUser?.assignedWarehouseId || "main",
        // 🛠️ FIX: كانت مثبتة على مصفوفة فاضية دايمًا - يعني مستحيل تحدد
        // قطع غيار وانت بتنشئ التذكرة، لازم تستنى لحد ما تتحفظ وتفتحها تاني.
        spareParts: newTicketSpareParts,
        totalCost: newTicketSpareParts.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.quantity) || 1), 0),
        totalPaid: 0,
        remaining: 0,
        comments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: appUser.id,
        createdByName: appUser.name,
        statusHistory: [{ status: 'created', timestamp: new Date().toISOString(), by: appUser.name }],
        history: [{ action: 'إنشاء تذكرة', timestamp: new Date().toISOString(), by: appUser.name }],
        // ✅ إضافة Follow up
  followUp: newTicket.followUp || {
    accessibility: 0,
    maintenanceTime: 0,
    centerDealing: 0,
    deliveryProcedures: 0,
    repurchase: ''
  },
  followUpNotes: newTicket.followUpNotes || '',
  followUpDate: '',
  followUpBy: ''
      };

      const docRef = await addDoc(collection(db, 'tickets'), ticketData);
      
      setFullTicketView({ id: docRef.id, ...ticketData });
      setShowFullTicketModal(true);

      if (customerId) {
        await updateDoc(doc(db, 'customers', customerId), {
          ticketsCount: increment(1),
          lastTicket: serverTimestamp()
        });
      }

      showSuccess("تم إنشاء التذكرة بنجاح");
      setShowAddModal(false);
      resetNewTicket();
      setNewTicketSpareParts([]);
      resetSelections();
      setLastDoc(null);
      loadTickets(currentTicketsPage);
    } catch (error) {
      console.error(error);
      showError("حصل خطأ أثناء إنشاء التذكرة: " + error.message);
    }
    
    setGlobalLoading(false);
  };

  const resetNewTicket = () => {
    setNewTicket({
      customerId: '', customerName: '', customerPhone: '', secondPhone: '', landline: '',
      customerEmail: '', customerAddress: '', governorate: '', city: '',
      device: '', deviceType: '', deviceModel: '', deviceSerial: '',
      mainFaultCode: '', mainFaultDescription: '',
      subFaultCode: '', subFaultDescription: '',
      additionalFaults: [],
      productCode: '', issue: '',
      status: 'created', priority: 'medium',
      warrantyStatus: '', warrantyPeriod: '', ticketType: '', source: '', nearestBranch: '',
      assignedTechnician: '', assignedMaintenanceCenter: '', assignedCallCenter: '',
      estimatedCost: 0, estimatedDuration: '', notes: '', spareParts: [], tags: [],
      sparePartsWithCost: '', sparePartsWithoutCost: '',
      invoiceDate: '', deliveryDate: '', maintenanceEndDate: '',
      maintenanceEndTime: '',
      deliveryTime: ''
    });
  };

  // ========== تحديث حالة التذكرة ==========
  const handleUpdateStatus = async (ticketId, newStatus) => {
    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const snap = await getDoc(ticketRef);
      const current = snap.data();
      
      const statusHistory = [...(current.statusHistory || []), {
        status: newStatus,
        timestamp: new Date().toISOString(),
        by: appUser.name
      }];
      
      const history = [...(current.history || []), {
        action: `تغيير الحالة من "${TICKET_STATUSES.find(s => s.value === current.status)?.label || current.status || '-'}" إلى "${TICKET_STATUSES.find(s => s.value === newStatus)?.label || newStatus}"`,
        timestamp: new Date().toISOString(),
        by: appUser.name
      }];
      
      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
        statusHistory,
        history
      });
      
      showSuccess("تم تحديث حالة التذكرة");

      // ✨ ميزة جديدة: إشعار تلقائي للعميل عند تغيير حالة تذكرته (عبر Webhook
      // مربوط بخدمة زي Zapier/Make بتحوّل الإشعار لرسالة SMS أو واتساب)
      const notifConfig = systemSettings?.ticketNotifications;
      if (notifConfig?.enabled && notifConfig?.webhookUrl && current.customerPhone) {
        sendWebhookNotification(notifConfig.webhookUrl, {
          type: 'ticket_status_changed',
          ticketNumber: current.ticketNumber,
          customerName: current.customerName,
          customerPhone: current.customerPhone,
          oldStatus: TICKET_STATUSES.find(s => s.value === current.status)?.label || current.status,
          newStatus: TICKET_STATUSES.find(s => s.value === newStatus)?.label || newStatus,
          device: current.device || '',
          timestamp: new Date().toISOString()
        });
      }

      if (fullTicketView?.id === ticketId) {
        setFullTicketView({ ...fullTicketView, status: newStatus, statusHistory, history });
      }
      
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
    } catch(e) {
      showError("فشل تحديث الحالة: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== إضافة قطعة غيار ==========
  const handleAddSparePart = async (ticketId, part) => {
    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const snap = await getDoc(ticketRef);
      const current = snap.data();
      
      const spareParts = [...(current.spareParts || []), {
        ...part,
        id: Date.now().toString(),
        addedAt: new Date().toISOString(),
        addedBy: appUser.name
      }];
      
      const totalCost = (current.totalCost || 0) + (part.price * part.quantity);
      const remaining = totalCost - (current.totalPaid || 0);
      
      const history = [...(current.history || []), {
        action: `إضافة قطعة غيار: ${part.name} (${part.quantity} x ${part.price} ج)`,
        timestamp: new Date().toISOString(),
        by: appUser.name
      }];

      await updateDoc(ticketRef, {
        spareParts,
        totalCost,
        remaining,
        updatedAt: serverTimestamp(),
        history
      });
      
      showSuccess("تم إضافة قطعة الغيار");

      if (fullTicketView?.id === ticketId) {
        setFullTicketView({ ...fullTicketView, spareParts, totalCost, remaining, history });
      }
      // 🛠️ FIX: المودال بيعرض بيانات selectedTicket، وده كان بيفضل زي
      // ما هو (قديم) بعد الإضافة لحد ما تقفل المودال وتفتحه تاني.
      setSelectedTicket(prev => prev?.id === ticketId ? { ...prev, spareParts, totalCost, remaining, history } : prev);
    } catch(e) {
      showError("فشل إضافة قطعة الغيار: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== إضافة دفعة ==========
  const handleAddPayment = async (ticketId, amount) => {
    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const snap = await getDoc(ticketRef);
      const current = snap.data();
      
      const totalPaid = (current.totalPaid || 0) + amount;
      const remaining = (current.totalCost || 0) - totalPaid;
      
      const history = [...(current.history || []), {
        action: `إضافة دفعة: ${amount} ج`,
        timestamp: new Date().toISOString(),
        by: appUser.name
      }];

      await updateDoc(ticketRef, {
        totalPaid,
        remaining,
        updatedAt: serverTimestamp(),
        history
      });
      
      showSuccess("تم إضافة الدفعة بنجاح");

      if (fullTicketView?.id === ticketId) {
        setFullTicketView({ ...fullTicketView, totalPaid, remaining, history });
      }
      setSelectedTicket(prev => prev?.id === ticketId ? { ...prev, totalPaid, remaining, history } : prev);
    } catch(e) {
      showError("فشل إضافة الدفعة: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== تعيين المسؤولين ==========
  const handleAssign = async (ticketId) => {
    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const snap = await getDoc(ticketRef);
      const currentHistory = snap.data().history || [];
      const history = [];
      const updates = {};

      if (assignData.technician) {
        updates.assignedTechnician = assignData.technician;
        history.push({
          action: `تعيين الفني: ${assignData.technician}`,
          timestamp: new Date().toISOString(),
          by: appUser.name
        });
      }
      
      if (assignData.center) {
        updates.assignedMaintenanceCenter = assignData.center;
        history.push({
          action: `تعيين مركز صيانة: ${assignData.center}`,
          timestamp: new Date().toISOString(),
          by: appUser.name
        });
      }
      
      if (assignData.callCenter) {
        const selectedCall = callCenters.find(c => c.id === assignData.callCenter);
        updates.assignedCallCenter = selectedCall ? selectedCall.name : assignData.callCenter;
        history.push({
          action: `تعيين كول سنتر: ${updates.assignedCallCenter}`,
          timestamp: new Date().toISOString(),
          by: appUser.name
        });
      }

      await updateDoc(ticketRef, {
        ...updates,
        updatedAt: serverTimestamp(),
        history: [...currentHistory, ...history]
      });
      
      showSuccess("تم تعيين المسؤولين بنجاح");
      setShowAssignModal(false);
      setAssignData({ technician: '', center: '', callCenter: '' });

      if (fullTicketView?.id === ticketId) {
        setFullTicketView({ ...fullTicketView, ...updates, history: [...(fullTicketView.history || []), ...history] });
      }
      
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...updates } : t));
    } catch(e) {
      showError("فشل تعيين المسؤولين: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== إنشاء فاتورة ==========
  const handleGenerateInvoice = (ticket) => {
    if (onGenerateInvoice) {
      onGenerateInvoice({
        ...ticket,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        customerName: ticket.customerName,
        customerPhone: ticket.customerPhone,
        // 🛠️ FIX: كان بيسقط id/serialNumber هنا، يعني حتى لو القطعة كانت
        // مرتبطة بصنف حقيقي في المخزون، الوصلة كانت بتتقطع قبل ما توصل
        // نقطة البيع، فمستحيل كان يتحدد إنها فعلاً من المخزون ولا مضافة يدويًا.
        items: ticket.spareParts?.map(p => ({ id: p.id, serialNumber: p.serialNumber, name: p.name, price: p.price, quantity: p.quantity })) || [],
        totalCost: ticket.totalCost || 0
      });
    } else {
      showInfo("سيتم إضافة وظيفة إنشاء الفاتورة قريباً");
    }
  };

  // ========== حذف مجمع ==========
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      showError("لم يتم تحديد أي تذاكر");
      return;
    }
    
    if (bulkDeleteConfirm !== 'حذف') {
      showError("اكتب 'حذف' للتأكيد");
      return;
    }

    const confirmed = await showConfirm('تأكيد الحذف', `هل أنت متأكد من حذف ${selectedItems.size} تذكرة بشكل نهائي؟`);
    if (!confirmed) return;

    setGlobalLoading(true);
    
    try {
      const items = Array.from(selectedItems);
      
      for (let i = 0; i < items.length; i += 400) {
        const batch = writeBatch(db);
        items.slice(i, i + 400).forEach(id => batch.delete(doc(db, 'tickets', id)));
        await batch.commit();
      }
      
      showSuccess(`تم حذف ${items.length} تذكرة`);
      setSelectedItems(new Set());
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirm('');
      setLastDoc(null);
      loadTickets(currentTicketsPage);
    } catch(e) {
      showError("فشل الحذف: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== عرض السجل ==========
  const handleViewHistory = (ticket) => {
    setSelectedTicket(ticket);
    setTicketHistory(ticket.history || []);
    setShowHistoryModal(true);
  };

  // ========== دوال التعديل ==========
  const openEditModal = (ticket) => {
    setEditingTicket(ticket);
    initEditFaultSelection(ticket);
    setEditFormData({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber || '',
      customerName: ticket.customerName || '',
      customerPhone: ticket.customerPhone || '',
      secondPhone: ticket.secondPhone || '',
      landline: ticket.landline || '',
      customerEmail: ticket.customerEmail || '',
      customerAddress: ticket.customerAddress || '',
      governorate: ticket.governorate || '',
      city: ticket.city || '',
      device: ticket.device || '',
      deviceType: ticket.deviceType || '',
      deviceModel: ticket.deviceModel || '',
      deviceSerial: ticket.deviceSerial || '',
      productCode: ticket.productCode || '',
      // 🆕 أكواد العطل - كانت مش موجودة خالص في نموذج التعديل قبل كده
      mainFaultCode: ticket.mainFaultCode || '',
      mainFaultDescription: ticket.mainFaultDescription || '',
      subFaultCode: ticket.subFaultCode || '',
      subFaultDescription: ticket.subFaultDescription || '',
      additionalFaults: ticket.additionalFaults || [],
      issue: ticket.issue || '',
      status: ticket.status || 'created',
      priority: ticket.priority || 'medium',
      warrantyStatus: ticket.warrantyStatus || '',
      warrantyPeriod: ticket.warrantyPeriod || '',
      ticketType: ticket.ticketType || '',
      source: ticket.source || '',
      nearestBranch: ticket.nearestBranch || '',
      assignedTechnician: ticket.assignedTechnician || '',
      assignedMaintenanceCenter: ticket.assignedMaintenanceCenter || '',
      assignedCallCenter: ticket.assignedCallCenter || '',
      estimatedCost: ticket.estimatedCost || 0,
      estimatedDuration: ticket.estimatedDuration || '',
      notes: ticket.notes || '',
      tags: ticket.tags || [],
      sparePartsWithCost: ticket.sparePartsWithCost || '',
      sparePartsWithoutCost: ticket.sparePartsWithoutCost || '',
      invoiceDate: ticket.invoiceDate || '',
      deliveryDate: ticket.deliveryDate || '',
      maintenanceEndDate: ticket.maintenanceEndDate || '',
      maintenanceEndTime: ticket.maintenanceEndTime || '',
      deliveryTime: ticket.deliveryTime || '',
      
      followUpAccessibility: ticket.followUp?.accessibility || 0,
      followUpMaintenanceTime: ticket.followUp?.maintenanceTime || 0,
      followUpCenterDealing: ticket.followUp?.centerDealing || 0,
      followUpDeliveryProcedures: ticket.followUp?.deliveryProcedures || 0,
      followUpRepurchase: ticket.followUp?.repurchase || '',
      followUpNotes: ticket.followUpNotes || '',
      followUpDate: ticket.followUpDate || '',
      followUpBy: ticket.followUpBy || ''
  });
    
  };

  const handleUpdateTicket = async (e) => {
    e.preventDefault();
    if (!editingTicket) return;

    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', editingTicket.id);
      
      const updateData = {
        customerName: editFormData.customerName,
        customerPhone: editFormData.customerPhone,
        secondPhone: editFormData.secondPhone,
        landline: editFormData.landline,
        customerEmail: editFormData.customerEmail,
        customerAddress: editFormData.customerAddress,
        governorate: editFormData.governorate,
        city: editFormData.city,
        warrantyStatus: editFormData.warrantyStatus,
        warrantyPeriod: editFormData.warrantyPeriod,
        device: editFormData.device,
        deviceType: editFormData.deviceType,
        deviceModel: editFormData.deviceModel,
        deviceSerial: editFormData.deviceSerial,
        productCode: editFormData.productCode || '',
        // 🆕 كانت مش بتتحفظ خالص عند التعديل - يعني تعديل كود العطل بعد
        // الإنشاء مكانش بيتسجل فعليًا حتى لو غيّرته في الفورم
        mainFaultCode: editFormData.mainFaultCode || '',
        mainFaultDescription: editFormData.mainFaultDescription || '',
        subFaultCode: editFormData.subFaultCode || '',
        subFaultDescription: editFormData.subFaultDescription || '',
        additionalFaults: editFormData.additionalFaults || [],
        issue: editFormData.issue,
        status: editFormData.status,
        priority: editFormData.priority,
        ticketType: editFormData.ticketType,
        source: editFormData.source,
        nearestBranch: editFormData.nearestBranch,
        assignedTechnician: editFormData.assignedTechnician,
        assignedMaintenanceCenter: editFormData.assignedMaintenanceCenter,
        assignedCallCenter: editFormData.assignedCallCenter,
        estimatedCost: editFormData.estimatedCost,
        estimatedDuration: editFormData.estimatedDuration,
        notes: editFormData.notes,
        tags: editFormData.tags,
        // 🛠️ FIX: كان مش بيتعمل rebuild لـ searchTokens عند التعديل، فلو
        // غيرت الموديل أو كود المنتج أو وصف العطل بعد إنشاء التذكرة، البحث
        // كان بيفضل شغال بالبيانات القديمة (أو مش بيلاقيها خالص)
        searchTokens: buildSearchTokens(
          editFormData.customerName, editFormData.customerPhone, editFormData.ticketNumber,
          editFormData.assignedTechnician, editFormData.assignedMaintenanceCenter,
          editFormData.device, editFormData.deviceSerial, editFormData.deviceModel,
          editFormData.productCode, editFormData.issue, editFormData.notes
        ),
        sparePartsWithCost: editFormData.sparePartsWithCost || '',
        sparePartsWithoutCost: editFormData.sparePartsWithoutCost || '',
        invoiceDate: editFormData.invoiceDate || '',
        deliveryDate: editFormData.deliveryDate || '',
        maintenanceEndDate: editFormData.maintenanceEndDate || '',
        maintenanceEndTime: editFormData.maintenanceEndTime || '',
        deliveryTime: editFormData.deliveryTime || '',

        // ✅ Follow up
          followUp: {
            accessibility: Number(editFormData.followUpAccessibility) || 0,
            maintenanceTime: Number(editFormData.followUpMaintenanceTime) || 0,
            centerDealing: Number(editFormData.followUpCenterDealing) || 0,
            deliveryProcedures: Number(editFormData.followUpDeliveryProcedures) || 0,
            repurchase: editFormData.followUpRepurchase || ''
          },
          followUpNotes: editFormData.followUpNotes || '',
          followUpDate: editFormData.followUpDate || new Date().toISOString().split('T')[0],
          followUpBy: editFormData.followUpBy || appUser.name,
          
        updatedAt: serverTimestamp()
      };
      
      const snap = await getDoc(ticketRef);
      const beforeData = snap.data() || {};
      const currentHistory = beforeData.history || [];

      // 🛠️ FIX: كان بيتسجل سطر عام "تم تعديل بيانات التذكرة من قبل المستخدم"
      // من غير أي تفاصيل عن اللي اتغير فعليًا. دلوقتي بنقارن كل حقل قبل
      // وبعد الحفظ، ونسجل بالظبط "الحقل الفلاني اتغير من كذا لكذا"
      const FIELD_LABELS_FOR_HISTORY = {
        customerName: 'اسم العميل', customerPhone: 'هاتف العميل', warrantyStatus: 'حالة الضمان',
        warrantyPeriod: 'فترة الضمان', device: 'الجهاز', deviceModel: 'الموديل', deviceSerial: 'السيريال',
        productCode: 'كود المنتج', issue: 'وصف المشكلة', status: 'الحالة', priority: 'الأولوية',
        ticketType: 'نوع التذكرة', source: 'المصدر', assignedTechnician: 'الفني المسؤول',
        assignedMaintenanceCenter: 'مركز الصيانة', assignedCallCenter: 'الكول سنتر',
        estimatedCost: 'التكلفة التقديرية', estimatedDuration: 'المدة التقديرية', notes: 'الملاحظات',
        maintenanceEndDate: 'تاريخ انتهاء الصيانة', deliveryDate: 'تاريخ التسليم'
      };
      const displayVal = (key, val) => {
        if (key === 'status') return TICKET_STATUSES.find(s => s.value === val)?.label || val || '-';
        return (val === '' || val === undefined || val === null) ? '-' : String(val);
      };
      const changeLines = Object.keys(FIELD_LABELS_FOR_HISTORY)
        .filter(key => String(beforeData[key] ?? '') !== String(updateData[key] ?? ''))
        .map(key => `${FIELD_LABELS_FOR_HISTORY[key]}: "${displayVal(key, beforeData[key])}" ← "${displayVal(key, updateData[key])}"`);

      const history = changeLines.length > 0
        ? [...currentHistory, {
            action: 'تعديل بيانات التذكرة',
            timestamp: new Date().toISOString(),
            by: appUser.name,
            details: changeLines.join(' | ')
          }]
        : currentHistory;
      updateData.history = history;
      
      await updateDoc(ticketRef, updateData);
      showSuccess("تم تحديث التذكرة بنجاح");
      
      setEditingTicket(null);
      setEditFormData({});
      loadTickets(currentTicketsPage);
      
      if (fullTicketView?.id === editingTicket.id) {
        setFullTicketView({ ...fullTicketView, ...updateData });
      }
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء تحديث التذكرة: " + error.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== ألوان مساعدة ==========
  const getPriorityColor = (p) => {
    if (p === 'high') return 'text-rose-600 bg-rose-50 dark:bg-rose-900/30';
    if (p === 'medium') return 'text-amber-600 bg-amber-50 dark:bg-amber-900/30';
    return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30';
  };

  const resetFilters = () => {
    setFilterStatus('all');
    setFilterPriority('all');
    setFilterWarranty('all');
    setFilterTicketType('all');
    setFilterSource('all');
    setFilterBranch('all');
    setFilterTechnician('all');
    setFilterMaintenanceCenter('all'); // ✅ إعادة تعيين فلتر مركز الصيانة
    setFilterTag('all');
    setDateRange({ from: '', to: '' });
    setSearch('');
  };

  // ====================== RENDER ======================
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden text-right" dir="rtl">
      
      {/* ===== مودال إضافة تذكرة ===== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <MessageSquare className="text-teal-600"/> إنشاء تذكرة صيانة جديدة
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-rose-600"><X size={24}/></button>
            </div>
            
           <form onSubmit={handleAddTicket} className="space-y-4">
  {/* البحث عن عميل */}
  <div className="relative">
    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">🔍 البحث عن عميل موجود</label>
    <input 
      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 outline-none focus:border-teal-500"
      placeholder="ابحث عن عميل مسجل..."
      value={customerSearch}
      onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
      onFocus={() => setShowCustomerDropdown(true)}
    />
    {showCustomerDropdown && filteredCustomers.length > 0 && (
      <div className="absolute z-20 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mt-1 shadow-lg max-h-48 overflow-y-auto">
        {filteredCustomers.map(c => (
          <button key={c.id} type="button" onClick={() => selectCustomer(c)} className="w-full p-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700 border-b last:border-0">
            <span className="font-bold block text-sm">{c.name}</span>
            <span className="text-xs text-slate-500">{c.phone}</span>
          </button>
        ))}
      </div>
    )}
  </div>

  {/* معلومات العميل الأساسية */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div>
      <label className="block text-xs font-bold mb-1">اسم العميل *</label>
      <input required className="w-full border p-3 rounded-xl text-sm" value={newTicket.customerName} onChange={e => setNewTicket({...newTicket, customerName: e.target.value})} />
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">رقم الهاتف *</label>
      <input required className="w-full border p-3 rounded-xl text-sm font-mono" value={newTicket.customerPhone} onChange={e => setNewTicket({...newTicket, customerPhone: e.target.value})} dir="ltr" />
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">رقم ثاني</label>
      <input className="w-full border p-3 rounded-xl text-sm font-mono" value={newTicket.secondPhone} onChange={e => setNewTicket({...newTicket, secondPhone: e.target.value})} dir="ltr" />
    </div>
  </div>
  
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div>
      <label className="block text-xs font-bold mb-1">تليفون أرضي</label>
      <input className="w-full border p-3 rounded-xl text-sm font-mono" value={newTicket.landline} onChange={e => setNewTicket({...newTicket, landline: e.target.value})} dir="ltr" />
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">البريد الإلكتروني</label>
      <input type="email" className="w-full border p-3 rounded-xl text-sm" value={newTicket.customerEmail} onChange={e => setNewTicket({...newTicket, customerEmail: e.target.value})} />
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">العنوان</label>
      <input className="w-full border p-3 rounded-xl text-sm" value={newTicket.customerAddress} onChange={e => setNewTicket({...newTicket, customerAddress: e.target.value})} />
    </div>
  </div>

  {/* المحافظة والمدينة */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div>
      <label className="block text-xs font-bold mb-1">المحافظة</label>
      <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.governorate || ''} onChange={e => setNewTicket({...newTicket, governorate: e.target.value})}>
        <option value="">-- اختر المحافظة --</option>
        {EGYPT_GOVERNORATES.map(gov => <option key={gov} value={gov}>{gov}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">المدينة / المنطقة</label>
      <input className="w-full border p-3 rounded-xl text-sm" value={newTicket.city || ''} onChange={e => setNewTicket({...newTicket, city: e.target.value})} placeholder="مثال: مدينة نصر" />
    </div>
  </div>

  {/* القوائم المتتالية */}
  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl">
    <div>
      <label className="block text-xs font-bold mb-1 text-teal-800 dark:text-teal-300">المنتج</label>
      {/* 🆕 FIX: تحويل الليستة لخانة قابلة للكتابة (بحث مباشر) بدل السكرول في
          ليستة طويلة - اكتب أي جزء من اسم المنتج وهيبان في الاقتراحات */}
      <input
        list="products-datalist"
        className="w-full border p-3 rounded-xl text-sm bg-white dark:bg-slate-900"
        placeholder="اكتب اسم المنتج للبحث..."
        value={productSearchInput}
        onChange={e => {
          const typed = e.target.value;
          setProductSearchInput(typed);
          const matched = products.find(p => p.name === typed);
          setSelectedModelId('');
          setSelectedMainFaultId('');
          setSelectedSubFaultId('');
          if (matched) {
            setSelectedProductId(matched.id);
            setNewTicket(prev => ({ ...prev, device: matched.name }));
          } else {
            setSelectedProductId('');
          }
        }}
      />
      <datalist id="products-datalist">
        {products.map(p => <option key={p.id} value={p.name} />)}
      </datalist>
    </div>

    <div>
      <label className="block text-xs font-bold mb-1 text-teal-800 dark:text-teal-300">الموديل</label>
      <select className="w-full border p-3 rounded-xl text-sm bg-white dark:bg-slate-900 disabled:opacity-50" value={selectedModelId} onChange={e => {
        setSelectedModelId(e.target.value);
        setSelectedMainFaultId('');
        setSelectedSubFaultId('');
        const model = models.find(m => m.id === e.target.value);
        setNewTicket(prev => ({ ...prev, deviceModel: model?.name || '' }));
      }} disabled={!selectedProductId}>
        <option value="">-- اختر الموديل --</option>
        {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>

    <div>
      <label className="block text-xs font-bold mb-1 text-amber-800 dark:text-amber-300">كود العطل الرئيسي</label>
      <select className="w-full border p-3 rounded-xl text-sm bg-white dark:bg-slate-900 disabled:opacity-50" value={selectedMainFaultId} onChange={e => {
        setSelectedMainFaultId(e.target.value);
        setSelectedSubFaultId('');
      }} disabled={!selectedModelId}>
        <option value="">-- اختر الكود الرئيسي --</option>
        {mainFaults.map(f => <option key={f.id} value={f.id}>{f.code} - {f.description}</option>)}
      </select>
    </div>

    <div>
      <label className="block text-xs font-bold mb-1 text-purple-800 dark:text-purple-300">كود العطل الفرعي</label>
      <select className="w-full border p-3 rounded-xl text-sm bg-white dark:bg-slate-900 disabled:opacity-50" value={selectedSubFaultId} onChange={e => handleSelectSubFault(e.target.value)} disabled={!selectedMainFaultId}>
        <option value="">-- اختر الكود الفرعي --</option>
        {subFaults.map(f => (
          <option key={f.id} value={f.id}>{f.code} - {f.description}</option>
        ))}
      </select>
    </div>
  </div>

  {/* 🆕 إمكانية إضافة أكتر من كود عطل رئيسي/فرعي لنفس التذكرة */}
  {(newTicket.mainFaultCode || selectedSubFaultId) && (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleAddAnotherFault}
        className="self-start text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
      >
        <Plus size={14}/> إضافة كود عطل تاني لنفس التذكرة
      </button>
      {newTicket.mainFaultCode && (
        <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-2 text-xs">
          <span className="font-bold">العطل الأساسي:</span> {newTicket.mainFaultCode} - {newTicket.subFaultCode} ({newTicket.subFaultDescription})
        </div>
      )}
      {newTicket.additionalFaults.length > 0 && (
        <div className="space-y-1.5">
          {newTicket.additionalFaults.map((f, idx) => (
            <div key={idx} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs">
              <span>{f.mainFaultCode} - {f.subFaultCode} ({f.subFaultDescription})</span>
              <button type="button" onClick={() => handleRemoveAdditionalFault(f.subFaultCode)} className="text-rose-500 hover:text-rose-700">
                <X size={14}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )}

  {/* السيريال */}
  <div>
    <label className="block text-xs font-bold mb-1">السيريال التسلسلي للجهاز</label>
    <input className="w-full border p-3 rounded-xl text-sm font-mono" value={newTicket.deviceSerial} onChange={e => setNewTicket({...newTicket, deviceSerial: e.target.value})} placeholder="السيريال التسلسلي" />
  </div>

  {/* 🆕 كود المنتج - كان بيتعبى تلقائي بس من شيت أكواد الأعطال ومش ظاهر
      خالص في التذكرة. دلوقتي ظاهر، اختياري، وقابل للتعديل اليدوي */}
  <div>
    <label className="block text-xs font-bold mb-1">كود المنتج <span className="text-slate-400 font-normal">(اختياري)</span></label>
    <input className="w-full border p-3 rounded-xl text-sm font-mono" value={newTicket.productCode} onChange={e => setNewTicket({...newTicket, productCode: e.target.value})} placeholder="كود المنتج (لو موجود)" />
  </div>

  {/* 🆕 اختيار قطع الغيار المطلوبة من المخزون وقت إنشاء التذكرة نفسها -
      بتتحفظ مع التذكرة مباشرة، وتقدر تعمل منها فاتورة بضغطة واحدة بعد كده
      وهتتحط تلقائي في نقطة البيع مرتبطة بالمخزون الحقيقي. */}
  <div className="md:col-span-2 bg-purple-50/40 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/40 rounded-xl p-4 space-y-3">
    <p className="text-xs font-bold text-purple-700 dark:text-purple-400 flex items-center gap-1">
      <Package size={14}/> قطع الغيار المطلوبة <span className="text-slate-400 font-normal">(اختياري - تقدر تضيفها دلوقتي أو بعدين)</span>
    </p>
    <div className="flex gap-2">
      <input
        className="flex-1 border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900"
        placeholder="ابحث بالاسم أو السيريال..."
        value={sparePartSearch}
        onChange={e => setSparePartSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchSparePart(); } }}
      />
      <button type="button" onClick={() => handleSearchSparePart()} className="bg-teal-600 text-white px-4 rounded-xl font-bold text-sm flex items-center gap-1">
        {searchingSpareParts ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>} بحث
      </button>
    </div>

    {sparePartResults.length > 0 && (
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-700 max-h-48 overflow-y-auto">
        {sparePartResults.map(item => (
          <button
            type="button"
            key={item.id}
            onClick={() => handleAddNewTicketSparePart(item)}
            className="w-full text-right px-3 py-2 hover:bg-teal-50 dark:hover:bg-teal-900/30 flex items-center justify-between gap-2 bg-white dark:bg-slate-900"
          >
            <div>
              <p className="font-bold text-sm">{item.name}</p>
              <p className="text-xs text-slate-400 font-mono">{item.serialNumber} - متاح: {item.quantity}</p>
            </div>
            <span className="text-xs font-bold text-teal-600">{item.price} ج</span>
          </button>
        ))}
      </div>
    )}

    {newTicketSpareParts.length > 0 && (
      <div className="space-y-2">
        {newTicketSpareParts.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{p.name}</p>
              <p className="text-xs text-slate-400 font-mono">{p.serialNumber}</p>
            </div>
            <input
              type="number"
              min="1"
              value={p.quantity}
              onChange={e => handleNewTicketSparePartQtyChange(p.id, e.target.value)}
              className="w-14 border rounded-lg p-1.5 text-xs text-center bg-slate-50 dark:bg-slate-800"
            />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-16 text-left">{p.price * p.quantity} ج</span>
            <button type="button" onClick={() => handleRemoveNewTicketSparePart(p.id)} className="text-rose-500 hover:text-rose-700">
              <X size={16}/>
            </button>
          </div>
        ))}
      </div>
    )}
  </div>

  {/* ملاحظات إضافية */}
  <div>
    <label className="block text-xs font-bold mb-1">ملاحظات إضافية</label>
    <textarea rows="2" className="w-full border p-3 rounded-xl text-sm resize-none" value={newTicket.notes} onChange={e => setNewTicket({...newTicket, notes: e.target.value})} placeholder="أي ملاحظات إضافية..." />
  </div>

  {/* الضمان والنوع والمصدر */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div>
      <label className="block text-xs font-bold mb-1">حالة الضمان</label>
      <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.warrantyStatus || ''} onChange={e => {
        const newStatus = e.target.value;
        // 🆕 "غير معرف" يكمل على طول من غير خانة مدة، و"فاتورة اصلاح" بتظهر
        // لها خانة اختيار المدة زي "داخل الضمان" بالظبط
        if (newStatus === 'out_of_warranty' || newStatus === 'unidentified') {
          setNewTicket({ ...newTicket, warrantyStatus: newStatus, warrantyPeriod: newStatus });
        } else {
          setNewTicket({ ...newTicket, warrantyStatus: newStatus, warrantyPeriod: '' });
        }
      }}>
        <option value="">-- اختر --</option>
        <option value="in_warranty">✅ داخل الضمان</option>
        <option value="out_of_warranty">❌ خارج الضمان</option>
        <option value="unidentified">❔ غير معرف</option>
        <option value="repair_invoice">🧾 فاتورة اصلاح</option>
      </select>
    </div>
    {(newTicket.warrantyStatus === 'in_warranty' || newTicket.warrantyStatus === 'repair_invoice') && (
      <div>
        <label className="block text-xs font-bold mb-1">📅 فترة الضمان</label>
        <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.warrantyPeriod || ''} onChange={e => setNewTicket({...newTicket, warrantyPeriod: e.target.value})}>
          <option value="">-- اختر الفترة --</option>
          {WARRANTY_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
    )}
    <div>
      <label className="block text-xs font-bold mb-1">نوع التذكرة</label>
      <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.ticketType} onChange={e => setNewTicket({...newTicket, ticketType: e.target.value})}>
        <option value="">-- اختر --</option>
        {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">المصدر</label>
      <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.source} onChange={e => setNewTicket({...newTicket, source: e.target.value})}>
        <option value="">-- اختر --</option>
        {TICKET_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  </div>

  {/* قطع غيار */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label className="block text-xs font-bold mb-1">🛠️ قطع غيار بتكلفة</label>
      <textarea rows="3" className="w-full border p-3 rounded-xl text-sm resize-none" value={newTicket.sparePartsWithCost} onChange={e => setNewTicket({...newTicket, sparePartsWithCost: e.target.value})} placeholder="مثال:&#10;• شاشة - 500 ج&#10;• بطارية - 300 ج" />
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">🔧 قطع غيار بدون تكلفة</label>
      <textarea rows="3" className="w-full border p-3 rounded-xl text-sm resize-none" value={newTicket.sparePartsWithoutCost} onChange={e => setNewTicket({...newTicket, sparePartsWithoutCost: e.target.value})} placeholder="مثال:&#10;• سلك شحن&#10;• سماعة" />
    </div>
  </div>

  {/* التواريخ */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div>
      <label className="block text-xs font-bold mb-1">📅 تاريخ الفاتورة / الضمان</label>
      <input type="date" className="w-full border p-3 rounded-xl text-sm" value={newTicket.invoiceDate} onChange={e => setNewTicket({...newTicket, invoiceDate: e.target.value})} />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-xs font-bold mb-1">⏰ تاريخ انتهاء الصيانة</label>
        <input
          type="date"
          className="w-full border p-3 rounded-xl text-sm"
          value={newTicket.maintenanceEndDate}
          onChange={e => setNewTicket(prev => ({
            ...prev,
            maintenanceEndDate: e.target.value,
            // 🆕 لو المستخدم اختار تاريخ ولسه محددش وقت، بنسجل الوقت الفعلي
            // الحالي تلقائيًا (تقدر تعدّله يدوي بعد كده لو حبيت)
            maintenanceEndTime: e.target.value && !prev.maintenanceEndTime ? getCurrentTimeHHMM() : prev.maintenanceEndTime
          }))}
        />
      </div>
      <div>
        {/* 🆕 توقيت انتهاء الصيانة - كان موجود في البيانات بس مفيش خانة إدخال ليه */}
        <label className="block text-xs font-bold mb-1">🕐 الوقت</label>
        <input type="time" className="w-full border p-3 rounded-xl text-sm" value={newTicket.maintenanceEndTime} onChange={e => setNewTicket({...newTicket, maintenanceEndTime: e.target.value})} />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-xs font-bold mb-1">📦 تاريخ تسليم العميل</label>
        <input
          type="date"
          className="w-full border p-3 rounded-xl text-sm"
          value={newTicket.deliveryDate}
          onChange={e => setNewTicket(prev => ({
            ...prev,
            deliveryDate: e.target.value,
            deliveryTime: e.target.value && !prev.deliveryTime ? getCurrentTimeHHMM() : prev.deliveryTime
          }))}
        />
      </div>
      <div>
        {/* 🆕 توقيت تسليم العميل - كان موجود في البيانات بس مفيش خانة إدخال ليه */}
        <label className="block text-xs font-bold mb-1">🕐 الوقت</label>
        <input type="time" className="w-full border p-3 rounded-xl text-sm" value={newTicket.deliveryTime} onChange={e => setNewTicket({...newTicket, deliveryTime: e.target.value})} />
      </div>
    </div>
  </div>

  {/* الحالة والأولوية والتكلفة */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div>
      {/* 🆕 إمكانية اختيار الحالة عند الإنشاء - كانت دايمًا "إنشاء" تلقائي */}
      <label className="block text-xs font-bold mb-1">الحالة</label>
      <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.status} onChange={e => setNewTicket({...newTicket, status: e.target.value})}>
        {TICKET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">الأولوية</label>
      <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.priority} onChange={e => setNewTicket({...newTicket, priority: e.target.value})}>
        <option value="low">منخفضة</option>
        <option value="medium">متوسطة</option>
        <option value="high">عالية</option>
      </select>
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">التكلفة التقديرية</label>
      <input type="number" min="0" className="w-full border p-3 rounded-xl text-sm text-center" value={newTicket.estimatedCost} onChange={e => setNewTicket({...newTicket, estimatedCost: Number(e.target.value)})} />
    </div>
  </div>

  {/* تعيين مسؤولين */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div>
      <label className="block text-xs font-bold mb-1">الفني المختص</label>
      <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.assignedTechnician} onChange={e => setNewTicket({...newTicket, assignedTechnician: e.target.value})}>
        <option value="">-- غير محدد --</option>
        {(systemSettings?.technicians || []).map((tech, idx) => <option key={idx} value={tech}>{tech}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">مركز الصيانة</label>
      <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.assignedMaintenanceCenter} onChange={e => setNewTicket({...newTicket, assignedMaintenanceCenter: e.target.value})}>
        <option value="">-- غير محدد --</option>
        {(systemSettings?.maintenanceCenters || []).map(center => (
          <option key={typeof center === 'string' ? center : center.value} value={typeof center === 'string' ? center : center.name}>
            {typeof center === 'string' ? center : center.name}
          </option>
        ))}
      </select>
    </div>
    <div>
      <label className="block text-xs font-bold mb-1">الكول سنتر</label>
      <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.assignedCallCenter} onChange={e => setNewTicket({...newTicket, assignedCallCenter: e.target.value})}>
        <option value="">-- غير محدد --</option>
        {callCenters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
      </select>
    </div>
  </div>

  {/* الوسوم */}
  <div>
    <label className="block text-xs font-bold mb-1">الوسوم</label>
    <input className="w-full border p-3 rounded-xl text-sm" value={newTicket.tags?.join(', ')} onChange={e => setNewTicket({...newTicket, tags: e.target.value.split(',').map(t => t.trim())})} placeholder="وسم1, وسم2" />
  </div>

  {/* ===== ✅ قسم Follow up Callcenter ===== */}
  <div className="border-t-2 border-teal-200 dark:border-teal-800 pt-4 mt-4">
    <h4 className="font-black text-lg text-teal-700 dark:text-teal-300 mb-4 flex items-center gap-2">
      <Headphones size={20} className="text-teal-600" />
      📋 Follow up Callcenter
    </h4>
    
    <div className="space-y-4">
      {/* السؤال 1 */}
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
        <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
          1- سهولة الوصول الى الشركة
        </label>
        <div className="flex flex-wrap gap-2">
          {[1,2,3,4,5,6,7,8,9,10].map(num => (
            <label key={num} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="accessibility"
                value={num}
                checked={newTicket.followUp?.accessibility === num}
                onChange={(e) => setNewTicket({
                  ...newTicket,
                  followUp: {
                    ...newTicket.followUp,
                    accessibility: Number(e.target.value)
                  }
                })}
                className="w-4 h-4 accent-teal-600"
              />
              <span className="text-xs font-bold">{num}</span>
            </label>
          ))}
        </div>
      </div>
      
      {/* السؤال 2 */}
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
        <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
          2- تقييم وقت الصيانة
        </label>
        <div className="flex flex-wrap gap-2">
          {[1,2,3,4,5,6,7,8,9,10].map(num => (
            <label key={num} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="maintenanceTime"
                value={num}
                checked={newTicket.followUp?.maintenanceTime === num}
                onChange={(e) => setNewTicket({
                  ...newTicket,
                  followUp: {
                    ...newTicket.followUp,
                    maintenanceTime: Number(e.target.value)
                  }
                })}
                className="w-4 h-4 accent-teal-600"
              />
              <span className="text-xs font-bold">{num}</span>
            </label>
          ))}
        </div>
      </div>
      
      {/* السؤال 3 */}
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
        <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
          3- التعامل داخل مركز الصيانة
        </label>
        <div className="flex flex-wrap gap-2">
          {[1,2,3,4,5,6,7,8,9,10].map(num => (
            <label key={num} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="centerDealing"
                value={num}
                checked={newTicket.followUp?.centerDealing === num}
                onChange={(e) => setNewTicket({
                  ...newTicket,
                  followUp: {
                    ...newTicket.followUp,
                    centerDealing: Number(e.target.value)
                  }
                })}
                className="w-4 h-4 accent-teal-600"
              />
              <span className="text-xs font-bold">{num}</span>
            </label>
          ))}
        </div>
      </div>
      
      {/* السؤال 4 */}
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
        <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
          4- سهولة اجراءات التسليم و الاستلام
        </label>
        <div className="flex flex-wrap gap-2">
          {[1,2,3,4,5,6,7,8,9,10].map(num => (
            <label key={num} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="deliveryProcedures"
                value={num}
                checked={newTicket.followUp?.deliveryProcedures === num}
                onChange={(e) => setNewTicket({
                  ...newTicket,
                  followUp: {
                    ...newTicket.followUp,
                    deliveryProcedures: Number(e.target.value)
                  }
                })}
                className="w-4 h-4 accent-teal-600"
              />
              <span className="text-xs font-bold">{num}</span>
            </label>
          ))}
        </div>
      </div>
      
      {/* السؤال 5 */}
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
        <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
          5- حضرتك ممكن تشتري منتجات نوفال مرة اخرى ؟
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="repurchase"
              value="yes"
              checked={newTicket.followUp?.repurchase === 'yes'}
              onChange={(e) => setNewTicket({
                ...newTicket,
                followUp: {
                  ...newTicket.followUp,
                  repurchase: e.target.value
                }
              })}
              className="w-4 h-4 accent-emerald-600"
            />
            <span className="font-bold text-emerald-600">✅ نعم</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="repurchase"
              value="no"
              checked={newTicket.followUp?.repurchase === 'no'}
              onChange={(e) => setNewTicket({
                ...newTicket,
                followUp: {
                  ...newTicket.followUp,
                  repurchase: e.target.value
                }
              })}
              className="w-4 h-4 accent-rose-600"
            />
            <span className="font-bold text-rose-600">❌ لا</span>
          </label>
        </div>
      </div>
      
      {/* ملاحظات التقييم */}
      <div>
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
          📝 ملاحظات إضافية عن التقييم
        </label>
        <textarea
          rows="2"
          className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm resize-none bg-white dark:bg-slate-900"
          value={newTicket.followUpNotes || ''}
          onChange={(e) => setNewTicket({...newTicket, followUpNotes: e.target.value})}
          placeholder="أي ملاحظات إضافية عن تجربة العميل..."
        />
      </div>
    </div>
  </div>

  {/* الأزرار */}
  <div className="flex gap-3 pt-4 border-t">
    <button type="submit" className="flex-1 bg-teal-600 text-white py-3.5 rounded-xl font-bold hover:bg-teal-700 transition-colors flex items-center justify-center gap-2">
      <Save size={18}/> إنشاء التذكرة
    </button>
    <button type="button" onClick={() => setShowAddModal(false)} className="px-6 bg-slate-100 dark:bg-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-colors">
      إلغاء
    </button>
  </div>


              
            </form>
          </div>
          </div>

      )}

      {/* ===== مودال فتح التذكرة كاملة ===== */}
      {showFullTicketModal && fullTicketView && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] w-full max-w-5xl shadow-2xl max-h-[95vh] overflow-y-auto custom-scrollbar">
            <div className="sticky top-0 bg-teal-600 p-6 rounded-t-[1.5rem] z-10 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-white/80 text-sm font-mono">#{fullTicketView.ticketNumber}</span>
                    <StatusSelectComp value={fullTicketView.status} onChange={handleUpdateStatus} ticketId={fullTicketView.id} />
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      fullTicketView.priority === 'high' ? 'bg-rose-500 text-white' : 
                      fullTicketView.priority === 'medium' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                    }`}>
                      {fullTicketView.priority === 'high' ? 'عالية' : fullTicketView.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black">{fullTicketView.customerName}</h2>
                </div>
                <button onClick={() => setShowFullTicketModal(false)} className="text-white/70 hover:text-white">
                  <X size={24}/>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
  {/* معلومات العميل */}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">رقم الهاتف</label>
      <p className="font-bold font-mono" dir="ltr">{fullTicketView.customerPhone}</p>
    </div>
    {fullTicketView.secondPhone && (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
        <label className="text-xs text-slate-500 block mb-1">رقم ثاني</label>
        <p className="font-bold font-mono" dir="ltr">{fullTicketView.secondPhone}</p>
      </div>
    )}
    {fullTicketView.landline && (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
        <label className="text-xs text-slate-500 block mb-1">أرضي</label>
        <p className="font-bold font-mono" dir="ltr">{fullTicketView.landline}</p>
      </div>
    )}
    {fullTicketView.customerEmail && (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
        <label className="text-xs text-slate-500 block mb-1">البريد</label>
        <p className="font-bold text-sm">{fullTicketView.customerEmail}</p>
      </div>
    )}
  </div>

  {/* الجهاز والضمان */}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">الجهاز</label>
      <p className="font-bold">{fullTicketView.device || '-'}</p>
    </div>
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">الموديل</label>
      <p className="font-bold">{fullTicketView.deviceModel || '-'}</p>
    </div>
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">السيريال</label>
      <p className="font-bold font-mono">{fullTicketView.deviceSerial || '-'}</p>
    </div>
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">الضمان</label>
      <p className="font-bold">{WARRANTY_OPTIONS.find(w => w.value === fullTicketView.warrantyStatus)?.label || '-'}</p>
    </div>
    {fullTicketView.productCode && (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
        <label className="text-xs text-slate-500 block mb-1">كود المنتج</label>
        <p className="font-bold font-mono">{fullTicketView.productCode}</p>
      </div>
    )}
  </div>

  {/* النوع والمصدر والفرع */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">نوع التذكرة</label>
      <p className="font-bold">{TICKET_TYPES.find(t => t.value === fullTicketView.ticketType)?.label || '-'}</p>
    </div>
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">المصدر</label>
      <p className="font-bold">{TICKET_SOURCES.find(s => s.value === fullTicketView.source)?.label || '-'}</p>
    </div>
  </div>

  {/* العنوان والمشكلة */}
  {fullTicketView.customerAddress && (
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">العنوان</label>
      <p className="font-bold">{fullTicketView.customerAddress}</p>
    </div>
  )}
  
  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
    <label className="text-xs text-slate-500 block mb-1">المشكلة</label>
    <p className="font-bold">{fullTicketView.issue || '-'}</p>
  </div>

  {/* 🆕 أكواد الأعطال (الأساسي + الإضافية لو موجودة) */}
  {(fullTicketView.mainFaultCode || (fullTicketView.additionalFaults || []).length > 0) && (
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-2">أكواد الأعطال</label>
      <div className="space-y-1.5">
        {fullTicketView.mainFaultCode && (
          <div className="text-sm font-bold bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-2">
            {fullTicketView.mainFaultCode} - {fullTicketView.subFaultCode} ({fullTicketView.subFaultDescription})
          </div>
        )}
        {(fullTicketView.additionalFaults || []).map((f, idx) => (
          <div key={idx} className="text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
            {f.mainFaultCode} - {f.subFaultCode} ({f.subFaultDescription})
          </div>
        ))}
      </div>
    </div>
  )}

  {/* المسؤولون */}
  <div className="grid grid-cols-3 gap-3">
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">الفني</label>
      <p className="font-bold">{fullTicketView.assignedTechnician || '-'}</p>
    </div>
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">مركز الصيانة</label>
      <p className="font-bold">{fullTicketView.assignedMaintenanceCenter || '-'}</p>
    </div>
    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
      <label className="text-xs text-slate-500 block mb-1">الكول سنتر</label>
      <p className="font-bold">{fullTicketView.assignedCallCenter || '-'}</p>
    </div>
  </div>

  {/* المبالغ */}
  <div className="grid grid-cols-4 gap-3 text-center">
    <div className="bg-teal-50 dark:bg-teal-900/30 p-3 rounded-xl">
      <label className="text-xs block mb-1">التكلفة</label>
      <p className="font-black text-lg">{(fullTicketView.totalCost || fullTicketView.estimatedCost || 0).toLocaleString()} ج</p>
    </div>
    <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl">
      <label className="text-xs block mb-1">المدفوع</label>
      <p className="font-black text-lg">{(fullTicketView.totalPaid || 0).toLocaleString()} ج</p>
    </div>
    <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl">
      <label className="text-xs block mb-1">المتبقي</label>
      <p className="font-black text-lg">{((fullTicketView.totalCost || 0) - (fullTicketView.totalPaid || 0)).toLocaleString()} ج</p>
    </div>
    <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-xl">
      <label className="text-xs block mb-1">قطع الغيار</label>
      <p className="font-black text-lg">{(fullTicketView.spareParts || []).length}</p>
    </div>
  </div>

  {/* قطع غيار */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {fullTicketView.sparePartsWithCost && (
      <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
        <label className="text-xs text-amber-600 dark:text-amber-400 block mb-1 font-bold">🛠️ قطع غيار بتكلفة</label>
        <p className="text-sm whitespace-pre-wrap font-bold">{fullTicketView.sparePartsWithCost}</p>
      </div>
    )}
    {fullTicketView.sparePartsWithoutCost && (
      <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-xl border border-green-200 dark:border-green-800">
        <label className="text-xs text-green-600 dark:text-green-400 block mb-1 font-bold">🔧 قطع غيار بدون تكلفة</label>
        <p className="text-sm whitespace-pre-wrap font-bold">{fullTicketView.sparePartsWithoutCost}</p>
      </div>
    )}
  </div>

  {/* التواريخ */}
  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
    {fullTicketView.invoiceDate && (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
        <label className="text-xs text-slate-500 block mb-1 font-bold">📅 تاريخ الفاتورة</label>
        <p className="font-bold">{formatDateOnly(fullTicketView.invoiceDate)}</p>
      </div>
    )}
    {(fullTicketView.maintenanceEndDate || fullTicketView.maintenanceEndTime) && (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
        <label className="text-xs text-slate-500 block mb-1 font-bold">⏰ توقيت انتهاء الصيانة</label>
        <p className="font-bold">
          {fullTicketView.maintenanceEndDate ? formatDateOnly(fullTicketView.maintenanceEndDate) : '-'}
          {fullTicketView.maintenanceEndTime ? ` - ${fullTicketView.maintenanceEndTime}` : ''}
        </p>
      </div>
    )}
    {(fullTicketView.deliveryDate || fullTicketView.deliveryTime) && (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
        <label className="text-xs text-slate-500 block mb-1 font-bold">📦 توقيت تسليم العميل</label>
        <p className="font-bold">
          {fullTicketView.deliveryDate ? formatDateOnly(fullTicketView.deliveryDate) : '-'}
          {fullTicketView.deliveryTime ? ` - ${fullTicketView.deliveryTime}` : ''}
        </p>
      </div>
    )}
  </div>

  {/* ===== ✅ قسم Follow up Callcenter - عرض ===== */}
  {(fullTicketView.followUp?.accessibility > 0 || 
    fullTicketView.followUp?.maintenanceTime > 0 || 
    fullTicketView.followUp?.centerDealing > 0 || 
    fullTicketView.followUp?.deliveryProcedures > 0 || 
    fullTicketView.followUp?.repurchase) && (
    
    <div className="border-t-2 border-teal-200 dark:border-teal-800 pt-4 mt-4">
      <h4 className="font-black text-lg text-teal-700 dark:text-teal-300 mb-4 flex items-center gap-2">
        <Headphones size={20} className="text-teal-600" />
        📋 تقييم خدمة العملاء (Follow up)
      </h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* السؤال 1 */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">سهولة الوصول الى الشركة</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
              {fullTicketView.followUp?.accessibility || 0}
            </span>
            <span className="text-sm text-slate-500">/ 10</span>
            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full ml-2">
              <div 
                className="h-2 bg-teal-600 rounded-full transition-all"
                style={{ width: `${((fullTicketView.followUp?.accessibility || 0) / 10) * 100}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* السؤال 2 */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">تقييم وقت الصيانة</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
              {fullTicketView.followUp?.maintenanceTime || 0}
            </span>
            <span className="text-sm text-slate-500">/ 10</span>
            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full ml-2">
              <div 
                className="h-2 bg-teal-600 rounded-full transition-all"
                style={{ width: `${((fullTicketView.followUp?.maintenanceTime || 0) / 10) * 100}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* السؤال 3 */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">التعامل داخل مركز الصيانة</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
              {fullTicketView.followUp?.centerDealing || 0}
            </span>
            <span className="text-sm text-slate-500">/ 10</span>
            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full ml-2">
              <div 
                className="h-2 bg-teal-600 rounded-full transition-all"
                style={{ width: `${((fullTicketView.followUp?.centerDealing || 0) / 10) * 100}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* السؤال 4 */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">سهولة اجراءات التسليم والاستلام</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
              {fullTicketView.followUp?.deliveryProcedures || 0}
            </span>
            <span className="text-sm text-slate-500">/ 10</span>
            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full ml-2">
              <div 
                className="h-2 bg-teal-600 rounded-full transition-all"
                style={{ width: `${((fullTicketView.followUp?.deliveryProcedures || 0) / 10) * 100}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* السؤال 5 */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl md:col-span-2">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">شراء منتجات نوفال مرة أخرى</p>
          <div className="flex items-center gap-4">
            <span className={`text-xl font-black ${fullTicketView.followUp?.repurchase === 'yes' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {fullTicketView.followUp?.repurchase === 'yes' ? '✅ نعم' : 
               fullTicketView.followUp?.repurchase === 'no' ? '❌ لا' : 'لم يتم التقييم'}
            </span>
          </div>
        </div>
        
        {/* ملاحظات */}
        {fullTicketView.followUpNotes && (
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl md:col-span-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">📝 ملاحظات التقييم</p>
            <p className="font-bold text-sm">{fullTicketView.followUpNotes}</p>
          </div>
        )}
        
        {/* معلومات التقييم */}
        {(fullTicketView.followUpBy || fullTicketView.followUpDate) && (
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl md:col-span-2">
            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              {fullTicketView.followUpBy && (
                <p>👤 تم التقييم بواسطة: <span className="font-bold text-slate-700">{fullTicketView.followUpBy}</span></p>
              )}
              {fullTicketView.followUpDate && (
                <p>📅 تاريخ التقييم: <span className="font-bold text-slate-700">{formatDate(fullTicketView.followUpDate)}</span></p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )}

  {/* 🆕 الملاحظات العامة - كانت موجودة بس مش ظاهرة إلا لو فتحت وضع التعديل */}
  {fullTicketView.notes && (
    <div className="border rounded-xl p-4 bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
      <h3 className="font-bold mb-2 flex items-center gap-2 text-amber-800 dark:text-amber-300">
        <FileTextIcon size={18}/> ملاحظات
      </h3>
      <p className="text-sm whitespace-pre-wrap">{fullTicketView.notes}</p>
    </div>
  )}

  {/* التعليقات */}
  <div className="border rounded-xl p-4">
    <h3 className="font-bold mb-3 flex items-center gap-2">
      <MessageSquare size={18} className="text-teal-600"/> التعليقات ({ticketComments.length})
    </h3>
    <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
      {ticketComments.map(comment => (
        <div key={comment.id} className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg">
          {editingCommentId === comment.id ? (
            <div className="flex gap-2">
              <input className="flex-1 border p-2 rounded-lg text-sm" value={editingCommentText} onChange={e => setEditingCommentText(e.target.value)} />
              <button onClick={() => editComment(comment.id)} className="px-3 py-1 bg-teal-600 text-white rounded text-xs">حفظ</button>
              <button onClick={() => { setEditingCommentId(null); setEditingCommentText(''); }} className="px-3 py-1 bg-slate-200 rounded text-xs">إلغاء</button>
            </div>
          ) : (
            <div>
              <p className="text-sm">{comment.text}</p>
              <div className="flex justify-between items-center mt-2">
                <div>
                  <span className="text-xs text-slate-500">{comment.createdBy}</span>
                  <span className="text-xs text-slate-400 mx-2">•</span>
                  <span className="text-xs text-slate-400">{new Date(comment.createdAt).toLocaleString('ar-EG')}</span>
                  {comment.editedAt && <span className="text-xs text-amber-500 mr-2">(معدل)</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.text); }} className="text-xs text-teal-500">تعديل</button>
                  <button onClick={() => deleteComment(comment.id)} className="text-xs text-rose-500">حذف</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
    <div className="flex gap-2">
      <input className="flex-1 border p-2 rounded-lg text-sm" placeholder="أضف تعليقاً..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment(); }} />
      <button onClick={addComment} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold">إضافة</button>
    </div>
  </div>

  {/* ✨ ميزة جديدة: عرض الفاتورة المرتبطة بالتذكرة (لو موجودة) */}
  {fullTicketView.linkedInvoiceNumber && (
    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex items-center gap-2">
      <LinkIcon size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0"/>
      <span className="text-emerald-700 dark:text-emerald-300 text-sm font-bold">
        مرتبطة بالفاتورة #{fullTicketView.linkedInvoiceNumber}
      </span>
    </div>
  )}

  {/* أزرار الإجراءات */}
  <div className="flex flex-wrap gap-2 pt-4 border-t">
    <button onClick={() => { setSelectedTicket(fullTicketView); setShowAssignModal(true); }} className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm font-bold">
      <Users size={14} className="inline ml-1"/> تعيين مسؤولين
    </button>
    {/* 🛠️ FIX (باگ حقيقي): مودال قطع الغيار كان موجود بالكامل في الكود
        (جدول + بحث + إضافة) بس مفيش أي زرار في كل الملف بيفتحه خالص -
        يعني الميزة كانت موجودة تقنيًا لكن مستحيل توصلها من الواجهة. */}
    <button onClick={() => { setSelectedTicket(fullTicketView); setShowSparePartsModal(true); }} className="px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg text-sm font-bold">
      <Package size={14} className="inline ml-1"/> قطع الغيار {(fullTicketView.spareParts || []).length > 0 && `(${fullTicketView.spareParts.length})`}
    </button>
    <button onClick={() => { openEditModal(fullTicketView); setShowFullTicketModal(false); }} className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-bold">
      <Edit size={14} className="inline ml-1"/> تعديل التذكرة
    </button>
    <button onClick={() => handleGenerateInvoice(fullTicketView)} className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-bold">
      <Receipt size={14} className="inline ml-1"/> {fullTicketView.linkedInvoiceNumber ? 'إنشاء فاتورة أخرى' : 'إنشاء فاتورة'}
    </button>
    <button onClick={() => window.print()} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-bold">
      <Printer size={14} className="inline ml-1"/> طباعة
    </button>
    <button onClick={() => setShowFullTicketModal(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-bold">
      إغلاق
    </button>
  </div>

  <div className="text-xs text-slate-400 space-y-1 border-t pt-4">
    <p>تاريخ الإنشاء: {formatDate(fullTicketView.createdAt)}</p>
    <p>آخر تحديث: {formatDate(fullTicketView.updatedAt)}</p>
    <p>تم الإنشاء بواسطة: {fullTicketView.createdByName}</p>
    <p>المركز: {warehouseMap?.[fullTicketView.assignedCenter] || fullTicketView.assignedCenter}</p>
  </div>
</div>
          </div>
        </div>
      )}

      {/* ===== مودال تعيين مسؤولين ===== */}
      {showAssignModal && selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white">تعيين مسؤولين للتذكرة #{selectedTicket.ticketNumber}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">الفني</label>
                <select className="w-full border p-3 rounded-xl bg-white dark:bg-slate-900 font-bold" value={assignData.technician} onChange={e => setAssignData({...assignData, technician: e.target.value})}>
                  <option value="">-- اختر --</option>
                  {technicians.map((tech, idx) => <option key={idx} value={tech}>{tech}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">مركز الصيانة</label>
                <select className="w-full border p-3 rounded-xl bg-white dark:bg-slate-900 font-bold" value={assignData.center} onChange={e => setAssignData({...assignData, center: e.target.value})}>
                  <option value="">-- اختر --</option>
                  {maintenanceCenters.map(center => <option key={center.id} value={center.name}>{center.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">الكول سنتر</label>
                <select className="w-full border p-3 rounded-xl bg-white dark:bg-slate-900 font-bold" value={assignData.callCenter} onChange={e => setAssignData({...assignData, callCenter: e.target.value})}>
                  <option value="">-- اختر --</option>
                  {callCenters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button onClick={() => handleAssign(selectedTicket.id)} className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold">حفظ</button>
                <button onClick={() => { setShowAssignModal(false); setAssignData({ technician: '', center: '', callCenter: '' }); }} className="flex-1 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال قطع الغيار ===== */}
      {showSparePartsModal && selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl">قطع غيار التذكرة #{selectedTicket.ticketNumber}</h3>
              <button onClick={() => setShowSparePartsModal(false)} className="hover:text-rose-600"><X size={24}/></button>
            </div>
            <div className="space-y-6">
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="p-3">القطعة</th>
                      <th className="p-3 text-center">الكمية</th>
                      <th className="p-3 text-center">السعر</th>
                      <th className="p-3 text-center">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(selectedTicket.spareParts || []).map((p, i) => (
                      <tr key={i}>
                        <td className="p-3 font-bold">{p.name}</td>
                        <td className="p-3 text-center">{p.quantity}</td>
                        <td className="p-3 text-center">{p.price} ج</td>
                        <td className="p-3 text-center font-black">{p.quantity * p.price} ج</td>
                      </tr>
                    ))}
                    {(selectedTicket.spareParts || []).length === 0 && (
                      <tr>
                        <td colSpan="4" className="p-6 text-center text-slate-400">لا توجد قطع غيار</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                <h4 className="font-bold mb-3">إضافة قطعة غيار من المخزون</h4>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border p-2.5 rounded-lg text-sm bg-white dark:bg-slate-900"
                    placeholder="ابحث بالاسم أو السيريال..."
                    value={sparePartSearch}
                    onChange={e => setSparePartSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchSparePart(); } }}
                  />
                  <button type="button" onClick={() => handleSearchSparePart()} className="bg-teal-600 text-white px-4 rounded-lg font-bold text-sm flex items-center gap-1">
                    {searchingSpareParts ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>} بحث
                  </button>
                </div>

                {sparePartResults.length > 0 && (
                  <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-700 max-h-48 overflow-y-auto">
                    {sparePartResults.map(item => (
                      <button
                        key={item.id}
                        onClick={() => {
                          handleAddSparePart(selectedTicket.id, {
                            id: item.id,
                            serialNumber: item.serialNumber,
                            name: item.name,
                            quantity: 1,
                            price: Number(item.price) || 0,
                          });
                          setSparePartResults([]);
                          setSparePartSearch('');
                        }}
                        className="w-full text-right px-3 py-2 hover:bg-teal-50 dark:hover:bg-teal-900/30 flex items-center justify-between gap-2 bg-white dark:bg-slate-900"
                      >
                        <div>
                          <p className="font-bold text-sm">{item.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{item.serialNumber} - متاح: {item.quantity}</p>
                        </div>
                        <span className="text-xs font-bold text-teal-600">{item.price} ج</span>
                      </button>
                    ))}
                  </div>
                )}
                {sparePartResults.length === 0 && sparePartSearch && !searchingSpareParts && (
                  <p className="text-xs text-slate-400 mt-2">جرب البحث بجزء من الاسم أو السيريال</p>
                )}

                {/* 🆕 بديل يدوي لو القطعة مش موجودة أصلاً في المخزون (اتجابت خصيصًا مثلاً) */}
                <details className="mt-3">
                  <summary className="text-xs font-bold text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
                    القطعة مش موجودة في المخزون؟ أضفها يدويًا
                  </summary>
                  <div className="grid grid-cols-4 gap-3 mt-2">
                    <input className="col-span-2 border p-2 rounded-lg text-sm bg-white dark:bg-slate-900" placeholder="اسم القطعة" id="partName" />
                    <input type="number" className="border p-2 rounded-lg text-sm bg-white dark:bg-slate-900" placeholder="الكمية" id="partQty" defaultValue="1" />
                    <input type="number" className="border p-2 rounded-lg text-sm bg-white dark:bg-slate-900" placeholder="السعر" id="partPrice" />
                  </div>
                  <button onClick={() => {
                    const name = document.getElementById('partName').value;
                    const qty = parseInt(document.getElementById('partQty').value) || 1;
                    const price = parseFloat(document.getElementById('partPrice').value) || 0;
                    if (!name) return showError("يرجى إدخال اسم القطعة");
                    handleAddSparePart(selectedTicket.id, { name, quantity: qty, price });
                    document.getElementById('partName').value = '';
                    document.getElementById('partPrice').value = '';
                  }} className="mt-2 w-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white py-2 rounded-lg font-bold text-sm">إضافة يدوية (بدون ربط بالمخزون)</button>
                </details>
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                <h4 className="font-bold mb-3">إضافة دفعة</h4>
                <div className="flex gap-3">
                  <input type="number" className="flex-1 border p-2 rounded-lg text-sm bg-white dark:bg-slate-900" placeholder="المبلغ" id="paymentAmount" />
                  <button onClick={() => {
                    const amount = parseFloat(document.getElementById('paymentAmount').value);
                    if (!amount || amount <= 0) return showError("مبلغ غير صحيح");
                    handleAddPayment(selectedTicket.id, amount);
                    document.getElementById('paymentAmount').value = '';
                  }} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold text-sm">إضافة</button>
                </div>
              </div>
              
              <button onClick={() => setShowSparePartsModal(false)} className="w-full bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال سجل التذكرة ===== */}
      {showHistoryModal && selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl">سجل التذكرة #{selectedTicket.ticketNumber}</h3>
              <button onClick={() => setShowHistoryModal(false)} className="hover:text-rose-600"><X size={24}/></button>
            </div>
            <div className="space-y-4">
              {ticketHistory.map((event, idx) => (
                <div key={idx} className="relative pr-6 pb-4 border-r-2 border-teal-200 dark:border-teal-800 last:border-0">
                  <div className="absolute right-[-5px] top-0 w-3 h-3 rounded-full bg-teal-600"></div>
                  <p className="text-xs text-slate-400">{formatDate(event.timestamp)}</p>
                  <p className="font-bold">{event.action}</p>
                  {event.details && <p className="text-sm text-slate-600">{event.details}</p>}
                  <p className="text-xs text-teal-500 mt-1">بواسطة: {event.by}</p>
                </div>
              ))}
              {ticketHistory.length === 0 && <p className="text-center text-slate-400 py-8">لا يوجد سجل</p>}
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال الحذف المجمع ===== */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <Trash2 size={20}/> حذف مجمع للتذاكر
            </h3>
            <p className="text-sm mb-4">حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> تذكرة بشكل نهائي</p>
            <input className="w-full border p-3 rounded-xl font-bold mb-4 bg-white dark:bg-slate-900" placeholder="اكتب 'حذف' للتأكيد" value={bulkDeleteConfirm} onChange={e => setBulkDeleteConfirm(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={handleBulkDelete} disabled={bulkDeleteConfirm !== 'حذف'} className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold disabled:opacity-50">تأكيد</button>
              <button onClick={() => { setShowBulkDeleteModal(false); setBulkDeleteConfirm(''); }} className="flex-1 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال تعديل التذكرة ===== */}
      {editingTicket && (appUser.permissions?.editTicket || appUser.role === 'admin') && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.75rem] w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">

            {/* ===== رأس المودال ===== */}
            <div className="relative bg-teal-600 px-6 py-5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3 text-white">
                <div className="bg-white/15 p-2.5 rounded-xl">
                  <Edit2 size={22} />
                </div>
                <div>
                  <h3 className="font-black text-lg leading-tight">تعديل التذكرة</h3>
                  <p className="text-teal-100 text-xs font-mono mt-0.5" dir="ltr">#{editingTicket.ticketNumber}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-white`}>
                  {TICKET_STATUSES.find(s => s.value === editFormData.status)?.label || editFormData.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingTicket(null)}
                className="bg-white/10 hover:bg-white/25 text-white p-2 rounded-xl transition-colors"
              >
                <X size={20}/>
              </button>
            </div>

            <form onSubmit={handleUpdateTicket} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 space-y-5 bg-slate-50 dark:bg-slate-900/40">

              {/* ===== قسم: بيانات العميل ===== */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-teal-50/60 dark:bg-teal-900/20 border-b border-slate-100 dark:border-slate-700">
                  <User size={16} className="text-teal-600 dark:text-teal-400" />
                  <h4 className="font-black text-sm text-teal-700 dark:text-teal-300">بيانات العميل</h4>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">اسم العميل *</label>
                    <input required className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.customerName} onChange={e => setEditFormData({ ...editFormData, customerName: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">رقم الهاتف *</label>
                    <input required className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold font-mono outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.customerPhone} onChange={e => setEditFormData({ ...editFormData, customerPhone: e.target.value })} dir="ltr" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">رقم ثاني</label>
                    <input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold font-mono outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.secondPhone} onChange={e => setEditFormData({ ...editFormData, secondPhone: e.target.value })} dir="ltr" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">تليفون أرضي</label>
                    <input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold font-mono outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.landline} onChange={e => setEditFormData({ ...editFormData, landline: e.target.value })} dir="ltr" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">البريد الإلكتروني</label>
                    <input type="email" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.customerEmail} onChange={e => setEditFormData({ ...editFormData, customerEmail: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">العنوان</label>
                    <input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.customerAddress} onChange={e => setEditFormData({ ...editFormData, customerAddress: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">المحافظة</label>
                    <select className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.governorate} onChange={e => setEditFormData({ ...editFormData, governorate: e.target.value })}>
                      <option value="">-- اختر --</option>
                      {EGYPT_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">المدينة</label>
                    <input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.city} onChange={e => setEditFormData({ ...editFormData, city: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* ===== قسم: بيانات الجهاز والعطل ===== */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-amber-50/60 dark:bg-amber-900/20 border-b border-slate-100 dark:border-slate-700">
                  <WrenchIcon size={16} className="text-amber-600 dark:text-amber-400" />
                  <h4 className="font-black text-sm text-amber-700 dark:text-amber-300">بيانات الجهاز والعطل</h4>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الجهاز</label>
                      <input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.device} onChange={e => setEditFormData({ ...editFormData, device: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الموديل</label>
                      <input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.deviceModel} onChange={e => setEditFormData({ ...editFormData, deviceModel: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">السيريال</label>
                      <input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold font-mono outline-none focus:border-amber-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.deviceSerial} onChange={e => setEditFormData({ ...editFormData, deviceSerial: e.target.value })} />
                    </div>
                    <div>
                      {/* 🆕 كود المنتج - كان بيتعبى من شيت أكواد الأعطال بس مش ظاهر
                          في التذكرة، اختياري وقابل للتعديل اليدوي دلوقتي */}
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">كود المنتج <span className="text-slate-400 font-normal">(اختياري)</span></label>
                      <input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold font-mono outline-none focus:border-amber-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.productCode || ''} onChange={e => setEditFormData({ ...editFormData, productCode: e.target.value })} />
                    </div>
                  </div>

                  {/* 🆕 اختيار أكواد الأعطال بنفس طريقة إنشاء التذكرة (قوائم مرتبطة) -
                      كانت غير موجودة خالص عند التعديل قبل كده */}
                  <div className="bg-amber-50/40 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/40 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">اختيار كود العطل (قوائم مرتبطة)</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">المنتج</label>
                        <input
                          className="w-full border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900"
                          list="edit-products-datalist"
                          value={editProductSearchInput}
                          placeholder="اكتب اسم المنتج..."
                          onChange={e => {
                            setEditProductSearchInput(e.target.value);
                            const matched = products.find(p => p.name === e.target.value);
                            setEditSelectedModelId('');
                            setEditSelectedMainFaultId('');
                            setEditSelectedSubFaultId('');
                            setEditSelectedProductId(matched ? matched.id : '');
                          }}
                        />
                        <datalist id="edit-products-datalist">
                          {products.map(p => <option key={p.id} value={p.name} />)}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">الموديل</label>
                        <select className="w-full border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900 disabled:opacity-50" value={editSelectedModelId} onChange={e => {
                          setEditSelectedModelId(e.target.value);
                          setEditSelectedMainFaultId('');
                          setEditSelectedSubFaultId('');
                          const model = editModels.find(m => m.id === e.target.value);
                          if (model) setEditFormData(prev => ({ ...prev, deviceModel: model.name }));
                        }} disabled={!editSelectedProductId}>
                          <option value="">-- اختر الموديل --</option>
                          {editModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">كود العطل الرئيسي</label>
                        <select className="w-full border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900 disabled:opacity-50" value={editSelectedMainFaultId} onChange={e => {
                          setEditSelectedMainFaultId(e.target.value);
                          setEditSelectedSubFaultId('');
                        }} disabled={!editSelectedModelId}>
                          <option value="">-- اختر الكود الرئيسي --</option>
                          {editMainFaults.map(f => <option key={f.id} value={f.id}>{f.code} - {f.description}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">كود العطل الفرعي</label>
                        <select className="w-full border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900 disabled:opacity-50" value={editSelectedSubFaultId} onChange={e => handleEditSelectSubFault(e.target.value)} disabled={!editSelectedMainFaultId}>
                          <option value="">-- اختر الكود الفرعي --</option>
                          {editSubFaults.map(f => <option key={f.id} value={f.id}>{f.code} - {f.description}</option>)}
                        </select>
                      </div>
                    </div>
                    {editFormData.mainFaultCode && (
                      <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg p-2 text-xs">
                        <span className="font-bold">الكود الحالي:</span> {editFormData.mainFaultCode} - {editFormData.subFaultCode} ({editFormData.subFaultDescription})
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">المشكلة</label>
                    <textarea rows="2" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-amber-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 resize-none" value={editFormData.issue} onChange={e => setEditFormData({ ...editFormData, issue: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* ===== قسم: قطع الغيار ===== */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-emerald-50/60 dark:bg-emerald-900/20 border-b border-slate-100 dark:border-slate-700">
                  <Package size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <h4 className="font-black text-sm text-emerald-700 dark:text-emerald-300">قطع الغيار</h4>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">🛠️ قطع غيار بتكلفة</label>
                    <textarea rows="3" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 resize-none" value={editFormData.sparePartsWithCost} onChange={e => setEditFormData({...editFormData, sparePartsWithCost: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">🔧 قطع غيار بدون تكلفة</label>
                    <textarea rows="3" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 resize-none" value={editFormData.sparePartsWithoutCost} onChange={e => setEditFormData({...editFormData, sparePartsWithoutCost: e.target.value})} />
                  </div>
                </div>
              </div>

              {/* ===== قسم: التواريخ ===== */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-sky-50/60 dark:bg-sky-900/20 border-b border-slate-100 dark:border-slate-700">
                  <CalendarDays size={16} className="text-sky-600 dark:text-sky-400" />
                  <h4 className="font-black text-sm text-sky-700 dark:text-sky-300">التواريخ</h4>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">📅 تاريخ الفاتورة</label>
                    <input type="date" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-sky-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.invoiceDate} onChange={e => setEditFormData({...editFormData, invoiceDate: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">⏰ انتهاء الصيانة</label>
                      <input
                        type="date"
                        className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-sky-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                        value={editFormData.maintenanceEndDate}
                        onChange={e => setEditFormData(prev => ({
                          ...prev,
                          maintenanceEndDate: e.target.value,
                          // 🆕 لو مفيش وقت متسجل، بنسجل الوقت الفعلي الحالي تلقائيًا (قابل للتعديل)
                          maintenanceEndTime: e.target.value && !prev.maintenanceEndTime ? getCurrentTimeHHMM() : prev.maintenanceEndTime
                        }))}
                      />
                    </div>
                    <div>
                      {/* 🆕 توقيت انتهاء الصيانة - كان موجود في البيانات بس مفيش خانة إدخال ليه */}
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">🕐 الوقت</label>
                      <input type="time" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-sky-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.maintenanceEndTime} onChange={e => setEditFormData({...editFormData, maintenanceEndTime: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">📦 تسليم العميل</label>
                      <input
                        type="date"
                        className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-sky-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                        value={editFormData.deliveryDate}
                        onChange={e => setEditFormData(prev => ({
                          ...prev,
                          deliveryDate: e.target.value,
                          deliveryTime: e.target.value && !prev.deliveryTime ? getCurrentTimeHHMM() : prev.deliveryTime
                        }))}
                      />
                    </div>
                    <div>
                      {/* 🆕 توقيت تسليم العميل - كان موجود في البيانات بس مفيش خانة إدخال ليه */}
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">🕐 الوقت</label>
                      <input type="time" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-sky-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.deliveryTime} onChange={e => setEditFormData({...editFormData, deliveryTime: e.target.value})} />
                    </div>
                  </div>
                </div>
              </div>

              {/* ===== قسم: الحالة والتصنيف والتخصيص ===== */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-purple-50/60 dark:bg-purple-900/20 border-b border-slate-100 dark:border-slate-700">
                  <Filter size={16} className="text-purple-600 dark:text-purple-400" />
                  <h4 className="font-black text-sm text-purple-700 dark:text-purple-300">الحالة والتصنيف والتخصيص</h4>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الحالة</label>
                      <select className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.status} onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}>
                        {TICKET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الأولوية</label>
                      <select className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.priority} onChange={e => setEditFormData({ ...editFormData, priority: e.target.value })}>
                        <option value="low">منخفضة</option>
                        <option value="medium">متوسطة</option>
                        <option value="high">عالية</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">التكلفة التقديرية</label>
                      <input type="number" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.estimatedCost} onChange={e => setEditFormData({ ...editFormData, estimatedCost: Number(e.target.value) })} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">نوع التذكرة</label>
                      <select className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.ticketType} onChange={e => setEditFormData({ ...editFormData, ticketType: e.target.value })}>
                        <option value="">-- اختر --</option>
                        {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">المصدر</label>
                      <select className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.source} onChange={e => setEditFormData({ ...editFormData, source: e.target.value })}>
                        <option value="">-- اختر --</option>
                        {TICKET_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* 🆕 حالة الضمان بقت قابلة للتعديل بعد حفظ التذكرة (كانت
                      مش موجودة كخانة إدخال في فورم التعديل خالص) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">حالة الضمان</label>
                      <select
                        className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                        value={editFormData.warrantyStatus || ''}
                        onChange={e => {
                          const newStatus = e.target.value;
                          if (newStatus === 'out_of_warranty' || newStatus === 'unidentified') {
                            setEditFormData({ ...editFormData, warrantyStatus: newStatus, warrantyPeriod: newStatus });
                          } else {
                            setEditFormData({ ...editFormData, warrantyStatus: newStatus, warrantyPeriod: editFormData.warrantyPeriod || '' });
                          }
                        }}
                      >
                        <option value="">-- اختر --</option>
                        <option value="in_warranty">✅ داخل الضمان</option>
                        <option value="out_of_warranty">❌ خارج الضمان</option>
                        <option value="unidentified">❔ غير معرف</option>
                        <option value="repair_invoice">🧾 فاتورة اصلاح</option>
                      </select>
                    </div>
                    {(editFormData.warrantyStatus === 'in_warranty' || editFormData.warrantyStatus === 'repair_invoice') && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">📅 فترة الضمان</label>
                        <select
                          className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                          value={editFormData.warrantyPeriod || ''}
                          onChange={e => setEditFormData({ ...editFormData, warrantyPeriod: e.target.value })}
                        >
                          <option value="">-- اختر الفترة --</option>
                          {WARRANTY_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الفني المختص</label>
                      <select className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.assignedTechnician} onChange={e => setEditFormData({...editFormData, assignedTechnician: e.target.value})}>
                        <option value="">-- غير محدد --</option>
                        {(systemSettings?.technicians || []).map((tech, idx) => <option key={idx} value={tech}>{tech}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">مركز الصيانة</label>
                      <select className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.assignedMaintenanceCenter} onChange={e => setEditFormData({...editFormData, assignedMaintenanceCenter: e.target.value})}>
                        <option value="">-- غير محدد --</option>
                        {(systemSettings?.maintenanceCenters || []).map(center => (
                          <option key={typeof center === 'string' ? center : center.value} value={typeof center === 'string' ? center : center.name}>
                            {typeof center === 'string' ? center : center.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الكول سنتر</label>
                      <select className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-purple-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.assignedCallCenter} onChange={e => setEditFormData({...editFormData, assignedCallCenter: e.target.value})}>
                        <option value="">-- غير محدد --</option>
                        {callCenters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* ===== قسم: الوسوم والملاحظات ===== */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                  <Tag size={16} className="text-slate-500 dark:text-slate-400" />
                  <h4 className="font-black text-sm text-slate-600 dark:text-slate-300">الوسوم والملاحظات</h4>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الوسوم</label>
                    <input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" value={editFormData.tags?.join(', ')} onChange={e => setEditFormData({...editFormData, tags: e.target.value.split(',').map(t => t.trim())})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">ملاحظات</label>
                    <textarea rows="2" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm font-bold outline-none focus:border-teal-500 transition-colors bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 resize-none" value={editFormData.notes} onChange={e => setEditFormData({...editFormData, notes: e.target.value})} />
                  </div>
                </div>
              </div>

              {/* ===== ✅ قسم Follow up Callcenter - تعديل ===== */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-teal-50/60 dark:bg-teal-900/20 border-b border-slate-100 dark:border-slate-700">
                  <Headphones size={16} className="text-teal-600 dark:text-teal-400" />
                  <h4 className="font-black text-sm text-teal-700 dark:text-teal-300">📋 Follow up Callcenter</h4>
                </div>
                <div className="p-5">
                <div className="space-y-4">
                  {/* السؤال 1 */}
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                    <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
                      1- سهولة الوصول الى الشركة
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[1,2,3,4,5,6,7,8,9,10].map(num => (
                        <label key={num} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="editAccessibility"
                            value={num}
                            checked={editFormData.followUpAccessibility === num}
                            onChange={(e) => setEditFormData({
                              ...editFormData,
                              followUpAccessibility: Number(e.target.value)
                            })}
                            className="w-4 h-4 accent-teal-600"
                          />
                          <span className="text-xs font-bold">{num}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* السؤال 2 */}
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                    <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
                      2- تقييم وقت الصيانة
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[1,2,3,4,5,6,7,8,9,10].map(num => (
                        <label key={num} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="editMaintenanceTime"
                            value={num}
                            checked={editFormData.followUpMaintenanceTime === num}
                            onChange={(e) => setEditFormData({
                              ...editFormData,
                              followUpMaintenanceTime: Number(e.target.value)
                            })}
                            className="w-4 h-4 accent-teal-600"
                          />
                          <span className="text-xs font-bold">{num}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* السؤال 3 */}
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                    <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
                      3- التعامل داخل مركز الصيانة
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[1,2,3,4,5,6,7,8,9,10].map(num => (
                        <label key={num} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="editCenterDealing"
                            value={num}
                            checked={editFormData.followUpCenterDealing === num}
                            onChange={(e) => setEditFormData({
                              ...editFormData,
                              followUpCenterDealing: Number(e.target.value)
                            })}
                            className="w-4 h-4 accent-teal-600"
                          />
                          <span className="text-xs font-bold">{num}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* السؤال 4 */}
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                    <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
                      4- سهولة اجراءات التسليم و الاستلام
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[1,2,3,4,5,6,7,8,9,10].map(num => (
                        <label key={num} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="editDeliveryProcedures"
                            value={num}
                            checked={editFormData.followUpDeliveryProcedures === num}
                            onChange={(e) => setEditFormData({
                              ...editFormData,
                              followUpDeliveryProcedures: Number(e.target.value)
                            })}
                            className="w-4 h-4 accent-teal-600"
                          />
                          <span className="text-xs font-bold">{num}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* السؤال 5 */}
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                    <label className="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">
                      5- حضرتك ممكن تشتري منتجات نوفال مرة اخرى ؟
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="editRepurchase"
                          value="yes"
                          checked={editFormData.followUpRepurchase === 'yes'}
                          onChange={(e) => setEditFormData({
                            ...editFormData,
                            followUpRepurchase: e.target.value
                          })}
                          className="w-4 h-4 accent-emerald-600"
                        />
                        <span className="font-bold text-emerald-600">✅ نعم</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="editRepurchase"
                          value="no"
                          checked={editFormData.followUpRepurchase === 'no'}
                          onChange={(e) => setEditFormData({
                            ...editFormData,
                            followUpRepurchase: e.target.value
                          })}
                          className="w-4 h-4 accent-rose-600"
                        />
                        <span className="font-bold text-rose-600">❌ لا</span>
                      </label>
                    </div>
                  </div>
                  
                  {/* ملاحظات التقييم */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                      📝 ملاحظات إضافية عن التقييم
                    </label>
                    <textarea
                      rows="2"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm resize-none bg-white dark:bg-slate-900"
                      value={editFormData.followUpNotes || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        followUpNotes: e.target.value
                      })}
                      placeholder="أي ملاحظات إضافية عن تجربة العميل..."
                    />
                  </div>
                  
                  {/* من قام بالتقييم */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                        👤 من قام بالتقييم
                      </label>
                      <input
                        className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm bg-white dark:bg-slate-900"
                        value={editFormData.followUpBy || appUser.name}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          followUpBy: e.target.value
                        })}
                        placeholder="اسم المقيم"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                        📅 تاريخ التقييم
                      </label>
                      <input
                        type="date"
                        className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm bg-white dark:bg-slate-900"
                        value={editFormData.followUpDate || new Date().toISOString().split('T')[0]}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          followUpDate: e.target.value
                        })}
                      />
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>

            {/* ===== ✨ تذييل ثابت بأزرار الحفظ والإلغاء ===== */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
              <button type="button" onClick={() => setEditingTicket(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                إلغاء
              </button>
              <button type="submit" className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20">
                <Save size={18}/> حفظ التعديلات
              </button>
            </div>
            </form>

          </div>
        </div>
      )}

      {/* ===== رأس الصفحة ===== */}
      <div className="p-5 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black flex items-center gap-2">
            <MessageSquare className="text-teal-600" size={20}/> تذاكر الصيانة
          </h2>
          <span className="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-3 py-1 rounded-lg text-xs">{displayedTickets.length} تذكرة</span>
          <button
            onClick={() => setShowOverdueOnly(prev => !prev)}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
              showOverdueOnly
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100'
            }`}
            title="عرض التذاكر المتأخرة عن SLA فقط"
          >
            ⏰ {showOverdueOnly ? 'إلغاء فلتر المتأخرة' : 'المتأخرة فقط'}
          </button>
          {/* ✨ ميزة جديدة: إرسال تنبيه بالتذاكر المتأخرة عن SLA لأي شخص مسؤول (نفس رابط تنبيهات التذاكر) */}
          {systemSettings?.ticketNotifications?.webhookUrl && overdueTickets.length > 0 && (
            <button
              onClick={async () => {
                const ok = await sendWebhookNotification(systemSettings.ticketNotifications.webhookUrl, {
                  type: 'sla_overdue_alert',
                  triggeredAt: new Date().toISOString(),
                  count: overdueTickets.length,
                  tickets: overdueTickets.map(t => ({
                    ticketNumber: t.ticketNumber,
                    customerName: t.customerName,
                    priority: t.priority,
                    assignedTechnician: t.assignedTechnician || ''
                  }))
                });
                if (ok) showSuccess("تم إرسال تنبيه التذاكر المتأخرة بنجاح");
                else showError("فشل إرسال التنبيه");
              }}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 flex items-center gap-1"
            >
              <Bell size={12}/> إرسال تنبيه بالمتأخرة ({overdueTickets.length})
            </button>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          {selectedItems.size > 0 && (
            <button onClick={() => setShowBulkDeleteModal(true)} className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
              <Trash2 size={14}/> حذف {selectedItems.size}
            </button>
          )}
          
          <input className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900 w-40" placeholder="بحث شامل..." value={search} onChange={e => setSearch(e.target.value)} />
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">كل الحالات</option>
            {TICKET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="all">كل الأولويات</option>
            <option value="high">عالية</option>
            <option value="medium">متوسطة</option>
            <option value="low">منخفضة</option>
          </select>
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterWarranty} onChange={e => setFilterWarranty(e.target.value)}>
            <option value="all">كل الضمانات</option>
            {WARRANTY_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterTicketType} onChange={e => setFilterTicketType(e.target.value)}>
            <option value="all">كل الأنواع</option>
            {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
            <option value="all">كل المصادر</option>
            {TICKET_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          
          {/* ✅ فلتر مركز الصيانة الجديد */}
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterMaintenanceCenter} onChange={e => setFilterMaintenanceCenter(e.target.value)}>
            <option value="all">كل مراكز الصيانة</option>
            {maintenanceCenters.map(center => (
              <option key={center.id} value={center.name}>{center.name}</option>
            ))}
          </select>
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterTechnician} onChange={e => setFilterTechnician(e.target.value)}>
            <option value="all">كل الفنيين</option>
            {technicians.map(tech => (
              <option key={tech} value={tech}>{tech}</option>
            ))}
          </select>
          
          <button 
            onClick={handleExportAllFilteredTickets}
            disabled={exportingTickets}
            className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2 disabled:opacity-50"
            title="تصدير تقرير تفصيلي شامل لكل التذاكر المطابقة للفلاتر الحالية (مش بس الصفحة الظاهرة)"
          >
            {exportingTickets ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>}
            {exportingTickets ? 'جاري التصدير...' : 'تصدير تقرير تفصيلي'}
          </button>

          <button onClick={resetFilters} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs font-bold">
            <RotateCcw size={14}/>
          </button>
          
          <button onClick={() => setShowAddModal(true)} className="bg-teal-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-teal-700 flex items-center gap-2">
            <Plus size={14}/> تذكرة جديدة
          </button>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <input type="date" className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} />
          <input type="date" className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} />
        </div>
      </div>

      {/* ===== جدول التذاكر ===== */}
      <div className="overflow-x-auto max-h-[70vh] custom-scrollbar">
        <table className="w-full text-right text-sm">
          <thead className="bg-white dark:bg-slate-900 border-b text-slate-500 dark:text-slate-400 font-bold text-[11px] uppercase sticky top-0">
            <tr>
              <th className="p-3 w-10">
                <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={selectedItems.size === tickets.length && tickets.length > 0} onChange={toggleSelectAll} />
              </th>
              <th className="p-3">رقم التذكرة</th>
              <th className="p-3">العميل</th>
              <th className="p-3">الهاتف</th>
              <th className="p-3">الموديل</th>
              <th className="p-3">النوع</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الأولوية</th>
              <th className="p-3">SLA</th>
              <th className="p-3">الضمان</th>
              <th className="p-3">المصدر</th>
              <th className="p-3">مركز الصيانة</th>
              <th className="p-3">الفني</th>
              <th className="p-3">آخر تحديث</th>
              <th className="p-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700 font-medium text-xs">
            {displayedTickets.length === 0 && !loadingData ? (
              <tr>
                <td colSpan="15" className="p-10 text-center text-slate-400">لا توجد تذاكر</td>
              </tr>
            ) : (
              displayedTickets.map(t => (
                <tr 
                  key={t.id} 
                  className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer" 
                  onClick={(e) => {
                    // ✅ منع فتح التذكرة إذا كان العنصر المضغوط هو select أو زر أو أي عنصر تفاعلي
                    if (
                      e.target.closest('select') || 
                      e.target.closest('button') || 
                      e.target.closest('input[type="checkbox"]') ||
                      e.target.closest('a')
                    ) {
                      return;
                    }
                    openFullTicket(t);
                  }}
                >
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={selectedItems.has(t.id)} onChange={() => toggleSelectItem(t.id)} />
                  </td>
                  <td className="p-3 font-mono font-bold text-teal-600 dark:text-teal-400">{t.ticketNumber || t.id.slice(0,8)}</td>
                  <td className="p-3 font-bold">{t.customerName}</td>
                  <td className="p-3 font-mono" dir="ltr">{t.customerPhone}</td>
                  <td className="p-3">{t.deviceModel || t.device || '-'}</td>
                  <td className="p-3">{TICKET_TYPES.find(tt => tt.value === t.ticketType)?.label || '-'}</td>
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <StatusSelectComp value={t.status} onChange={handleUpdateStatus} ticketId={t.id} />
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${getPriorityColor(t.priority)}`}>
                      {t.priority === 'high' ? 'عالية' : t.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                    </span>
                  </td>
                  <td className="p-3">
                    {(() => {
                      const sla = getTicketSLAInfo(t, systemSettings?.ticketSLA);
                      if (!sla) return '-';
                      if (sla.level === 'completed') {
                        return <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">تمت</span>;
                      }
                      if (sla.level === 'overdue') {
                        return <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">⏰ متأخرة {Math.abs(Math.round(sla.hoursRemaining))} س</span>;
                      }
                      if (sla.level === 'due_soon') {
                        return <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">⏳ باقي {Math.round(sla.hoursRemaining)} س</span>;
                      }
                      return <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">✅ في الموعد</span>;
                    })()}
                  </td>
                  <td className="p-3">{WARRANTY_OPTIONS.find(w => w.value === t.warrantyStatus)?.label || '-'}</td>
                  <td className="p-3">{TICKET_SOURCES.find(s => s.value === t.source)?.label || '-'}</td>
                  <td className="p-3 font-bold text-amber-600 dark:text-amber-400">{t.assignedMaintenanceCenter || '-'}</td>
                  <td className="p-3">{t.assignedTechnician || '-'}</td>
                  <td className="p-3 text-[9px]">{formatDate(t.updatedAt || t.createdAt)}</td>
                  <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); openFullTicket(t); }} className="p-1.5 bg-teal-50 dark:bg-teal-900/30 text-teal-600 rounded hover:bg-teal-100" title="فتح">
                        <Eye size={14}/>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedTicket(t); setShowAssignModal(true); }} className="p-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded hover:bg-amber-100" title="تعيين">
                        <Users size={14}/>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleViewHistory(t); }} className="p-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 rounded hover:bg-purple-100" title="سجل">
                        <History size={14}/>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleGenerateInvoice(t); }} className="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded hover:bg-emerald-100" title="فاتورة">
                        <Receipt size={14}/>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openEditModal(t); }} className="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded hover:bg-emerald-100" title="تعديل">
                        <Edit size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        {/* 🆕 ترقيم صفحات حقيقي بدل "تحميل المزيد" */}
        {!loadingData && (tickets.length > 0 || currentTicketsPage > 1) && (
          <div className="p-4 flex items-center justify-center gap-3 bg-slate-50 dark:bg-slate-900/50 border-t">
            <button
              onClick={() => loadTickets(currentTicketsPage - 1)}
              disabled={currentTicketsPage <= 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronRight size={14}/> السابق
            </button>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 px-2">
              صفحة {currentTicketsPage}
            </span>
            <button
              onClick={() => loadTickets(currentTicketsPage + 1)}
              disabled={!hasMore}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              التالي <ChevronLeft size={14}/>
            </button>
          </div>
        )}
        {loadingData && tickets.length > 0 && (
          <div className="p-4 text-center text-xs text-slate-400">
            <Loader2 size={16} className="animate-spin inline-block"/>
          </div>
        )}
      </div>
    </div>
  );
}



// ==========================================================================
// 👥 إدارة المستخدمين المحسنة (مع صلاحيات تفصيلية وتحكم كامل)
// ==========================================================================
