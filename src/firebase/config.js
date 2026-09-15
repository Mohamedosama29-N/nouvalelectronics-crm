import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  collection, doc, getFirestore
} from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import { getFunctions } from 'firebase/functions';

// 🛠️ FIX (أمان): كانت القيم الافتراضية (fallback) لمفاتيح Firebase مكتوبة
// صراحةً في الكود، فلو حد نسي يضبط متغيرات البيئة وقت الـ build، الكود
// كان بيشتغل بهدوء بمفاتيح المشروع القديم بدل ما يبلّغ بالمشكلة. دلوقتي
// التطبيق بيرفض يشتغل من الأساس لو متغيرات البيئة الأساسية مش مضبوطة،
// عشان محدش ينشر نسخة بمفاتيح غلط بالغلط.
const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !import.meta.env[key]);
if (missingEnvVars.length > 0) {
  throw new Error(
    `إعدادات Firebase ناقصة. المتغيرات دي لازم تتضبط في ملف .env قبل التشغيل: ${missingEnvVars.join(', ')}`
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// 🛠️ FIX: كان فيه console.log بيطبع تفاصيل إعدادات Firebase في الـ
// production build، وده مش لازم يظهر في الكونسول لمستخدم عادي.
if (import.meta.env.DEV) {
  console.log('🔥 Firebase Config Loaded:', {
    projectId: firebaseConfig.projectId,
    hasApiKey: !!firebaseConfig.apiKey,
  });
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

export const db = getFirestore(app);

// 🆕 لاستدعاء الـ Cloud Functions (زي submitInvoiceToETA) من الواجهة.
// نفس الـ region المحدد في functions/index.js (europe-west1) عشان
// httpsCallable يوصل للفنكشن الصح.
export const functions = getFunctions(app, 'europe-west1');

export let messaging;
try {
  messaging = getMessaging(app);
} catch (error) {
  console.warn('Firebase Messaging not available:', error);
}

export const getCollRef = (collName) => collection(db, collName);

export const getDocRef = (collName, docId) => doc(db, collName, docId);

// مراجع مجموعات المنتجات والموديلات وأكواد الأعطال

export const getProductsColl = () => collection(db, 'products');

export const getModelsColl = () => collection(db, 'models');
