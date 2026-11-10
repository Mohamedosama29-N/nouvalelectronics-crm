// src/services/firebase.js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { logger } from '../utils/logger'
import { installFirestoreNormalizer } from '../utils/normalizeFirestore'

// تنضيف كل البيانات المقروءة من Firestore (أرقام كنص، تواريخ قديمة...)
installFirestoreNormalizer()

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// التحقق من وجود البيانات (بدون عرضها في الكونسول)
const hasValidConfig = firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== 'undefined' &&
  firebaseConfig.projectId

if (!hasValidConfig && import.meta.env.DEV) {
  logger.warn('Firebase configuration is missing or invalid')
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// ✅ تفعيل العمل بدون اتصال بالإنترنت (Offline Persistence):
// أي قراءة/كتابة عادية (فواتير، عملاء، أوردرات مطبخ...) تتخزن محلياً في
// IndexedDB تلقائياً لو النت مقطوع، وتتزامن مع Firebase فور رجوع الاتصال
// من غير أي تدخل يدوي. استثناء وحيد: العمليات اللي بتعتمد على runTransaction
// (زي ترقيم الفواتير) مش بتشتغل أوفلاين لأنها محتاجة اتصال مباشر بالسيرفر،
// ولها fallback خاص بها في invoiceNumberService.js.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    // تعدد التابات: الكاشير وشاشة المطبخ ممكن يبقوا مفتوحين في تابين على نفس
    // الجهاز - الوضع ده بيخلي الاتنين يشتغلوا أوفلاين ومتزامنين مع بعض
    tabManager: persistentMultipleTabManager()
  })
})

export const storage = getStorage(app)

// لا نعرض أي رسائل في الكونسول