import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, serverTimestamp, onSnapshot, writeBatch, limit
} from 'firebase/firestore';
import {
  LayoutDashboard,
  Download,
  Plus,
  Edit,
  Trash2,
  UserCog,
  X,
  Shield,
  Eye,
  UserPlus,
  Trash as TrashIcon,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { DASHBOARD_WIDGETS } from '../../constants/dashboard';
import { ALL_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS, USER_ROLES } from '../../constants/roles';
import { db } from '../../firebase/config';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { getDashboardWidgetConfig } from '../../utils/dashboardHelpers';
import { exportToExcel } from '../../utils/exportUtils';
import { formatDate } from '../../utils/format';
import { getRoleColor, getRoleColorClasses, getRoleIcon } from '../../utils/roleHelpers';
import { hashPassword } from '../../utils/security';
import { validators } from '../../utils/validators';

export function EnhancedUserManagement({ appUser, warehouses, setGlobalLoading, onViewProfile }) {
  const [usersList, setUsersList] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    pass: '', 
    role: 'sales', 
    assignedWarehouseId: 'main',
    department: '',
    jobTitle: '',
    hireDate: '',
    salary: 0,
    notes: ''
  });
  const [permissionsByCategory, setPermissionsByCategory] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState(null);
  // 🎛️ حالة مودال تخصيص الداشبورد لكل مستخدم
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [dashboardUser, setDashboardUser] = useState(null);
  const [dashboardWidgetsDraft, setDashboardWidgetsDraft] = useState([]);
  const [departments] = useState(['المبيعات', 'المخزون', 'الصيانة', 'المحاسبة', 'الإدارة', 'الكول سنتر', 'استقبال مركز']);

  
  // خيارات فترات الضمان
