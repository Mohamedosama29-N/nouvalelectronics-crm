// src/utils/normalizeFirestore.js
// تنضيف أي مستند جاي من Firestore قبل ما أي صفحة تستخدمه.
// البيانات القديمة (نسخ سابقة من السيستم، استيراد Excel، استرجاع نسخة احتياطية)
// ممكن يكون فيها أرقام متسجلة كنص ("30") أو تواريخ كنص/كائن عادي - وده كان
// بيكسر صفحات زي الداشبورد والتقارير (toFixed / toDate is not a function).
// هنا بنصلّح ده في مكان واحد لكل السيستم.
import { DocumentSnapshot, Timestamp } from 'firebase/firestore'

const NUM_KEYS = new Set([
  'total', 'subtotal', 'tax', 'taxAmount', 'discount', 'discountAmount', 'discountValue',
  'price', 'cost', 'quantity', 'amount', 'points', 'totalSpent', 'salary',
  'lowStockThreshold', 'visits', 'totalVisits', 'openingBalance', 'closingBalance',
  'expectedBalance', 'actualBalance', 'difference', 'amountPaid', 'change', 'minQuantity',
  'unitCost', 'totalCost', 'guests', 'pointsEarned', 'pointsRedeemed', 'totalSales',
  'cashSales', 'cardSales', 'totalExpenses'
])

const DATE_KEYS = new Set([
  'timestamp', 'createdAt', 'updatedAt', 'lastVisit', 'completedAt', 'openedAt',
  'closedAt', 'voidedAt', 'deliveredAt', 'startedAt', 'readyAt', 'cancelledAt',
  'refundedAt', 'lastLogin', 'archivedAt'
])

const ARRAY_KEYS = new Set(['items', 'ingredients'])

const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

const toNumber = (v) => {
  if (typeof v === 'number') return v
  if (v === null || v === undefined || v === '') return 0
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

const toTimestamp = (v) => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v?.toDate === 'function') return v
  if (isPlainObject(v) && typeof v.seconds === 'number') {
    return new Timestamp(v.seconds, v.nanoseconds || 0) // نسخة احتياطية مسترجعة
  }
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : Timestamp.fromDate(d)
}

const normalizeValue = (key, value, depth) => {
  // كائنات زي discount: { type, value, amount } لازم تفضل كائنات (منحوّلهاش لرقم)
  if (DATE_KEYS.has(key)) return toTimestamp(value)
  if (isPlainObject(value)) return depth < 3 ? normalizeObject(value, depth + 1) : value
  if (Array.isArray(value) && !ARRAY_KEYS.has(key)) return value
  if (NUM_KEYS.has(key)) {
    if (typeof value === 'string' || value === null) return toNumber(value)
    return value
  }
  if (ARRAY_KEYS.has(key)) {
    if (!Array.isArray(value)) return []
    return value.map(it => (isPlainObject(it) ? normalizeObject(it, depth + 1) : it))
  }
  return value
}

export const normalizeObject = (obj, depth = 0) => {
  if (!isPlainObject(obj)) return obj
  const out = {}
  for (const key of Object.keys(obj)) out[key] = normalizeValue(key, obj[key], depth)
  return out
}

let installed = false
// بنلف دالة data() الأصلية مرة واحدة: كل getDoc/getDocs/onSnapshot/transaction.get
// في السيستم كله بيرجّع بيانات نضيفة تلقائياً.
export const installFirestoreNormalizer = () => {
  if (installed || !DocumentSnapshot?.prototype?.data) return
  installed = true
  const original = DocumentSnapshot.prototype.data
  DocumentSnapshot.prototype.data = function patchedData(...args) {
    const data = original.apply(this, args)
    if (!data) return data
    try {
      return normalizeObject(data)
    } catch {
      return data
    }
  }
}
