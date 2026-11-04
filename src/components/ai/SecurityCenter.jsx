import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { ShieldCheck, HardDriveDownload, History, KeyRound, Loader2, Undo2, RefreshCw, Save, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { db } from '../../firebase/config';
import { BACKUP_COLLECTIONS, backupDue, createFullBackup } from '../../utils/fullBackup';
import { COLL_LABELS, FIELD_LABELS, revertAudit } from '../../utils/audit';
import { AUTH_MODE, APPCHECK_KEY, secureAuthStatus, sendResetLink } from '../../utils/secureAuth';
import { hasPerm } from '../../utils/permissions';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { toDate } from '../../utils/liveStats';

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
    </section>
  );
}

export default SecurityCenter;

