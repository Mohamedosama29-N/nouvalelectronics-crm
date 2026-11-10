import React, { useEffect, useMemo, useState } from 'react';
import { ticketsUpdatedSince } from '../../data/mirror';
import { addDoc, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { PhoneCall, Search, Loader2, Plus, Phone, ExternalLink, ClipboardList, HeartHandshake, CalendarClock, History, ShieldCheck, Save, Check, Sparkles, Megaphone, Inbox } from 'lucide-react';
import { db } from '../../firebase/config';
import { normalizePhone } from '../../utils/search';
import { requestNavigation } from '../../utils/appEvents';
import { showError, showSuccess } from '../../utils/alerts';
import { statusLabel, whatsappLink } from '../../ai/ticketAssist';
import { CONTACT_OUTCOMES, CONTACT_TYPES, customerDevices, followUpMessage, followUpQueue, labelOf, periodicDue, periodicMessage, triageQuestions } from '../../ai/callCenter';
import { TICKET_TERMINAL_STATUSES } from '../../constants/tickets';
import { askJSON, friendlyAIError, isAIFeatureOn } from '../../ai/aiClient';
import { redactText } from '../../ai/redact';
import { ticketWarehouseOf, toDate } from '../../utils/liveStats';
import { customerMood, MOODS } from '../../ai/insights';
import { useIntent } from '../../hooks/useIntent';
import { ComplaintsTab } from './ComplaintsTab';
import { RequestsTab } from './RequestsTab';

const DAY = 86400000;
const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const inp = 'w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50';
const fmt = (d) => (d ? d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const todayYmd = () => new Date().toISOString().slice(0, 10);

function ContactForm({ phone, name, tickets = [], appUser, onSaved, defaults = {} }) {
  const [f, setF] = useState({ type: 'call_in', outcome: 'info', note: '', ticketId: '', followUpAt: '', ...defaults });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.note.trim() && f.outcome !== 'no_answer') { showError('اكتب ملخص التواصل'); return; }
    setSaving(true);
    try {
      const t = tickets.find((x) => x.id === f.ticketId);
      const rec = {
        customerPhone: phone, customerName: name || '', type: f.type, outcome: f.outcome, note: f.note.trim(),
        ticketId: f.ticketId || null, ticketNumber: t?.ticketNumber || null,
        followUpAt: f.followUpAt || null, followUpDone: !f.followUpAt,
        by: appUser?.name || '', byId: appUser?.id || '', warehouseId: appUser?.assignedWarehouseId || 'main', at: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'contactLogs'), rec);
      showSuccess('اتسجل التواصل');
      onSaved?.({ id: ref.id, ...rec, at: new Date() });
      if (f.outcome === 'complaint') requestNavigation('callcenter', { kind: 'complaint-new', prefill: { phone, name: name || '', ticketNumber: t?.ticketNumber || '', ticketId: f.ticketId || '', description: f.note.trim() } });
      setF({ type: 'call_in', outcome: 'info', note: '', ticketId: '', followUpAt: '' });
    } catch (e) { console.error(e); showError('معرفتش أسجل التواصل'); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="نوع التواصل" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inp}>{CONTACT_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
        <select aria-label="النتيجة" value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })} className={inp}>{CONTACT_OUTCOMES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      </div>
      <textarea aria-label="ملخص التواصل" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="العميل قال إيه واتفقنا على إيه..." className={inp} />
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="تذكرة مرتبطة" value={f.ticketId} onChange={(e) => setF({ ...f, ticketId: e.target.value })} className={inp}>
          <option value="">من غير تذكرة</option>{tickets.map((t) => <option key={t.id} value={t.id}>{t.ticketNumber}</option>)}
        </select>
        <label className="text-[11px] text-slate-500">متابعة يوم<input type="date" value={f.followUpAt} onChange={(e) => setF({ ...f, followUpAt: e.target.value })} className={inp} /></label>
      </div>
      <button type="button" onClick={save} disabled={saving || !phone} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} سجّل التواصل</button>
    </div>
  );
}

