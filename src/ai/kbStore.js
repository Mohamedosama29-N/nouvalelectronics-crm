// 📚 تحميل مقالات قاعدة المعرفة (كاش 10 دقايق) + بيانات فحص الضمان
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

const TTL = 10 * 60000;
const kb = { at: 0, p: null };
export function loadKbArticles() {
  if (kb.p && Date.now() - kb.at < TTL) return kb.p;
  kb.at = Date.now();
  kb.p = getDocs(query(collection(db, 'knowledgeBase'), orderBy('createdAt', 'desc'), limit(1000)))
    .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => !a.archived))
    .catch((e) => { kb.at = 0; throw e; });
  return kb.p;
}
export const invalidateKb = () => { kb.at = 0; };

const wm = { at: 0, p: null };
// آخر 3000 فاتورة بيع + سجل الأجهزة — عشان نعرف تاريخ الشراء وانتهاء الضمان لكل سيريال
export function loadWarrantySources() {
  if (wm.p && Date.now() - wm.at < TTL) return wm.p;
  wm.at = Date.now();
  wm.p = Promise.all([
    getDocs(query(collection(db, 'transactions'), where('type', '==', 'sell'), orderBy('timestamp', 'desc'), limit(3000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    getDocs(query(collection(db, 'deviceRegistry'), limit(3000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
  ]).then(([sales, registry]) => ({ sales, registry }));
  return wm.p;
}
