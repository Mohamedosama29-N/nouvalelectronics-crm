import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, getDocs, doc, updateDoc, query, where, serverTimestamp, orderBy, increment, limit, runTransaction, arrayUnion
} from 'firebase/firestore';
import {
  Users,
  Search,
  Edit,
  Trash2,
  Printer,
  MapPin,
  Phone,
  Wrench,
  X,
  Eye,
  HardHat,
  Headphones,
  MessageSquare,
  Award,
  MessageCircle
} from 'lucide-react';
import { AdvancedCharts } from '../common/AdvancedCharts';
import { TicketCard } from '../tickets/TicketCard';
import { TICKET_STATUSES } from '../../constants/tickets';
import { db } from '../../firebase/config';
import { tagManager } from '../../utils/TagManager';
import { showConfirm, showError, showInfo, showSuccess } from '../../utils/alerts';
import { sendWhatsApp } from '../../utils/communications';
import { formatDate } from '../../utils/format';
import { normalizeSerial } from '../../utils/search';

export function CustomerProfileView({ customer, onClose, systemSettings, setGlobalLoading, appUser, onCheckoutSuccess, technicians = [], maintenanceCenters = [], callCenters = [] }) {
  const [activeTab, setActiveTab] = useState('info'); 
  const [history, setHistory] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({ 
    totalSpent: 0, 
    avgTicket: 0, 
    lastVisit: null, 
    totalTickets: 0,
    totalReturns: 0,
    favoriteProducts: []
  });
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editedData, setEditedData] = useState(customer);
  const [availableTags, setAvailableTags] = useState([]);

  // 🛠️ FIX: خانة "الحالة" في كروت التذاكر هنا كانت متعطّلة تمامًا
  // (onStatusChange={() => {}})، فلما المستخدم يختار حالة جديدة، القيمة
  // كانت بترجع للقديمة فورًا مع أول إعادة رسم لأنها لسه مربوطة بـ
  // ticket.status الأصلي اللي معملهوش تحديث — وده كان بيبان للمستخدم
  // وكأن الـ dropdown "بيقفل بسرعة" قبل ما يلحق يختار. دلوقتي بنحدّث فعليًا
  // في Firestore وفي الحالة المحلية للتذاكر بعد نجاح التحديث.
  const handleTicketStatusChange = async (ticketId, newStatus) => {
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        history: arrayUnion({
          action: `تغيير الحالة إلى ${TICKET_STATUSES.find(s => s.value === newStatus)?.label || newStatus}`,
          timestamp: new Date().toISOString(),
          by: appUser?.name || '-'
        })
      });
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
      showSuccess('تم تحديث حالة التذكرة');
    } catch (e) {
      showError('فشل تحديث الحالة: ' + e.message);
    }
  };

  // 🛠️ FIX: أزرار "عرض" و"تعديل" في كارت التذكرة هنا كانت onView={() => {}}
  // (مش بتعمل حاجة) و onEdit={(t)=>setEditingTicket(t)} كانت بتستدعي state
  // مش موجود أصلًا في المكوّن ده (setEditingTicket معرّف في مكوّن تاني
  // تمامًا هو EnhancedTicketManager)، يعني كانت بترمي خطأ لو حد ضغط عليها.
  // دلوقتي فيهم modal حقيقي للعرض والتعديل من نفس صفحة العميل.
  const [viewingCustomerTicket, setViewingCustomerTicket] = useState(null);
  const [editingCustomerTicket, setEditingCustomerTicket] = useState(null);
  const [editCustomerTicketData, setEditCustomerTicketData] = useState({});

  const openEditCustomerTicket = (ticket) => {
    setEditingCustomerTicket(ticket);
    setEditCustomerTicketData({
      status: ticket.status || 'created',
      priority: ticket.priority || 'medium',
      warrantyStatus: ticket.warrantyStatus || '',
      assignedTechnician: ticket.assignedTechnician || '',
      notes: ticket.notes || ''
    });
  };

  const handleSaveCustomerTicketEdit = async () => {
    if (!editingCustomerTicket) return;
    setGlobalLoading(true);
    try {
      const ticketRef = doc(db, 'tickets', editingCustomerTicket.id);
      const changedFields = [];
      if (editCustomerTicketData.status !== editingCustomerTicket.status) {
        changedFields.push(`الحالة: "${TICKET_STATUSES.find(s => s.value === editingCustomerTicket.status)?.label || editingCustomerTicket.status}" ← "${TICKET_STATUSES.find(s => s.value === editCustomerTicketData.status)?.label || editCustomerTicketData.status}"`);
      }
      if (editCustomerTicketData.priority !== editingCustomerTicket.priority) {
        changedFields.push(`الأولوية: "${editingCustomerTicket.priority || '-'}" ← "${editCustomerTicketData.priority}"`);
      }
      if (editCustomerTicketData.warrantyStatus !== (editingCustomerTicket.warrantyStatus || '')) {
        changedFields.push(`حالة الضمان: "${editingCustomerTicket.warrantyStatus || '-'}" ← "${editCustomerTicketData.warrantyStatus || '-'}"`);
      }
      if (editCustomerTicketData.assignedTechnician !== (editingCustomerTicket.assignedTechnician || '')) {
        changedFields.push(`الفني المسؤول: "${editingCustomerTicket.assignedTechnician || '-'}" ← "${editCustomerTicketData.assignedTechnician || '-'}"`);
      }
      if (editCustomerTicketData.notes !== (editingCustomerTicket.notes || '')) {
        changedFields.push(`الملاحظات اتعدّلت`);
      }

      const updatePayload = {
        status: editCustomerTicketData.status,
        priority: editCustomerTicketData.priority,
        warrantyStatus: editCustomerTicketData.warrantyStatus,
        assignedTechnician: editCustomerTicketData.assignedTechnician,
        notes: editCustomerTicketData.notes,
        updatedAt: serverTimestamp()
      };
      if (changedFields.length > 0) {
        updatePayload.history = arrayUnion({
          action: 'تعديل بيانات التذكرة (من صفحة العميل)',
          timestamp: new Date().toISOString(),
          by: appUser?.name || '-',
          details: changedFields.join(' | ')
        });
      }

      await updateDoc(ticketRef, updatePayload);
      setTickets(prev => prev.map(t => t.id === editingCustomerTicket.id ? { ...t, ...updatePayload } : t));
      showSuccess('تم تحديث التذكرة بنجاح');
      setEditingCustomerTicket(null);
    } catch (e) {
      showError('فشل تحديث التذكرة: ' + e.message);
    }
    setGlobalLoading(false);
  };

  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [invoice, setInvoice] = useState({ 
    discount: 0, 
    discountType: 'value', 
    taxEnabled: true, 
    installationFeeId: '', 
    technicianName: '',
    paymentMethod: 'cash',
    notes: ''
  });

  useEffect(() => {
    const loadTags = async () => {
      await tagManager.loadTags();
      const tags = tagManager.getTagsByCategory('customer');
      setAvailableTags(tags.map(t => t.name));
    };
    loadTags();
  }, []);

  useEffect(() => {
     if (activeTab === 'history' || activeTab === 'info') {
        const fetchData = async () => {
            setGlobalLoading(true);
            try {
                const q = query(
                  collection(db, 'transactions'),
                  where('phone', '==', customer.phone),
                  where('type', '==', 'sell'),
                  orderBy('timestamp', 'desc'),
                  limit(100)
                );
                const snap = await getDocs(q);
                const transactions = snap.docs.map(d => ({id: d.id, ...d.data()}));
                setHistory(transactions);
                
                const tq = query(
                  collection(db, 'tickets'),
                  where('customerPhone', '==', customer.phone),
                  orderBy("createdAt", "desc"),
                  limit(50)
                );
                const tSnap = await getDocs(tq);
                const ticketsData = tSnap.docs.map(d => ({id: d.id, ...d.data()}));
                setTickets(ticketsData);
                
                const total = transactions.reduce((sum, t) => sum + (Number(t.finalTotal) || 0), 0);
                const returns = transactions.filter(t => t.type === 'return').length;
                
                const productCount = {};
                transactions.forEach(t => {
                  if (t.type === 'sell') {
                    productCount[t.itemName] = (productCount[t.itemName] || 0) + 1;
                  }
                });
                
                const favoriteProducts = Object.entries(productCount)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([name, count]) => ({ name, count }));

                setStats({
                  totalSpent: total,
                  avgTicket: transactions.length > 0 ? total / transactions.length : 0,
                  lastVisit: transactions[0]?.timestamp,
                  totalTickets: ticketsData.length,
                  totalReturns: returns,
                  favoriteProducts
                });
                
            } catch(e) {
                console.error(e);
                if (e.code === 'permission-denied') {
                  showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
                } else {
                  showError("فشل جلب السجل: " + e.message);
                }
            }
            setGlobalLoading(false);
        };
        fetchData();
     }
  }, [activeTab, customer.phone, setGlobalLoading]);

  const handleUpdateCustomer = async () => {
    setGlobalLoading(true);
    try {
      await updateDoc(doc(db, 'customers', customer.id), editedData);
      showSuccess("تم تحديث بيانات العميل بنجاح");
      setEditingCustomer(false);
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء تحديث البيانات");
    }
    setGlobalLoading(false);
  };

  const calculations = useMemo(() => {
      const subtotal = cart.reduce(
  (sum, item) => sum + ((Number(item.price) || 0) * (item.quantity || 1)),
  0
   );
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

    if (!snap.empty) {

      const item = { id: snap.docs[0].id, ...snap.docs[0].data() };

      const existing = cart.find(i => i.id === item.id);

      if (existing) {
        setCart(cart.map(i =>
          i.id === item.id
            ? { ...i, quantity: (i.quantity || 1) + 1 }
            : i
        ));
      } else {
        setCart([...cart, { ...item, quantity: 1 }]);
      }

      setSearch('');

    } else {

      showError("الباركود غير صحيح أو الكمية غير متوفرة");

    }

  } catch (err) {

    console.error(err);
    showError("خطأ في البحث");

  }

  setGlobalLoading(false);

};

  const handleCheckout = async () => {
      if (cart.length === 0) return showError("يرجى إضافة منتج واحد على الأقل");
      if (calculations.finalTotal < 0) return showError("الإجمالي لا يمكن أن يكون سالباً");

      const confirmed = await showConfirm(
        'تأكيد الفاتورة',
        `هل أنت متأكد من إصدار فاتورة بقيمة ${calculations.finalTotal} ج للعميل ${customer.name}؟`
      );
      
      if (!confirmed) return;

      setGlobalLoading(true);
      const invId = 'INV-' + Date.now().toString().slice(-8);
      try {
         const transRef = doc(collection(db, 'transactions'));
         await runTransaction(db, async (t) => {
             const itemRefs = [];
             const itemSnaps = [];
             for (const cartItem of cart) {
                 const ref = doc(db, 'inventory', cartItem.id);
                 itemRefs.push(ref);
                 itemSnaps.push(await t.get(ref));
             }

             itemSnaps.forEach((snap, idx) => {
                 const requestedQty = cart[idx].quantity || 1;
                 if (!snap.exists() || snap.data().quantity < requestedQty) throw new Error(`المنتج ${cart[idx].name} غير متوفر بالكمية المطلوبة!`);
             });

             itemRefs.forEach((ref, idx) => {
                 const currentQty = itemSnaps[idx].data().quantity;
                 const requestedQty = cart[idx].quantity || 1;
                 const newQty = currentQty - requestedQty;
                 t.update(ref, { quantity: newQty });
             });

             const joinedNames = cart.map(i => i.name).join(' + ');
             const joinedSerials = cart.map(i => i.serialNumber).join(', ');

             t.set(transRef, {
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
                 paymentMethod: invoice.paymentMethod,
                 notes: invoice.notes,
                 timestamp: serverTimestamp()
             });
             
             const customerRef = doc(db, 'customers', customer.id);
             t.update(customerRef, {
               totalPurchases: increment(1),
               lastPurchase: serverTimestamp()
             });
         });
         
         onCheckoutSuccess({
            id: transRef.id,
            customerName: customer.name,
            phone: customer.phone,
            ...invoice,
            ...calculations,
            items: cart,
            invoiceNumber: invId,
            date: new Date().toISOString(),
            operator: appUser.name || appUser.email
         });
         
         showSuccess("تم البيع وإصدار الفاتورة بنجاح");
      } catch(e) {
         console.error(e);
         showError(e.message || "حدث خطأ أثناء إتمام العملية");
      }
      setGlobalLoading(false);
  };

  const handleSendSMS = async () => {
    showInfo("سيتم تفعيل خدمة SMS قريباً");
  };

  const handleSendWhatsApp = () => {
    const message = `مرحباً ${customer.name}،\nنشكرك على تعاملك مع ${systemSettings.storeName}`;
    sendWhatsApp(customer.phone, message);
  };

  return (
      <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden text-right flex flex-col max-h-full" dir="rtl">
          <div className="p-6 border-b bg-gradient-to-l from-indigo-600 to-purple-600 text-white">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-3xl font-black backdrop-blur-sm">
                  {customer.name?.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-black mb-1">{customer.name}</h2>
                  <div className="flex items-center gap-3 text-sm opacity-90">
                    <span className="flex items-center gap-1"><Phone size={14}/> {customer.phone}</span>
                    {customer.email && <span>• {customer.email}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(customer.tags || []).map(tag => (
                      <span key={tag} className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleSendWhatsApp}
                  className="p-2 bg-green-500/20 rounded-lg hover:bg-green-500/30 transition-colors"
                  title="إرسال واتساب"
                >
                  <MessageCircle size={18}/>
                </button>
                <button 
                  onClick={handleSendSMS}
                  className="p-2 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-colors"
                  title="إرسال SMS"
                >
                  <MessageSquare size={18}/>
                </button>
                <button 
                  onClick={() => setEditingCustomer(!editingCustomer)}
                  className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                  title="تعديل البيانات"
                >
                  <Edit size={18}/>
                </button>
                <button onClick={onClose} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                  <X size={20}/>
                </button>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3 mt-4">
              {customer.productCategory && 
                <span className="bg-white/20 px-3 py-1.5 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/30">
                  {customer.productCategory} {customer.productModel && `- ${customer.productModel}`}
                </span>
              }
              {customer.issue && 
                <span className="bg-rose-500/30 px-3 py-1.5 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/30">
                  ⚠️ {customer.issue}
                </span>
              }
            </div>
          </div>

          <div className="flex border-b bg-white dark:bg-slate-800 overflow-x-auto">
              <button 
                onClick={()=>setActiveTab('info')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'info' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                المعلومات العامة
              </button>
              <button 
                onClick={()=>setActiveTab('new_invoice')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'new_invoice' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                إصدار فاتورة
              </button>
              <button 
                onClick={()=>setActiveTab('history')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'history' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                سجل المشتريات
              </button>
              <button 
                onClick={()=>setActiveTab('tickets')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'tickets' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                تذاكر الصيانة
              </button>
              <button 
                onClick={()=>setActiveTab('analytics')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'analytics' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                التحليلات
              </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              {activeTab === 'info' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl">
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">إجمالي المشتريات</p>
                      <p className="text-xl font-black text-indigo-800 dark:text-indigo-300">{stats.totalSpent.toLocaleString()} ج</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">متوسط الفاتورة</p>
                      <p className="text-xl font-black text-emerald-800 dark:text-emerald-300">{stats.avgTicket.toLocaleString()} ج</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/30 p-4 rounded-xl">
                      <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">آخر زيارة</p>
                      <p className="text-base font-black text-purple-800 dark:text-purple-300">{formatDate(stats.lastVisit)}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/30 p-4 rounded-xl">
                      <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">عدد التذاكر</p>
                      <p className="text-xl font-black text-amber-800 dark:text-amber-300">{stats.totalTickets}</p>
                    </div>
                  </div>
                  
                  {stats.favoriteProducts.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                      <h3 className="font-bold mb-3 flex items-center gap-2">
                        <Award size={16} className="text-amber-500"/> المنتجات المفضلة
                      </h3>
                      <div className="space-y-2">
                        {stats.favoriteProducts.map((p, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span className="text-sm">{p.name}</span>
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">تم شراؤها {p.count} مرة</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {editingCustomer ? (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                      <h3 className="font-bold mb-3 flex items-center gap-2"><Edit size={16}/> تعديل البيانات</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.name}
                          onChange={e => setEditedData({...editedData, name: e.target.value})}
                          placeholder="الاسم"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.phone}
                          onChange={e => setEditedData({...editedData, phone: e.target.value})}
                          placeholder="الهاتف"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.email || ''}
                          onChange={e => setEditedData({...editedData, email: e.target.value})}
                          placeholder="البريد الإلكتروني"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.governorate || ''}
                          onChange={e => setEditedData({...editedData, governorate: e.target.value})}
                          placeholder="المحافظة"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.city || ''}
                          onChange={e => setEditedData({...editedData, city: e.target.value})}
                          placeholder="المدينة"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.address || ''}
                          onChange={e => setEditedData({...editedData, address: e.target.value})}
                          placeholder="العنوان"
                        />
                        <input
                          className="col-span-2 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={(editedData.tags || []).join(', ')}
                          onChange={e => setEditedData({...editedData, tags: e.target.value.split(',').map(t => t.trim())})}
                          placeholder="الوسوم (مفصولة بفواصل)"
                        />
                        <textarea
                          className="col-span-2 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.notes || ''}
                          onChange={e => setEditedData({...editedData, notes: e.target.value})}
                          placeholder="ملاحظات"
                          rows="2"
                        />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleUpdateCustomer}
                          className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-indigo-700"
                        >
                          حفظ التعديلات
                        </button>
                        <button
                          onClick={() => {
                            setEditingCustomer(false);
                            setEditedData(customer);
                          }}
                          className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-2 rounded-lg font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                        <h3 className="font-bold mb-3 flex items-center gap-2"><MapPin size={16}/> العنوان</h3>
                        <p className="text-sm">{customer.governorate || 'غير محدد'} {customer.city && `- ${customer.city}`}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{customer.address || 'لا يوجد عنوان مفصل'}</p>
                      </div>
                      
                      {(customer.assignedTechnician || customer.assignedMaintenanceCenter || customer.assignedCallCenter) && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                          <h3 className="font-bold mb-3 flex items-center gap-2"><Users size={16}/> المسؤولون</h3>
                          <div className="space-y-2">
                            {customer.assignedTechnician && (
                              <div className="flex items-center gap-2">
                                <HardHat size={14} className="text-amber-600 dark:text-amber-400"/>
                                <span className="text-sm">الفني: {technicians.find(t => t.id === customer.assignedTechnician)?.name || customer.assignedTechnician}</span>
                              </div>
                            )}
                            {customer.assignedMaintenanceCenter && (
                              <div className="flex items-center gap-2">
                                <Wrench size={14} className="text-orange-600 dark:text-orange-400"/>
                                <span className="text-sm">مركز الصيانة: {maintenanceCenters.find(m => m.id === customer.assignedMaintenanceCenter)?.name || customer.assignedMaintenanceCenter}</span>
                              </div>
                            )}
                            {customer.assignedCallCenter && (
                              <div className="flex items-center gap-2">
                                <Headphones size={14} className="text-cyan-600 dark:text-cyan-400"/>
                                <span className="text-sm">الكول سنتر: {callCenters.find(c => c.id === customer.assignedCallCenter)?.name || customer.assignedCallCenter}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {customer.notes && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                          <h3 className="font-bold mb-2">ملاحظات</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{customer.notes}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'new_invoice' && (
                 <div className="space-y-6">
                    <form onSubmit={handleSearchItem} className="flex gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                       <input 
                         className="flex-1 border-none bg-transparent p-2 outline-none text-lg font-mono text-center tracking-widest text-slate-700 dark:text-slate-300" 
                         placeholder="مرر باركود المنتج..." 
                         value={search} 
                         onChange={e=>setSearch(e.target.value)} 
                         autoFocus 
                       />
                       <button 
                         type="submit" 
                         className="bg-indigo-600 text-white px-6 rounded-lg font-bold text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2"
                       >
                         <Search size={18}/> بحث
                       </button>
                    </form>

                    {cart.length > 0 && (
                       <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-right text-xs">
                             <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-b font-bold">
                               <tr>
                                 <th className="p-3">الصنف</th>
                                 <th className="p-3 text-center">الكمية</th>
                                 <th className="p-3 text-center">السعر</th>
                                 <th className="p-3 text-center">الإجمالي</th>
                                 <th className="p-3 text-center">إزالة</th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {cart.map((item, idx) => (
                                   <tr key={idx} className="bg-white dark:bg-slate-800">
                                      <td className="p-3 font-bold text-slate-800 dark:text-white">
                                        {item.name} <br/>
                                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 inline-block">{item.serialNumber}</span>
                                      </td>
                                      <td className="p-3 text-center font-bold text-slate-600 dark:text-slate-400">1</td>
                                      <td className="p-3 text-center font-black text-indigo-600 dark:text-indigo-400">{item.price * item.quantity} ج</td>
                                      <td className="p-3 text-center font-black text-emerald-600 dark:text-emerald-400">{item.price * item.quantity} ج</td>
                                      <td className="p-3 text-center">
                                        <button 
                                          onClick={() => setCart(cart.filter(i => i.serialNumber !== item.serialNumber))} 
                                          className="text-rose-500 p-1.5 bg-rose-50 dark:bg-rose-900/30 rounded hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <div>
                           <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الفني</label>
                           <select 
                             className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none font-bold text-sm bg-white dark:bg-slate-900" 
                             value={invoice.technicianName} 
                             onChange={e=>setInvoice({...invoice, technicianName: e.target.value})}
                           >
                              <option value="">-- بدون فني --</option>
                              {(systemSettings.technicians || []).map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">الخصم</label>
                           <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-800 overflow-hidden">
                              <input 
                                type="number" 
                                className="flex-1 p-2.5 outline-none font-bold text-center text-rose-600 dark:text-rose-400 text-sm bg-transparent" 
                                value={invoice.discount} 
                                onChange={e=>setInvoice({...invoice, discount: e.target.value})} 
                                min="0" 
                                max={invoice.discountType === 'percent' ? 100 : undefined}
                              />
                              <select 
                                className="bg-slate-50 dark:bg-slate-800 px-3 font-bold text-xs border-r border-slate-100 dark:border-slate-700 outline-none" 
                                value={invoice.discountType} 
                                onChange={e=>setInvoice({...invoice, discountType: e.target.value})}
                              >
                                 <option value="value">ج.م</option>
                                 <option value="percent">%</option>
                              </select>
                           </div>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">الرسوم</label>
                           <select 
                             className="w-full p-2.5 border border-indigo-100 dark:border-indigo-800 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs outline-none focus:border-indigo-500" 
                             value={invoice.installationFeeId} 
                             onChange={e=>setInvoice({...invoice, installationFeeId: e.target.value})}
                           >
                              <option value="">بدون رسوم</option>
                              {(systemSettings.installationFees || []).map(f => <option key={f.id} value={f.id}>{f.label} (+{f.value} ج)</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">طريقة الدفع</label>
                           <select 
                             className="w-full p-2.5 border border-indigo-100 dark:border-indigo-800 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs outline-none focus:border-indigo-500" 
                             value={invoice.paymentMethod}
                             onChange={e => setInvoice({...invoice, paymentMethod: e.target.value})}
                           >
                              <option value="cash">نقداً</option>
                              <option value="card">بطاقة</option>
                              <option value="transfer">تحويل بنكي</option>
                           </select>
                        </div>
                        <div className="md:col-span-4">
                           <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                           <input
                             className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none text-sm bg-white dark:bg-slate-900"
                             value={invoice.notes}
                             onChange={e => setInvoice({...invoice, notes: e.target.value})}
                             placeholder="أي ملاحظات إضافية..."
                           />
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
                      disabled={cart.length === 0}
                    >
                       <Printer size={24}/> إتمام العملية
                    </button>
                 </div>
              )}

              {activeTab === 'history' && (
                 <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-right text-xs">
                       <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b">
                          <tr>
                            <th className="p-4">رقم الفاتورة</th>
                            <th className="p-4">المنتجات</th>
                            <th className="p-4 text-center">الفني</th>
                            <th className="p-4 text-center">الصافي</th>
                            <th className="p-4">طريقة الدفع</th>
                            <th className="p-4">التاريخ</th>
                            <th className="p-4">ملاحظات</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                          {history.length === 0 ? 
                            <tr><td colSpan="7" className="p-10 text-center text-slate-400">لا توجد فواتير سابقة</td></tr> :
                             history.map(t => (
                                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                   <td className="p-4 font-mono font-black text-indigo-600 dark:text-indigo-400">{t.invoiceNumber || t.id.slice(0,6)}</td>
                                   <td className="p-4 font-bold text-slate-800 dark:text-white leading-relaxed max-w-xs">
                                     {t.itemName}
                                     {t.serialNumber && <p className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-1">{t.serialNumber}</p>}
                                   </td>
                                   <td className="p-4 text-center font-bold text-slate-600 dark:text-slate-400">{t.technicianName || '-'}</td>
                                   <td className="p-4 text-center font-black text-emerald-600 dark:text-emerald-400">{Number(t.finalTotal || t.total || 0).toLocaleString()} ج</td>
                                   <td className="p-4 text-center text-slate-600 dark:text-slate-400">
                                     {t.paymentMethod === 'cash' ? 'نقداً' : 
                                      t.paymentMethod === 'card' ? 'بطاقة' : 
                                      t.paymentMethod === 'transfer' ? 'تحويل' : '-'}
                                   </td>
                                   <td className="p-4 text-slate-500 dark:text-slate-400 text-[10px]">{formatDate(t.timestamp)}</td>
                                   <td className="p-4 text-slate-400 text-[9px] max-w-[100px] truncate">{t.notes || '-'}</td>
                                </tr>
                             ))
                          }
                       </tbody>
                    </table>
                 </div>
              )}

              {activeTab === 'tickets' && (
                 <div className="space-y-4">
                    {tickets.length === 0 ? (
                      <div className="text-center p-8 text-slate-400">
                        <MessageSquare size={48} className="mx-auto mb-3 opacity-20"/>
                        <p>لا توجد تذاكر صيانة لهذا العميل</p>
                      </div>
                    ) : (
                      tickets.map(ticket => (
                        <TicketCard
                          key={ticket.id}
                          ticket={ticket}
                          systemSettings={systemSettings}
                          onStatusChange={handleTicketStatusChange}
                          onView={(t) => setViewingCustomerTicket(t)}
                          onEdit={(t) => openEditCustomerTicket(t)}
                        />
                      ))
                    )}
                 </div>
              )}

              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                      <h3 className="font-bold mb-3">تحليل المشتريات</h3>
                      <AdvancedCharts 
                        data={history.map(h => ({
                          name: formatDate(h.timestamp).split(' ')[0],
                          value: Number(h.finalTotal || 0)
                        })).slice(0, 10)}
                        type="line"
                        height={200}
                      />
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                      <h3 className="font-bold mb-3">توزيع المشتريات</h3>
                      <AdvancedCharts 
                        data={[
                          { name: 'نقداً', value: history.filter(h => h.paymentMethod === 'cash').length },
                          { name: 'بطاقة', value: history.filter(h => h.paymentMethod === 'card').length },
                          { name: 'تحويل', value: history.filter(h => h.paymentMethod === 'transfer').length }
                        ]}
                        type="pie"
                        height={200}
                      />
                    </div>
                  </div>
                </div>
              )}
          </div>

      {/* 🆕 مودال عرض تفاصيل التذكرة من صفحة العميل */}
      {viewingCustomerTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="font-black text-lg flex items-center gap-2">
                <Eye className="text-indigo-600" size={20}/> تذكرة #{viewingCustomerTicket.ticketNumber}
              </h3>
              <button onClick={() => setViewingCustomerTicket(null)} className="text-slate-400 hover:text-rose-600"><X size={22}/></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">الحالة</p>
                  <p className="font-bold">{TICKET_STATUSES.find(s => s.value === viewingCustomerTicket.status)?.label || viewingCustomerTicket.status}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">الأولوية</p>
                  <p className="font-bold">{viewingCustomerTicket.priority === 'high' ? 'عالية' : viewingCustomerTicket.priority === 'medium' ? 'متوسطة' : 'منخفضة'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">الجهاز / الموديل</p>
                  <p className="font-bold">{viewingCustomerTicket.deviceModel || viewingCustomerTicket.device || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">حالة الضمان</p>
                  <p className="font-bold">{viewingCustomerTicket.warrantyStatus || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">الفني المسؤول</p>
                  <p className="font-bold">{viewingCustomerTicket.assignedTechnician || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">تاريخ الإنشاء</p>
                  <p className="font-bold">{formatDate(viewingCustomerTicket.createdAt)}</p>
                </div>
              </div>
              {viewingCustomerTicket.issue && (
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">وصف المشكلة</p>
                  <p className="font-bold">{viewingCustomerTicket.issue}</p>
                </div>
              )}
              {viewingCustomerTicket.notes && (
                <div className="bg-amber-50/50 dark:bg-amber-900/10 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">ملاحظات</p>
                  <p className="font-bold">{viewingCustomerTicket.notes}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => { setViewingCustomerTicket(null); openEditCustomerTicket(viewingCustomerTicket); }}
              className="w-full mt-4 bg-indigo-600 text-white py-2.5 rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
            >
              <Edit size={16}/> تعديل التذكرة
            </button>
          </div>
        </div>
      )}

      {/* 🆕 مودال تعديل سريع للتذكرة من صفحة العميل (بدون الحاجة للخروج
          للصفحة الرئيسية لإدارة التذاكر) */}
      {editingCustomerTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="font-black text-lg flex items-center gap-2">
                <Edit className="text-emerald-600" size={20}/> تعديل تذكرة #{editingCustomerTicket.ticketNumber}
              </h3>
              <button onClick={() => setEditingCustomerTicket(null)} className="text-slate-400 hover:text-rose-600"><X size={22}/></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">الحالة</label>
                  <select className="w-full border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900" value={editCustomerTicketData.status} onChange={e => setEditCustomerTicketData({...editCustomerTicketData, status: e.target.value})}>
                    {TICKET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">الأولوية</label>
                  <select className="w-full border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900" value={editCustomerTicketData.priority} onChange={e => setEditCustomerTicketData({...editCustomerTicketData, priority: e.target.value})}>
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">حالة الضمان</label>
                  <select className="w-full border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900" value={editCustomerTicketData.warrantyStatus} onChange={e => setEditCustomerTicketData({...editCustomerTicketData, warrantyStatus: e.target.value})}>
                    <option value="">-- اختر --</option>
                    <option value="in_warranty">✅ داخل الضمان</option>
                    <option value="out_of_warranty">❌ خارج الضمان</option>
                    <option value="unidentified">❔ غير معرف</option>
                    <option value="repair_invoice">🧾 فاتورة اصلاح</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">الفني المسؤول</label>
                  <select className="w-full border p-2.5 rounded-xl text-sm bg-white dark:bg-slate-900" value={editCustomerTicketData.assignedTechnician} onChange={e => setEditCustomerTicketData({...editCustomerTicketData, assignedTechnician: e.target.value})}>
                    <option value="">-- غير محدد --</option>
                    {(systemSettings?.technicians || []).map((tech, idx) => <option key={idx} value={tech}>{tech}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">ملاحظات</label>
                <textarea rows="3" className="w-full border p-2.5 rounded-xl text-sm resize-none bg-white dark:bg-slate-900" value={editCustomerTicketData.notes} onChange={e => setEditCustomerTicketData({...editCustomerTicketData, notes: e.target.value})} />
              </div>
              <p className="text-xs text-slate-400">
                لتعديل بيانات أوسع (الجهاز، قطع الغيار، التكلفة...) استخدم صفحة "تذاكر الصيانة" الرئيسية.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSaveCustomerTicketEdit} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl font-bold hover:bg-emerald-700">حفظ التعديلات</button>
              <button onClick={() => setEditingCustomerTicket(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 py-2.5 rounded-xl font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}
// ==========================================================================
// 🎫 مكون عرض التذكرة في القائمة
// ==========================================================================
