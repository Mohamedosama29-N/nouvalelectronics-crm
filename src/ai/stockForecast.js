// 📈 توقع نفاد المخزون — حساب محلي 100% (من غير أي خدمة خارجية ومن غير تكلفة).
// الفكرة: سرعة البيع اليومية لكل صنف في كل مخزن خلال آخر N يوم، ومنها:
//   - أيام التغطية = الكمية الحالية ÷ سرعة البيع
//   - تاريخ النفاد المتوقع
//   - الكمية المقترحة للطلب = سرعة البيع × (مدة التوريد + أيام التغطية المستهدفة) − الموجود
//   - الاتجاه: مقارنة سرعة النص الأخير من الفترة بالنص الأول
//   - المخزون الراكد: كمية موجودة ومفيش ولا بيعة في الفترة
import { toDate, isSale } from '../utils/liveStats';

const DAY = 86400000;
const keyOf = (serial, wh) => `${String(serial || '').trim().toLowerCase()}|${wh || 'main'}`;

// المبيعات لكل (سيريال، مخزن): الكمية في النص الأول والتاني من الفترة
export function salesVelocity(transactions, { days, now = new Date() }) {
  const end = now.getTime();
  const start = end - days * DAY;
  const mid = start + (days * DAY) / 2;
  const map = new Map();
  (transactions || []).filter(isSale).forEach((t) => {
    const d = toDate(t.timestamp);
    if (!d) return;
    const ms = d.getTime();
    if (ms < start || ms > end) return;
    const items = Array.isArray(t.items) ? t.items : [];
    items.forEach((i) => {
      if (i.isService || !i.serialNumber) return;
      const qty = Number(i.quantity) || 1;
      const k = keyOf(i.serialNumber, t.warehouseId);
      const v = map.get(k) || { sold: 0, firstHalf: 0, secondHalf: 0, lastSale: 0 };
      v.sold += qty;
      if (ms < mid) v.firstHalf += qty; else v.secondHalf += qty;
      v.lastSale = Math.max(v.lastSale, ms);
      map.set(k, v);
    });
  });
  return map;
}

export const trendOf = (firstHalf, secondHalf) => {
  if (firstHalf === 0 && secondHalf === 0) return 'none';
  if (firstHalf === 0) return 'up';
  const ratio = secondHalf / firstHalf;
  if (ratio >= 1.25) return 'up';
  if (ratio <= 0.75) return 'down';
  return 'flat';
};

export function buildForecast(inventory, transactions, opts = {}) {
  const { days = 30, leadDays = 7, coverDays = 30, now = new Date() } = opts;
  const vel = salesVelocity(transactions, { days, now });
  const rows = (inventory || [])
    .filter((it) => !it.isDeleted && it.serialNumber)
    .map((it) => {
      const qty = Math.max(0, Number(it.quantity) || 0);
      const v = vel.get(keyOf(it.serialNumber, it.warehouseId)) || { sold: 0, firstHalf: 0, secondHalf: 0, lastSale: 0 };
      const perDay = v.sold / days;
      const daysLeft = perDay > 0 ? qty / perDay : null;
      const need = Math.ceil(perDay * (leadDays + coverDays)) - qty;
      let level = 'ok';
      if (perDay > 0 && qty === 0) level = 'out';
      else if (daysLeft !== null && daysLeft <= leadDays) level = 'critical';
      else if (daysLeft !== null && daysLeft <= leadDays * 2) level = 'soon';
      else if (perDay === 0 && qty > 0) level = 'dead';
      return {
        id: it.id,
        name: it.name || it.serialNumber,
        serialNumber: it.serialNumber,
        warehouseId: it.warehouseId || 'main',
        quantity: qty,
        price: Number(it.price) || 0,
        cost: Number(it.avgCost || it.cost) || 0,
        sold: v.sold,
        perDay,
        daysLeft,
        stockoutDate: daysLeft !== null ? new Date(now.getTime() + daysLeft * DAY) : null,
        suggestedOrder: perDay > 0 ? Math.max(0, need) : 0,
        trend: trendOf(v.firstHalf, v.secondHalf),
        lastSale: v.lastSale ? new Date(v.lastSale) : null,
        level,
      };
    });
  const order = { out: 0, critical: 1, soon: 2, ok: 3, dead: 4 };
  rows.sort((a, b) => order[a.level] - order[b.level] || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9) || b.sold - a.sold);
  const summary = {
    out: rows.filter((r) => r.level === 'out').length,
    critical: rows.filter((r) => r.level === 'critical').length,
    soon: rows.filter((r) => r.level === 'soon').length,
    dead: rows.filter((r) => r.level === 'dead').length,
    deadValue: rows.filter((r) => r.level === 'dead').reduce((s, r) => s + r.quantity * r.price, 0),
    toOrder: rows.filter((r) => r.suggestedOrder > 0).length,
  };
  return { rows, summary };
}