// (9) مزاج العميل من سجل التواصل والتذاكر والتقييمات
function MoodBadge({ data }) {
  const mood = useMemo(() => customerMood({ logs: data.logs, tickets: data.tickets }), [data]);
  const m = MOODS[mood.label];
  if (mood.label === 'neutral' && !mood.reasons.length) return null;
  return <span title={mood.reasons.join('\n')} className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${m.cls}`}>{m.emoji} {m.label}{mood.escalate ? ' · خطر تصعيد' : ''}</span>;
}

function CallTab({ appUser, systemSettings, preset }) {
  const [phoneIn, setPhoneIn] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [triageDevice, setTriageDevice] = useState('');
  const [checked, setChecked] = useState({});
  const [extraQs, setExtraQs] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const aiOn = isAIFeatureOn(systemSettings, 'tickets');

  const lookup = async (e, override) => {
    e?.preventDefault?.();
    const p = normalizePhone(override ?? phoneIn);
    if (!/^0\d{9,10}$/.test(p)) { showError('اكتب رقم موبايل صحيح'); return; }
    setLoading(true);
    const safe = (pr) => pr.catch((err) => { console.warn(err?.code || err); return { docs: [] }; });
    try {
      const [c, t, s, l] = await Promise.all([
        safe(getDocs(query(collection(db, 'customers'), where('phone', '==', p), limit(5)))),
        safe(getDocs(query(collection(db, 'tickets'), where('customerPhone', '==', p), orderBy('createdAt', 'desc'), limit(30)))),
        safe(getDocs(query(collection(db, 'transactions'), where('phone', '==', p), where('type', '==', 'sell'), orderBy('timestamp', 'desc'), limit(20)))),
        safe(getDocs(query(collection(db, 'contactLogs'), where('customerPhone', '==', p), orderBy('at', 'desc'), limit(30)))),
      ]);
      const tickets = t.docs.map((d) => ({ id: d.id, ...d.data() }));
      const sales = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      const customer = c.docs[0] ? { id: c.docs[0].id, ...c.docs[0].data() } : null;
      setData({ phone: p, customer, tickets, sales, logs: l.docs.map((d) => ({ id: d.id, ...d.data() })), name: customer?.name || tickets[0]?.customerName || sales[0]?.customerName || '' });
      setTriageDevice(tickets[0]?.device || '');
      setChecked({}); setExtraQs([]);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    if (!preset?.phone) return undefined;
    const t = setTimeout(() => { setPhoneIn(preset.phone); lookup(null, preset.phone); }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- لما ييجي رقم من شاشة تانية
  }, [preset]);

  const devices = useMemo(() => (data ? customerDevices(data.tickets, data.sales) : []), [data]);
  const triage = useMemo(() => triageQuestions(triageDevice), [triageDevice]);
  const openTickets = data ? data.tickets.filter((t) => !TICKET_TERMINAL_STATUSES.includes(t.status)) : [];
  const triageNotes = () => [...triage.questions, ...extraQs].filter((q) => checked[q] !== undefined && checked[q] !== '').map((q) => `• ${q} ${checked[q] === true ? '✓' : checked[q]}`).join('\n');

  const moreQuestions = async () => {
    setAiBusy(true);
    try {
      const r = await askJSON(systemSettings, {
        system: 'أنت فني خبرة في مركز صيانة في مصر. اقترح 3-5 أسئلة فحص مبدئي قصيرة بالعامية يسألها موظف الكول سنتر للعميل على التليفون، مختلفة عن الأسئلة الموجودة.',
        prompt: JSON.stringify({ device: triageDevice, existing: triage.questions, lastIssue: redactText(data?.tickets?.[0]?.issue || '').slice(0, 300) }),
        schema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' } } }, required: ['questions'] },
        temperature: 0.3,
      });
      setExtraQs((r.questions || []).slice(0, 5).filter((q) => !triage.questions.includes(q)));
    } catch (e) { showError(friendlyAIError(e)); }
    finally { setAiBusy(false); }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={lookup} className={`${card} flex flex-wrap gap-2 items-center`}>
        <PhoneCall size={20} className="text-teal-600" />
        <input autoFocus value={phoneIn} onChange={(e) => setPhoneIn(e.target.value)} placeholder="رقم موبايل العميل" aria-label="رقم موبايل العميل" dir="ltr" className={`${inp} flex-1 min-w-[180px] text-lg font-mono`} />
        <button type="submit" disabled={loading} className={`${btn} bg-teal-600 text-white hover:bg-teal-700 py-3`}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} دوّر</button>
      </form>

      {data && (
        <div className="grid lg:grid-cols-3 gap-4 anim-up">
          <div className="space-y-4 lg:col-span-2">
            <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
              <div>
                <p className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">{data.name || 'عميل جديد'} <MoodBadge data={data} /></p>
                <p className="text-xs text-slate-500" dir="ltr">{data.phone}</p>
                <p className="text-xs text-slate-500 mt-1">{data.tickets.length} تذكرة ({openTickets.length} مفتوحة) · {data.sales.length} فاتورة شراء · {data.logs.length} تواصل</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => requestNavigation('accounts_hub', { kind: 'statement', phone: data.phone })} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200`}>كشف حساب</button>
                <a href={`tel:${data.phone}`} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200`}><Phone size={14} /> اتصال</a>
                {whatsappLink(data.phone, '') && <a href={whatsappLink(data.phone, '')} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-600 text-white`}><ExternalLink size={14} /> واتساب</a>}
                <button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket-new', prefill: { customerName: data.name, customerPhone: data.phone, device: triageDevice || '', notes: triageNotes() } })}
                  className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}><Plus size={14} /> تذكرة جديدة</button>
              </div>
            </div>

            <div className={card}>
              <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">أجهزة العميل</p>
              {!devices.length && <p className="text-xs text-slate-400">مفيش أجهزة مسجلة.</p>}
              <div className="grid sm:grid-cols-2 gap-2">
                {devices.map((d) => {
                  const inW = d.warrantyEnd && d.warrantyEnd > new Date();
                  return (
                    <div key={d.key} className="rounded-xl border border-slate-100 dark:border-slate-700 p-3 text-xs">
                      <div className="flex justify-between gap-2"><b className="text-slate-800 dark:text-white">{d.device || 'جهاز'}</b>
                        {d.warrantyEnd && <span className={`px-2 py-0.5 rounded-lg font-bold ${inW ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><ShieldCheck size={10} className="inline" /> {inW ? `ضمان لحد ${fmt(d.warrantyEnd)}` : 'الضمان انتهى'}</span>}
                      </div>
                      {d.serial && <p className="text-slate-400 font-mono">{d.serial}</p>}
                      {d.purchased && <p className="text-slate-500">اتشرى {fmt(d.purchased)} {d.invoiceNumber ? `(${d.invoiceNumber})` : ''}</p>}
                      {d.tickets.slice(0, 3).map((t) => (
                        <button key={t.id} type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: t.id })} className="block w-full text-right mt-1 text-teal-700 dark:text-teal-300 hover:underline">
                          {t.ticketNumber} · {statusLabel(t.status)} · {fmt(t.created)}
                        </button>
                      ))}
                      <button type="button" onClick={() => setTriageDevice(d.device)} className="mt-1 text-[10px] text-violet-600 hover:underline">أسئلة الفحص للجهاز ده</button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={card}>
              <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5"><ClipboardList size={16} /> أسئلة الفحص المبدئي</p>
              <input value={triageDevice} onChange={(e) => setTriageDevice(e.target.value)} placeholder="نوع الجهاز (شاشة، غسالة، تكييف...)" aria-label="نوع الجهاز للأسئلة" className={`${inp} mb-2`} />
              <div className="space-y-1.5">
                {[...triage.questions, ...extraQs].map((q) => (
                  <div key={q} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" className="accent-teal-600" checked={checked[q] !== undefined && checked[q] !== ''} onChange={(e) => setChecked((c) => ({ ...c, [q]: e.target.checked ? true : '' }))} />
                    <span className="flex-1 text-slate-700 dark:text-slate-200">{q}</span>
                    <input value={typeof checked[q] === 'string' ? checked[q] : ''} onChange={(e) => setChecked((c) => ({ ...c, [q]: e.target.value }))} placeholder="الإجابة" aria-label={`إجابة: ${q}`} className="w-40 border-b border-slate-200 dark:border-slate-700 bg-transparent text-xs focus:outline-none focus:border-teal-500" />
                  </div>
                ))}
              </div>
              {aiOn && <button type="button" onClick={moreQuestions} disabled={aiBusy} className="mt-2 flex items-center gap-1 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:underline disabled:opacity-50">{aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} أسئلة إضافية بالذكاء الاصطناعي</button>}
              <p className="text-[10px] text-slate-400 mt-2">الإجابات بتتنقل لملاحظات التذكرة لما تدوس "تذكرة جديدة".</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className={card}>
              <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">سجّل التواصل ده</p>
              <ContactForm phone={data.phone} name={data.name} tickets={data.tickets} appUser={appUser} onSaved={(rec) => setData((d) => ({ ...d, logs: [rec, ...d.logs] }))} />
            </div>
            <div className={card}>
              <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5"><History size={16} /> سجل التواصل</p>
              {!data.logs.length && <p className="text-xs text-slate-400">مفيش تواصل مسجل قبل كده.</p>}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                {data.logs.map((l) => (
                  <div key={l.id} className="text-xs border-r-2 border-teal-400 pr-2">
                    <p className="font-bold text-slate-700 dark:text-slate-200">{labelOf(CONTACT_TYPES, l.type)} · {labelOf(CONTACT_OUTCOMES, l.outcome)}</p>
                    {l.note && <p className="text-slate-600 dark:text-slate-300">{l.note}</p>}
                    <p className="text-[10px] text-slate-400">{fmt(toDate(l.at))} · {l.by}{l.ticketNumber ? ` · ${l.ticketNumber}` : ''}{l.followUpAt && !l.followUpDone ? ` · متابعة ${l.followUpAt}` : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FollowUpTab({ appUser, systemSettings }) {
  const seeAll = appUser?.role === 'admin' || appUser?.permissions?.viewAllWarehouses;
  const own = appUser?.assignedWarehouseId || 'main';
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(new Set());
  const [openForm, setOpenForm] = useState(null);
  const [scores, setScores] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      // 📉 من المرايا المحلية: التذاكر اللي اتعدّلت بس بتتقري من السيرفر
      setList(await ticketsUpdatedSince(new Date(Date.now() - 12 * DAY), { wheres: seeAll ? [] : [['assignedCenter', '==', own]], max: 2000 }));
    } catch (e) { console.error(e); showError('معرفتش أحمّل القائمة'); }
    finally { setLoading(false); }
  };
  const queue = useMemo(() => (list ? followUpQueue(list, { skipIds: skip }) : []), [list, skip]);

  const logContact = (t, outcome, note, followUpAt = null) => addDoc(collection(db, 'contactLogs'), {
    customerPhone: t.customerPhone || '', customerName: t.customerName || '', type: 'call_out', outcome, note, ticketId: t.id, ticketNumber: t.ticketNumber || null,
    followUpAt, followUpDone: !followUpAt, by: appUser?.name || '', byId: appUser?.id || '', warehouseId: ticketWarehouseOf(t), at: serverTimestamp(),
  });

  const saveResult = async (t) => {
    const s = scores[t.id] || {};
    const keys = ['accessibility', 'maintenanceTime', 'centerDealing', 'deliveryProcedures'];
    if (!keys.every((k) => Number(s[k]) >= 1)) { showError('اختار التقييمات الأربعة'); return; }
    try {
      await updateDoc(doc(db, 'tickets', t.id), {
        followUp: { ...Object.fromEntries(keys.map((k) => [k, Number(s[k])])), repurchase: s.repurchase || '' },
        followUpNotes: s.notes || '', followUpDate: todayYmd(), followUpBy: appUser?.name || '', updatedAt: serverTimestamp(),
      });
      await logContact(t, 'followup_done', s.notes || 'متابعة بعد التسليم');
      showSuccess('اتسجلت المتابعة');
      setSkip((x) => new Set([...x, t.id])); setOpenForm(null);
    } catch (e) { console.error(e); showError('معرفتش أسجل المتابعة'); }
  };
  const noAnswer = async (t) => {
    const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10);
    try { await logContact(t, 'no_answer', 'متابعة بعد التسليم — مارديش', tomorrow); showSuccess('اتسجل — هيظهر في المتابعات بكرة'); setSkip((x) => new Set([...x, t.id])); }
    catch { showError('معرفتش أسجل'); }
  };
  const LABELS = { accessibility: 'سهولة الوصول', maintenanceTime: 'وقت الصيانة', centerDealing: 'التعامل', deliveryProcedures: 'التسليم' };

  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
        <p className="text-sm text-slate-600 dark:text-slate-300">عملاء استلموا أجهزتهم من 2 لـ 10 أيام ولسه محدش كلّمهم. التقييم بيتحفظ في التذكرة وبيظهر في "رضا العملاء".</p>
        <button type="button" onClick={load} disabled={loading} className={`${btn} bg-teal-600 text-white`}>{loading ? <Loader2 size={14} className="animate-spin" /> : <HeartHandshake size={14} />} {list ? 'تحديث' : 'اعرض القائمة'}</button>
      </div>
      {list && !queue.length && <p className="text-sm text-slate-400 text-center p-6">مفيش متابعات مستنية 👌</p>}
      {queue.map(({ ticket: t, daysSince }) => (
        <div key={t.id} className={`${card} anim-up`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              <p className="font-black text-slate-800 dark:text-white text-sm">{t.customerName} <span className="font-normal text-slate-500">· {[t.device, t.deviceModel].filter(Boolean).join(' ')}</span></p>
              <p className="text-slate-500"><button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: t.id })} className="text-teal-700 hover:underline">{t.ticketNumber}</button> · اتسلّم من {daysSince} يوم · <span dir="ltr">{t.customerPhone}</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${t.customerPhone}`} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200`}><Phone size={14} /> اتصال</a>
              {whatsappLink(t.customerPhone, followUpMessage(t, systemSettings?.storeName)) && <a href={whatsappLink(t.customerPhone, followUpMessage(t, systemSettings?.storeName))} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-600 text-white`}><ExternalLink size={14} /> واتساب</a>}
              <button type="button" onClick={() => setOpenForm(openForm === t.id ? null : t.id)} className={`${btn} bg-teal-600 text-white`}><Check size={14} /> سجّل التقييم</button>
              <button type="button" onClick={() => noAnswer(t)} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-600`}>مارديش</button>
            </div>
          </div>
          {openForm === t.id && (
            <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2 anim-fade">
              {Object.entries(LABELS).map(([k, l]) => (
                <label key={k} className="text-[11px] text-slate-500">{l}
                  <select value={scores[t.id]?.[k] || ''} onChange={(e) => setScores((s) => ({ ...s, [t.id]: { ...s[t.id], [k]: e.target.value } }))} className={inp}>
                    <option value="">—</option>{Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              ))}
              <label className="text-[11px] text-slate-500">هيشتري تاني؟
                <select value={scores[t.id]?.repurchase || ''} onChange={(e) => setScores((s) => ({ ...s, [t.id]: { ...s[t.id], repurchase: e.target.value } }))} className={inp}><option value="">—</option><option value="yes">أيوه</option><option value="no">لأ</option></select>
              </label>
              <input value={scores[t.id]?.notes || ''} onChange={(e) => setScores((s) => ({ ...s, [t.id]: { ...s[t.id], notes: e.target.value } }))} placeholder="ملاحظات العميل" aria-label="ملاحظات العميل" className={`${inp} sm:col-span-2`} />
              <button type="button" onClick={() => saveResult(t)} className={`${btn} bg-teal-600 text-white justify-center`}><Save size={14} /> حفظ</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RemindersTab({ appUser, systemSettings }) {
  const seeAll = appUser?.role === 'admin' || appUser?.permissions?.viewAllWarehouses;
  const own = appUser?.assignedWarehouseId || 'main';
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const list = await ticketsUpdatedSince(new Date(Date.now() - 400 * DAY), { wheres: seeAll ? [] : [['assignedCenter', '==', own]], max: 20000 });
      setItems(periodicDue(list, { rules: systemSettings?.periodicMaintenance || undefined }));
    } catch (e) { console.error(e); showError('معرفتش أحمّل القائمة'); }
    finally { setLoading(false); }
  };
  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p>أجهزة قرب ميعاد صيانتها الدورية (التكييف كل 6 شهور، فلتر المياه كل 3، السخان والغسالة كل سنة).</p>
          <button type="button" onClick={() => requestNavigation('warranty_alerts')} className="text-xs font-bold text-teal-700 hover:underline mt-1">تذكيرات انتهاء الضمان ← صفحة تنبيهات الضمان (فيها زرار واتساب لكل عميل)</button>
        </div>
        <button type="button" onClick={load} disabled={loading} className={`${btn} bg-teal-600 text-white`}>{loading ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />} {items ? 'تحديث' : 'اعرض القائمة'}</button>
      </div>
      {items && !items.length && <p className="text-sm text-slate-400 text-center p-6">مفيش صيانات دورية قريبة.</p>}
      {(items || []).map((x) => {
        const link = whatsappLink(x.ticket.customerPhone, periodicMessage(x, systemSettings?.storeName));
        return (
          <div key={x.ticket.id} className={`${card} flex flex-wrap items-center justify-between gap-2 anim-up`}>
            <div className="text-xs">
              <p className="font-black text-sm text-slate-800 dark:text-white">{x.ticket.customerName} · {x.rule.label}</p>
              <p className="text-slate-500">{[x.ticket.device, x.ticket.deviceModel].filter(Boolean).join(' ')} · الميعاد {fmt(x.due)} ({x.daysToDue >= 0 ? `بعد ${x.daysToDue} يوم` : `فات من ${-x.daysToDue} يوم`})</p>
            </div>
            <div className="flex gap-2">
              <a href={`tel:${x.ticket.customerPhone}`} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200`}><Phone size={14} /> اتصال</a>
              {link && <a href={link} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-600 text-white`}><ExternalLink size={14} /> واتساب</a>}
              <button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket-new', prefill: { customerName: x.ticket.customerName, customerPhone: x.ticket.customerPhone, device: x.ticket.device, deviceModel: x.ticket.deviceModel, deviceSerial: x.ticket.deviceSerial, issue: x.rule.label, ticketType: 'maintenance' } })} className={`${btn} bg-teal-600 text-white`}><Plus size={14} /> احجز صيانة</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LogTab({ appUser }) {
  const seeAll = appUser?.role === 'admin' || appUser?.permissions?.viewAllWarehouses;
  const own = appUser?.assignedWarehouseId || 'main';
  const [logs, setLogs] = useState(null);
  const [due, setDue] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const cons = seeAll ? [] : [where('warehouseId', '==', own)];
      const [a, b] = await Promise.all([
        getDocs(query(collection(db, 'contactLogs'), ...cons, orderBy('at', 'desc'), limit(200))),
        getDocs(query(collection(db, 'contactLogs'), where('followUpDone', '==', false), where('followUpAt', '<=', todayYmd()), orderBy('followUpAt', 'asc'), limit(200))),
      ]);
      setLogs(a.docs.map((d) => ({ id: d.id, ...d.data() })));
      setDue(b.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => seeAll || x.warehouseId === own));
    } catch (e) { console.error(e); showError(e?.code === 'failed-precondition' ? 'محتاج Index: شغّل firebase deploy --only firestore:indexes' : 'معرفتش أحمّل السجل'); }
    finally { setLoading(false); }
  };
  const markDone = async (l) => {
    try { await updateDoc(doc(db, 'contactLogs', l.id), { followUpDone: true, doneBy: appUser?.name || '', doneAt: serverTimestamp() }); setDue((d) => d.filter((x) => x.id !== l.id)); }
    catch { showError('معرفتش أحدّث'); }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button type="button" onClick={load} disabled={loading} className={`${btn} bg-teal-600 text-white`}>{loading ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />} {logs ? 'تحديث' : 'اعرض السجل'}</button></div>
      {due.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-900/60 p-4">
          <p className="text-sm font-black text-amber-800 dark:text-amber-300 mb-2">متابعات ميعادها جه ({due.length})</p>
          {due.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 border-b border-amber-100 dark:border-amber-900/40">
              <span><b>{l.customerName || l.customerPhone}</b> · {l.note} · <span className="text-slate-500">{l.followUpAt}</span></span>
              <span className="flex gap-2"><a href={`tel:${l.customerPhone}`} className="text-teal-700 font-bold">اتصال</a><button type="button" onClick={() => markDone(l)} className="text-emerald-700 font-bold">تم ✓</button></span>
            </div>
          ))}
        </div>
      )}
      {logs && (
        <div className={card}>
          {!logs.length && <p className="text-xs text-slate-400">مفيش تواصل مسجل.</p>}
          {logs.map((l) => (
            <div key={l.id} className="text-xs py-2 border-b border-slate-50 dark:border-slate-700/60">
              <p><b>{l.customerName || l.customerPhone}</b> · {labelOf(CONTACT_TYPES, l.type)} · <span className="text-teal-700">{labelOf(CONTACT_OUTCOMES, l.outcome)}</span> {l.ticketNumber && <button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: l.ticketId })} className="text-teal-700 hover:underline">· {l.ticketNumber}</button>}</p>
              {l.note && <p className="text-slate-600 dark:text-slate-300">{l.note}</p>}
              <p className="text-[10px] text-slate-400">{fmt(toDate(l.at))} · {l.by}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [['call', 'مكالمة', <PhoneCall size={14} key="i" />], ['requests', 'طلبات الحجز أونلاين', <Inbox size={14} key="i" />], ['complaints', 'الشكاوى والتصعيد', <Megaphone size={14} key="i" />], ['followup', 'متابعة بعد التسليم', <HeartHandshake size={14} key="i" />], ['reminders', 'صيانة دورية وضمان', <CalendarClock size={14} key="i" />], ['log', 'سجل التواصل', <History size={14} key="i" />]];

// ☎️ شاشة الكول سنتر
export function CallCenterView({ appUser, systemSettings }) {
  const [tab, setTab] = useState('call');
  const [preset, setPreset] = useState(null);
  useIntent('call', (v) => { setTab('call'); setPreset({ phone: v.phone, at: Date.now() }); });
  useIntent('requests', () => setTab('requests'));
  const [complaintPrefill, setComplaintPrefill] = useState(null);
  useIntent('complaint-new', (v) => { setTab('complaints'); setComplaintPrefill({ ...(v.prefill || {}), at: Date.now() }); });
  return (
    <section className="space-y-4" dir="rtl">
      <div className={`${card} shadow-sm flex flex-wrap items-center justify-between gap-3 anim-up`}>
        <h2 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><PhoneCall size={20} className="text-teal-600" /> الكول سنتر</h2>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([id, label, icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${tab === id ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>{icon} {label}</button>
          ))}
        </div>
      </div>
      {tab === 'call' && <CallTab appUser={appUser} systemSettings={systemSettings} preset={preset} />}
      {tab === 'requests' && <RequestsTab appUser={appUser} systemSettings={systemSettings} />}
      {tab === 'complaints' && <ComplaintsTab appUser={appUser} systemSettings={systemSettings} prefill={complaintPrefill} />}
      {tab === 'followup' && <FollowUpTab appUser={appUser} systemSettings={systemSettings} />}
      {tab === 'reminders' && <RemindersTab appUser={appUser} systemSettings={systemSettings} />}
      {tab === 'log' && <LogTab appUser={appUser} />}
    </section>
  );
}
