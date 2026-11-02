// 🛒 "بيتشتروا مع بعض": تحليل السلال من تاريخ المبيعات (محلي، من غير ذكاء اصطناعي)
import { isSale } from '../utils/liveStats';

const key = (s) => String(s || '').trim().toLowerCase();

export function buildBasketModel(transactions = []) {
  const pairs = new Map(); // a -> Map(b -> count)
  const info = new Map();  // serial -> { name, price, baskets }
  transactions.filter(isSale).forEach((t) => {
    const items = (Array.isArray(t.items) ? t.items : []).filter((i) => !i.isService && i.serialNumber);
    const uniq = [...new Map(items.map((i) => [key(i.serialNumber), i])).values()];
    uniq.forEach((i) => {
      const k = key(i.serialNumber);
      const cur = info.get(k) || { serialNumber: i.serialNumber, name: i.name || i.serialNumber, price: Number(i.price) || 0, baskets: 0 };
      cur.baskets += 1;
      info.set(k, cur);
    });
    for (let x = 0; x < uniq.length; x++) {
      for (let y = 0; y < uniq.length; y++) {
        if (x === y) continue;
        const a = key(uniq[x].serialNumber); const b = key(uniq[y].serialNumber);
        const m = pairs.get(a) || new Map();
        m.set(b, (m.get(b) || 0) + 1);
        pairs.set(a, m);
      }
    }
  });
  return { pairs, info };
}

// اقتراحات للسلة الحالية: مجموع مرات الشراء مع أي صنف في السلة، بحد أدنى مرتين
export function suggestForCart(model, cartSerials = [], { limit = 4, minCount = 2 } = {}) {
  if (!model) return [];
  const inCart = new Set(cartSerials.map(key));
  const score = new Map();
  inCart.forEach((a) => {
    const base = model.info.get(a)?.baskets || 1;
    (model.pairs.get(a) || new Map()).forEach((n, b) => {
      if (inCart.has(b) || n < minCount) return;
      const s = score.get(b) || { together: 0, confidence: 0 };
      s.together += n;
      s.confidence = Math.max(s.confidence, n / base);
      score.set(b, s);
    });
  });
  return [...score.entries()]
    .map(([b, s]) => ({ ...model.info.get(b), together: s.together, confidence: s.confidence }))
    .sort((a, b) => b.together - a.together || b.confidence - a.confidence)
    .slice(0, limit);
}
