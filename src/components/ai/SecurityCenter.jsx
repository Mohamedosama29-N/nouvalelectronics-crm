import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { ShieldCheck, HardDriveDownload, History, KeyRound, Loader2, Undo2, RefreshCw, Save, Mail, AlertTriangle, CheckCircle2, Upload, Gauge } from 'lucide-react';
import { db } from '../../firebase/config';
import { BACKUP_COLLECTIONS, backupDue, createFullBackup, FREE_WRITES_PER_DAY, parseBackupFile, restoreBackup, SENSITIVE } from '../../utils/fullBackup';
import { COLL_LABELS, FIELD_LABELS, revertAudit } from '../../utils/audit';
import { AUTH_MODE, APPCHECK_KEY, secureAuthStatus, sendResetLink } from '../../utils/secureAuth';
import { hasPerm } from '../../utils/permissions';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { toDate } from '../../utils/liveStats';
import { deviceUsage, FREE_LIMITS, flushUsage, onUsage, quotaDay, readUsageToday, usageLevel } from '../../utils/readMeter';
import { resetTicketPools } from '../../ai/ticketPool';

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const inp = 'border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50';
const show = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (typeof v === 'object') { const s = JSON.stringify(v); return s.length > 80 ? `${s.slice(0, 80)}…` : s; }
  return String(v).length > 80 ? `${String(v).slice(0, 80)}…` : String(v);
};

