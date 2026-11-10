// src/components/Layout/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logger } from '../../utils/logger'

export const ProtectedRoute = ({ children, requiredRole, requiredPermission }) => {
  const { user, loading, hasRole, hasPermission, userData } = useAuth()

  // عرض شاشة تحميل أثناء التحقق من حالة المستخدم
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  // إذا لم يكن هناك مستخدم مسجل دخول، انتقل إلى صفحة تسجيل الدخول
  if (!user) {
    logger.log('🔒 ProtectedRoute: No user found, redirecting to login')
    return <Navigate to="/login" replace />
  }

  // التحقق من صلاحية الدور (role)
  if (requiredRole) {
    const hasRequiredRole = hasRole(requiredRole)
    if (!hasRequiredRole) {
      logger.log(`🔒 ProtectedRoute: User role ${userData?.role} does not have required role ${requiredRole}`)
      return <Navigate to="/unauthorized" replace />
    }
  }

  // التحقق من الصلاحية المحددة (permission)
  if (requiredPermission) {
    const hasRequiredPermission = hasPermission(requiredPermission)
    if (!hasRequiredPermission) {
      logger.log(`🔒 ProtectedRoute: User does not have required permission ${requiredPermission}`)
      return <Navigate to="/unauthorized" replace />
    }
  }

  // إذا اجتاز جميع الفحوصات، اعرض المحتوى
  return children
}

// دالة مساعدة للتحقق من صلاحية الحذف في أي مكان في التطبيق
// يمكن استخدامها في صفحات الفواتير والمنتجات والعملاء وغيرها
export const canDelete = (permission, userRole, hasPermissionFunc) => {
  // إذا كان المستخدم Admin، له صلاحية الحذف دائماً
  if (userRole === 'admin') return true
  
  // إذا كانت الصلاحية محددة والمستخدم لديه الصلاحية
  if (permission && hasPermissionFunc && hasPermissionFunc(permission)) {
    return true
  }
  
  return false
}

// دوال مساعدة لصلاحيات محددة
export const canDeleteInvoice = (userRole, hasPermissionFunc) => {
  return canDelete('invoices_delete', userRole, hasPermissionFunc)
}

export const canDeleteProduct = (userRole, hasPermissionFunc) => {
  return canDelete('products_delete', userRole, hasPermissionFunc)
}

export const canDeleteCustomer = (userRole, hasPermissionFunc) => {
  return canDelete('customers_delete', userRole, hasPermissionFunc)
}

export const canDeleteUser = (userRole, hasPermissionFunc) => {
  return canDelete('users_delete', userRole, hasPermissionFunc)
}

export const canEditPrice = (userRole, hasPermissionFunc) => {
  return canDelete('canEditPrices', userRole, hasPermissionFunc)
}

export const canViewReports = (userRole, hasPermissionFunc) => {
  return canDelete('reports_view', userRole, hasPermissionFunc)
}

export const canManageUsers = (userRole, hasPermissionFunc) => {
  return canDelete('users_manage', userRole, hasPermissionFunc)
}