// src/hooks/useOnlineStatus.js
import { useState, useEffect } from 'react'

/**
 * تتبع حالة الاتصال بالإنترنت في المتصفح، تُستخدم لعرض تنبيه للكاشير
 * إن النظام شغال دلوقتي في وضع أوفلاين (البيانات هتتخزن محلياً وتتزامن
 * تلقائياً فور رجوع الاتصال بفضل Firestore offline persistence).
 */
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
