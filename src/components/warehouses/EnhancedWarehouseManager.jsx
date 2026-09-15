import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, serverTimestamp, writeBatch
} from 'firebase/firestore';
import {
  Package,
  Users,
  ArrowRightLeft,
  Plus,
  Edit,
  Store,
  Trash2,
  Save,
  MapPin,
  X,
  UserX,
  UserPlus,
  Trash as TrashIcon
} from 'lucide-react';
import { db } from '../../firebase/config';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { formatDate } from '../../utils/format';
import { getRoleColor, getRoleIcon } from '../../utils/roleHelpers';

export function EnhancedWarehouseManager({ warehouses, appUser, setGlobalLoading }) {
   const [name, setName] = useState('');
   const [location, setLocation] = useState('');
   const [phone, setPhone] = useState('');
   const [address, setAddress] = useState('');
   const [manager, setManager] = useState('');
   const [email, setEmail] = useState('');
   const [workingHours, setWorkingHours] = useState('');
   const [selectedWarehouse, setSelectedWarehouse] = useState(null);
   const [assignedUsers, setAssignedUsers] = useState([]);
   const [allUsers, setAllUsers] = useState([]);
   const [editingWarehouse, setEditingWarehouse] = useState(null);
   const [inventory, setInventory] = useState([]);
   const [showInventory, setShowInventory] = useState(false);
   const [warehouseStats, setWarehouseStats] = useState({ 
     totalItems: 0, 
     totalValue: 0, 
     totalUsers: 0, 
     totalCategories: 0,
     totalTransactions: 0,
     monthlySales: 0
   });
   const [searchUser, setSearchUser] = useState('');
   const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
   const [selectedItems, setSelectedItems] = useState(new Set());
   const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
   const [showTransferModal, setShowTransferModal] = useState(false);
   const [transferData, setTransferData] = useState({ toWarehouse: '', items: [] });
   const [reports, setReports] = useState([]);

   useEffect(() => {
     if (selectedWarehouse) {
       const fetchData = async () => {
         setGlobalLoading(true);
         try {
           const usersSnap = await getDocs(query(collection(db, 'employees'), where('isDisabled', '==', false)));
           const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
           setAllUsers(users);
           
           const assigned = users.filter(u => u.assignedWarehouseId === selectedWarehouse.id);
           setAssignedUsers(assigned);

           const invSnap = await getDocs(query(collection(db, 'inventory'), where('warehouseId', '==', selectedWarehouse.id), where('isDeleted', '==', false)));
           const invData = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
           setInventory(invData);
           
           const thirtyDaysAgo = new Date();
           thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
           const transSnap = await getDocs(query(
             collection(db, 'transactions'),
             where('warehouseId', '==', selectedWarehouse.id),
             where('timestamp', '>=', thirtyDaysAgo)
           ));
           
           const totalItems = invData.reduce((sum, item) => sum + (item.quantity || 0), 0);
           const totalValue = invData.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0)), 0);
           const categories = new Set(invData.map(item => item.category).filter(Boolean));
           const monthlySales = transSnap.docs.reduce((sum, doc) => {
             const data = doc.data();
             return sum + (data.finalTotal || data.total || 0);
           }, 0);
           
           setWarehouseStats({
             totalItems,
             totalValue,
             totalUsers: assigned.length,
             totalCategories: categories.size,
             totalTransactions: transSnap.size,
             monthlySales
           });
           
         } catch (error) {
           console.error("Error fetching warehouse data:", error);
           if (error.code === 'permission-denied') {
             showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
           }
         }
         setGlobalLoading(false);
       };
       fetchData();
     }
   }, [selectedWarehouse, setGlobalLoading]);

   // دوال التحديد المتعدد للمخزون
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
     if (selectedItems.size === inventory.length) {
       setSelectedItems(new Set());
     } else {
       setSelectedItems(new Set(inventory.map(i => i.id)));
     }
   };

   // دالة الحذف المجمع للمخزون في الفرع
   const handleBulkDeleteInventory = async () => {
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
       `هل أنت متأكد من حذف ${selectedItems.size} صنف من مخزون هذا الفرع بشكل نهائي؟`,
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

       await logUserActivity(appUser, 'حذف مجمع مخزون فرع', `تم حذف ${deleted} صنف من مخزون ${selectedWarehouse.name}`);
       showSuccess(`تم حذف ${deleted} صنف بنجاح`);
       
       setSelectedItems(new Set());
       setShowBulkDeleteModal(false);
       setBulkDeleteConfirm('');
       
       if (selectedWarehouse) {
         const invSnap = await getDocs(query(collection(db, 'inventory'), where('warehouseId', '==', selectedWarehouse.id), where('isDeleted', '==', false)));
         setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
       }
       
     } catch (error) {
       console.error("Bulk delete error:", error);
       showError("حدث خطأ أثناء الحذف المجمع");
     }
     setGlobalLoading(false);
   };

   // دالة نقل الأصناف بين الفروع
  const handleTransferItems = async () => {

  if (selectedItems.size === 0) {
    showError("لم يتم تحديد أي أصناف للنقل");
    return;
  }

  if (!transferData.toWarehouse) {
    showError("يرجى اختيار الفرع المستهدف");
    return;
  }

  const confirmed = await showConfirm(
    'تأكيد النقل',
    `هل أنت متأكد من نقل ${selectedItems.size} صنف إلى الفرع المحدد؟`,
    'info',
    'نعم، نقل'
  );

  if (!confirmed) return;

  setGlobalLoading(true);

  try {

    const itemsToTransfer = Array.from(selectedItems)
  .map(id => inventory.find(i => i.id === id))
  .filter(Boolean);

for (const item of itemsToTransfer) {

  const itemRef = doc(db, 'inventory', item.id);

  await updateDoc(itemRef, {
    warehouseId: transferData.toWarehouse,
    updatedAt: serverTimestamp()
  });

}

    await logUserActivity(
      appUser,
      'نقل مخزون بين فروع',
      `نقل ${selectedItems.size} صنف من ${selectedWarehouse.name}`
    );

    showSuccess("تم نقل الأصناف بنجاح");

    setSelectedItems(new Set());
    setShowTransferModal(false);
    setTransferData({ toWarehouse: '', items: [] });

    if (selectedWarehouse) {

      const invSnap = await getDocs(
        query(
          collection(db, 'inventory'),
          where('warehouseId', '==', selectedWarehouse.id),
          where('isDeleted', '==', false)
        )
      );

      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    }

  } catch (error) {

    console.error("Transfer error:", error);
    showError("حدث خطأ أثناء نقل الأصناف");

  } finally {

    setGlobalLoading(false);

  }

};
   const handleAdd = async (e) => {
      e.preventDefault(); 
      if(!name) return;
      setGlobalLoading(true);
      try { 
        await addDoc(collection(db, 'warehouses'), { 
          name, 
          location,
          phone,
          address,
          manager,
          email,
          workingHours,
          createdAt: serverTimestamp(),
          managers: [],
          users: []
        }); 
        showSuccess("تم إضافة الفرع بنجاح"); 
        setName(''); 
        setLocation('');
        setPhone('');
        setAddress('');
        setManager('');
        setEmail('');
        setWorkingHours('');
      } catch(e) { 
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("فشل الإضافة: " + e.message); 
        }
      }
      setGlobalLoading(false);
   };

   // دالة حذف الفرع
   const handleDeleteWarehouse = async (id) => {
     // 🛠️ FIX: حذف الفرع مباشرة من غير أي تحقق كان بيسيب أصناف مخزون
     // وموظفين معلّقين على warehouseId مش موجود أصلًا (بيانات يتيمة)،
     // فبتختفي فعليًا من كل الفلاتر والتقارير من غير أي تنبيه أو تفسير.
     setGlobalLoading(true);
     try {
       const [invSnap, empSnap] = await Promise.all([
         getDocs(query(collection(db, 'inventory'), where('warehouseId', '==', id), where('isDeleted', '==', false))),
         getDocs(query(collection(db, 'employees'), where('assignedWarehouseId', '==', id)))
       ]);

       if (invSnap.size > 0 || empSnap.size > 0) {
         setGlobalLoading(false);
         showError(
           `لا يمكن حذف هذا الفرع لأنه مرتبط بـ ${invSnap.size} صنف مخزون و ${empSnap.size} موظف. ` +
           `يرجى نقل المخزون وإعادة تعيين الموظفين لفرع آخر أولاً.`
         );
         return;
       }
     } catch (e) {
       setGlobalLoading(false);
       showError("فشل التحقق من بيانات الفرع قبل الحذف: " + e.message);
       return;
     }

     const confirmed = await showConfirm(
       'تأكيد حذف الفرع',
       'هل أنت متأكد من حذف هذا الفرع؟'
     );
     
     if (!confirmed) {
       setGlobalLoading(false);
       return;
     }
     
     try {
       await deleteDoc(doc(db, 'warehouses', id));
       showSuccess("تم حذف الفرع بنجاح");
       setSelectedWarehouse(null);
     } catch(e) {
       console.error(e);
       if (e.code === 'permission-denied') {
         showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
       } else {
         showError("فشل حذف الفرع: " + e.message);
       }
     }
     setGlobalLoading(false);
   };

   const handleUpdateWarehouse = async () => {
      if (!editingWarehouse) return;
      setGlobalLoading(true);
      try {
        await updateDoc(doc(db, 'warehouses', editingWarehouse.id), {
          name: editingWarehouse.name,
          location: editingWarehouse.location,
          phone: editingWarehouse.phone,
          address: editingWarehouse.address,
          manager: editingWarehouse.manager,
          email: editingWarehouse.email,
          workingHours: editingWarehouse.workingHours
        });
        showSuccess("تم تحديث بيانات الفرع");
        setEditingWarehouse(null);
        if (selectedWarehouse) {
          setSelectedWarehouse({...selectedWarehouse, ...editingWarehouse});
        }
      } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("فشل التحديث: " + e.message);
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
        
        if (assign) {
          showSuccess("تم تعيين المستخدم للفرع");
          setAssignedUsers(prev => [...prev, allUsers.find(u => u.id === userId)]);
        } else {
          showSuccess("تم إلغاء تعيين المستخدم");
          setAssignedUsers(prev => prev.filter(u => u.id !== userId));
        }
      } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("فشل تحديث تعيين المستخدم: " + e.message);
        }
      }
      setGlobalLoading(false);
   };

   const filteredUsers = allUsers.filter(user => 
     user.name?.toLowerCase().includes(searchUser.toLowerCase()) ||
     user.email?.toLowerCase().includes(searchUser.toLowerCase())
   );

   return (
      <div className="space-y-6 text-right" dir="rtl">
         
         {/* مودال نقل الأصناف */}
         {showTransferModal && (
           <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
               <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white">نقل الأصناف إلى فرع آخر</h3>
               <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                 تم تحديد <span className="font-bold text-indigo-600">{selectedItems.size}</span> صنف للنقل
               </p>
               
               <div className="space-y-4">
                 <div>
                   <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الفرع المستهدف</label>
                   <select
                     className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900"
                     value={transferData.toWarehouse}
                     onChange={e => setTransferData({...transferData, toWarehouse: e.target.value})}
                   >
                     <option value="">-- اختر الفرع --</option>
                     {warehouses
                       .filter(w => w.id !== selectedWarehouse?.id)
                       .map(w => (
                         <option key={w.id} value={w.id}>{w.name}</option>
                       ))}
                   </select>
                 </div>
                 
                 <div className="flex gap-2 pt-4">
                   <button
                     onClick={handleTransferItems}
                     className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700"
                   >
                     تأكيد النقل
                   </button>
                   <button
                     onClick={() => {
                       setShowTransferModal(false);
                       setTransferData({ toWarehouse: '', items: [] });
                     }}
                     className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
                   >
                     إلغاء
                   </button>
                 </div>
               </div>
             </div>
           </div>
         )}

         {/* مودال الحذف المجمع للمخزون */}
         {showBulkDeleteModal && (
           <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
               <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
                 <TrashIcon size={20}/> حذف مجمع لمخزون الفرع
               </h3>
               <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                 أنت على وشك حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> صنف من مخزون هذا الفرع بشكل نهائي.
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
                   onClick={handleBulkDeleteInventory}
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

         <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
            <h3 className="font-black text-xl mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
              <Store className="text-indigo-600"/> إضافة فرع جديد
            </h3>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-3">
               <input 
                 required 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="اسم الفرع *" 
                 value={name} 
                 onChange={e=>setName(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="الموقع" 
                 value={location} 
                 onChange={e=>setLocation(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="رقم الهاتف" 
                 value={phone} 
                 onChange={e=>setPhone(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="مدير الفرع" 
                 value={manager} 
                 onChange={e=>setManager(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="البريد الإلكتروني" 
                 type="email"
                 value={email} 
                 onChange={e=>setEmail(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="ساعات العمل" 
                 value={workingHours} 
                 onChange={e=>setWorkingHours(e.target.value)} 
               />
               <textarea 
                 className="md:col-span-3 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="العنوان بالتفصيل" 
                 value={address} 
                 onChange={e=>setAddress(e.target.value)} 
                 rows="2"
               />
               <button className="md:col-span-3 bg-slate-900 dark:bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-black dark:hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                 <Plus size={18}/> إضافة فرع
               </button>
            </form>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl shadow-sm overflow-hidden">
               <div className="p-4 border-b bg-slate-50 dark:bg-slate-900/50">
                  <h4 className="font-bold text-slate-600 dark:text-slate-400 text-sm">الفروع المتاحة</h4>
               </div>
               <div className="divide-y divide-slate-50 dark:divide-slate-700 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {warehouses.map(w => (
                     <button
                       key={w.id}
                       onClick={() => setSelectedWarehouse(w)}
                       className={`w-full p-4 text-right hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors flex justify-between items-center ${selectedWarehouse?.id === w.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-r-4 border-indigo-600' : ''}`}
                     >
                        <div className="flex items-center gap-3">
                           <MapPin size={18} className={selectedWarehouse?.id === w.id ? 'text-indigo-600' : 'text-slate-400'}/>
                           <div className="text-right">
                             <span className="font-bold text-slate-800 dark:text-white block">{w.name}</span>
                             {w.location && <span className="text-[10px] text-slate-500 dark:text-slate-400">{w.location}</span>}
                             {w.manager && <span className="text-[10px] text-indigo-400 block">مدير: {w.manager}</span>}
                           </div>
                        </div>
                        {w.id === 'main' && (
                          <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full">رئيسي</span>
                        )}
                     </button>
                  ))}
               </div>
            </div>

            <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl shadow-sm overflow-hidden">
               {selectedWarehouse ? (
                  <div className="p-6">
                     <div className="flex justify-between items-start mb-6">
                        <div>
                           <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">{selectedWarehouse.name}</h3>
                           {selectedWarehouse.manager && (
                             <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">مدير الفرع: {selectedWarehouse.manager}</p>
                           )}
                           {selectedWarehouse.location && <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{selectedWarehouse.location}</p>}
                           {selectedWarehouse.phone && <p className="text-sm text-slate-600 dark:text-slate-400 mb-1" dir="ltr">{selectedWarehouse.phone}</p>}
                           {selectedWarehouse.email && <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{selectedWarehouse.email}</p>}
                           {selectedWarehouse.workingHours && <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">ساعات العمل: {selectedWarehouse.workingHours}</p>}
                           {selectedWarehouse.address && <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">{selectedWarehouse.address}</p>}
                           <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">آخر تحديث: {formatDate(selectedWarehouse.createdAt)}</p>
                        </div>
                        {appUser.role === 'admin' && (
                          <div className="flex gap-2">
                             <button
                               onClick={() => setEditingWarehouse(selectedWarehouse)}
                               className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-indigo-600 dark:hover:bg-indigo-700 hover:text-white transition-colors"
                               title="تعديل بيانات الفرع"
                             >
                                <Edit size={16}/>
                             </button>
                             {selectedWarehouse.id !== 'main' && (
                               <button
                                 onClick={() => handleDeleteWarehouse(selectedWarehouse.id)}
                                 className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-600 dark:hover:bg-rose-700 hover:text-white transition-colors"
                                 title="حذف الفرع"
                               >
                                  <Trash2 size={16}/>
                               </button>
                             )}
                          </div>
                        )}
                     </div>

                     <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                        <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">إجمالي القطع</p>
                           <p className="text-lg font-black text-indigo-800 dark:text-indigo-300">{warehouseStats.totalItems}</p>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">قيمة المخزون</p>
                           <p className="text-lg font-black text-emerald-800 dark:text-emerald-300">{warehouseStats.totalValue.toLocaleString()} ج</p>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">المستخدمون</p>
                           <p className="text-lg font-black text-purple-800 dark:text-purple-300">{warehouseStats.totalUsers}</p>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">التصنيفات</p>
                           <p className="text-lg font-black text-amber-800 dark:text-amber-300">{warehouseStats.totalCategories}</p>
                        </div>
                        <div className="bg-rose-50 dark:bg-rose-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-rose-600 dark:text-rose-400 mb-1">مبيعات الشهر</p>
                           <p className="text-lg font-black text-rose-800 dark:text-rose-300">{warehouseStats.monthlySales.toLocaleString()} ج</p>
                        </div>
                     </div>

                     {editingWarehouse && editingWarehouse.id === selectedWarehouse.id && (
                       <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
                         <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-300 mb-3">تعديل بيانات الفرع</h4>
                         <div className="space-y-3">
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.name}
                             onChange={e => setEditingWarehouse({...editingWarehouse, name: e.target.value})}
                             placeholder="اسم الفرع"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.location || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, location: e.target.value})}
                             placeholder="الموقع"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.phone || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, phone: e.target.value})}
                             placeholder="رقم الهاتف"
                             dir="ltr"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.email || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, email: e.target.value})}
                             placeholder="البريد الإلكتروني"
                             type="email"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.manager || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, manager: e.target.value})}
                             placeholder="مدير الفرع"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.workingHours || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, workingHours: e.target.value})}
                             placeholder="ساعات العمل"
                           />
                           <textarea
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 resize-none"
                             value={editingWarehouse.address || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, address: e.target.value})}
                             placeholder="العنوان"
                             rows="2"
                           />
                           <div className="flex gap-2">
                             <button onClick={handleUpdateWarehouse} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700">
                                <Save size={16}/> حفظ
                             </button>
                             <button onClick={() => setEditingWarehouse(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600">
                                <X size={16}/> إلغاء
                             </button>
                           </div>
                         </div>
                       </div>
                     )}

                     <div className="flex border-b mb-4">
                        <button 
                          onClick={() => setShowInventory(false)}
                          className={`px-4 py-2 text-sm font-bold ${!showInventory ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                          المستخدمون ({assignedUsers.length})
                        </button>
                        <button 
                          onClick={() => setShowInventory(true)}
                          className={`px-4 py-2 text-sm font-bold ${showInventory ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                          المخزون ({inventory.length})
                        </button>
                     </div>

                     {!showInventory ? (
                       <div className="space-y-4">
                          <div className="flex gap-2 mb-3">
                            <input
                              type="text"
                              placeholder="بحث عن مستخدم..."
                              className="flex-1 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                              value={searchUser}
                              onChange={e => setSearchUser(e.target.value)}
                            />
                          </div>

                          <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <Users size={18} className="text-indigo-600"/>
                            المستخدمون الحاليون
                          </h4>

                          {assignedUsers.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                              {assignedUsers.map(user => {
                                const RoleIcon = getRoleIcon(user.role);
                                return (
                                  <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <div className="flex items-center gap-3">
                                      <RoleIcon size={16} className={`text-${getRoleColor(user.role)}-600`}/>
                                      <div>
                                        <p className="font-bold text-slate-800 dark:text-white">{user.name}</p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{user.email}</p>
                                        {user.jobTitle && <p className="text-[9px] text-indigo-400">{user.jobTitle}</p>}
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
                            <p className="text-slate-400 dark:text-slate-500 text-xs p-4 text-center border border-dashed rounded-xl">
                              لا يوجد مستخدمون معينون لهذا الفرع
                            </p>
                          )}

                          {appUser.role === 'admin' && (
                            <>
                              <h4 className="font-bold text-slate-700 dark:text-slate-300 mt-6 mb-3">تعيين مستخدمين جدد</h4>
                              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                {filteredUsers
                                  .filter(u => u.assignedWarehouseId !== selectedWarehouse.id && !u.isDisabled)
                                  .map(user => {
                                    const RoleIcon = getRoleIcon(user.role);
                                    return (
                                      <div key={user.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                                        <div className="flex items-center gap-3">
                                          <RoleIcon size={16} className={`text-${getRoleColor(user.role)}-600`}/>
                                          <div>
                                            <p className="font-bold text-slate-800 dark:text-white">{user.name}</p>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{user.email}</p>
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
                          <div className="flex justify-between items-center">
                            <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                              <Package size={18} className="text-indigo-600"/>
                              مخزون الفرع
                            </h4>
                            <div className="flex gap-2">
                              {selectedItems.size > 0 && (
                                <>
                                  <button
                                    onClick={() => setShowTransferModal(true)}
                                    className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center gap-2"
                                  >
                                    <ArrowRightLeft size={14}/> نقل {selectedItems.size}
                                  </button>
                                  <button
                                    onClick={() => setShowBulkDeleteModal(true)}
                                    className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center gap-2"
                                  >
                                    <TrashIcon size={14}/> حذف {selectedItems.size}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          
                          {inventory.length > 0 ? (
                            <div className="overflow-x-auto max-h-96 custom-scrollbar">
                              <table className="w-full text-right text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold text-xs">
                                  <tr>
                                    <th className="p-2 w-10">
                                      <input 
                                        type="checkbox" 
                                        className="w-4 h-4 accent-indigo-600"
                                        checked={selectedItems.size === inventory.length && inventory.length > 0}
                                        onChange={toggleSelectAll}
                                      />
                                    </th>
                                    <th className="p-2">السيريال</th>
                                    <th className="p-2">المنتج</th>
                                    <th className="p-2">التصنيف</th>
                                    <th className="p-2 text-center">الكمية</th>
                                    <th className="p-2 text-center">السعر</th>
                                    <th className="p-2 text-center">القيمة</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {inventory.map(item => (
                                    <tr key={item.id}>
                                      <td className="p-2">
                                        <input 
                                          type="checkbox" 
                                          className="w-4 h-4 accent-indigo-600"
                                          checked={selectedItems.has(item.id)}
                                          onChange={() => toggleSelectItem(item.id)}
                                        />
                                      </td>
                                      <td className="p-2 font-mono text-xs">{item.serialNumber}</td>
                                      <td className="p-2 font-bold">{item.name}</td>
                                      <td className="p-2 text-slate-600 dark:text-slate-400">{item.category || 'عام'}</td>
                                      <td className="p-2 text-center">{item.quantity}</td>
                                      <td className="p-2 text-center">{item.price * item.quantity} ج</td>
                                      <td className="p-2 text-center font-black text-indigo-600 dark:text-indigo-400">{(item.quantity * item.price).toLocaleString()} ج</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-slate-400 dark:text-slate-500 text-xs p-8 text-center border border-dashed rounded-xl">
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
// 🏪 نقطة البيع POS المحسنة مع تكامل كامل
// ==========================================================================
// ==========================================================================
// 🏪 نقطة البيع POS - الكود الكامل المعدل
// ==========================================================================
