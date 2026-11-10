// src/services/invoiceNumberService.js
import { db } from './firebase'
import { doc, getDoc, getDocs, setDoc, runTransaction, collection, query, where } from 'firebase/firestore'

// الحصول على تاريخ اليوم مع مراعاة إغلاق الساعة 3 صباحاً
const getBusinessDate = () => {
  const now = new Date()
  const hour = now.getHours()

  // إذا كان الوقت قبل 3 صباحاً، نعتبره من اليوم السابق
  if (hour < 3) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday
  }
  return now
}

const getDateKey = (date) => {
  return date.toISOString().split('T')[0] // '2024-01-15'
}

const buildResult = (dateKey, number) => ({
  number,
  formatted: number.toString().padStart(4, '0'),
  fullNumber: `${dateKey.replace(/-/g, '')}-${number.toString().padStart(4, '0')}`,
  date: dateKey,
  offline: false
})

// رقم مؤقت يُستخدم فقط لو الجهاز أوفلاين وقت البيع، عشان العملية تكمل
// من غير ما تنتظر اتصال بالسيرفر (transaction الترقيم الرسمي محتاجة اتصال
// مباشر ومش بتشتغل أوفلاين، على عكس باقي عمليات الحفظ العادية في السيستم).
const buildOfflineFallbackResult = () => {
  const now = new Date()
  const dateKey = getDateKey(now)
  const randomSuffix = Math.floor(1000 + Math.random() * 9000)
  return {
    number: null,
    formatted: `OFFLINE-${randomSuffix}`,
    fullNumber: `OFFLINE-${dateKey.replace(/-/g, '')}-${randomSuffix}`,
    date: dateKey,
    offline: true
  }
}

/**
 * الحصول على رقم الفاتورة التالي ويزيد العداد.
 * منفذة عبر Firestore transaction حتى لو ضغط كاشيرين على "إتمام البيع"
 * في نفس اللحظة بالظبط، كل واحد ياخد رقم فريد ولا يحصل تصادم.
 *
 * لو الجهاز أوفلاين، الـ transaction مش هتقدر توصل للسيرفر (على عكس عمليات
 * الحفظ العادية اللي بتتخزن محلياً وتتزامن تلقائياً). في الحالة دي بنرجع
 * رقم مؤقت مميز (OFFLINE-...) عشان البيع يكمل من غير ما الكاشير يستنى،
 * والفاتورة نفسها (بكل بياناتها) هتتزامن عادي فور رجوع النت.
 */
export const getNextInvoiceNumber = async () => {
  const businessDate = getBusinessDate()
  const dateKey = getDateKey(businessDate)
  const counterRef = doc(db, 'counters', 'invoiceCounter')

  // بنحاول كذا مرة قبل ما نلجأ لرقم مؤقت: أغلب الفشل بيكون لحظي (تزاحم
  // كاشيرين على نفس العداد، أو النت فصل ثانية ورجع). قبل كده أي خطأ - حتى
  // خطأ صلاحيات - كان بيطلّع رقم OFFLINE في صمت من غير ما نعرف السبب.
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const currentNumber = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef)

        let nextNumber = 1
        if (counterDoc.exists()) {
          const data = counterDoc.data()
          if (data.lastDate === dateKey) {
            nextNumber = (data.lastNumber || 0) + 1
          }
          // إذا كان التاريخ مختلفاً، يبدأ الترقيم من 1 تلقائياً (يوم عمل جديد)
        }

        transaction.set(counterRef, { lastDate: dateKey, lastNumber: nextNumber }, { merge: true })
        return nextNumber
      })

      return buildResult(dateKey, currentNumber)
    } catch (error) {
      lastError = error
      // خطأ صلاحيات مش هيتصلح بالمحاولة تاني
      if (error?.code === 'permission-denied') break
      await new Promise(r => setTimeout(r, 300 * attempt))
    }
  }

  const fallback = buildOfflineFallbackResult()
  fallback.reason = lastError?.code || lastError?.message || 'unknown'
  return fallback
}

// الحصول على الرقم الحالي دون زيادته (للعرض فقط)
export const getCurrentInvoiceNumber = async () => {
  const businessDate = getBusinessDate()
  const dateKey = getDateKey(businessDate)

  const counterRef = doc(db, 'counters', 'invoiceCounter')
  const counterDoc = await getDoc(counterRef)

  if (counterDoc.exists() && counterDoc.data().lastDate === dateKey) {
    const currentNumber = counterDoc.data().lastNumber || 0
    return buildResult(dateKey, currentNumber + 1)
  }

  return buildResult(dateKey, 1)
}

// إعادة تعيين العداد (للمدير فقط)
export const resetInvoiceCounter = async () => {
  const businessDate = getBusinessDate()
  const dateKey = getDateKey(businessDate)

  const counterRef = doc(db, 'counters', 'invoiceCounter')
  await setDoc(counterRef, {
    lastDate: dateKey,
    lastNumber: 0
  })
  return { success: true, message: 'تم إعادة تعيين الترقيم' }
}

