// src/pages/Settings/UsersManagement.jsx
import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { auth as firebaseAuth } from '../../services/firebase'
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { UserPlusIcon, PencilIcon, TrashIcon, KeyIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'

const UsersManagement = () => {
  const { userData, hasPermission, loadUsers, users } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedPermissions, setExpandedPermissions] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'cashier',
    branch: 'الفرع الرئيسي',
    isActive: true,
    permissions: {
      products_view: true,
      products_add: false,
      products_edit: false,
      products_delete: false,
      invoices_view: true,
      invoices_create: true,
      invoices_delete: false,
      invoices_archive: false,
      customers_view: true,
      customers_add: false,
      customers_edit: false,
      customers_delete: false,
      reports_view: true,
      reports_export: false,
      settings_view: true,
      settings_edit: false,
      users_manage: false,
      backup_manage: false,
      inventory_view: true,
      inventory_edit: false,
      inventory_reorder: false,
      pos_access: true,
      discounts_manage: false,
      branches_view: false,
      branches_manage: false,
      employees_view: false,
      employees_manage: false,
      bookings_view: false,
      bookings_manage: false,
      crm_view: false,
      loyalty_view: false,
      kitchen_view: false,
      kitchen_cancel: false,
      kitchen_archive: false,
      purchases_view: false,
      logs_view: false,
      data_export: false,
      pos_direct_sale: false,
      expenses_view: false,
      expenses_add: false,
      expenses_delete: false
    }
  })

  const roles = [
    { value: 'admin', label: 'مدير النظام', color: 'bg-purple-100 text-purple-800', description: 'جميع الصلاحيات' },
    { value: 'branch_manager', label: 'مدير فرع', color: 'bg-blue-100 text-blue-800', description: 'إدارة فرع كامل' },
    { value: 'cashier', label: 'كاشير', color: 'bg-green-100 text-green-800', description: 'بيع فقط' },
    { value: 'inventory', label: 'مسؤول مخزون', color: 'bg-yellow-100 text-yellow-800', description: 'إدارة المخزون' },
    { value: 'accountant', label: 'محاسب', color: 'bg-indigo-100 text-indigo-800', description: 'تقارير مالية' }
  ]

  const setPermissionsByRole = (role) => {
    const basePermissions = {
      products_view: true, products_add: false, products_edit: false, products_delete: false,
      invoices_view: true, invoices_create: true, invoices_delete: false, invoices_archive: false,
      customers_view: true, customers_add: false, customers_edit: false, customers_delete: false,
      reports_view: true, reports_export: false,
      settings_view: true, settings_edit: false, users_manage: false, backup_manage: false,
      inventory_view: true, inventory_edit: false, inventory_reorder: false,
      pos_access: true, discounts_manage: false,
      branches_view: false, branches_manage: false, employees_view: false, employees_manage: false,
      bookings_view: false, bookings_manage: false, crm_view: false, loyalty_view: false,
      kitchen_view: false, kitchen_cancel: false, kitchen_archive: false,
      purchases_view: false, logs_view: false, data_export: false,
      pos_direct_sale: false, expenses_view: false, expenses_add: false, expenses_delete: false
    }

    switch (role) {
      case 'admin':
        Object.keys(basePermissions).forEach(key => {
          basePermissions[key] = true
        })
        break
      case 'branch_manager':
        basePermissions.products_edit = true
        basePermissions.inventory_edit = true
        basePermissions.customers_edit = true
        basePermissions.reports_export = true
        basePermissions.settings_edit = true
        basePermissions.branches_view = true
        basePermissions.employees_view = true
        break
      case 'inventory':
        basePermissions.products_add = true
        basePermissions.products_edit = true
        basePermissions.inventory_edit = true
        basePermissions.inventory_reorder = true
        basePermissions.reports_export = true
        basePermissions.purchases_view = true
        break
      case 'accountant':
        basePermissions.reports_export = true
        basePermissions.invoices_archive = true
        break
      default:
        break
    }
    
    return basePermissions
  }

  const handleRoleChange = (newRole) => {
    const newPermissions = setPermissionsByRole(newRole)
    setFormData({ ...formData, role: newRole, permissions: newPermissions })
  }

  const updatePermission = (permission, value) => {
    setFormData({
      ...formData,
      permissions: { ...formData.permissions, [permission]: value }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      if (editingUser) {
        // تحديث مستخدم موجود
        if (editingUser.uid === userData?.uid && editingUser.role === 'admin') {
          await updateDoc(doc(db, 'users', editingUser.uid), {
            name: formData.name,
            branch: formData.branch,
            isActive: formData.isActive,
            updatedAt: new Date()
          })
          toast.success('✅ تم تحديث بياناتك الشخصية بنجاح')
        } else {
          await updateDoc(doc(db, 'users', editingUser.uid), {
            name: formData.name,
            role: formData.role,
            branch: formData.branch,
            isActive: formData.isActive,
            permissions: formData.permissions,
            updatedAt: new Date()
          })
          toast.success('✅ تم تحديث المستخدم بنجاح')
        }
      } else {
        // إنشاء مستخدم جديد
        if (!formData.email || !formData.password) {
          toast.error('❌ البريد الإلكتروني وكلمة المرور مطلوبين')
          setLoading(false)
          return
        }
        if (formData.password.length < 6) {
          toast.error('❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل')
          setLoading(false)
          return
        }

        // إنشاء المستخدم في Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(firebaseAuth, formData.email, formData.password)
        
        // إضافة بيانات المستخدم في Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          branch: formData.branch,
          isActive: true,
          permissions: formData.permissions,
          createdAt: new Date()
        })
        
        toast.success(`✅ تم إنشاء المستخدم ${formData.name} بنجاح`)
        toast(`🔑 بيانات الدخول: ${formData.email} / ${formData.password}`, { icon: 'ℹ️', duration: 8000
        })
      }
      
      setShowModal(false)
      setEditingUser(null)
      resetForm()
      await loadUsers()
      
    } catch (error) {
      logger.error('Error:', error)
      if (error.code === 'auth/email-already-in-use') {
        toast.error('❌ البريد الإلكتروني مستخدم بالفعل')
      } else if (error.code === 'auth/weak-password') {
        toast.error('❌ كلمة المرور ضعيفة - يجب أن تكون 6 أحرف على الأقل')
      } else if (error.code === 'auth/invalid-email') {
        toast.error('❌ البريد الإلكتروني غير صحيح')
      } else {
        toast.error('❌ فشل حفظ المستخدم: ' + error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    
    setLoading(true)
    try {
      toast.success('تم تغيير كلمة المرور بنجاح')
      setShowPasswordModal(false)
      setNewPassword('')
    } catch (error) {
      toast.error('فشل إعادة تعيين كلمة المرور')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (user) => {
    if (user.uid === userData?.uid) {
      toast.error('لا يمكن حذف حسابك الحالي')
      return
    }
    
    if (!confirm(`⚠️ تحذير: سيتم حذف المستخدم ${user.name} نهائياً. هل أنت متأكد؟`)) return
    
    setLoading(true)
    try {
      await deleteDoc(doc(db, 'users', user.uid))
      toast.success('تم حذف المستخدم بنجاح')
      await loadUsers()
    } catch (error) {
      toast.error('فشل حذف المستخدم')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      email: '', password: '', name: '', role: 'cashier', branch: 'الفرع الرئيسي', isActive: true,
      permissions: setPermissionsByRole('cashier')
    })
  }

  const getRoleLabel = (role) => {
    const r = roles.find(r => r.value === role)
    return r ? r.label : role
  }

  const getRoleColor = (role) => {
    const r = roles.find(r => r.value === role)
    return r ? r.color : 'bg-gray-100 text-gray-800'
  }

  if (!hasPermission('users_manage') && userData?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-red-600 mb-2">غير مصرح</h1>
          <p className="text-gray-600">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">👥 إدارة المستخدمين</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">إضافة وتعديل حسابات المستخدمين (المدير فقط)</p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setEditingUser(null)
            setShowModal(true)
          }}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <UserPlusIcon className="w-5 h-5" />
          مستخدم جديد
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-right">الاسم</th>
                <th className="px-6 py-3 text-right">البريد الإلكتروني</th>
                <th className="px-6 py-3 text-right">الصلاحية</th>
                <th className="px-6 py-3 text-right">الفرع</th>
                <th className="px-6 py-3 text-right">الحالة</th>
                <th className="px-6 py-3 text-right">تاريخ الإنشاء</th>
                <th className="px-6 py-3 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-500">
                    لا يوجد مستخدمون
                   </td>
                 </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.uid} className="border-t dark:border-gray-700">
                    <td className="px-6 py-4 font-medium dark:text-white">
                      {user.name}
                      {user.uid === userData?.uid && (
                        <span className="mr-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">أنت</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-sm ${getRoleColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{user.branch || 'الفرع الرئيسي'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-sm ${user.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {user.isActive !== false ? 'نشط' : 'غير نشط'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {user.createdAt ? new Date(user.createdAt.toDate()).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingUser(user)
                            setFormData({
                              email: user.email,
                              password: '',
                              name: user.name,
                              role: user.role,
                              branch: user.branch,
                              isActive: user.isActive !== false,
                              permissions: user.permissions || {}
                            })
                            setShowModal(true)
                          }}
                          className="text-blue-500 hover:text-blue-700"
                          title="تعديل"
                        >
                          <PencilIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user)
                            setShowPasswordModal(true)
                          }}
                          className="text-green-500 hover:text-green-700"
                          title="إعادة تعيين كلمة المرور"
                        >
                          <KeyIcon className="w-5 h-5" />
                        </button>
                        {user.uid !== userData?.uid && (
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="text-red-500 hover:text-red-700"
                            title="حذف"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">
              {editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="الاسم الكامل"
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
                
                <input
                  type="email"
                  placeholder="البريد الإلكتروني"
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                  disabled={!!editingUser}
                />
                
                {!editingUser && (
                  <input
                    type="password"
                    placeholder="كلمة المرور"
                    className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required
                  />
                )}
                
                <select
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={formData.role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                >
                  {roles.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                
                <input
                  type="text"
                  placeholder="الفرع"
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={formData.branch}
                  onChange={(e) => setFormData({...formData, branch: e.target.value})}
                />
                
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                    className="w-4 h-4"
                  />
                  <span className="dark:text-white">حساب نشط</span>
                </label>
                
                {/* صلاحيات تفصيلية */}
                <div className="border-t pt-3 mt-3">
                  <button
                    type="button"
                    onClick={() => setExpandedPermissions(!expandedPermissions)}
                    className="flex items-center gap-2 text-blue-500 mb-3"
                  >
                    {expandedPermissions ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                    <span className="font-semibold">الصلاحيات التفصيلية</span>
                  </button>
                  
                  {expandedPermissions && (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {/* 📦 المنتجات */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-blue-600">📦 المنتجات</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.products_view} onChange={(e) => updatePermission('products_view', e.target.checked)} /> عرض المنتجات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.products_add} onChange={(e) => updatePermission('products_add', e.target.checked)} /> إضافة منتج</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.products_edit} onChange={(e) => updatePermission('products_edit', e.target.checked)} /> تعديل منتج</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.products_delete} onChange={(e) => updatePermission('products_delete', e.target.checked)} /> حذف منتج</label>
    </div>
    
    {/* 🧾 الفواتير */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-green-600">🧾 الفواتير</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.invoices_view} onChange={(e) => updatePermission('invoices_view', e.target.checked)} /> عرض الفواتير</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.invoices_create} onChange={(e) => updatePermission('invoices_create', e.target.checked)} /> إنشاء فاتورة</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.invoices_delete} onChange={(e) => updatePermission('invoices_delete', e.target.checked)} /> حذف فاتورة</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.invoices_archive} onChange={(e) => updatePermission('invoices_archive', e.target.checked)} /> أرشيف الفواتير</label>
    </div>
    
    {/* 👥 العملاء */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-purple-600">👥 العملاء</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.customers_view} onChange={(e) => updatePermission('customers_view', e.target.checked)} /> عرض العملاء</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.customers_add} onChange={(e) => updatePermission('customers_add', e.target.checked)} /> إضافة عميل</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.customers_edit} onChange={(e) => updatePermission('customers_edit', e.target.checked)} /> تعديل عميل</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.customers_delete} onChange={(e) => updatePermission('customers_delete', e.target.checked)} /> حذف عميل</label>
    </div>
    
    {/* 📊 التقارير */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-orange-600">📊 التقارير</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.reports_view} onChange={(e) => updatePermission('reports_view', e.target.checked)} /> عرض التقارير</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.reports_export} onChange={(e) => updatePermission('reports_export', e.target.checked)} /> تصدير التقارير</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.reports_advanced} onChange={(e) => updatePermission('reports_advanced', e.target.checked)} /> التقارير المتقدمة</label>
    </div>
    
    {/* ⚙️ النظام */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-gray-600">⚙️ النظام</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.settings_view} onChange={(e) => updatePermission('settings_view', e.target.checked)} /> عرض الإعدادات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.settings_edit} onChange={(e) => updatePermission('settings_edit', e.target.checked)} /> تعديل الإعدادات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.users_manage} onChange={(e) => updatePermission('users_manage', e.target.checked)} /> إدارة المستخدمين</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.backup_manage} onChange={(e) => updatePermission('backup_manage', e.target.checked)} /> إدارة النسخ الاحتياطي</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.roles_manage} onChange={(e) => updatePermission('roles_manage', e.target.checked)} /> إدارة الأدوار والصلاحيات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.logs_view} onChange={(e) => updatePermission('logs_view', e.target.checked)} /> عرض سجل النشاطات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.data_export} onChange={(e) => updatePermission('data_export', e.target.checked)} /> تصدير واستيراد البيانات</label>
    </div>
    
    {/* 📦 المخزون والمواد الخام */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-yellow-600">📦 المخزون</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.inventory_view} onChange={(e) => updatePermission('inventory_view', e.target.checked)} /> عرض المخزون</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.inventory_edit} onChange={(e) => updatePermission('inventory_edit', e.target.checked)} /> تعديل المخزون</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.inventory_reorder} onChange={(e) => updatePermission('inventory_reorder', e.target.checked)} /> إعادة طلب مخزون</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.raw_materials_view} onChange={(e) => updatePermission('raw_materials_view', e.target.checked)} /> عرض المواد الخام</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.raw_materials_edit} onChange={(e) => updatePermission('raw_materials_edit', e.target.checked)} /> تعديل المواد الخام</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.recipes_view} onChange={(e) => updatePermission('recipes_view', e.target.checked)} /> عرض الوصفات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.recipes_edit} onChange={(e) => updatePermission('recipes_edit', e.target.checked)} /> تعديل الوصفات</label>
    </div>
    
    {/* 🏭 المشتريات والموردين */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-cyan-600">🏭 المشتريات</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.purchases_view} onChange={(e) => updatePermission('purchases_view', e.target.checked)} /> عرض المشتريات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.purchases_create} onChange={(e) => updatePermission('purchases_create', e.target.checked)} /> إنشاء أمر شراء</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.purchases_approve} onChange={(e) => updatePermission('purchases_approve', e.target.checked)} /> اعتماد أمر شراء</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.purchases_receive} onChange={(e) => updatePermission('purchases_receive', e.target.checked)} /> استلام مشتريات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.suppliers_view} onChange={(e) => updatePermission('suppliers_view', e.target.checked)} /> عرض الموردين</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.suppliers_edit} onChange={(e) => updatePermission('suppliers_edit', e.target.checked)} /> تعديل الموردين</label>
    </div>
    
    {/* 🍳 المطبخ */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-red-600">🍳 المطبخ</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.kitchen_view} onChange={(e) => updatePermission('kitchen_view', e.target.checked)} /> عرض شاشة المطبخ</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.kitchen_update} onChange={(e) => updatePermission('kitchen_update', e.target.checked)} /> تحديث حالة الطلب</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.kitchen_print} onChange={(e) => updatePermission('kitchen_print', e.target.checked)} /> طباعة تذكرة المطبخ</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.kitchen_cancel} onChange={(e) => updatePermission('kitchen_cancel', e.target.checked)} /> إلغاء طلب من شاشة المطبخ</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.kitchen_archive} onChange={(e) => updatePermission('kitchen_archive', e.target.checked)} /> عرض أرشيف طلبات المطبخ</label>
    </div>
    
    {/* 🎁 نظام الولاء */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-pink-600">🎁 نظام الولاء</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.loyalty_view} onChange={(e) => updatePermission('loyalty_view', e.target.checked)} /> عرض نظام الولاء</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.loyalty_edit} onChange={(e) => updatePermission('loyalty_edit', e.target.checked)} /> تعديل نقاط الولاء</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.loyalty_rewards} onChange={(e) => updatePermission('loyalty_rewards', e.target.checked)} /> إدارة المكافآت</label>
    </div>
    
    {/* 🏢 الفروع */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-indigo-600">🏢 الفروع</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.branches_view} onChange={(e) => updatePermission('branches_view', e.target.checked)} /> عرض الفروع</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.branches_manage} onChange={(e) => updatePermission('branches_manage', e.target.checked)} /> إدارة الفروع</label>
    </div>
    
    {/* 👥 الموظفين */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-emerald-600">👥 الموظفين</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.employees_view} onChange={(e) => updatePermission('employees_view', e.target.checked)} /> عرض الموظفين</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.employees_manage} onChange={(e) => updatePermission('employees_manage', e.target.checked)} /> إدارة الموظفين</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.attendance_view} onChange={(e) => updatePermission('attendance_view', e.target.checked)} /> عرض الحضور</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.attendance_manage} onChange={(e) => updatePermission('attendance_manage', e.target.checked)} /> تسجيل الحضور</label>
    </div>
    
    {/* 🪑 الحجوزات */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-lime-600">🪑 الحجوزات</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.bookings_view} onChange={(e) => updatePermission('bookings_view', e.target.checked)} /> عرض الحجوزات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.bookings_manage} onChange={(e) => updatePermission('bookings_manage', e.target.checked)} /> إدارة الحجوزات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.tables_manage} onChange={(e) => updatePermission('tables_manage', e.target.checked)} /> إدارة الطاولات</label>
    </div>
    
    {/* 📊 CRM */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-teal-600">📊 CRM</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.crm_view} onChange={(e) => updatePermission('crm_view', e.target.checked)} /> عرض CRM</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.crm_campaigns} onChange={(e) => updatePermission('crm_campaigns', e.target.checked)} /> إدارة الحملات التسويقية</label>
    </div>
    
    {/* 💰 نقطة البيع */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-amber-600">💰 نقطة البيع</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.pos_access} onChange={(e) => updatePermission('pos_access', e.target.checked)} /> الوصول لنقطة البيع</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.discounts_manage} onChange={(e) => updatePermission('discounts_manage', e.target.checked)} /> إدارة الخصومات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.pos_direct_sale} onChange={(e) => updatePermission('pos_direct_sale', e.target.checked)} /> بيع مباشر (بدون انتظار المطبخ)</label>
    </div>

    {/* 💸 المصروفات */}
    <div className="border p-3 rounded-lg">
      <p className="font-bold text-sm mb-2 text-rose-600">💸 المصروفات</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.expenses_view} onChange={(e) => updatePermission('expenses_view', e.target.checked)} /> عرض المصروفات</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.expenses_add} onChange={(e) => updatePermission('expenses_add', e.target.checked)} /> تسجيل مصروف</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.permissions?.expenses_delete} onChange={(e) => updatePermission('expenses_delete', e.target.checked)} /> حذف مصروف</label>
    </div>
  </div>
)}
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button type="submit" disabled={loading} className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600">
                  {loading ? 'جاري الحفظ...' : (editingUser ? 'تحديث' : 'إضافة')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingUser(null)
                    resetForm()
                  }}
                  className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">
              إعادة تعيين كلمة المرور
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              إعادة تعيين كلمة المرور للمستخدم: <strong>{selectedUser.name}</strong>
            </p>
            <div className="space-y-3">
              <input
                type="password"
                placeholder="كلمة المرور الجديدة"
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-gray-500">كلمة المرور يجب أن تكون 6 أحرف على الأقل</p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleResetPassword}
                disabled={loading}
                className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
              >
                {loading ? 'جاري...' : 'إعادة تعيين'}
              </button>
              <button
                onClick={() => {
                  setShowPasswordModal(false)
                  setSelectedUser(null)
                  setNewPassword('')
                }}
                className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UsersManagement