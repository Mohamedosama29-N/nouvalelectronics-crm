// src/services/shiftService.js
import { db } from './firebase'
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore'

/**
 * الحصول على الشيفت المفتوح حالياً (لو موجود). النظام بيدعم شيفت واحد
 * مفتوح في نفس الوقت لكل فرع (أو للنظام كله لو مفيش فروع مفعّلة).
 */
export const getActiveShift = async (branch = null) => {
  const shiftsRef = collection(db, 'shifts')
  const constraints = [where('status', '==', 'open')]
  if (branch) constraints.push(where('branch', '==', branch))

  // ملحوظة: قصدًا من غير orderBy هنا. لو ضفنا orderBy('openedAt') مع
  // where('status', ...) فايرستور بيطلب composite index، ولحد ما الـindex
  // يخلص بناء (أو لو مش موجود أصلاً) كل الكويريز دي بتفشل بـ"failed
  // precondition" وده اللي كان بيسبب "فشل تحميل الشيفت" وبعدين لما الـindex
  // يخلص بناء، فتح شيفت جديد كان بيلاقي القديم لسه شغال ويرفض. فلترة
  // وترتيب النتيجة بيحصل هنا في الكود بدل ما نعتمد على composite index.
  const q = query(shiftsRef, ...constraints)
  const snapshot = await getDocs(q)

  if (snapshot.empty) return null

  const shifts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  shifts.sort((a, b) => {
    const aTime = a.openedAt?.toMillis?.() ?? 0
    const bTime = b.openedAt?.toMillis?.() ?? 0
    return bTime - aTime
  })
  return shifts[0]
}

// فتح شيفت جديد برصيد ابتدائي في الدرج
export const openShift = async ({ openingCash, userId, userName, branch = null }) => {
  const existing = await getActiveShift(branch)
  if (existing) {
    throw new Error('يوجد شيفت مفتوح بالفعل، لازم تقفله الأول')
  }

  const shiftData = {
    status: 'open',
    openingCash: Number(openingCash) || 0,
    openedBy: userId || null,
    openedByName: userName || 'مستخدم',
    openedAt: new Date(),
    branch: branch || null
  }

  const docRef = await addDoc(collection(db, 'shifts'), shiftData)
  return { id: docRef.id, ...shiftData }
}

/**
 * حساب ملخص المبيعات خلال شيفت معين (من وقت الفتح لحد دلوقتي أو لحد وقت القفل)
 * بيتجاهل الفواتير الملغاة (voided) من الحسابات.
 */
export const getShiftSalesSummary = async (shift) => {
  const invoicesRef = collection(db, 'invoices')
  const q = query(invoicesRef, where('shiftId', '==', shift.id))
  const snapshot = await getDocs(q)

  const summary = {
    invoiceCount: 0,
    totalSales: 0,
    cashSales: 0,
    cardSales: 0,
    otherSales: 0
  }

  snapshot.docs.forEach((docSnap) => {
    const inv = docSnap.data()
    if (inv.status === 'voided' || inv.status === 'refunded') return

    summary.invoiceCount += 1
    summary.totalSales += Number(inv.total) || 0

    if (inv.paymentMethod === 'cash') {
      summary.cashSales += Number(inv.total) || 0
    } else if (inv.paymentMethod === 'card') {
      summary.cardSales += Number(inv.total) || 0
    } else {
      summary.otherSales += Number(inv.total) || 0
    }
  })

  return summary
}

// قفل الشيفت بعد عدّ الكاش الفعلي في الدرج
export const closeShift = async (shiftId, { countedCash, userId, userName, notes }) => {
  const shiftRef = doc(db, 'shifts', shiftId)
  const shiftSnap = await getDoc(shiftRef)

  if (!shiftSnap.exists() || shiftSnap.data().status !== 'open') {
    throw new Error('الشيفت غير موجود أو مقفول بالفعل')
  }

  const shift = { id: shiftSnap.id, ...shiftSnap.data() }
  const summary = await getShiftSalesSummary(shift)

  const expectedCash = (Number(shift.openingCash) || 0) + summary.cashSales
  const difference = Number(countedCash) - expectedCash

  const closeData = {
    status: 'closed',
    closedAt: new Date(),
    closedBy: userId || null,
    closedByName: userName || 'مستخدم',
    countedCash: Number(countedCash) || 0,
    expectedCash,
    difference,
    notes: notes || '',
    ...summary
  }

  await updateDoc(shiftRef, closeData)
  return { ...shift, ...closeData }
}

// آخر 30 شيفت (للمراجعة)
export const getRecentShifts = async () => {
  const shiftsRef = collection(db, 'shifts')
  const q = query(shiftsRef, orderBy('openedAt', 'desc'), limit(30))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}
