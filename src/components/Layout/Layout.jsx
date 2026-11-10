// src/components/Layout/Layout.jsx
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import PageErrorBoundary from '../common/PageErrorBoundary'
import { autoRepairOfflineInvoices } from '../../services/invoiceNumberService'
import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { user, loading } = useAuth()
  const isOnline = useOnlineStatus()
  const navigate = useNavigate()
  const location = useLocation()

  // إصلاح أرقام فواتير OFFLINE تلقائياً عند فتح السيستم وكل ما النت يرجع
  useEffect(() => {
    if (!user) return
    const run = async () => {
      const res = await autoRepairOfflineInvoices()
      if (res?.fixedCount > 0) toast.success(`تم تصحيح ${res.fixedCount} فاتورة برقم مؤقت إلى أرقام تسلسلية`)
    }
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [user])

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true })
    }
  }, [user, loading, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">جاري تحميل البيانات...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        {!isOnline && (
          <div className="bg-yellow-500 text-white text-center py-2 text-sm font-bold">
            لا يوجد اتصال بالإنترنت حالياً - النظام مستمر في العمل وسيتم مزامنة البيانات تلقائياً فور رجوع الاتصال
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4">
          <PageErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default Layout