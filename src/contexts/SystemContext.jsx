// src/contexts/SystemContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import { db } from '../services/firebase'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { useAuth } from './AuthContext'
import { logger } from '../utils/logger'

const SystemContext = createContext()

export const useSystem = () => useContext(SystemContext)

export const SystemProvider = ({ children }) => {
  const { user } = useAuth()
  const [systemSettings, setSystemSettings] = useState({
    cafeName: 'مقهى ___',
    cafeLogo: null,
    cafeAddress: '',
    cafePhone: '',
    cafeEmail: '',
    receiptFooter: 'شكراً لزيارتكم',
    receiptQrEnabled: true,
    receiptLogoMono: true,
    receiptQrUrl: 'https://facebook.com/SAFALOVAZZA', // QR في آخر الفاتورة
    receiptQrLabel: 'تابعونا على فيسبوك',
    currency: 'ج.م',
    taxRate: 0,
    taxEnabled: false, // الضريبة اتشالت من السيستم نهائياً
    lowStockAlert: 10,
    paperSize: '80mm',
    showCashierName: true,
    autoPrint: true,
    copyCount: 1,
    requireOpenShift: false, // ✅ فتح الشيفت اختياري افتراضياً - ممكن تفعّله من الإعدادات لو حابب يبقى إجباري
    kitchenDisplayEnabled: true, // ✅ التحكم في تفعيل/تعطيل إرسال الطلبات لشاشة المطبخ
    kitchenAutoPrint: true,
    splitKitchenTickets: false, // الطلب كله في تذكرة واحدة (التقسيم بار/مطبخ اختياري)
    requireKitchenDeliveryForInvoice: true // ✅ منع تسجيل الفاتورة إلا بعد "تم التسليم" من شاشة المطبخ
  })

  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(doc(db, 'settings', 'system'), (docSnap) => {
        if (docSnap.exists()) {
          setSystemSettings(prev => ({ ...prev, ...docSnap.data() }))
        }
      })
      return () => unsubscribe()
    }
  }, [user])

  const updateSystemSettings = async (newSettings) => {
    try {
      const docRef = doc(db, 'settings', 'system')
      await setDoc(docRef, { ...newSettings, updatedAt: new Date() }, { merge: true })
      setSystemSettings(prev => ({ ...prev, ...newSettings }))
      return { success: true }
    } catch (error) {
      logger.error('Error saving system settings:', error)
      return { success: false }
    }
  }

  return (
    <SystemContext.Provider value={{ systemSettings, updateSystemSettings }}>
      {children}
    </SystemContext.Provider>
  )
}