const WARRANTY_PERIODS = [
  { value: '6_months', label: '6 شهور' },
  { value: '1_year', label: 'سنة' },
  { value: '2_years', label: 'سنتين' },
  { value: '3_years', label: '3 سنوات' },
  { value: '5_years', label: '5 سنوات' }
];


  useEffect(() => {
    if (appUser?.role !== 'admin') return;
    // 🛠️ FIX (أداء): كان الاستماع مفتوح على كل مستندات كوليكشن الموظفين
    // بدون حد أقصى. مع تعدد المستخدمين المتصلين، أي تعديل/إضافة موظف من
    // أي حد كان بيبعت كل المستندات تاني لكل شاشة إدارة مستخدمين مفتوحة.
    // limit() هنا بيحدد سقف معقول (يقدر يتزوّد لو عدد الموظفين الفعلي أكبر).
    const unsub = onSnapshot(
      query(collection(db, 'employees'), limit(500)),
      snap => setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
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
    if (selectedItems.size === filteredUsers.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredUsers.map(u => u.id)));
    }
  };

  // دالة الحذف المجمع
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      showError("لم يتم تحديد أي مستخدمين للحذف");
      return;
    }

    if (bulkDeleteConfirm !== 'حذف') {
      showError("يرجى كتابة 'حذف' لتأكيد العملية");
      return;
    }

    const confirmed = await showConfirm(
      'تأكيد الحذف المجمع',
      `هل أنت متأكد من حذف ${selectedItems.size} مستخدم بشكل نهائي؟`,
      'warning',
      'نعم، احذف الكل'
    );

    if (!confirmed) return;

    setGlobalLoading(true);
    try {
      // 🛠️ FIX: الحذف الفردي بيمنع الأدمن من حذف حسابه الحالي (الزرار
      // بيتعطّل له)، لكن الحذف الجماعي معندهوش نفس الحماية — لو الأدمن
      // عمل "تحديد الكل" كان ممكن يحذف حسابه بالغلط ويتقفل بره النظام.
      const skippedSelf = selectedItems.has(appUser.id);
      const itemsToDelete = Array.from(selectedItems).filter(id => id !== appUser.id);
      const chunks = [];
      
      for (let i = 0; i < itemsToDelete.length; i += 400) {
        chunks.push(itemsToDelete.slice(i, i + 400));
      }

      let deleted = 0;
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        chunk.forEach(userId => {
          const ref = doc(db, 'employees', userId);
          batch.delete(ref);
        });

        await batch.commit();
        deleted += chunk.length;
      }

      await logUserActivity(appUser, 'حذف مجمع مستخدمين', `تم حذف ${deleted} مستخدم`);
      showSuccess(skippedSelf
        ? `تم حذف ${deleted} مستخدم بنجاح (تم تجاهل حسابك الحالي لحمايته من الحذف)`
        : `تم حذف ${deleted} مستخدم بنجاح`);
      
      setSelectedItems(new Set());
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirm('');
      
    } catch (error) {
      console.error("Bulk delete error:", error);
      showError("حدث خطأ أثناء الحذف المجمع");
    }
    setGlobalLoading(false);
  };

  const handleUpdateUser = async (e) => {
     e.preventDefault(); 
     if (!editingUser) return;
     setGlobalLoading(true);
     try {
        const dataToUpdate = {
            name: editingUser.name,
            phone: editingUser.phone || '',
            role: editingUser.role,
            department: editingUser.department || '',
            jobTitle: editingUser.jobTitle || '',
            hireDate: editingUser.hireDate || '',
            salary: editingUser.salary || 0,
            notes: editingUser.notes || '',
            assignedWarehouseId: editingUser.assignedWarehouseId,
            isDisabled: editingUser.isDisabled || false,
            permissions: editingUser.permissions || {}
        };
        await updateDoc(doc(db, 'employees', editingUser.id), dataToUpdate);
        await logUserActivity(appUser, 'تعديل بيانات موظف', `تعديل صلاحيات أو بيانات الموظف: ${editingUser.name}`);
        showSuccess("تم حفظ الإعدادات"); 
        setEditingUser(null);
     } catch(e) { 
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ في حفظ الإعدادات: " + e.message); 
        }
     }
     setGlobalLoading(false);
  };

  const handleAddUser = async (e) => {
     e.preventDefault();
     
     const errors = validators.user(newUser);
     if (errors.length > 0) {
       showError(errors.join('\n'));
       return;
     }
     
     setGlobalLoading(true);
     try {
        const emailToSave = newUser.email.trim().toLowerCase();
        const q = query(collection(db, 'employees'), where('email', '==', emailToSave));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            showError("المستخدم موجود بالفعل بهذا البريد الإلكتروني!");
            setGlobalLoading(false);
            return;
        }
        
        const defaultPermissions = ROLE_DEFAULT_PERMISSIONS[newUser.role] || {};
        defaultPermissions.viewInvoices = newUser.role === 'admin';

        await addDoc(collection(db, 'employees'), {
            email: emailToSave,
            pass: hashPassword(newUser.pass),
            name: newUser.name,
            phone: newUser.phone || '',
            role: newUser.role,
            department: newUser.department || '',
            jobTitle: newUser.jobTitle || '',
            hireDate: newUser.hireDate || '',
            salary: Number(newUser.salary) || 0,
            notes: newUser.notes || '',
            assignedWarehouseId: newUser.assignedWarehouseId,
            permissions: defaultPermissions,
            isDisabled: false,
            createdAt: serverTimestamp(),
            lastLogin: null,
            loginHistory: []
        });
        
        await logUserActivity(appUser, 'إضافة موظف', `إنشاء حساب للموظف: ${newUser.name} بدور ${newUser.role}`);
        showSuccess("تم إضافة المستخدم بنجاح");
        setShowAddModal(false);
        setNewUser({ 
          name: '', 
          email: '', 
          phone: '', 
          pass: '', 
          role: 'sales', 
          assignedWarehouseId: 'main',
          department: '',
          jobTitle: '',
          hireDate: '',
          salary: 0,
          notes: ''
        });
     } catch (err) {
        console.error(err);
        if (err.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ أثناء إضافة المستخدم: " + err.message);
        }
     }
     setGlobalLoading(false);
  };

  const handleDeleteUser = async (id, name) => {
     const confirmed = await showConfirm(
       'تأكيد الحذف',
       `هل أنت متأكد من حذف المستخدم "${name}" بشكل نهائي؟`
     );
     
     if (!confirmed) return;
     
     setGlobalLoading(true);
     try {
        await deleteDoc(doc(db, 'employees', id));
        await logUserActivity(appUser, 'حذف موظف', `تم حذف حساب الموظف: ${name}`);
        showSuccess("تم حذف المستخدم بنجاح");
     } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ أثناء الحذف: " + e.message);
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

  const handleCopyPermissions = (sourceUser) => {
    if (!editingUser) return;
    setEditingUser({
      ...editingUser,
      permissions: { ...sourceUser.permissions }
    });
    showSuccess("تم نسخ الصلاحيات");
  };

  const handleSavePermissions = async () => {
    if (!permissionsUser) return;
    setGlobalLoading(true);
    try {
      await updateDoc(doc(db, 'employees', permissionsUser.id), {
        permissions: permissionsUser.permissions
      });
      await logUserActivity(appUser, 'تعديل صلاحيات', `تعديل صلاحيات المستخدم: ${permissionsUser.name}`);
      showSuccess("تم حفظ الصلاحيات بنجاح");
      setShowPermissionsModal(false);
      setPermissionsUser(null);
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء حفظ الصلاحيات");
    }
    setGlobalLoading(false);
  };

  // 🎛️ فتح مودال تخصيص الداشبورد لمستخدم معيّن - بنجهّز نسخة عمل (draft)
  // مرتبة من DASHBOARD_WIDGETS بعد تطبيق إعداداته المحفوظة (أو الافتراضي)
  const openDashboardCustomization = (user) => {
    setDashboardUser(user);
    setDashboardWidgetsDraft(getDashboardWidgetConfig(user));
    setShowDashboardModal(true);
  };

  const toggleDraftWidget = (id) => {
    setDashboardWidgetsDraft(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const moveDraftWidget = (id, direction) => {
    setDashboardWidgetsDraft(prev => {
      const list = [...prev];
      const idx = list.findIndex(w => w.id === id);
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (idx === -1 || targetIdx < 0 || targetIdx >= list.length) return prev;
      [list[idx], list[targetIdx]] = [list[targetIdx], list[idx]];
      return list;
    });
  };

  const handleSaveDashboardConfig = async () => {
    if (!dashboardUser) return;
    setGlobalLoading(true);
    try {
      const widgets = {};
      dashboardWidgetsDraft.forEach((w, idx) => {
        widgets[w.id] = { visible: w.visible, order: idx };
      });
      await updateDoc(doc(db, 'employees', dashboardUser.id), {
        dashboardConfig: { widgets }
      });
      await logUserActivity(appUser, 'تخصيص الداشبورد', `تعديل عناصر الداشبورد للمستخدم: ${dashboardUser.name}`);
      showSuccess("تم حفظ تخصيص الداشبورد بنجاح");
      setShowDashboardModal(false);
      setDashboardUser(null);
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء حفظ تخصيص الداشبورد");
    }
    setGlobalLoading(false);
  };

  const resetDraftToDefault = () => {
    setDashboardWidgetsDraft(DASHBOARD_WIDGETS.map((w, idx) => ({ ...w, visible: true, order: idx })));
  };

  const filteredUsers = usersList.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.phone?.includes(searchTerm);
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesWarehouse = filterWarehouse === 'all' || user.assignedWarehouseId === filterWarehouse;
    const matchesDepartment = filterDepartment === 'all' || user.department === filterDepartment;
    return matchesSearch && matchesRole && matchesWarehouse && matchesDepartment;
  });


  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* مودال تعديل المستخدم */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <UserCog className="text-indigo-600"/> إعدادات الموظف
              </h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-rose-600">
                <X size={24}/>
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اسم الموظف</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={editingUser.name} 
                       onChange={e=>setEditingUser({...editingUser, name:e.target.value})} 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">البريد الإلكتروني</label>
                     <input 
                       type="email"
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={editingUser.email} 
                       disabled
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم الهاتف</label>
                     <input 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold font-mono bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={editingUser.phone || ''} 
                       onChange={e=>setEditingUser({...editingUser, phone:e.target.value})} 
                       dir="ltr" 
                     />
                  </div>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الرتبة</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-white dark:bg-slate-900 outline-none focus:border-indigo-500" 
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
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الفرع المخصص</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-white dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.assignedWarehouseId} 
                      onChange={e=>setEditingUser({...editingUser, assignedWarehouseId:e.target.value})}
                    >
                       {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">القسم</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-white dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.department || ''} 
                      onChange={e=>setEditingUser({...editingUser, department: e.target.value})}
                    >
                       <option value="">-- اختر القسم --</option>
                       {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">المسمى الوظيفي</label>
                    <input 
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.jobTitle || ''} 
                      onChange={e=>setEditingUser({...editingUser, jobTitle: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">تاريخ التعيين</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.hireDate || ''} 
                      onChange={e=>setEditingUser({...editingUser, hireDate: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الراتب</label>
                    <input 
                      type="number"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.salary || 0} 
                      onChange={e=>setEditingUser({...editingUser, salary: Number(e.target.value)})} 
                    />
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                  <textarea
                    rows="2"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500"
                    value={editingUser.notes || ''}
                    onChange={e=>setEditingUser({...editingUser, notes: e.target.value})}
                  />
               </div>
               
               <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <input 
                        type="checkbox" 
                        id="disableUser" 
                        className="w-4 h-4 accent-rose-600" 
                        checked={editingUser.isDisabled || false} 
                        onChange={e => setEditingUser({...editingUser, isDisabled: e.target.checked})} 
                    />
                    <label htmlFor="disableUser" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">تعطيل الحساب (منع الدخول)</label>
               </div>

               <div className="flex gap-3 pt-4 border-t">
                 <button type="submit" className="flex-1 bg-slate-900 dark:bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-black dark:hover:bg-indigo-700 transition-colors">حفظ التعديلات</button>
                 <button type="button" onClick={()=>setEditingUser(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">إلغاء</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال إضافة مستخدم */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <UserPlus className="text-indigo-600"/> إضافة مستخدم جديد
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24}/>
              </button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اسم الموظف *</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={newUser.name} 
                       onChange={e=>setNewUser({...newUser, name:e.target.value})} 
                       placeholder="الاسم بالكامل" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم الهاتف</label>
                     <input 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold font-mono bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={newUser.phone} 
                       onChange={e=>setNewUser({...newUser, phone:e.target.value})} 
                       placeholder="01XXXXXXXXX" 
                       dir="ltr" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">البريد الإلكتروني *</label>
                     <input 
                       type="email" 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold font-mono bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={newUser.email} 
                       onChange={e=>setNewUser({...newUser, email:e.target.value})} 
                       placeholder="employee@domain.com" 
                       dir="ltr" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">كلمة المرور *</label>
                     <input 
                       type="text" 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold font-mono bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={newUser.pass} 
                       onChange={e=>setNewUser({...newUser, pass:e.target.value})} 
                       placeholder="كلمة المرور للدخول" 
                       dir="ltr" 
                     />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الرتبة</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.role} 
                      onChange={e=>setNewUser({...newUser, role:e.target.value})}>
                       {USER_ROLES.map(role => (
                         <option key={role.key} value={role.key}>{role.label}</option>
                       ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">القسم</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.department} 
                      onChange={e=>setNewUser({...newUser, department:e.target.value})}>
                       <option value="">-- اختر القسم --</option>
                       {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الفرع المخصص</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.assignedWarehouseId} 
                      onChange={e=>setNewUser({...newUser, assignedWarehouseId:e.target.value})}>
                       {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">المسمى الوظيفي</label>
                    <input 
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.jobTitle} 
                      onChange={e=>setNewUser({...newUser, jobTitle:e.target.value})} 
                    />
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">تاريخ التعيين</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.hireDate} 
                      onChange={e=>setNewUser({...newUser, hireDate:e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الراتب</label>
                    <input 
                      type="number"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.salary} 
                      onChange={e=>setNewUser({...newUser, salary: Number(e.target.value)})} 
                    />
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                  <textarea
                    rows="2"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500"
                    value={newUser.notes}
                    onChange={e=>setNewUser({...newUser, notes:e.target.value})}
                  />
               </div>
               
               <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                 <p className="text-xs text-indigo-800 dark:text-indigo-300 font-bold">
                   سيتم منح المستخدم الصلاحيات الافتراضية حسب الدور المختار، ويمكنك تعديلها لاحقاً من صفحة تعديل المستخدم.
                 </p>
               </div>

               <div className="flex gap-3 pt-4 border-t">
                 <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors flex justify-center items-center gap-2">
                   <Plus size={18}/> إنشاء الحساب
                 </button>
                 <button type="button" onClick={()=>setShowAddModal(false)} className="px-6 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">إلغاء</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال إدارة الصلاحيات التفصيلية */}
      {showPermissionsModal && permissionsUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <Shield className="text-indigo-600"/> إدارة صلاحيات {permissionsUser.name}
              </h3>
              <button onClick={() => setShowPermissionsModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24}/>
              </button>
            </div>
            
            <div className="space-y-6">
              {Object.entries(permissionsByCategory).map(([category, perms]) => (
                <div key={category} className="mb-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b">
                    <h5 className="font-bold text-indigo-700 dark:text-indigo-400">{category}</h5>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const newPermissions = { ...permissionsUser.permissions };
                          perms.forEach(p => {
                            newPermissions[p.key] = true;
                          });
                          setPermissionsUser({ ...permissionsUser, permissions: newPermissions });
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                      >
                        تحديد الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newPermissions = { ...permissionsUser.permissions };
                          perms.forEach(p => {
                            newPermissions[p.key] = false;
                          });
                          setPermissionsUser({ ...permissionsUser, permissions: newPermissions });
                        }}
                        className="text-xs text-slate-500 hover:text-slate-700 font-bold"
                      >
                        إلغاء الكل
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                     {perms.map(p => (
                        <label 
                          key={p.key} 
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${permissionsUser.permissions?.[p.key] ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'}`}
                          title={p.label}
                        >
                           <input 
                             type="checkbox" 
                             className="w-4 h-4 accent-indigo-600" 
                             checked={permissionsUser.permissions?.[p.key] || false} 
                             onChange={e => setPermissionsUser({
                               ...permissionsUser, 
                               permissions: {
                                 ...permissionsUser.permissions, 
                                 [p.key]: e.target.checked
                               }
                             })} 
                           />
                           <span className="text-xs font-bold line-clamp-2">{p.label}</span>
                        </label>
                     ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-4 border-t mt-6">
              <button
                onClick={handleSavePermissions}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700"
              >
                حفظ الصلاحيات
              </button>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎛️ مودال تخصيص الداشبورد لكل مستخدم على حدة */}
      {showDashboardModal && dashboardUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-2 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <LayoutDashboard className="text-indigo-600"/> تخصيص الداشبورد لـ {dashboardUser.name}
              </h3>
              <button onClick={() => setShowDashboardModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24}/>
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              حدد العناصر اللي هتظهر في داشبورد المستخدم ده، ورتّبها بالسهام. العناصر الأولى بتظهر فوق.
            </p>

            <div className="space-y-2">
              {dashboardWidgetsDraft.map((w, idx) => (
                <div
                  key={w.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${w.visible ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 opacity-60'}`}
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveDraftWidget(w.id, 'up')}
                      disabled={idx === 0}
                      className="text-slate-400 hover:text-indigo-600 disabled:opacity-20 disabled:cursor-not-allowed"
                      title="نقل لأعلى"
                    >
                      <ArrowUp size={14}/>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDraftWidget(w.id, 'down')}
                      disabled={idx === dashboardWidgetsDraft.length - 1}
                      className="text-slate-400 hover:text-indigo-600 disabled:opacity-20 disabled:cursor-not-allowed"
                      title="نقل لأسفل"
                    >
                      <ArrowDown size={14}/>
                    </button>
                  </div>

                  <label className="flex items-center gap-3 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-indigo-600"
                      checked={w.visible}
                      onChange={() => toggleDraftWidget(w.id)}
                    />
                    <div>
                      <span className="text-sm font-bold text-slate-800 dark:text-white block">{w.label}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{w.category}</span>
                    </div>
                  </label>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-4 border-t mt-6">
              <button
                onClick={handleSaveDashboardConfig}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700"
              >
                حفظ التخصيص
              </button>
              <button
                onClick={resetDraftToDefault}
                className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
                title="إرجاع كل العناصر للوضع الافتراضي (ظاهرة، بالترتيب الأصلي)"
              >
                رجوع للافتراضي
              </button>
              <button
                onClick={() => setShowDashboardModal(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال الحذف المجمع */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <TrashIcon size={20}/> حذف مجمع للمستخدمين
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              أنت على وشك حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> مستخدم بشكل نهائي.
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

       <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b bg-slate-50 dark:bg-slate-900/50 flex flex-wrap justify-between items-center gap-4">
             <div className="flex items-center gap-3">
                <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                  <Shield className="text-indigo-600" size={20}/> فريق العمل والصلاحيات
                </h3>
                <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-1.5 rounded-lg font-bold text-xs">{usersList.length} مستخدم</div>
             </div>
             
             <div className="flex flex-wrap gap-2">
               {selectedItems.size > 0 && (
                 <button 
                   onClick={() => setShowBulkDeleteModal(true)} 
                   className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center justify-center gap-2"
                 >
                   <TrashIcon size={14}/> حذف {selectedItems.size} مستخدم
                 </button>
               )}
               
               <input
                 type="text"
                 placeholder="بحث..."
                 className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
               />
               <select
                 className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                 value={filterRole}
                 onChange={e => setFilterRole(e.target.value)}
               >
                 <option value="all">كل الأدوار</option>
                 {USER_ROLES.map(role => (
                   <option key={role.key} value={role.key}>{role.label}</option>
                 ))}
               </select>
               <select
                 className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                 value={filterWarehouse}
                 onChange={e => setFilterWarehouse(e.target.value)}
               >
                 <option value="all">كل الفروع</option>
                 {warehouses.map(w => (
                   <option key={w.id} value={w.id}>{w.name}</option>
                 ))}
               </select>
               <select
                 className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                 value={filterDepartment}
                 onChange={e => setFilterDepartment(e.target.value)}
               >
                 <option value="all">كل الأقسام</option>
                 {departments.map(d => (
                   <option key={d} value={d}>{d}</option>
                 ))}
               </select>
               <button 
                 onClick={() => {
                   // 🆕 تصدير Excel للمستخدمين - مش موجود قبل كده خالص
                   if (filteredUsers.length === 0) {
                     showError("لا يوجد مستخدمين للتصدير");
                     return;
                   }
                   const exportData = filteredUsers.map(u => ({
                     'الاسم': u.name || '-',
                     'البريد الإلكتروني': u.email || '-',
                     'الهاتف': u.phone || '-',
                     'الدور الوظيفي': USER_ROLES.find(r => r.key === u.role)?.label || u.role,
                     'الفرع': warehouses.find(w => w.id === u.assignedWarehouseId)?.name || u.assignedWarehouseId || '-',
                     'القسم': u.department || '-',
                     'الوظيفة': u.jobTitle || '-',
                     'تاريخ التعيين': u.hireDate || '-',
                     'آخر دخول': u.lastLogin ? formatDate(u.lastLogin) : '-',
                     'عدد الصلاحيات': Object.values(u.permissions || {}).filter(Boolean).length
                   }));
                   if (exportToExcel(exportData, `Users_${new Date().toISOString().split('T')[0]}`, 'المستخدمين')) {
                     showSuccess("تم تصدير ملف Excel بنجاح");
                   } else {
                     showError("حدث خطأ أثناء التصدير");
                   }
                 }}
                 className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2 whitespace-nowrap"
               >
                  <Download size={14}/> تصدير Excel
               </button>
               <button 
                 onClick={()=>setShowAddModal(true)} 
                 className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm whitespace-nowrap"
               >
                  <Plus size={14}/> إضافة مستخدم
               </button>
             </div>
          </div>
          
          <div className="overflow-x-auto">
             <table className="w-full text-right text-sm">
                <thead className="bg-white dark:bg-slate-900 border-b text-slate-500 dark:text-slate-400 font-bold">
                   <tr>
                      <th className="p-5 w-10">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 accent-indigo-600"
                          checked={selectedItems.size === filteredUsers.length && filteredUsers.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-5">الموظف</th>
                      <th className="p-5 text-center">الفرع</th>
                      <th className="p-5 text-center">القسم</th>
                      <th className="p-5 text-center">الرتبة</th>
                      <th className="p-5 text-center">الحالة</th>
                      <th className="p-5 text-center">آخر ظهور</th>
                      <th className="p-5 text-center">عدد الصلاحيات</th>
                      <th className="p-5 text-center">إدارة</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700 font-medium">
                   {filteredUsers.map(u => {
                     const RoleIcon = getRoleIcon(u.role);
                     const roleColor = getRoleColor(u.role);
                     const permissionsCount = Object.values(u.permissions || {}).filter(Boolean).length;
                     return (
                       <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                          <td className="p-5">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 accent-indigo-600"
                              checked={selectedItems.has(u.id)}
                              onChange={() => toggleSelectItem(u.id)}
                            />
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-2">
                              <RoleIcon size={16} className={`text-${roleColor}-600`}/>
                              <div>
                                <p className="text-slate-800 dark:text-white font-bold">{u.name || 'مستخدم جديد'}</p>
                                <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1" dir="ltr">{u.email}</p>
                                {u.phone && <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{u.phone}</p>}
                                {u.jobTitle && <p className="text-[9px] text-indigo-400">{u.jobTitle}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="p-5 text-center font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                            {warehouses.find(w=>w.id===u.assignedWarehouseId)?.name || 'الرئيسي'}
                          </td>
                          <td className="p-5 text-center text-slate-600 dark:text-slate-400 text-xs">
                            {u.department || '-'}
                          </td>
                          <td className="p-5 text-center">
                            <span className={`px-3 py-1 rounded-md text-[10px] font-bold ${getRoleColorClasses(u.role)}`}>
                              {USER_ROLES.find(r => r.key === u.role)?.label || u.role}
                            </span>
                          </td>
                          <td className="p-5 text-center">
                              {u.isDisabled ? 
                                  <span className="px-3 py-1 rounded-md text-[10px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">موقوف</span> : 
                                  <span className="px-3 py-1 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">نشط</span>
                              }
                          </td>
                          <td className="p-5 text-center text-[10px] text-slate-500 dark:text-slate-400">
                            {u.lastLogin ? formatDate(u.lastLogin) : '-'}
                          </td>
                          <td className="p-5 text-center font-bold">
                            <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-lg text-xs">
                              {permissionsCount} / {ALL_PERMISSIONS.length}
                            </span>
                          </td>
                          <td className="p-5 text-center flex justify-center gap-2">
                              <button 
                                onClick={() => onViewProfile(u)} 
                                className="p-2 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg hover:bg-sky-600 dark:hover:bg-sky-700 hover:text-white transition-colors shadow-sm" 
                                title="عرض نشاط الموظف"
                              >
                                <Eye size={16}/>
                              </button>
                              <button 
                                onClick={() => { setPermissionsUser(u); setShowPermissionsModal(true); }} 
                                className="p-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-600 dark:hover:bg-purple-700 hover:text-white transition-colors shadow-sm" 
                                title="إدارة الصلاحيات"
                              >
                                <Shield size={16}/>
                              </button>
                              <button 
                                onClick={() => openDashboardCustomization(u)} 
                                className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-600 dark:hover:bg-indigo-700 hover:text-white transition-colors shadow-sm" 
                                title="تخصيص الداشبورد"
                              >
                                <LayoutDashboard size={16}/>
                              </button>
                              <button 
                                onClick={()=>setEditingUser({...u, permissions: u.permissions || {}})} 
                                className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-indigo-600 dark:hover:bg-indigo-700 hover:text-white transition-colors shadow-sm" 
                                title="تعديل البيانات"
                              >
                                <Edit size={16}/>
                              </button>
                              <button 
                                onClick={()=>handleDeleteUser(u.id, u.name || u.email)} 
                                disabled={appUser.id === u.id} 
                                className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-600 dark:hover:bg-rose-700 hover:text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" 
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
// 🏪 مدير الفروع المحسن مع إدارة كاملة
// ==========================================================================
