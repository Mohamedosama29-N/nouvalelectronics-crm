// src/services/liveCollections.js
// ============================================================================
// توفير حصة Firebase المجانية (Spark: ~50 ألف قراءة في اليوم)
//
// البيانات الصغيرة الثابتة (منتجات، عملاء، موردين، مواد خام...) بتتقري من
// السيرفر **مرة واحدة** في الجلسة عن طريق listener مباشر، وبعدها:
// - أي صفحة تطلبها بتاخدها من الذاكرة فوراً (صفر قراءات إضافية).
// - لما حاجة تتغير (بيعة خصمت كمية، منتج اتعدل) السيرفر بيبعت المستند ده بس.
// - ولو السيستم اتقفل واتفتح خلال نص ساعة، Firebase بيبعت التغييرات بس.
// قبل كده كل صفحة كانت بتقرا الـ collection كلها من الأول مع كل فتحة.
//
// getLiveSnapshot('products') بترجع نفس شكل نتيجة getDocs (docs / size /
// forEach / empty) فبتتحط مكانها من غير ما باقي الكود يتغير.
// ============================================================================
import { db } from './firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import { logger } from '../utils/logger'

const entries = new Map()

const wrap = (docs) => ({
  docs,
  size: docs.length,
  empty: docs.length === 0,
  forEach: (fn) => docs.forEach(fn)
})

const start = (name) => {
  let resolveReady
  let rejectReady
  const entry = {
    docs: [],
    loaded: false,
    subscribers: new Set(),
    ready: new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  }
  entry.unsubscribe = onSnapshot(
    collection(db, name),
    (snapshot) => {
      entry.docs = snapshot.docs
      if (!entry.loaded) {
        entry.loaded = true
        resolveReady()
      }
      entry.subscribers.forEach(cb => {
        try { cb(wrap(entry.docs)) } catch (e) { logger.error('live subscriber error', e) }
      })
    },
    (error) => {
      logger.error(`Live collection "${name}" failed:`, error)
      entries.delete(name) // المحاولة الجاية تبدأ listener جديد
      try { entry.unsubscribe?.() } catch { /* ignore */ }
      if (!entry.loaded) rejectReady(error)
    }
  )
  entries.set(name, entry)
  return entry
}

/** نفس getDocs(collection(db, name)) بس من الذاكرة بعد أول قراءة */
export const getLiveSnapshot = async (name) => {
  const entry = entries.get(name) || start(name)
  await entry.ready
  return wrap(entry.docs)
}

/** اشتراك مباشر في التغييرات (بيتنادى فوراً لو البيانات جاهزة) - بيرجّع دالة إلغاء */
export const subscribeLive = (name, callback, onError) => {
  const entry = entries.get(name) || start(name)
  entry.subscribers.add(callback)
  if (entry.loaded) callback(wrap(entry.docs))
  else entry.ready.catch(err => onError?.(err))
  return () => entry.subscribers.delete(callback)
}

/** عند تسجيل الخروج: قفل كل الـ listeners (عشان ميطلعوش أخطاء صلاحيات) */
export const stopAllLiveCollections = () => {
  entries.forEach(entry => { try { entry.unsubscribe?.() } catch { /* ignore */ } })
  entries.clear()
}
