// src/contexts/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth'
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { auth, db } from '../services/firebase'
import { logger } from '../utils/logger'
import toast from 'react-hot-toast'
import { stopAllLiveCollections } from '../services/liveCollections'

const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (userDoc.exists()) {
            // ⚠️ إصلاح مهم: كانت userData بتتحفظ من غير uid (userDoc.data() لوحدها
            // بترجع بيانات المستند بس من غير الـ id بتاعه). ده كان معناه إن
            // userData?.uid كانت دايماً undefined في كل الشاشات، فأي حقل زي
            // cashierId في الفاتورة أو voidedBy في الإلغاء كان بيتسجل null
            // دايماً بدل معرّف المستخدم الحقيقي.
            setUserData({ uid: firebaseUser.uid, ...userDoc.data() })
          } else {
            // إذا وجد مستخدم في Auth ولكن لا توجد بيانات في Firestore
            // نعتبره غير مصرح له ونسجل خروجه
            logger.warn('User exists in Auth but not in Firestore')
            await signOut(auth)
            setUserData(null)
            toast.error('حسابك غير مصرح به. يرجى التواصل مع المدير')
          }
        } catch (error) {
          logger.error('Error loading user data:', error)
        }
        await loadUsers()
      } else {
        setUserData(null)
        setUsers([])
      }
      
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const loadUsers = async () => {
    try {
      const usersRef = collection(db, 'users')
      const usersSnapshot = await getDocs(usersRef)
      const usersList = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      }))
      setUsers(usersList)
    } catch (error) {
      logger.error('Error loading users:', error)
    }
  }

  // تسجيل الدخول فقط - لا يوجد تسجيل عام
  // src/contexts/AuthContext.jsx
// أصلح دالة login

const login = async (email, password) => {
  logger.audit('login_attempt', email)
  
  try {
    const result = await signInWithEmailAndPassword(auth, email, password)
    logger.audit('login_authenticated', result.user.uid)
    
    // التحقق من وجود المستخدم في Firestore
    const userDoc = await getDoc(doc(db, 'users', result.user.uid))
    
    if (!userDoc.exists()) {
      logger.warn('Login blocked: user not found in Firestore')
      await signOut(auth)
      toast.error('❌ هذا الحساب غير مصرح به. يرجى التواصل مع المدير')
      return { success: false, error: 'unauthorized' }
    }
    
    const userDataFromDb = userDoc.data()
    logger.audit('login_success', result.user.uid)
    
    if (userDataFromDb.isActive === false) {
      logger.warn('Login blocked: account inactive')
      await signOut(auth)
      toast.error('❌ هذا الحساب معطل. يرجى التواصل مع المدير')
      return { success: false, error: 'inactive' }
    }
    
    toast.success(`✨ مرحباً ${userDataFromDb.name || result.user.email}`)
    return { success: true, user: result.user }
    
  } catch (error) {
    logger.error('❌ خطأ في تسجيل الدخول:', error.code, error.message)
    
    let errorMessage = '❌ فشل تسجيل الدخول'
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        errorMessage = '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة'
        break
      case 'auth/invalid-email':
        errorMessage = '❌ البريد الإلكتروني غير صحيح'
        break
      case 'auth/too-many-requests':
        errorMessage = '❌ تم تعطيل الحساب مؤقتاً. حاول لاحقاً'
        break
      case 'auth/configuration-not-found':
        errorMessage = '❌ خطأ في إعدادات Firebase. تأكد من تفعيل Email/Password'
        break
      default:
        errorMessage = `❌ ${error.message}`
    }
    toast.error(errorMessage)
    return { success: false, error: errorMessage }
  }
}
  // تسجيل الخروج
  const logout = async () => {
    stopAllLiveCollections()
    try {
      await signOut(auth)
      toast.success('تم تسجيل الخروج بنجاح')
      return { success: true }
    } catch (error) {
      toast.error('فشل تسجيل الخروج')
      return { success: false }
    }
  }

  // إعادة تعيين كلمة المرور
  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email)
      toast.success('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني')
      return { success: true }
    } catch (error) {
      let errorMessage = 'فشل إرسال رابط إعادة التعيين'
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'لا يوجد مستخدم بهذا البريد الإلكتروني'
      }
      toast.error(errorMessage)
      return { success: false }
    }
  }

  // تحديث دور المستخدم وصلاحياته
  // دالة تحديث صلاحيات المستخدم - أضف شرط لمنع تغيير الـ Admin
