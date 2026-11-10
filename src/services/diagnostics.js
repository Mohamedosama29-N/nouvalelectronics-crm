// src/services/diagnostics.js
// فحص الاتصال بقاعدة البيانات: بيجرب كل نوع عملية بيعتمد عليه البيع
// (قراءة، تعديل كمية منتج، حجز رقم فاتورة) ويطلع السبب الحقيقي لو فيه فشل.
// كل الاختبارات آمنة: مش بتغيّر أي بيانات فعلية (زيادة بصفر / إعادة كتابة نفس القيم).
import { db } from './firebase'
import {
  collection, query, limit, getDocsFromServer, doc, updateDoc, increment, runTransaction
} from 'firebase/firestore'

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => { const e = new Error('timeout'); e.code = 'timeout'; reject(e) }, ms))
])

const HINTS = {
  'permission-denied': 'قواعد الأمان في Firebase (Firestore Rules) مانعة العملية دي للحساب ده.',
  'timeout': 'الاتصال بقاعدة البيانات مش واصل. لو المتصفح Brave: اقفل الدروع (Shields) للموقع ده، أو اقفل أي إضافة حجب إعلانات/VPN/برنامج حماية بيمنع الاتصال.',
  'unavailable': 'الجهاز مش قادر يوصل لسيرفر Firebase (النت أو حاجة بتحجب الاتصال).',
  'failed-precondition': 'قاعدة البيانات شغالة في وضع أوفلاين على الجهاز ده - جرّب تقفل كل التابات المفتوحة للسيستم وتفتحه في تاب واحد.',
  'not-found': 'المستند المطلوب مش موجود (عادي لو أول مرة).',
  'unauthenticated': 'الجلسة انتهت - سجّل خروج ودخول تاني.'
}

const run = async (name, fn, ms = 10000) => {
  const started = performance.now()
  try {
    const detail = await withTimeout(fn(), ms)
    return { name, ok: true, ms: Math.round(performance.now() - started), detail: detail || '' }
  } catch (error) {
    const code = error?.code || error?.message || 'unknown'
    return { name, ok: false, code, hint: HINTS[code] || error?.message || '', ms: Math.round(performance.now() - started) }
  }
}

export const runConnectionDiagnostics = async () => {
  const results = []
  let sampleProductId = null

  results.push(await run('قراءة البيانات من السيرفر', async () => {
    const snap = await getDocsFromServer(query(collection(db, 'products'), limit(1)))
    sampleProductId = snap.docs[0]?.id || null
    return snap.empty ? 'مفيش منتجات' : ''
  }))

  results.push(await run('تعديل كمية منتج (خصم المخزون)', async () => {
    if (!sampleProductId) return 'اتخطى: مفيش منتج للتجربة'
    await updateDoc(doc(db, 'products', sampleProductId), { quantity: increment(0) })
    return ''
  }))

  results.push(await run('حجز رقم فاتورة (Transaction)', async () => {
    const ref = doc(db, 'counters', 'invoiceCounter')
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      // بنعيد كتابة نفس القيم بالظبط - مفيش أي تغيير في الترقيم
      if (snap.exists()) tx.set(ref, snap.data(), { merge: true })
    })
    return ''
  }, 15000))

  const isBrave = typeof navigator !== 'undefined' && !!navigator.brave
  return { results, isBrave, online: typeof navigator !== 'undefined' ? navigator.onLine : true }
}