// تعيين رقم بداية مخصص
export const setInvoiceCounter = async (startNumber) => {
  const businessDate = getBusinessDate()
  const dateKey = getDateKey(businessDate)

  const counterRef = doc(db, 'counters', 'invoiceCounter')
  await setDoc(counterRef, {
    lastDate: dateKey,
    lastNumber: startNumber - 1
  })
  return { success: true, message: `تم تعيين بداية الترقيم إلى ${startNumber}` }
}

/**
 * قراءة بس (بدون كتابة) - بترجع الرقم التالي المحسوب من غير ما تحجزه فعلياً
 * جوه الـ transaction. لازم تتنفذ مع باقي القراءات الأول قبل أي كتابة، ولازم
 * تتبعها commitInvoiceNumber بعد ما كل القراءات في الـ transaction تخلص.
 *
 * ⚠️ السبب: Firestore بيرفض أي قراءة (get) بعد أي كتابة (set/update) في نفس
 * الـ transaction. لو الحجز والكتابة بيحصلوا مدمجين في دالة واحدة (زي
 * reserveInvoiceNumberInTransaction تحت) واستُخدمت مع عمليات تانية محتاجة
 * تقرا بعدها (زي خصم المخزون)، الـ transaction كلها بتفشل.
 */
export const readNextInvoiceNumber = async (transaction) => {
  const businessDate = getBusinessDate()
  const dateKey = getDateKey(businessDate)
  const counterRef = doc(db, 'counters', 'invoiceCounter')

  const counterDoc = await transaction.get(counterRef)
  let nextNumber = 1
  if (counterDoc.exists()) {
    const data = counterDoc.data()
    if (data.lastDate === dateKey) {
      nextNumber = (data.lastNumber || 0) + 1
    }
  }

  return { counterRef, dateKey, nextNumber, result: buildResult(dateKey, nextNumber) }
}

// كتابة فقط - تتنفذ بعد كل القراءات في الـ transaction (بما فيها
// readNextInvoiceNumber نفسها) خلصت
export const commitInvoiceNumber = (transaction, reserved) => {
  transaction.set(reserved.counterRef, { lastDate: reserved.dateKey, lastNumber: reserved.nextNumber }, { merge: true })
}

/**
 * حجز رقم فاتورة تالي *جوه transaction قائمة أصلاً* - نسخة مدمجة (قراءة+كتابة
 * سوا)، آمنة الاستخدام بس لو دي أول وآخر عملية محتاجة تقرا في الـ transaction
 * (يعني مفيش قراءة تانية هتحصل بعدها). لو محتاج تعمل قراءات تانية بعد حجز
 * الرقم (زي قراءة منتجات لخصم المخزون)، استخدم readNextInvoiceNumber و
 * commitInvoiceNumber منفصلين بدل ما تستخدم دي - زي ما بيحصل بالظبط في
 * KitchenDisplay.jsx.
 *
 * بتُستخدم لما إنشاء الفاتورة نفسه بيحصل جوه transaction تانية (زي لحظة
 * "تم التسليم" في شاشة المطبخ) عشان حجز الرقم وإنشاء الفاتورة يحصلوا سوا
 * بشكل ذرّي واحد. ده بالظبط اللي بيضمن **ترقيم متسلسل بدون أي فجوات** حتى
 * لو حصل إلغاء لاحقاً، لأن الرقم مبيتحجزش إلا في نفس لحظة تسجيل الفاتورة
 * الفعلية، مش قبل كده.
 */
export const reserveInvoiceNumberInTransaction = async (transaction) => {
  const reserved = await readNextInvoiceNumber(transaction)
  commitInvoiceNumber(transaction, reserved)
  return reserved.result
}

/**
 * رقم أوردر بسيط تسلسلي (1، 2، 3...) بيتحجز فور إرسال الأوردر لشاشة
 * المطبخ - مستقل تماماً عن رقم الفاتورة الرسمي (اللي بيتحجز بس لحظة
 * التسليم، شوف reserveInvoiceNumberInTransaction فوق). الغرض منه إنه يدي
 * الكاشير والمطبخ مرجع بسيط ومفهوم للأوردر وهو لسه بيتحضّر، من غير ما يأثر
 * على تسلسل أرقام الفواتير الرسمية أو يعمل فيه فجوات لو الأوردر اتلغى.
 * بيتصفّر كل يوم عمل جديد زي رقم الفاتورة بالظبط.
 */
