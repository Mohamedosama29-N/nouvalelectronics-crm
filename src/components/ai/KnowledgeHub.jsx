import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Brain, Search, BookOpen, TrendingUp, ShieldAlert, Smile, Loader2, Sparkles, Plus, Save, Archive, RefreshCw, Phone, ExternalLink, Pencil } from 'lucide-react';
import { db } from '../../firebase/config';
import { loadRecentTickets } from '../../ai/ticketPool';
import { invalidateKb, loadKbArticles, loadWarrantySources } from '../../ai/kbStore';
import { articleFromSuggestion, buildWarrantyMaps, customerMood, forecastTicketVolume, FRAUD_LEVELS, fraudScan, kbText, mineSolutions, MOODS, semanticSearch, WEEKDAYS } from '../../ai/insights';
import { statusLabel, whatsappLink } from '../../ai/ticketAssist';
import { isAIFeatureOn, friendlyAIError } from '../../ai/aiClient';
import { draftKbArticle, expandSearchQuery } from '../../ai/aiServices';
import { requestNavigation } from '../../utils/appEvents';
import { showError, showSuccess } from '../../utils/alerts';
import { exportToExcel } from '../../utils/exportUtils';

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const inp = 'border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50';
const DAY = 86400000;
const seeAll = (u) => u?.role === 'admin' || u?.permissions?.viewAllTickets;
const openTicket = (id) => requestNavigation('tickets', { kind: 'ticket', id });

function usePool(appUser) {
  const [pool, setPool] = useState(null);
  useEffect(() => {
    let alive = true;
    loadRecentTickets(800).then((p) => {
      if (!alive) return;
      const mine = appUser?.assignedWarehouseId || 'main';
      setPool(seeAll(appUser) ? p : p.filter((t) => (t.warehouseId || t.assignedCenter || 'main') === mine));
    }).catch(() => alive && setPool([]));
    return () => { alive = false; };
  }, [appUser]);
  return pool;
}