// ================================================================ (55) النسخ الاحتياطي
function BackupTab({ appUser, systemSettings }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [cfg, setCfg] = useState({ backupReminderDays: systemSettings?.backupReminderDays || 7, complaintsSupervisor: systemSettings?.complaintsSupervisor || '' });
  const [now] = useState(() => new Date());
  const due = backupDue(systemSettings, now);
  const info = systemSettings?.backupInfo;
  const run = async () => {
    setBusy(true); setResult(null);
    try { setResult(await createFullBackup({ user: appUser, onProgress: setProgress })); showSuccess('النسخة الاحتياطية اتنزلت على جهازك'); }
    catch (e) { console.error(e); showError('معرفتش أعمل النسخة الاحتياطية'); }
    setBusy(false); setProgress(null);
  };
  const saveCfg = async () => {
    try { await setDoc(doc(db, 'settings', 'general'), { backupReminderDays: Number(cfg.backupReminderDays) || 7, complaintsSupervisor: cfg.complaintsSupervisor.trim() }, { merge: true }); showSuccess('اتحفظ'); }
    catch { showError('معرفتش أحفظ'); }
  };
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <div className={`rounded-xl p-3 text-sm font-bold flex items-center gap-2 ${due.due ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>
          {due.due ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          {due.days === null ? 'لسه متعملتش نسخة احتياطية كاملة.' : `آخر نسخة من ${due.days} يوم${info?.lastBy ? ` (${info.lastBy})` : ''}${info?.docs ? ` · ${info.docs.toLocaleString()} سجل · ${info.sizeKb?.toLocaleString()} KB` : ''}.`}
        </div>
        <p className="text-xs text-slate-500">النسخة ملف JSON بيتنزل على جهازك وفيه {BACKUP_COLLECTIONS.length} جدول (المخزون، الفواتير، التذاكر، العملاء، الموظفين، الإعدادات، المشتريات، الشكاوى…). مجانية تمامًا. احفظها في مكان آمن (فلاشة أو Google Drive).</p>
        <button type="button" onClick={run} disabled={busy} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <HardDriveDownload size={14} />} اعمل نسخة احتياطية دلوقتي</button>
        {progress && <p className="text-xs text-slate-500">جاري: {progress.name} ({progress.step}/{progress.total}) · {progress.docs} سجل</p>}
        {result && <p className="text-xs text-emerald-700">✅ {result.total.toLocaleString()} سجل · {result.sizeKb.toLocaleString()} KB{result.errors.length ? ` · ⚠️ ${result.errors.length} جدول معرفتش أقراه: ${result.errors.map((e) => e.name).join('، ')}` : ''}</p>}
      </div>
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <label className="text-xs font-bold">ذكّرني بالنسخة كل (يوم)<input type="number" min="1" max="60" className={`${inp} block mt-1 w-24`} value={cfg.backupReminderDays} onChange={(e) => setCfg({ ...cfg, backupReminderDays: e.target.value })} /></label>
        <label className="text-xs font-bold">مشرف الشكاوى (اسم الموظف — المستوى التاني)<input className={`${inp} block mt-1`} value={cfg.complaintsSupervisor} onChange={(e) => setCfg({ ...cfg, complaintsSupervisor: e.target.value })} /></label>
        <button type="button" onClick={saveCfg} className={`${btn} bg-slate-800 text-white`}><Save size={14} /> حفظ</button>
      </div>
      <RestoreCard appUser={appUser} />
    </div>
  );
}

// ================================================================ (3) الاسترجاع من ملف
function RestoreCard({ appUser }) {
  const [file, setFile] = useState(null);
  const [sel, setSel] = useState({});
  const [mode, setMode] = useState('missing');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(null);
  const onFile = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = parseBackupFile(String(reader.result));
      if (!r.ok) { showError(r.error); return; }
      setFile({ ...r, name: f.name }); setDone(null);
      setSel(Object.fromEntries(Object.keys(r.counts).map((k) => [k, !SENSITIVE.has(k) && r.counts[k] > 0])));
    };
    reader.readAsText(f);
  };
  const chosen = file ? Object.keys(sel).filter((k) => sel[k]) : [];
  const writes = file ? chosen.reduce((s, k) => s + (file.counts[k] || 0), 0) : 0;
  const run = async () => {
    if (!chosen.length) return showError('اختار جدول واحد على الأقل');
    const sens = chosen.filter((k) => SENSITIVE.has(k));
    const ok = await showConfirm('تأكيد الاسترجاع',
      `${mode === 'overwrite' ? '⚠️ هيرجّع المستندات زي ما كانت في النسخة ويكتب فوق التعديلات اللي بعدها.' : 'هيضيف المستندات اللي اتمسحت بس، ومش هيلمس الموجود.'}\n${chosen.length} جدول · حوالي ${writes.toLocaleString()} كتابة${sens.length ? `\nجداول حساسة: ${sens.join('، ')}` : ''}\n\nيفضّل تعمل نسخة احتياطية جديدة الأول.`);
    if (!ok) return;
    setBusy(true);
    try { setDone(await restoreBackup(file.payload, { collections: chosen, mode, onProgress: setProgress })); showSuccess('الاسترجاع خلص'); }
    catch (e) { console.error(e); showError(e?.code === 'resource-exhausted' ? 'وصلت لحد الكتابة المجاني النهارده — كمّل بكرة بنفس الملف واختار "المفقود بس".' : 'الاسترجاع وقف في النص — جرّب تاني بوضع "المفقود بس" عشان يكمّل من غير تكرار'); }
    setBusy(false); setProgress(null);
  };
  if (appUser?.role !== 'admin') return null;
  return (
    <div className={`${card} space-y-3`}>
      <p className="font-black text-sm flex items-center gap-2"><Upload size={16} className="text-teal-600" /> استرجاع من ملف نسخة احتياطية</p>
      <label className={`${btn} bg-slate-100 dark:bg-slate-700 w-fit cursor-pointer`}><Upload size={14} /> اختار ملف النسخة (.json)<input type="file" accept="application/json,.json" className="hidden" onChange={onFile} aria-label="ملف النسخة الاحتياطية" /></label>
      {file && (
        <>
          <p className="text-xs text-slate-500">{file.name} · اتعملت {file.meta.createdAt ? new Date(file.meta.createdAt).toLocaleString('ar-EG') : '—'}{file.meta.createdBy ? ` بواسطة ${file.meta.createdBy}` : ''}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-xs">
            {Object.entries(file.counts).map(([k, c]) => (
              <label key={k} className={`flex items-center gap-1 rounded-lg px-2 py-1 ${SENSITIVE.has(k) ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-900/40'}`}>
                <input type="checkbox" checked={!!sel[k]} disabled={!c} onChange={(e) => setSel({ ...sel, [k]: e.target.checked })} /> {k} <span className="text-slate-400">({c})</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1"><input type="radio" name="rmode" checked={mode === 'missing'} onChange={() => setMode('missing')} /> رجّع المفقود بس (أأمن)</label>
            <label className="flex items-center gap-1"><input type="radio" name="rmode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} /> رجّع كل حاجة زي النسخة (بيكتب فوق التعديلات)</label>
          </div>
          {writes > FREE_WRITES_PER_DAY * 0.8 && <p className="text-xs text-amber-700">⚠️ حوالي {writes.toLocaleString()} كتابة — الحد المجاني {FREE_WRITES_PER_DAY.toLocaleString()} في اليوم. قسّم الجداول على أكتر من يوم.</p>}
          <button type="button" onClick={run} disabled={busy || !chosen.length} className={`${btn} bg-rose-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} ابدأ الاسترجاع</button>
          {progress && <p className="text-xs text-slate-500">{progress.name} ({progress.step}/{progress.total}) · {progress.phase === 'check' ? 'بشوف الموجود…' : `${progress.written}/${progress.of}`}</p>}
          {done && <div className="text-xs space-y-0.5">{Object.entries(done).map(([k, r]) => <p key={k}>✅ {k}: اترجع {r.written}{r.skipped ? ` · موجود قبل كده ${r.skipped}` : ''}</p>)}</div>}
        </>
      )}
    </div>
  );
}

// ================================================================ (56) سجل التعديلات مع التراجع
function AuditTab({ appUser }) {
  const [list, setList] = useState(null);
  const [coll, setColl] = useState('all');
  const [busy, setBusy] = useState('');
  const canRevert = hasPerm(appUser, 'revertChanges');
  const load = async () => {
    try {
      const parts = [collection(db, 'auditTrail')];
      if (coll !== 'all') parts.push(where('coll', '==', coll));
      const s = await getDocs(query(...parts, orderBy('at', 'desc'), limit(200)));
      setList(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); showError(e?.code === 'failed-precondition' ? 'محتاج Index: firebase deploy --only firestore:indexes' : 'معرفتش أحمّل السجل'); setList([]); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- بيتحمّل لما الفلتر يتغير
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [coll]);

  const revert = async (e) => {
    setBusy(e.id);
    try {
      let r = await revertAudit(e, appUser);
      if (r.conflicts.length) {
        const unlocked = r.conflicts.filter((c) => !c.locked);
        const msg = r.conflicts.map((c) => `${FIELD_LABELS[c.field] || c.field}: بقت "${show(c.now)}"${c.locked ? ' (قيمة كبيرة — مينفعش)' : ''}`).join('\n');
        if (unlocked.length && await showConfirm('فيه حقول اتغيرت بعد التعديل ده', `${msg}\n\nترجّعهم برضه للقيمة القديمة؟`)) r = await revertAudit({ ...e, changes: unlocked, reverted: false }, appUser, { force: true });
      }
      if (r.applied) showSuccess(`اترجع ${r.applied} حقل`); else showError('مفيش حاجة اترجعت');
      load();
    } catch (err) { console.error(err); showError(err?.code === 'gone' ? 'السجل الأصلي اتمسح' : 'معرفتش أرجّع التعديل'); }
    setBusy('');
  };

  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        {['all', ...Object.keys(COLL_LABELS)].map((k) => <button key={k} type="button" onClick={() => setColl(k)} className={`${btn} ${coll === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{k === 'all' ? 'الكل' : COLL_LABELS[k]}</button>)}
        <button type="button" onClick={load} aria-label="تحديث" className={`${btn} bg-slate-100 dark:bg-slate-700 mr-auto`}><RefreshCw size={14} /></button>
      </div>
      <p className="text-[11px] text-slate-500">كل تعديل على التذاكر والأصناف والعملاء والصلاحيات والإعدادات بيتسجل بالقيمة قبل وبعد. التراجع مش بيكتب فوق أي تغيير حصل بعده من غير ما يسألك.</p>
      {!list ? <Loader2 className="animate-spin text-teal-600" /> : list.length === 0 ? <p className="text-xs text-slate-400">مفيش تعديلات متسجلة لسه.</p> : list.map((e) => {
        const at = toDate(e.at);
        return (
          <div key={e.id} className={`border rounded-xl p-3 text-xs space-y-1 ${e.reverted ? 'opacity-60 border-slate-100 dark:border-slate-700' : 'border-slate-200 dark:border-slate-700'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <b>{e.label}</b><span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700">{COLL_LABELS[e.coll] || e.coll}</span>
              <span className="text-slate-500">{e.by} · {at ? at.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
              {e.reverted && <span className="text-amber-600 font-bold">اترجع{e.revertedBy ? ` (${e.revertedBy})` : ''}</span>}
              {!e.reverted && canRevert && <button type="button" disabled={busy === e.id} onClick={() => revert(e)} className={`${btn} bg-amber-500 text-white mr-auto`}>{busy === e.id ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} تراجع</button>}
            </div>
            <table className="w-full"><tbody>{(e.changes || []).map((c) => (
              <tr key={c.field} className="border-t border-slate-100 dark:border-slate-700"><td className="p-1 font-bold w-32">{FIELD_LABELS[c.field] || c.field}</td><td className="p-1 text-rose-600 line-through">{show(c.before)}</td><td className="p-1 text-emerald-700">{show(c.after)}</td></tr>
            ))}</tbody></table>
          </div>
        );
      })}
    </div>
  );
}

// ================================================================ (5) استهلاك الخطة المجانية
const Bar = ({ used, limit, label }) => {
  const u = usageLevel(used, limit);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><b>{label}</b><span>{Math.round(used).toLocaleString()} / {limit.toLocaleString()} ({Math.round(u.pct * 100)}%)</span></div>
      <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden"><div className={`h-full ${u.level === 'danger' ? 'bg-rose-500' : u.level === 'warn' ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${Math.min(100, u.pct * 100)}%` }} /></div>
    </div>
  );
};
function UsageTab({ appUser }) {
  const [total, setTotal] = useState(null);
  const [mine, setMine] = useState(() => deviceUsage());
  const load = async () => { try { await flushUsage(appUser, { force: true }); setTotal(await readUsageToday()); } catch (e) { console.warn(e); setTotal({ reads: 0, writes: 0, error: true }); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- مرة واحدة
  useEffect(() => { const t = setTimeout(load, 0); const off = onUsage((m) => setMine({ ...m })); return () => { clearTimeout(t); off(); }; }, []);
  const top = Object.entries(mine.top || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <p className="font-black text-sm flex items-center gap-2"><Gauge size={16} className="text-teal-600" /> استهلاك النهارده (كل الأجهزة) — يوم {quotaDay()}</p>
        {!total ? <Loader2 className="animate-spin text-teal-600" /> : (
          <>
            <Bar used={total.reads || 0} limit={FREE_LIMITS.reads} label="القراءات" />
            <Bar used={total.writes || 0} limit={FREE_LIMITS.writes} label="الكتابات" />
          </>
        )}
        <p className="text-[11px] text-slate-500">رقم تقريبي من عدّاد جوه السيستم (الأجهزة بتبعته كل ربع ساعة)، والحصة بتتجدد حوالي الساعة 10 الصبح بتوقيت مصر. الرقم الرسمي في Firebase Console ← Firestore ← Usage.</p>
        <button type="button" onClick={load} className={`${btn} bg-slate-100 dark:bg-slate-700 w-fit`}><RefreshCw size={14} /> تحديث</button>
      </div>
      <div className={`${card} space-y-2 text-xs`}>
        <p className="font-black text-sm">الجهاز ده النهارده</p>
        <p>قراءات: <b>{mine.reads.toLocaleString()}</b> · من الكاش (ببلاش): <b>{(mine.cacheHits || 0).toLocaleString()}</b> · كتابات: <b>{mine.writes.toLocaleString()}</b></p>
        {top.length > 0 && <p>أكتر جداول بتتقري: {top.map(([k, v]) => `${k} (${v.toLocaleString()})`).join(' · ')}</p>}
        <button type="button" onClick={() => { resetTicketPools(); showSuccess('اتمسح كاش التذاكر على الجهاز ده'); }} className={`${btn} bg-slate-100 dark:bg-slate-700 w-fit`}>امسح كاش التذاكر (لو حاسس إن فيه بيانات قديمة)</button>
      </div>
      <div className={`${card} text-xs space-y-1 text-slate-600 dark:text-slate-300`}>
        <p className="font-black text-sm text-slate-800 dark:text-white">نصايح توفّر القراءات</p>
        <p>• شاشات التحليلات بقت بتحتفظ بالتذاكر على الجهاز وبتجيب اللي اتغير بس — متقفلش المتصفح بـ "مسح البيانات" كل شوية.</p>
        <p>• التقارير الكبيرة (الأرباح، توقع حجم التذاكر، النسخة الاحتياطية) بتقرا آلاف المستندات — اعملها مرة في اليوم مش كل شوية.</p>
        <p>• لو العدّاد عدّى 70% هيظهر تنبيه للأدمن فوق الصفحات.</p>
      </div>
    </div>
  );
}

// ================================================================ (54) الدخول الآمن
function SecureLoginTab() {
  const [emps, setEmps] = useState(null);
  useEffect(() => { getDocs(collection(db, 'employees')).then((s) => setEmps(s.docs.map((d) => ({ id: d.id, ...d.data() })))).catch(() => setEmps([])); }, []);
  const st = useMemo(() => (emps ? secureAuthStatus(emps) : null), [emps]);
  const reset = async (e) => { try { await sendResetLink(e.email); showSuccess(`اتبعت رابط تعيين باسورد لـ ${e.email}`); } catch { showError('معرفتش أبعت — اتأكد إن Email/Password متفعّل في Firebase Auth'); } };
  const MODES = { legacy: 'الدخول القديم (الحالي)', migrate: 'ترحيل هادي', firebase: 'دخول آمن بالكامل' };
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-2 text-sm`}>
        <p className="font-black flex items-center gap-2"><KeyRound size={16} className="text-teal-600" /> الوضع الحالي: {MODES[AUTH_MODE]}</p>
        <p className="text-xs">App Check: {APPCHECK_KEY ? <b className="text-emerald-600">متفعّل</b> : <span className="text-slate-500">مقفول (مفيش مفتاح)</span>}</p>
        {AUTH_MODE === 'legacy' && <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">الدخول الآمن المجاني جاهز بس مقفول عن قصد. خطوات التفعيل في ملف SECURE_LOGIN.md (فعّله بعد الأجازة زي ما اتفقنا).</p>}
        {st && <p className="text-xs">الموظفين المربوطين بحساب آمن: <b>{st.linked}</b> من <b>{st.total}</b></p>}
        {st && st.total > 0 && <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-teal-500" style={{ width: `${(st.linked / st.total) * 100}%` }} /></div>}
      </div>
      {st && st.pending.length > 0 && (
        <div className={`${card} space-y-1`}>
          <p className="font-black text-sm">لسه مااتربطوش ({st.pending.length})</p>
          <p className="text-[11px] text-slate-500">في وضع "ترحيل هادي" بيتربطوا لوحدهم أول ما يسجّلوا دخول. لو باسورد حد أقل من 6 حروف ابعتله رابط تعيين باسورد (بعد تفعيل Email/Password).</p>
          {st.pending.map((e) => (
            <div key={e.id} className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-1 text-xs">
              <span><b>{e.name}</b> <span className="text-slate-500" dir="ltr">{e.email}</span></span>
              {AUTH_MODE !== 'legacy' && e.email && <button type="button" onClick={() => reset(e)} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Mail size={12} /> رابط باسورد</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [
  ['backup', 'النسخ الاحتياطي', <HardDriveDownload size={14} key="i" />],
  ['audit', 'سجل التعديلات والتراجع', <History size={14} key="i" />],
  ['login', 'الدخول الآمن', <KeyRound size={14} key="i" />],
  ['usage', 'استهلاك الخطة المجانية', <Gauge size={14} key="i" />],
];

// 🛡️ الأمان والنسخ الاحتياطي
export function SecurityCenter({ appUser, systemSettings }) {
  const [tab, setTab] = useState('backup');
  return (
    <section className="space-y-4" dir="rtl">
      <div className={`${card} shadow-sm flex flex-wrap items-center justify-between gap-3 anim-up`}>
        <h2 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><ShieldCheck size={20} className="text-teal-600" /> الأمان والنسخ الاحتياطي</h2>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([id, label, icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${tab === id ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{icon} {label}</button>)}
        </div>
      </div>
      {tab === 'backup' && <BackupTab appUser={appUser} systemSettings={systemSettings} />}
      {tab === 'audit' && <AuditTab appUser={appUser} />}
      {tab === 'login' && <SecureLoginTab />}
      {tab === 'usage' && <UsageTab appUser={appUser} />}
    </section>
  );
}

export default SecurityCenter;

