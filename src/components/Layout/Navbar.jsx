// src/components/Layout/Navbar.jsx
import { Bars3Icon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useNavigate } from 'react-router-dom'

const Navbar = ({ sidebarOpen, setSidebarOpen }) => {
  const { user, userData, logout } = useAuth()
  const { darkMode, toggleDarkMode } = useTheme()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm px-4 py-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          
          <div>
            <h2 className="text-lg font-semibold dark:text-white">
              مرحباً, {userData?.name || user?.email?.split('@')[0] || 'مدير'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {userData?.role === 'admin' ? 'مدير النظام' : 
               userData?.role === 'branch_manager' ? 'مدير فرع' :
               userData?.role === 'cashier' ? 'كاشير' :
               userData?.role === 'inventory' ? 'مسؤول مخزون' :
               userData?.role === 'accountant' ? 'محاسب' : 'موظف'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-xl"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span className="hidden sm:inline">تسجيل خروج</span>
          </button>
        </div>
      </div>
    </nav>
  )
}

export default Navbar