const updateUserRole = async (uid, role, permissions) => {
  // منع تغيير صلاحيات المستخدم الحالي إذا كان Admin
  if (uid === user?.uid && userData?.role === 'admin') {
    toast.error('لا يمكن تغيير صلاحيات حساب المدير الرئيسي')
    return { success: false, error: 'cannot_change_admin' }
  }
  
  // منع تغيير أي مستخدم إلى Admin إلا إذا كان المنفذ Admin
  if (role === 'admin' && userData?.role !== 'admin') {
    toast.error('غير مصرح لك بإنشاء حساب مدير')
    return { success: false, error: 'unauthorized' }
  }
  
  try {
    await setDoc(doc(db, 'users', uid), {
      role,
      permissions,
      updatedAt: new Date()
    }, { merge: true })
    toast.success('تم تحديث صلاحيات المستخدم')
    await loadUsers()
    return { success: true }
  } catch (error) {
    toast.error('فشل تحديث الصلاحيات')
    return { success: false }
  }
}

  // تحديث بيانات المستخدم
  const updateUserProfile = async (uid, data) => {
    try {
      await setDoc(doc(db, 'users', uid), data, { merge: true })
      if (uid === user?.uid) {
        setUserData(prev => ({ ...prev, ...data }))
      }
      toast.success('تم تحديث البيانات بنجاح')
      return { success: true }
    } catch (error) {
      toast.error('فشل تحديث البيانات')
      return { success: false }
    }
  }

  // التحقق من الصلاحيات
  const hasPermission = (requiredPermission) => {
    if (!userData) return false
    if (userData.role === 'admin') return true
    const perms = userData.permissions
    // حسابات قديمة ممكن تكون صلاحياتها متسجلة كقائمة بدل كائن
    if (Array.isArray(perms)) return perms.includes(requiredPermission)
    return perms?.[requiredPermission] === true
  }

  const hasRole = (roles) => {
    if (!userData) return false
    if (userData.role === 'admin') return true
    return roles.includes(userData.role)
  }

  return (
    <AuthContext.Provider value={{
      user,
      userData,
      users,
      loading,
      login,
      logout,
      resetPassword,
      updateUserRole,
      updateUserProfile,
      hasPermission,
      hasRole,
      loadUsers
    }}>
      {children}
    </AuthContext.Provider>
  )
}


// src/contexts/AuthContext.jsx - أضف قائمة الصلاحيات الكاملة

// قائمة بجميع الصلاحيات المتاحة في النظام
export const ALL_PERMISSIONS = {
  // المنتجات
  products_view: 'عرض المنتجات',
  products_add: 'إضافة منتج',
  products_edit: 'تعديل منتج',
  products_delete: 'حذف منتج',
  
  // الفواتير
  invoices_view: 'عرض الفواتير',
  invoices_create: 'إنشاء فاتورة',
  invoices_delete: 'حذف فاتورة',
  invoices_archive: 'أرشيف الفواتير',
  
  // العملاء
  customers_view: 'عرض العملاء',
  customers_add: 'إضافة عميل',
  customers_edit: 'تعديل عميل',
  customers_delete: 'حذف عميل',
  
  // التقارير
  reports_view: 'عرض التقارير',
  reports_export: 'تصدير التقارير',
  reports_advanced: 'التقارير المتقدمة',
  
  // النظام
  settings_view: 'عرض الإعدادات',
  settings_edit: 'تعديل الإعدادات',
  users_manage: 'إدارة المستخدمين',
  backup_manage: 'إدارة النسخ الاحتياطي',
  roles_manage: 'إدارة الأدوار والصلاحيات',
  logs_view: 'عرض سجل النشاطات',
  data_export: 'تصدير واستيراد البيانات',
  
  // المخزون والمواد الخام
  inventory_view: 'عرض المخزون',
  inventory_edit: 'تعديل المخزون',
  inventory_reorder: 'إعادة طلب مخزون',
  raw_materials_view: 'عرض المواد الخام',
  raw_materials_edit: 'تعديل المواد الخام',
  recipes_view: 'عرض الوصفات',
  recipes_edit: 'تعديل الوصفات',
  
  // المشتريات والموردين
  purchases_view: 'عرض المشتريات',
  purchases_create: 'إنشاء أمر شراء',
  purchases_approve: 'اعتماد أمر شراء',
  purchases_receive: 'استلام مشتريات',
  suppliers_view: 'عرض الموردين',
  suppliers_edit: 'تعديل الموردين',
  
  // المطبخ
  kitchen_view: 'عرض شاشة المطبخ',
  kitchen_update: 'تحديث حالة الطلب',
  kitchen_print: 'طباعة تذكرة المطبخ',
  kitchen_cancel: 'إلغاء طلب من شاشة المطبخ',
  kitchen_archive: 'عرض أرشيف طلبات المطبخ',
  
  // الولاء
  loyalty_view: 'عرض نظام الولاء',
  loyalty_edit: 'تعديل نقاط الولاء',
  loyalty_rewards: 'إدارة المكافآت',
  
  // الفروع
  branches_view: 'عرض الفروع',
  branches_manage: 'إدارة الفروع',
  
  // الموظفين
  employees_view: 'عرض الموظفين',
  employees_manage: 'إدارة الموظفين',
  attendance_view: 'عرض الحضور',
  attendance_manage: 'تسجيل الحضور',
  
  // الحجوزات
  bookings_view: 'عرض الحجوزات',
  bookings_manage: 'إدارة الحجوزات',
  tables_manage: 'إدارة الطاولات',
  
  // CRM
  crm_view: 'عرض CRM',
  crm_campaigns: 'إدارة الحملات التسويقية',
  
  // نقطة البيع
  pos_access: 'الوصول لنقطة البيع',
  discounts_manage: 'إدارة الخصومات',
  pos_direct_sale: 'بيع مباشر (بدون انتظار المطبخ)',

  // درج الكاش / الشيفتات
  shifts_view: 'عرض الشيفتات',
  shifts_manage: 'فتح وقفل الشيفتات',

  // استرجاع/إلغاء الفواتير
  invoices_refund: 'استرجاع أو إلغاء فاتورة',

  // المصروفات
  expenses_view: 'عرض المصروفات',
  expenses_add: 'تسجيل مصروف',
  expenses_delete: 'حذف مصروف'
}