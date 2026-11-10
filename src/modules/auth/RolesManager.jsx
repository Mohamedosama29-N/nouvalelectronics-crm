// src/modules/auth/RolesManager.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { useAuth, ALL_PERMISSIONS } from '../../contexts/AuthContext'
import { PlusIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { getLiveSnapshot } from '../../services/liveCollections'

const RolesManager = () => {
  const { hasPermission } = useAuth()
  const [roles, setRoles] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: {}
  })

  // قائمة بجميع الصلاحيات المتاحة
  // ⚠️ ملاحظة إصلاح: كانت هذه القائمة تحتوي على مفاتيح صلاحيات (مثل
  // 'sales_view', 'users_view') مختلفة تماماً عن المفاتيح الفعلية المستخدمة
  // في hasPermission() في باقي الصفحات (مثل 'invoices_view', 'users_manage').
  // النتيجة: كان المدير يقدر "يفعّل" صلاحيات وهمية ما بتأثرش في أي حاجة،
  // وميقدرش يمنح صلاحيات حقيقية زي 'pos_access' أو 'crm_view' لأنها مكنتش
  // موجودة في القائمة أصلاً. اتصلحت لتطابق ALL_PERMISSIONS الفعلية بالظبط.
  const availablePermissions = [
    { category: 'المنتجات', permissions: ['products_view', 'products_add', 'products_edit', 'products_delete'] },
    { category: 'الفواتير', permissions: ['invoices_view', 'invoices_create', 'invoices_delete', 'invoices_archive', 'invoices_refund'] },
    { category: 'العملاء', permissions: ['customers_view', 'customers_add', 'customers_edit', 'customers_delete'] },
    { category: 'التقارير', permissions: ['reports_view', 'reports_export', 'reports_advanced'] },
    { category: 'النظام', permissions: ['settings_view', 'settings_edit', 'users_manage', 'backup_manage', 'roles_manage', 'logs_view', 'data_export'] },
    { category: 'المخزون والمواد الخام', permissions: ['inventory_view', 'inventory_edit', 'inventory_reorder', 'raw_materials_view', 'raw_materials_edit', 'recipes_view', 'recipes_edit'] },
    { category: 'المشتريات والموردين', permissions: ['purchases_view', 'purchases_create', 'purchases_approve', 'purchases_receive', 'suppliers_view', 'suppliers_edit'] },
    { category: 'المطبخ', permissions: ['kitchen_view', 'kitchen_update', 'kitchen_print', 'kitchen_cancel', 'kitchen_archive'] },
    { category: 'الولاء', permissions: ['loyalty_view', 'loyalty_edit', 'loyalty_rewards'] },
    { category: 'الفروع', permissions: ['branches_view', 'branches_manage'] },
    { category: 'الموظفين', permissions: ['employees_view', 'employees_manage', 'attendance_view', 'attendance_manage'] },
    { category: 'الحجوزات', permissions: ['bookings_view', 'bookings_manage', 'tables_manage'] },
    { category: 'CRM', permissions: ['crm_view', 'crm_campaigns'] },
    { category: 'نقطة البيع', permissions: ['pos_access', 'discounts_manage', 'pos_direct_sale'] },
    { category: 'درج الكاش', permissions: ['shifts_view', 'shifts_manage'] },
    { category: 'المصروفات', permissions: ['expenses_view', 'expenses_add', 'expenses_delete'] }
  ]

  useEffect(() => {
    loadRoles()
  }, [])

  const loadRoles = async () => {
    try {
      const snapshot = await getLiveSnapshot('roles')
      const rolesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setRoles(rolesData)
    } catch (error) {
      toast.error('فشل تحميل الأدوار')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingRole) {
        await updateDoc(doc(db, 'roles', editingRole.id), formData)
        toast.success('تم تحديث الدور بنجاح')
      } else {
        await addDoc(collection(db, 'roles'), formData)
        toast.success('تم إضافة الدور بنجاح')
      }
      setShowModal(false)
      setEditingRole(null)
      setFormData({ name: '', description: '', permissions: {} })
      loadRoles()
    } catch (error) {
      toast.error('حدث خطأ')
    }
  }

  const handleDelete = async (id) => {
    if (confirm('هل أنت متأكد من حذف هذا الدور؟')) {
      await deleteDoc(doc(db, 'roles', id))
      toast.success('تم الحذف بنجاح')
      loadRoles()
    }
  }

  if (!hasPermission('roles_manage')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">👥 إدارة الأدوار والصلاحيات</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">إنشاء وتعديل أدوار المستخدمين وتحديد صلاحياتهم</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <PlusIcon className="w-5 h-5" /> دور جديد
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">لا توجد أدوار. أضف دور جديد</div>
        ) : (
          roles.map(role => (
            <div key={role.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
              <div className="p-6 border-b dark:border-gray-700">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold dark:text-white">{role.name}</h3>
                    <p className="text-gray-500 text-sm mt-1">{role.description || 'وصف الدور'}</p>
                  </div>
                  <ShieldCheckIcon className="w-8 h-8 text-blue-500" />
                </div>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-1 mb-4">
                  {Object.keys(role.permissions || {}).filter(p => role.permissions[p]).slice(0, 5).map(perm => (
                    <span key={perm} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">✓ {perm.replace(/_/g, ' ')}</span>
                  ))}
                  {Object.keys(role.permissions || {}).filter(p => role.permissions[p]).length > 5 && (
                    <span className="text-xs text-gray-500">+{Object.keys(role.permissions).filter(p => role.permissions[p]).length - 5} أخرى</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingRole(role); setFormData(role); setShowModal(true) }} className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">تعديل</button>
                  <button onClick={() => handleDelete(role.id)} className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">حذف</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Role Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">{editingRole ? 'تعديل دور' : 'إضافة دور جديد'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="اسم الدور (مثال: مدير, كاشير, محاسب)"
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
                <textarea
                  placeholder="وصف الدور"
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
                
                <div className="border-t pt-4">
                  <h3 className="font-bold mb-3 dark:text-white">الصلاحيات</h3>
                  {availablePermissions.map(category => (
                    <div key={category.category} className="mb-4">
                      <p className="font-semibold text-blue-600 mb-2">{category.category}</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {category.permissions.map(perm => (
                          <label key={perm} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={formData.permissions?.[perm] || false}
                              onChange={(e) => setFormData({
                                ...formData,
                                permissions: { ...formData.permissions, [perm]: e.target.checked }
                              })}
                              className="w-4 h-4"
                            />
                            <span className="dark:text-gray-300">{ALL_PERMISSIONS[perm] || perm.replace(/_/g, ' ')}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600">حفظ</button>
                <button type="button" onClick={() => { setShowModal(false); setEditingRole(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default RolesManager