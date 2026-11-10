// src/components/Common/NotificationBell.jsx
import { useState, useEffect, useCallback } from 'react'
import { BellIcon } from '@heroicons/react/24/outline'
import { wsService } from '../../services/websocketService'
import { useAuth } from '../../contexts/AuthContext'

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const { userData } = useAuth()

  const addNotification = useCallback((notification) => {
    setNotifications(prev => [notification, ...prev])
  }, [])

  useEffect(() => {
    // مفيش اتصال إلا بعد ما بيانات المستخدم تتحمّل (عشان الـ uid والفرع يوصلوا صح)
    if (!userData?.uid) return

    const handleNewOrder = (order) => addNotification({
      id: Date.now() + Math.random(),
      type: 'order',
      title: 'طلب جديد',
      message: `طلب رقم ${order.id} - ${order.customerName}`,
      read: false,
      data: order
    })
    const handleLowStock = (alert) => addNotification({
      id: Date.now() + Math.random(),
      type: 'warning',
      title: 'تنبيه مخزون',
      message: `${alert.materialName} - الكمية منخفضة`,
      read: false,
      data: alert
    })
    const handleCustomerArrived = (customer) => addNotification({
      id: Date.now() + Math.random(),
      type: 'info',
      title: 'عميل وصل',
      message: `${customer.name} في انتظار الطلب`,
      read: false,
      data: customer
    })

    wsService.connect(userData.uid, userData.branchId)
    wsService.on('new_order', handleNewOrder)
    wsService.on('low_stock_alert', handleLowStock)
    wsService.on('customer_arrived', handleCustomerArrived)

    return () => {
      // نفصل الـ listeners قبل ما نقفل الاتصال عشان متتكررش مع أي mount جديد
      wsService.off('new_order', handleNewOrder)
      wsService.off('low_stock_alert', handleLowStock)
      wsService.off('customer_arrived', handleCustomerArrived)
      wsService.disconnect()
    }
  }, [userData?.uid, userData?.branchId, addNotification])


  const markAsRead = (id) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    )
  }

  const unreadCount = notifications.filter(n => !n.read).length

  const getIconByType = (type) => {
    switch (type) {
      case 'order': return '🛒'
      case 'warning': return '⚠️'
      case 'info': return 'ℹ️'
      default: return '📢'
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <BellIcon className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50">
          <div className="p-3 border-b dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-semibold dark:text-white">الإشعارات</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                تحديد الكل كمقروء
              </button>
            )}
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                لا توجد إشعارات
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-2">
                    <div className="text-xl">{getIconByType(notification.type)}</div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm dark:text-white">
                        {notification.title}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(notification.id).toLocaleTimeString('ar-EG')}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell