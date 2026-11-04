import React, { useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { TrendingUp, TrendingDown, Minus, Loader2, Download, Sparkles, PackageX, AlertTriangle, Clock, Archive, ShoppingCart } from 'lucide-react';
import { db } from '../../firebase/config';
import { buildForecast } from '../../ai/stockForecast';
import { exportToExcel } from '../../utils/exportUtils';
import { showError } from '../../utils/alerts';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { poItemsFromForecast } from '../../ai/accounts';
import { requestNavigation } from '../../utils/appEvents';

const LEVELS = {
  out: { label: 'نفد', cls: 'bg-rose-600 text-white' },
  critical: { label: 'حرج', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  soon: { label: 'قريب', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  ok: { label: 'كويس', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  dead: { label: 'راكد', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

const TrendIcon = ({ t }) => {
  if (t === 'up') return <TrendingUp size={14} className="text-emerald-500" aria-label="متزايد" />;
  if (t === 'down') return <TrendingDown size={14} className="text-rose-500" aria-label="متناقص" />;
  if (t === 'flat') return <Minus size={14} className="text-slate-400" aria-label="ثابت" />;
  return <span className="text-slate-300">—</span>;
};

const cache = new Map(); // key -> { at, inventory, txs }

export function StockForecastPanel({ appUser, warehouseMap = {} }) {
  const seeAll = appUser?.role === 'admin' || appUser?.permissions?.viewAllWarehouses;
  const own = appUser?.assignedWarehouseId || 'main';
  const [warehouse, setWarehouse] = useState(seeAll ? 'all' : own);
  const [days, setDays] = useState(30);
  const [leadDays, setLeadDays] = useState(7);
  const [coverDays, setCoverDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('action');
  const [search, setSearch] = useState('');

  const load = async () => {
    const wh = seeAll ? warehouse : own;
    const key = `${wh}|${days}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) { setData(hit); return; }
    setLoading(true);
    try {
      const since = new Date(Date.now() - days * 86400000);
      const invCons = [where('isDeleted', '==', false)];
      if (wh !== 'all') invCons.unshift(where('warehouseId', '==', wh));
      const txCons = [where('type', '==', 'sell')];
      if (wh !== 'all') txCons.push(where('warehouseId', '==', wh));
      txCons.push(where('timestamp', '>=', since), limit(10000));
      const [invSnap, txSnap] = await Promise.all([
        getDocs(query(collection(db, 'inventory'), ...invCons)),
        getDocs(query(collection(db, 'transactions'), ...txCons)),
      ]);
      const entry = {
        at: Date.now(),
        inventory: invSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        txs: txSnap.docs.map((d) => d.data()),
        truncated: txSnap.size >= 10000,
      };
      cache.set(key, entry);
      setData(entry);
    } catch (e) {
      console.error(e);
      showError(e?.code === 'failed-precondition' ? 'محتاج Index: شغّل firebase deploy --only firestore:indexes' : 'معرفتش أحمّل بيانات التوقعات.');
    } finally { setLoading(false); }
  };

  const forecast = useMemo(() => (data ? buildForecast(data.inventory, data.txs, { days, leadDays, coverDays }) : null), [data, days, leadDays, coverDays]);

  const rows = useMemo(() => {
    if (!forecast) return [];
    const q = search.trim().toLowerCase();
    return forecast.rows.filter((r) => {
      if (filter === 'action' && !['out', 'critical', 'soon'].includes(r.level)) return false;
      if (filter !== 'action' && filter !== 'all' && r.level !== filter) return false;
      if (q && !`${r.name} ${r.serialNumber}`.toLowerCase().includes(q)) return false;
      return true;
    }).slice(0, 300);
  }, [forecast, filter, search]);

  const whName = (id) => warehouseMap[id]?.name || warehouseMap[id] || (id === 'main' ? 'الرئيسي' : id);

  const exportRows = () => {
    if (!forecast) return;
    const ok = exportToExcel(forecast.rows.filter((r) => r.level !== 'ok').map((r) => ({
      'الصنف': r.name, 'السيريال': r.serialNumber, 'المخزن': whName(r.warehouseId), 'الموجود': r.quantity,
      [`مبيعات ${days} يوم`]: r.sold, 'بيع/يوم': Number(r.perDay.toFixed(2)),
      'أيام متبقية': r.daysLeft === null ? '' : Math.round(r.daysLeft),
      'تاريخ النفاد': r.stockoutDate ? r.stockoutDate.toISOString().slice(0, 10) : '',
      'الكمية المقترحة': r.suggestedOrder, 'الحالة': LEVELS[r.level].label,
    })), `Stock_Forecast_${new Date().toISOString().slice(0, 10)}`, 'توقع النفاد');
    if (!ok) showError('مفيش بيانات للتصدير');
  };

  const s = forecast?.summary;
  const cards = s ? [
    { k: 'out', label: 'نفد وعليه طلب', v: s.out, icon: <PackageX size={18} />, cls: 'from-rose-500 to-rose-600 text-white' },
    { k: 'critical', label: `ينفد خلال ${leadDays} أيام`, v: s.critical, icon: <AlertTriangle size={18} />, cls: 'from-orange-400 to-rose-500 text-white' },
    { k: 'soon', label: `ينفد خلال ${leadDays * 2} يوم`, v: s.soon, icon: <Clock size={18} />, cls: 'from-amber-300 to-amber-500 text-amber-950' },
    { k: 'dead', label: 'مخزون راكد', v: s.dead, sub: `${Math.round(s.deadValue).toLocaleString()} ج متجمدة`, icon: <Archive size={18} />, cls: 'from-slate-500 to-slate-700 text-white' },
  ] : [];

  const numCls = 'w-16 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-center text-sm font-bold bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <section className="mb-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden anim-up" dir="rtl">
      <div className="p-5 bg-gradient-to-l from-teal-600 to-violet-600 text-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-lg flex items-center gap-2"><Sparkles size={18} /> توقع نفاد المخزون</h3>
          <p className="text-xs text-white/80">بيتحسب من سرعة البيع الفعلية جوه السيستم — من غير أي خدمة خارجية.</p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="flex items-center gap-2 bg-white text-teal-700 px-4 py-2 rounded-xl font-black text-sm hover:bg-teal-50 active:scale-[0.98] transition disabled:opacity-60">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {data ? 'تحديث' : 'احسب التوقعات'}
        </button>
      </div>

      <div className="p-4 flex flex-wrap items-end gap-3 border-b border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400">
        {seeAll && (
          <label className="flex flex-col gap-1">المخزن
            <select value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setData(null); }}
              className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="all">كل المخازن</option>
              {Object.keys(warehouseMap).map((id) => <option key={id} value={id}>{whName(id)}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">فترة الحساب
          <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setData(null); }}
            className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value={30}>آخر 30 يوم</option><option value={60}>آخر 60 يوم</option><option value={90}>آخر 90 يوم</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">مدة التوريد (يوم)
          <input type="number" min="1" max="120" value={leadDays} onChange={(e) => setLeadDays(Math.max(1, Number(e.target.value) || 1))} className={numCls} />
        </label>
        <label className="flex flex-col gap-1">تغطية مستهدفة (يوم)
          <input type="number" min="1" max="365" value={coverDays} onChange={(e) => setCoverDays(Math.max(1, Number(e.target.value) || 1))} className={numCls} />
        </label>
        {forecast && (
          <button type="button" onClick={exportRows} className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200">
            <Download size={14} /> تصدير Excel
          </button>
        )}
        {forecast && (appUser?.role === 'admin' || appUser?.permissions?.accountsHub) && (
          <button type="button" onClick={() => {
            const wh = seeAll ? (warehouse === 'all' ? 'main' : warehouse) : own;
            const items = poItemsFromForecast(forecast.rows, wh);
            if (!items.length) { showError('مفيش أصناف محتاجة طلب في المخزن ده'); return; }
            requestNavigation('accounts_hub', { kind: 'po-new', items, warehouseId: wh });
          }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700">
            <ShoppingCart size={14} /> اعمل أمر شراء
          </button>
        )}
      </div>

      {!forecast && !loading && (
        <div className="p-10 text-center text-slate-400 dark:text-slate-500 text-sm">
          <Sparkles size={36} className="mx-auto mb-3 opacity-40 anim-float" />
          اضغط "احسب التوقعات" عشان تشوف الأصناف اللي هتخلص قريب والكمية المقترحة لكل صنف.
        </div>
      )}

      {forecast && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((c, i) => (
              <button key={c.k} type="button" onClick={() => setFilter(c.k)} style={{ '--d': `${i * 60}ms` }}
                className={`anim-up card-lift text-right rounded-2xl p-4 bg-gradient-to-br ${c.cls} shadow-sm ${filter === c.k ? 'ring-4 ring-offset-2 ring-teal-300 dark:ring-offset-slate-800' : ''}`}>
                <div className="flex items-center justify-between opacity-90">{c.icon}<span className="text-[11px] font-bold">{c.label}</span></div>
                <p className="text-3xl font-black mt-2"><AnimatedNumber value={c.v} /></p>
                {c.sub && <p className="text-[11px] opacity-80 mt-1">{c.sub}</p>}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[['action', `محتاج تصرّف`], ['all', 'الكل'], ['ok', 'كويس'], ['dead', 'راكد']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>{l}</button>
            ))}
            <span className="flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 mr-2"><ShoppingCart size={14} /> {s.toOrder} صنف محتاج طلب</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو السيريال" aria-label="بحث"
              className="mr-auto border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          {data?.truncated && <p className="text-[11px] text-amber-600">الحساب على أول 10,000 فاتورة في الفترة.</p>}

          <div className="overflow-x-auto custom-scrollbar max-h-[60vh] rounded-xl border border-slate-100 dark:border-slate-700">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-500 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="p-3">الصنف</th>{seeAll && <th className="p-3">المخزن</th>}<th className="p-3">الموجود</th>
                  <th className="p-3">بيع/يوم</th><th className="p-3">الاتجاه</th><th className="p-3">يخلص بعد</th>
                  <th className="p-3">الكمية المقترحة</th><th className="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                {rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">مفيش أصناف في الفلتر ده 👌</td></tr>}
                {rows.map((r) => (
                  <tr key={`${r.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="p-3"><p className="font-bold text-slate-800 dark:text-white">{r.name}</p><p className="text-[11px] text-slate-400 font-mono">{r.serialNumber}</p></td>
                    {seeAll && <td className="p-3 text-xs">{whName(r.warehouseId)}</td>}
                    <td className="p-3 font-bold">{r.quantity.toLocaleString()}</td>
                    <td className="p-3">{r.perDay ? r.perDay.toFixed(r.perDay < 1 ? 2 : 1) : '—'}</td>
                    <td className="p-3"><TrendIcon t={r.trend} /></td>
                    <td className="p-3">
                      {r.daysLeft === null ? '—' : r.quantity === 0 ? <span className="text-rose-600 font-bold">خلص</span> : (
                        <div className="min-w-[90px]">
                          <span className="font-bold">{Math.round(r.daysLeft)} يوم</span>
                          <div className="h-1.5 mt-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div className={`h-full rounded-full ${r.level === 'critical' ? 'bg-rose-500' : r.level === 'soon' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, (r.daysLeft / (leadDays + coverDays)) * 100)}%`, transition: 'width 600ms ease' }} />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="p-3">{r.suggestedOrder > 0 ? <span className="font-black text-teal-700 dark:text-teal-300">+{r.suggestedOrder}</span> : '—'}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-[11px] font-bold ${LEVELS[r.level].cls}`}>{LEVELS[r.level].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">الكمية المقترحة = سرعة البيع × (مدة التوريد + التغطية المستهدفة) − الموجود. الاتجاه بيقارن النص الأخير من الفترة بالنص الأول.</p>
        </div>
      )}
    </section>
  );
}
