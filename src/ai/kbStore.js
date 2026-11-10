// 📚 تحميل مقالات قاعدة المعرفة (كاش 10 دقايق) + بيانات فحص الضمان
import { mirrorDocs, transactionsBetween } from '../data/mirror';

const TTL = 30 * 60000; // 📊 (5) مدة أطول = قراءات أقل
const WTTL = 60 * 60000;
const kb = { at: 0, p: null };
export function loadKbArticles() {
  if (kb.p && Date.now() - kb.at < TTL) return kb.p;
  kb.at = Date.now();
  // 📉 من المرايا المحلية: المقالات الجديدة والمتعدّلة بس من السيرفر
  kb.p = mirrorDocs('knowledgeBase', null, { max: 5000 })
    .then((l) => l.filter((a) => !a.archived).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)))
    .catch((e) => { kb.at = 0; throw e; });
  return kb.p;
}
export const invalidateKb = () => { kb.at = 0; };

const wm = { at: 0, p: null };
// آخر 3000 فاتورة بيع + سجل الأجهزة — عشان نعرف تاريخ الشراء وانتهاء الضمان لكل سيريال
export function loadWarrantySources() {
  if (wm.p && Date.now() - wm.at < WTTL) return wm.p;
  wm.at = Date.now();
  wm.p = Promise.all([
    transactionsBetween(new Date(Date.now() - 730 * 86400000), null, { wheres: [['type', '==', 'sell']], max: 3000 }).catch(() => []),
    mirrorDocs('deviceRegistry', null, { max: 20000 }).catch(() => []),
  ]).then(([sales, registry]) => ({ sales, registry }));
  return wm.p;
}
