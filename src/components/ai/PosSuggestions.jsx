import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Sparkles, Plus } from 'lucide-react';
import { db } from '../../firebase/config';
import { buildBasketModel, suggestForCart } from '../../ai/basket';

// كاش للجلسة: آخر 90 يوم من مبيعات المخزن، بيتحمّل مرة كل 15 دقيقة بس
const cache = new Map();
async function loadModel(warehouseId) {
  const hit = cache.get(warehouseId);
  if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.model;
  const since = new Date(Date.now() - 90 * 86400000);
  const snap = await getDocs(query(collection(db, 'transactions'),
    where('type', '==', 'sell'), where('warehouseId', '==', warehouseId), where('timestamp', '>=', since), limit(3000)));
  const model = buildBasketModel(snap.docs.map((d) => d.data()));
  cache.set(warehouseId, { at: Date.now(), model });
  return model;
}

// 🛒 "عملاء كتير بيشتروا معاه": اقتراحات للكاشير حسب السلة الحالية
export function PosSuggestions({ cart = [], warehouseId = 'main', onAdd }) {
  const [model, setModel] = useState(null);
  const hasItems = cart.some((i) => !i.isService);

  useEffect(() => {
    if (!hasItems || model) return undefined;
    let cancelled = false;
    loadModel(warehouseId).then((m) => { if (!cancelled) setModel(m); }).catch((e) => console.warn('basket model failed', e?.code || e));
    return () => { cancelled = true; };
  }, [hasItems, model, warehouseId]);

  const suggestions = useMemo(() => (model ? suggestForCart(model, cart.filter((i) => !i.isService).map((i) => i.serialNumber)) : []), [model, cart]);
  if (!hasItems || suggestions.length === 0) return null;

  return (
    <div className="anim-up bg-gradient-to-l from-violet-50 to-teal-50 dark:from-violet-950/30 dark:to-teal-950/30 rounded-2xl border border-violet-100 dark:border-violet-900/50 p-4">
      <p className="text-xs font-black text-violet-700 dark:text-violet-300 flex items-center gap-1.5 mb-3"><Sparkles size={14} /> عملاء كتير بيشتروا معاه كمان</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {suggestions.map((s, i) => (
          <button key={s.serialNumber} type="button" onClick={() => onAdd?.(s.serialNumber)} style={{ '--d': `${i * 60}ms` }}
            className="anim-up card-lift flex items-center justify-between gap-2 text-right bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-3">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800 dark:text-white truncate">{s.name}</span>
              <span className="block text-[11px] text-slate-400 font-mono truncate">{s.serialNumber} · اتباع معاه {s.together} مرة</span>
            </span>
            <span className="shrink-0 w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center"><Plus size={16} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
