import { doc } from 'firebase/firestore';
import { db } from '../firebase/config';

// رقم فاتورة تسلسلي ذري (INV-000001، INV-000002 ...) من عدّاد في counters/invoices.
// 🛠️ الرقم القديم ('INV-' + آخر 8 أرقام من Date.now()) كان بيتكرر كل ~28 ساعة، فاحتمال
// تكرار رقم فاتورتين كبير مع زيادة الفواتير. لازم تتندّه جوه runTransaction وقبل أي كتابة
// (قاعدة Firestore: كل القراءات الأول). بيرجع { number, commit } - نادي commit() مع باقي الكتابات.
export async function readNextInvoiceNumber(transaction) {
  const ref = doc(db, 'counters', 'invoices');
  const snap = await transaction.get(ref);
  const next = (snap.exists() ? Number(snap.data().value) || 0 : 0) + 1;
  return {
    number: formatInvoiceNumber(next),
    commit: () => transaction.set(ref, { value: next }, { merge: true })
  };
}

export const formatInvoiceNumber = (n) => `INV-${String(n).padStart(6, '0')}`;

// كمية صالحة للبيع: عدد صحيح موجب (بيمنع السالب والكسور اللي كانت بتزوّد المخزون وتقلب الإجمالي)
export const sanitizeQty = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
};
export const isValidSaleQty = (v) => Number.isInteger(Number(v)) && Number(v) >= 1;