// ================================================================ (18) البحث بالمعنى
function SearchTab({ appUser, systemSettings }) {
  const pool = usePool(appUser);
  const [kb, setKb] = useState(null);
  const [q, setQ] = useState('');
  const [extra, setExtra] = useState([]);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState('');
  const aiOn = isAIFeatureOn(systemSettings, 'ask');
  useEffect(() => { loadKbArticles().then(setKb).catch(() => setKb([])); }, []);

  const tickets = useMemo(() => (submitted && pool ? semanticSearch(submitted, pool, { extra, limit: 25 }) : []), [submitted, pool, extra]);
  const articles = useMemo(() => (submitted && kb ? semanticSearch(submitted, kb, { textOf: kbText, extra, limit: 5 }) : []), [submitted, kb, extra]);

  const go = async (smart) => {
    if (!q.trim()) return;
    setSubmitted(q.trim()); setExtra([]);
    if (!smart) return;
    setBusy(true);
    try { setExtra(await expandSearchQuery(systemSettings, q.trim())); } catch (e) { showError(`${friendlyAIError(e)} — اتعمل بحث محلي.`); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); go(false); }} className={`${card} space-y-2`}>
        <div className="flex flex-wrap gap-2">
          <input className={`${inp} flex-1 min-w-60`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="ابحث بالمعنى" placeholder="اكتب العطل زي ما العميل بيقوله… مثلاً: التلاجة مبتبردش والفريزر شغال" />
          <button type="submit" className={`${btn} bg-slate-800 text-white`}><Search size={14} /> دوّر</button>
          {aiOn && <button type="button" onClick={() => go(true)} disabled={busy} className={`${btn} bg-indigo-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} بحث أذكى</button>}
        </div>
        <p className="text-[11px] text-slate-500">البحث بيفهم المرادفات (مبتبردش = تبريد/كمبروسر/فريون…) في آخر 800 تذكرة وقاعدة المعرفة.{extra.length ? ` كلمات إضافية: ${extra.join('، ')}` : ''}</p>
      </form>
      {submitted && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className={`${card} lg:col-span-2 space-y-2`}>
            <h3 className="font-black text-sm">تذاكر قريبة في المعنى ({tickets.length})</h3>
            {!pool ? <Loader2 className="animate-spin text-indigo-500" /> : tickets.length === 0 ? <p className="text-xs text-slate-400">مفيش نتايج — جرّب كلمات تانية.</p> : tickets.map(({ doc: t, score }) => (
              <button key={t.id} type="button" onClick={() => openTicket(t.id)} className="w-full text-right border-t border-slate-100 dark:border-slate-700 pt-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-900/40 rounded">
                <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">{t.ticketNumber}</span> · <b>{[t.device, t.deviceModel].filter(Boolean).join(' ')}</b> · {statusLabel(t.status)} <span className="text-slate-400">({Math.round(score * 100)}%)</span>
                <p className="text-slate-600 dark:text-slate-300">{t.issue}</p>
                {(t.mainFaultDescription || (t.spareParts || []).length > 0) && <p className="text-emerald-700 dark:text-emerald-300">الحل: {[t.mainFaultDescription, (t.spareParts || []).map((p) => p.name).filter(Boolean).join('، ')].filter(Boolean).join(' — ')}</p>}
              </button>
            ))}
          </div>
          <div className={`${card} space-y-2`}>
            <h3 className="font-black text-sm">من قاعدة المعرفة</h3>
            {articles.length === 0 ? <p className="text-xs text-slate-400">مفيش مقالات قريبة.</p> : articles.map(({ doc: a }) => (
              <details key={a.id} className="text-xs border-t border-slate-100 dark:border-slate-700 pt-2"><summary className="font-bold cursor-pointer">{a.title}</summary>
                {a.cause && <p className="mt-1">السبب: {a.cause}</p>}
                {(a.steps || []).length > 0 && <ol className="list-decimal pr-5">{a.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================ (6) قاعدة المعرفة
const EMPTY = { title: '', device: '', model: '', faultCode: '', symptoms: '', cause: '', steps: '', parts: '', typicalCost: '' };
function KbTab({ appUser, systemSettings }) {
  const pool = usePool(appUser);
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const aiOn = isAIFeatureOn(systemSettings, 'tickets');
  const load = () => { invalidateKb(); loadKbArticles().then(setList).catch(() => setList([])); };
  useEffect(() => { loadKbArticles().then(setList).catch(() => setList([])); }, []);

  const suggestions = useMemo(() => (pool && list ? mineSolutions(pool, { existing: list }).slice(0, 12) : []), [pool, list]);
  const shown = useMemo(() => {
    if (!list) return [];
    if (!filter.trim()) return list;
    return semanticSearch(filter, list, { textOf: kbText, limit: 50, minScore: 0.03 }).map((r) => r.doc);
  }, [list, filter]);

  const toForm = (a) => setForm({ ...EMPTY, ...a, steps: (a.steps || []).join('\n'), parts: (a.parts || []).join('، '), typicalCost: a.typicalCost || '' });
  const save = async () => {
    if (!form.title.trim()) return showError('اكتب عنوان');
    const data = { title: form.title.trim(), device: form.device.trim(), model: form.model.trim(), faultCode: form.faultCode.trim(), symptoms: form.symptoms.trim(), cause: form.cause.trim(), steps: form.steps.split('\n').map((s) => s.trim()).filter(Boolean), parts: form.parts.split(/[،,]/).map((s) => s.trim()).filter(Boolean), typicalCost: Number(form.typicalCost) || 0, tips: form.tips || '', source: form.source || 'manual', basedOn: form.basedOn || null };
    setBusy('save');
    try {
      if (form.id) await updateDoc(doc(db, 'knowledgeBase', form.id), { ...data, updatedAt: serverTimestamp(), updatedBy: appUser?.name || '' });
      else await addDoc(collection(db, 'knowledgeBase'), { ...data, createdAt: serverTimestamp(), createdBy: appUser?.name || '', helpful: 0 });
      showSuccess('اتحفظ المقال'); setForm(null); load();
    } catch (e) { console.error(e); showError('معرفتش أحفظ'); }
    setBusy('');
  };
  const polish = async () => {
    setBusy('ai');
    try { const r = await draftKbArticle(systemSettings, { ...form, steps: form.steps.split('\n').filter(Boolean), parts: form.parts.split(/[،,]/).filter(Boolean) }); toForm({ ...form, ...r }); } catch (e) { showError(friendlyAIError(e)); }
    setBusy('');
  };
  const archive = async (a) => { try { await updateDoc(doc(db, 'knowledgeBase', a.id), { archived: true }); load(); } catch { showError('معرفتش أأرشف'); } };
  const helpful = async (a) => { try { await updateDoc(doc(db, 'knowledgeBase', a.id), { helpful: (a.helpful || 0) + 1 }); setList((l) => l.map((x) => (x.id === a.id ? { ...x, helpful: (x.helpful || 0) + 1 } : x))); } catch { /* مش مهم */ } };

  const F = (k, label, props = {}) => <label className="text-xs font-bold block">{label}<input className={`${inp} w-full mt-1`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...props} /></label>;
  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap gap-2 items-center`}>
        <input className={`${inp} flex-1 min-w-48`} placeholder="فلتر المقالات بالمعنى…" aria-label="فلتر المقالات" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" onClick={() => setForm({ ...EMPTY })} className={`${btn} bg-indigo-600 text-white`}><Plus size={14} /> مقال جديد</button>
        <button type="button" onClick={load} className={`${btn} bg-slate-100 dark:bg-slate-700`}><RefreshCw size={14} /></button>
      </div>
      {form && (
        <div className={`${card} space-y-2 border-indigo-300 anim-pop`}>
          <div className="grid md:grid-cols-4 gap-2">{F('title', 'العنوان')}{F('device', 'الجهاز')}{F('model', 'الموديلات')}{F('faultCode', 'كود العطل')}</div>
          <div className="grid md:grid-cols-2 gap-2">{F('symptoms', 'الأعراض')}{F('cause', 'السبب')}</div>
          <label className="text-xs font-bold block">خطوات الفحص والإصلاح (خطوة في كل سطر)<textarea rows={5} className={`${inp} w-full mt-1`} value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} /></label>
          <div className="grid md:grid-cols-2 gap-2">{F('parts', 'القطع (افصل بفاصلة)')}{F('typicalCost', 'التكلفة المعتادة', { type: 'number', min: 0 })}</div>
          {form.tips && <p className="text-xs text-slate-500">💡 {form.tips}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={() => setForm(null)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>إلغاء</button>
            {aiOn && <button type="button" onClick={polish} disabled={busy === 'ai'} className={`${btn} bg-violet-600 text-white`}>{busy === 'ai' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} صياغة ذكية</button>}
            <button type="button" onClick={save} disabled={busy === 'save'} className={`${btn} bg-indigo-600 text-white`}><Save size={14} /> حفظ</button>
          </div>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className={card}>
          <h3 className="font-black text-sm mb-2 flex items-center gap-2"><Sparkles size={14} className="text-indigo-600" /> أعطال اتكررت ومالهاش مقال — السيستم جهّزهالك</h3>
          <div className="grid md:grid-cols-2 gap-2">
            {suggestions.map((s) => (
              <div key={s.key} className="rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 p-3 text-xs space-y-1">
                <p className="font-black">{s.title} <span className="font-normal text-slate-500">({s.count} تذكرة)</span></p>
                {s.parts.length > 0 && <p>القطع: {s.parts.map((p) => `${p.name} (${Math.round(p.share * 100)}%)`).join('، ')}</p>}
                {s.medianCost && <p>التكلفة المعتادة: {s.medianCost} ج</p>}
                <button type="button" onClick={() => toForm(articleFromSuggestion(s))} className={`${btn} bg-white dark:bg-slate-800 border border-indigo-200`}><Pencil size={12} /> حوّلها لمقال</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={`${card} space-y-2`}>
        <h3 className="font-black text-sm">المقالات ({list ? list.length : '…'})</h3>
        {!list ? <Loader2 className="animate-spin text-indigo-500" /> : shown.length === 0 ? <p className="text-xs text-slate-400">لسه مفيش مقالات. احفظ حلول من التذاكر المقفولة أو حوّل الاقتراحات اللي فوق.</p> : shown.map((a) => (
          <details key={a.id} className="border-t border-slate-100 dark:border-slate-700 pt-2 text-xs">
            <summary className="cursor-pointer flex flex-wrap items-center gap-2"><b>{a.title}</b>{a.faultCode && <span className="font-mono text-slate-400">{a.faultCode}</span>}{a.helpful > 0 && <span className="text-emerald-600">👍 {a.helpful}</span>}{a.fromTicket && <span className="text-slate-400">من {a.fromTicket}</span>}</summary>
            <div className="mt-1 space-y-1">
              {a.symptoms && <p><b>الأعراض:</b> {a.symptoms}</p>}
              {a.cause && <p><b>السبب:</b> {a.cause}</p>}
              {(a.steps || []).length > 0 && <ol className="list-decimal pr-5">{a.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
              {(a.parts || []).length > 0 && <p><b>القطع:</b> {a.parts.join('، ')}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => helpful(a)} className={`${btn} bg-emerald-50 text-emerald-700`}>👍 مفيد</button>
                <button type="button" onClick={() => toForm(a)} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Pencil size={12} /> تعديل</button>
                <button type="button" onClick={() => archive(a)} className={`${btn} text-rose-600`}><Archive size={12} /> أرشفة</button>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ================================================================ (16) توقع حجم التذاكر
function ForecastTab({ appUser, warehouses }) {
  const [tickets, setTickets] = useState(null);
  const [wh, setWh] = useState(seeAll(appUser) ? 'all' : appUser?.assignedWarehouseId || 'main');
  const [now] = useState(() => new Date());
  useEffect(() => {
    const from = new Date(now.getTime() - 113 * DAY);
    getDocs(query(collection(db, 'tickets'), where('createdAt', '>=', from), orderBy('createdAt', 'asc'), limit(15000)))
      .then((s) => setTickets(s.docs.map((d) => d.data()).filter((t) => !t.isDeleted)))
      .catch((e) => { console.error(e); showError('معرفتش أحمّل التذاكر'); setTickets([]); });
  }, [now]);
  const f = useMemo(() => (tickets ? forecastTicketVolume(tickets, { now, warehouse: wh }) : null), [tickets, wh, now]);
  if (!f) return <div className={card}><Loader2 className="animate-spin text-indigo-500" /></div>;
  if (!f.enough) return <div className={card}><p className="text-sm">محتاجين تاريخ أكتر (على الأقل 10 تذاكر في آخر 16 أسبوع) عشان نتوقع.</p></div>;
  const recent = f.history.slice(-28);
  const max = Math.max(...recent.map((h) => h.count), ...f.forecast.map((x) => x.high), 1);
  const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric' });
  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-center gap-3`}>
        <select className={inp} value={wh} disabled={!seeAll(appUser)} onChange={(e) => setWh(e.target.value)} aria-label="الفرع"><option value="all">كل الفروع</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <button type="button" onClick={() => exportToExcel(f.forecast.map((x) => ({ 'اليوم': x.date, 'اليوم في الأسبوع': WEEKDAYS[x.wd], 'المتوقع': x.expected, 'أقل': x.low, 'أعلى': x.high })), 'Ticket_Forecast', 'التوقع')} className={`${btn} bg-slate-100 dark:bg-slate-700`}>Excel</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
        <div className={card}><b className="block text-2xl">{f.next7}</b>تذكرة متوقعة الأسبوع الجاي</div>
        <div className={card}><b className={`block text-2xl ${f.changePct > 0.1 ? 'text-rose-600' : f.changePct < -0.1 ? 'text-emerald-600' : ''}`}>{f.changePct === null ? '—' : `${f.changePct > 0 ? '+' : ''}${Math.round(f.changePct * 100)}%`}</b>عن آخر 7 أيام ({f.last7})</div>
        <div className={card}><b className="block text-2xl">{WEEKDAYS[f.peak.wd]}</b>أزحم يوم ({Math.round(f.peak.expected)} تذكرة)</div>
        <div className={card}><b className="block text-2xl">{f.trendPerWeek > 0 ? '↗' : f.trendPerWeek < 0 ? '↘' : '→'} {Math.abs(f.trendPerWeek).toFixed(1)}</b>الاتجاه (تذكرة/يوم كل أسبوع)</div>
      </div>
      <div className={card}>
        <h3 className="font-black text-sm mb-3">آخر 4 أسابيع والتوقع لأسبوعين</h3>
        <div className="flex items-end gap-[3px] h-44 overflow-x-auto" role="img" aria-label="رسم التذاكر اليومية والتوقع">
          {recent.map((h) => <div key={h.date} title={`${day(h.date)}: ${h.count}`} className="flex-1 min-w-[8px] bg-slate-300 dark:bg-slate-600 rounded-t" style={{ height: `${(h.count / max) * 100}%` }} />)}
          {f.forecast.map((x) => (
            <div key={x.date} title={`${day(x.date)} (${WEEKDAYS[x.wd]}): متوقع ${x.expected} (${x.low}–${x.high})`} className="flex-1 min-w-[8px] relative" style={{ height: `${(x.high / max) * 100}%` }}>
              <div className="absolute inset-x-0 bottom-0 bg-indigo-100 dark:bg-indigo-900/40 rounded-t" style={{ height: '100%' }} />
              <div className="absolute inset-x-0 bottom-0 bg-indigo-500 rounded-t" style={{ height: `${x.high ? (x.expected / x.high) * 100 : 0}%` }} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-2">رمادي = فعلي · بنفسجي = متوقع (والفاتح = المدى المحتمل). محسوب من نمط أيام الأسبوع والاتجاه في آخر 16 أسبوع.</p>
      </div>
      {f.staffing && (
        <div className={`${card} overflow-x-auto`}>
          <h3 className="font-black text-sm mb-2">الفنيين المقترحين (على أساس {f.perTechDay.toFixed(1)} تذكرة/فني/يوم، {f.techs} فني اشتغلوا)</h3>
          <table className="w-full text-xs"><thead><tr className="text-slate-500"><th className="p-2 text-right">اليوم</th><th className="p-2 text-right">المتوقع</th><th className="p-2 text-right">المدى</th><th className="p-2 text-right">فنيين</th></tr></thead>
            <tbody>{f.staffing.map((x) => <tr key={x.date} className="border-t border-slate-100 dark:border-slate-700"><td className="p-2">{WEEKDAYS[x.wd]} {day(x.date)}</td><td className="p-2 font-bold">{x.expected}</td><td className="p-2">{x.low}–{x.high}</td><td className="p-2 font-black text-indigo-700 dark:text-indigo-300">{x.techsNeeded}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}

// ================================================================ (11) تلاعب الضمان
function FraudTab({ appUser }) {
  const pool = usePool(appUser);
  const [src, setSrc] = useState(null);
  useEffect(() => { loadWarrantySources().then(setSrc).catch(() => setSrc({ sales: [], registry: [] })); }, []);
  const rows = useMemo(() => (pool && src ? fraudScan(pool, buildWarrantyMaps(src.sales, src.registry)) : null), [pool, src]);
  if (!rows) return <div className={card}><Loader2 className="animate-spin text-indigo-500" /></div>;
  return (
    <div className={`${card} space-y-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-sm">تذاكر ضمان محتاجة مراجعة ({rows.length})</h3>
        <button type="button" onClick={() => exportToExcel(rows.map((r) => ({ 'التذكرة': r.ticket.ticketNumber, 'الجهاز': r.ticket.device, 'السيريال': r.ticket.deviceSerial, 'الدرجة': r.score, 'المستوى': FRAUD_LEVELS[r.level].label, 'الأسباب': r.signals.map((s) => s.label).join(' | ') })), 'Warranty_Review', 'مراجعة الضمان')} className={`${btn} bg-slate-100 dark:bg-slate-700`}>Excel</button>
      </div>
      <p className="text-[11px] text-slate-500">بنقارن بفواتير البيع وسجل الأجهزة والتذاكر السابقة وتحليل الصور. دي مؤشرات للمراجعة بس، مش اتهام.</p>
      {rows.length === 0 ? <p className="text-xs text-emerald-600">كل تذاكر الضمان الأخيرة شكلها طبيعي ✅</p> : rows.map((r) => (
        <div key={r.ticket.id} className="border-t border-slate-100 dark:border-slate-700 pt-2 text-xs flex flex-wrap items-start justify-between gap-2">
          <div>
            <p><button type="button" onClick={() => openTicket(r.ticket.id)} className="font-mono font-bold text-indigo-700 dark:text-indigo-300 hover:underline">{r.ticket.ticketNumber}</button> · {r.ticket.device} · <span className="font-mono">{r.ticket.deviceSerial || 'من غير سيريال'}</span></p>
            <ul className="list-disc pr-5 text-slate-600 dark:text-slate-300">{r.signals.map((s, i) => <li key={i}>{s.label}</li>)}</ul>
          </div>
          <span className={`px-2 py-0.5 rounded-full font-bold ${FRAUD_LEVELS[r.level].cls}`}>{FRAUD_LEVELS[r.level].label} · {r.score}</span>
        </div>
      ))}
    </div>
  );
}

// ================================================================ (9) مزاج العملاء
function MoodTab({ appUser }) {
  const pool = usePool(appUser);
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    getDocs(query(collection(db, 'contactLogs'), orderBy('at', 'desc'), limit(1500)))
      .then((s) => setLogs(s.docs.map((d) => d.data())))
      .catch(() => setLogs([]));
  }, []);
  const rows = useMemo(() => {
    if (!pool || !logs) return null;
    const by = new Map();
    const get = (phone, name) => { if (!by.has(phone)) by.set(phone, { phone, name: name || '', logs: [], tickets: [] }); const r = by.get(phone); if (!r.name && name) r.name = name; return r; };
    logs.forEach((l) => l.customerPhone && get(l.customerPhone, l.customerName).logs.push(l));
    pool.forEach((t) => t.customerPhone && get(t.customerPhone, t.customerName).tickets.push(t));
    return [...by.values()].map((r) => ({ ...r, mood: customerMood({ logs: r.logs, tickets: r.tickets }) }))
      .filter((r) => r.mood.label === 'angry' || r.mood.label === 'unhappy')
      .sort((a, b) => Number(b.mood.escalate) - Number(a.mood.escalate) || a.mood.score - b.mood.score).slice(0, 100);
  }, [pool, logs]);
  if (!rows) return <div className={card}><Loader2 className="animate-spin text-indigo-500" /></div>;
  return (
    <div className={`${card} space-y-2`}>
      <h3 className="font-black text-sm">عملاء محتاجين اهتمام ({rows.length})</h3>
      <p className="text-[11px] text-slate-500">من كلامهم في سجل التواصل، والشكاوى، والتقييمات، والتذاكر المتأخرة أو اللي رجعت تاني. الأحدث له وزن أكبر.</p>
      {rows.length === 0 ? <p className="text-xs text-emerald-600">مفيش عملاء زعلانين دلوقتي 🎉</p> : rows.map((r) => {
        const m = MOODS[r.mood.label];
        const wa = whatsappLink(r.phone, `أهلاً${r.name ? ` أستاذ/ة ${String(r.name).split(/\s+/)[0]}` : ''}، بنطمّن على حضرتك وعايزين نتأكد إن كل حاجة تمام معانا. لو فيه أي مشكلة إحنا تحت أمرك.`);
        const lastOpen = r.tickets.find((t) => t.id && !['delivered_to_customer', 'rejected_and_delivered'].includes(t.status));
        return (
          <div key={r.phone} className="border-t border-slate-100 dark:border-slate-700 pt-2 text-xs flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-2"><b>{r.name || 'عميل'}</b> <span className="font-mono text-slate-500" dir="ltr">{r.phone}</span> <span className={`px-2 py-0.5 rounded-full font-bold ${m.cls}`}>{m.emoji} {m.label}{r.mood.escalate ? ' · خطر تصعيد' : ''}</span></p>
              <ul className="list-disc pr-5 text-slate-600 dark:text-slate-300">{r.mood.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => requestNavigation('callcenter', { kind: 'call', phone: r.phone })} className={`${btn} bg-indigo-600 text-white`}><Phone size={12} /> افتح في الكول سنتر</button>
              {r.mood.label === 'angry' && <button type="button" onClick={() => requestNavigation('callcenter', { kind: 'complaint-new', prefill: { phone: r.phone, name: r.name, description: r.mood.reasons.join(' — ') } })} className={`${btn} bg-rose-600 text-white`}>سجّل شكوى</button>}
              {lastOpen && <button type="button" onClick={() => openTicket(lastOpen.id)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>{lastOpen.ticketNumber}</button>}
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-600 text-white`}><ExternalLink size={12} /> واتساب</a>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TABS = [
  ['search', 'البحث بالمعنى', <Search size={14} key="i" />],
  ['kb', 'قاعدة المعرفة', <BookOpen size={14} key="i" />],
  ['forecast', 'توقع حجم التذاكر', <TrendingUp size={14} key="i" />],
  ['fraud', 'مراجعة الضمان', <ShieldAlert size={14} key="i" />, (u) => u?.role === 'admin' || u?.permissions?.viewNetwork],
  ['mood', 'مزاج العملاء', <Smile size={14} key="i" />],
];

// 🧠 قاعدة المعرفة والتحليلات الذكية
export function KnowledgeHub({ appUser, systemSettings, warehouses = [] }) {
  const [tab, setTab] = useState('search');
  const tabs = TABS.filter((t) => !t[3] || t[3](appUser));
  const whs = Array.isArray(warehouses) ? warehouses.map((w) => ({ id: w.id, name: w.name || w.id })) : Object.entries(warehouses || {}).map(([id, w]) => ({ id, name: w?.name || w || id }));
  return (
    <section className="space-y-4" dir="rtl">
      <div className={`${card} shadow-sm flex flex-wrap items-center justify-between gap-3 anim-up`}>
        <h2 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><Brain size={20} className="text-indigo-600" /> قاعدة المعرفة والتحليلات الذكية</h2>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(([id, label, icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${tab === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>{icon} {label}</button>)}
        </div>
      </div>
      {tab === 'search' && <SearchTab appUser={appUser} systemSettings={systemSettings} />}
      {tab === 'kb' && <KbTab appUser={appUser} systemSettings={systemSettings} />}
      {tab === 'forecast' && <ForecastTab appUser={appUser} warehouses={whs} />}
      {tab === 'fraud' && tabs.some((t) => t[0] === 'fraud') && <FraudTab appUser={appUser} />}
      {tab === 'mood' && <MoodTab appUser={appUser} />}
    </section>
  );
}

export default KnowledgeHub;