export const getNextOrderNumber = async () => {
  const businessDate = getBusinessDate()
  const dateKey = getDateKey(businessDate)
  const counterRef = doc(db, 'counters', 'orderCounter')

  try {
    const nextNumber = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef)
      let number = 1
      if (counterDoc.exists()) {
        const data = counterDoc.data()
        if (data.lastDate === dateKey) {
          number = (data.lastNumber || 0) + 1
        }
      }
      transaction.set(counterRef, { lastDate: dateKey, lastNumber: number }, { merge: true })
      return number
    })
    return nextNumber
  } catch (error) {
    // لو حصل أي خطأ (انقطاع نت مثلاً)، رقم الأوردر ده تجميلي بس مش رسمي
    // زي رقم الفاتورة - فمفيش داعي نوقف الأوردر، بس نرجع null والعرض هيقع
    // على الاحتياطي التاني (جزء من معرّف المستند).
    return null
  }
}

/**
 * أفضل مرجع نصي "مفهوم" نعرضه للفاتورة/الأوردر في أي مكان بالنظام (الأرشيف،
 * التذاكر، شاشة المطبخ، التنبيهات...). بيفضّل الرقم التسلسلي الرسمي للفاتورة،
 * وبعدين الرقم الكامل (بما فيه رقم الفواتير اللي اتسجلت وقت انقطاع النت زي
 * "OFFLINE-20260902-1234")، وبعدين رقم الأوردر البسيط (1، 2، 3...) قبل ما
 * الفاتورة الرسمية تتسجل، وآخر حاجة بس (نادراً) جزء من معرّف المستند
 * العشوائي في Firestore - وده اللي كان بيظهر "متشفر" لما مفيش أي رقم.
 *
 * ملحوظة: القيمة المرجعة من غير علامة "#" - المتصفح المستدعي هو اللي
 * بيضيفها في الواجهة، عشان نتجنب ظهورها مكررة ("##").
 */
export const getInvoiceDisplayRef = (invoiceLike) => {
  if (!invoiceLike) return ''
  if (invoiceLike.invoiceNumber) return String(invoiceLike.invoiceNumber)
  if (invoiceLike.invoiceFullNumber) return invoiceLike.invoiceFullNumber
  if (invoiceLike.orderNumber) return String(invoiceLike.orderNumber)
  if (invoiceLike.id) return invoiceLike.id.slice(-6)
  return ''
}

/**
 * إصلاح الفواتير اللي اتسجلت برقم "أوفلاين" (OFFLINE-...) بدل رقم تسلسلي
 * عادي - بيديها أرقام تسلسلية حقيقية دلوقتي، بنفس ترتيبها الزمني الأصلي
 * (الأقدم أولاً)، فتترص جنب باقي الفواتير بالتسلسل العادي 1، 2، 3...
 *
 * ملحوظة: الأرقام اللي بتتحجز هنا بتكمل على تسلسل *النهارده*، مش بترجع
 * تتحسب على تاريخ يوم البيع الأصلي (لو كان يوم فات) - لأن عداد الترقيم في
 * النظام بيتابع يوم عمل واحد بس في كل لحظة. النتيجة: كل الفواتير بترقيم
 * متسلسل نضيف زي "1, 2, 3..." من غير أي "OFFLINE" - وده المطلوب فعلياً.
 */
export const repairOfflineInvoiceNumbers = async () => {
  const invoicesQuery = query(collection(db, 'invoices'), where('offlineGenerated', '==', true))
  const snapshot = await getDocs(invoicesQuery)

  const offlineInvoices = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((inv) => !inv.invoiceNumber)
    .sort((a, b) => {
      const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0
      const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0
      return ta - tb
    })

  let fixedCount = 0
  for (const inv of offlineInvoices) {
    const invoiceRef = doc(db, 'invoices', inv.id)
    try {
      await runTransaction(db, async (transaction) => {
        const freshSnap = await transaction.get(invoiceRef)
        // احتياط: لو الفاتورة اتصلحت أو اتحذفت من مكان تاني في نفس اللحظة
        if (!freshSnap.exists() || freshSnap.data().invoiceNumber) return

        const numberResult = await reserveInvoiceNumberInTransaction(transaction)
        transaction.update(invoiceRef, {
          invoiceNumber: numberResult.number,
          invoiceFullNumber: numberResult.fullNumber,
          offlineGenerated: false,
          offlineRepaired: true,
          originalOfflineRef: inv.invoiceFullNumber || null
        })
      })
      fixedCount++
    } catch {
      // لو فشلت فاتورة واحدة، نكمل الباقي بدل ما نوقف الإصلاح كله
    }
  }

  return { success: true, fixedCount, totalFound: offlineInvoices.length }
}


let repairRunning = false
/**
 * إصلاح تلقائي في الخلفية للفواتير اللي خدت رقم OFFLINE - بيتنادى أول ما
 * السيستم يفتح وكل ما النت يرجع. مش بيعمل أي حاجة لو مفيش فواتير محتاجة إصلاح.
 */
export const autoRepairOfflineInvoices = async () => {
  if (repairRunning) return { fixedCount: 0 }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { fixedCount: 0 }
  repairRunning = true
  try {
    return await repairOfflineInvoiceNumbers()
  } catch {
    return { fixedCount: 0 }
  } finally {
    repairRunning = false
  }
}
