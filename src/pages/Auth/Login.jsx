// src/pages/Auth/Login.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { EnvelopeIcon, KeyIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const { login, resetPassword, user } = useAuth()
  const { darkMode, toggleDarkMode } = useTheme()
  const navigate = useNavigate()

  // إذا كان المستخدم مسجل دخول بالفعل، انتقل للداشبورد
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    const result = await login(email, password)
    if (result.success) {
      navigate('/dashboard', { replace: true })
    }
    setLoading(false)
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!resetEmail) {
      toast.error('الرجاء إدخال البريد الإلكتروني')
      return
    }
    await resetPassword(resetEmail)
    setShowReset(false)
    setResetEmail('')
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">جاري التحويل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="absolute top-4 left-4">
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-lg text-xl"
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>
      
      <div className="max-w-md w-full mx-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">☕</div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              نظام إدارة المقهى
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              قم بتسجيل الدخول باستخدام بريدك الإلكتروني وكلمة المرور
            </p>
          </div>
          
          {!showReset ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pr-10 pl-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="your-email@example.com"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  كلمة المرور
                </label>
                <div className="relative">
                  <KeyIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pr-10 pl-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="••••••"
                  />
                </div>
              </div>
              
              <div className="text-left">
                <button
                  type="button"
                  onClick={() => setShowReset(true)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder="your-email@example.com"
                />
              </div>
              
              <button
                type="submit"
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                إرسال رابط إعادة التعيين
              </button>
              
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="w-full py-3 px-4 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
              >
                العودة لتسجيل الدخول
              </button>
            </form>
          )}
          
          <div className="mt-6 pt-6 border-t dark:border-gray-700 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              هذا النظام خاص بالإدارة فقط. للوصول إلى النظام، يرجى التواصل مع المدير
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login