import React, { useEffect, useState } from 'react';
import { addDoc, arrayUnion, collection, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Building2, ArrowLeftRight, PackagePlus, PackageX, FileBadge, Loader2, ChevronDown } from 'lucide-react';
import { db } from '../../firebase/config';
import { centersFromSettings, claimFromTicket, CLAIM_FLOW, DEFECTIVE_FLOW, PART_REQUEST_FLOW, timeByCenter } from '../../ai/network';
import { formatDuration } from '../../ai/repairTime';
import { showError, showSuccess } from '../../utils/alerts';
import { notify } from '../../utils/notifications';

const inp = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50';

// 🏢 أدوات الشبكة جوه التذكرة: تحويل لمركز، طلب قطع، قطعة تالفة، مطالبة ضمان
export function TicketNetworkTools({ ticket, systemSettings, appUser, warehouses = [], onTicketPatched }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [related, setRelated] = useState({ parts: [], defective: [], claims: [] });
  const [form, setForm] = useState({});
  const centers = centersFromSettings(systemSettings);
  const ticketId = ticket?.id;

  useEffect(() => {
    if (!open || !ticketId) return undefined;
    let cancelled = false;
    const get = (c) => getDocs(query(collection(db, c), where('ticketId', '==', ticketId), limit(50))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
    Promise.all([get('partRequests'), get('defectiveParts'), get('warrantyClaims')]).then(([parts, defective, claims]) => { if (!cancelled) setRelated({ parts, defective, claims }); });
    return () => { cancelled = true; };
  }, [open, ticketId]);

  if (!ticket) return null;
  const by = appUser?.name || '';
  const segs = timeByCenter(ticket);

  const transfer = async () => {
    if (!form.to || form.to === ticket.assignedMaintenanceCenter) { showError('اختار مركز مختلف'); return; }
    if (!String(form.reason || '').trim()) { showError('اكتب سبب التحويل'); return; }
    setBusy(true);
    try {
      const entry = { from: ticket.assignedMaintenanceCenter || '', to: form.to, reason: form.reason.trim(), at: new Date().toISOString(), by };
      await updateDoc(doc(db, 'tickets', ticket.id), {
        assignedMaintenanceCenter: form.to, updatedAt: serverTimestamp(), centerHistory: arrayUnion(entry),
        history: arrayUnion({ action: `تحويل من "${entry.from || 'غير محدد'}" إلى "${entry.to}"`, details: entry.reason, timestamp: entry.at, by }),
      });
      onTicketPatched?.({ assignedMaintenanceCenter: form.to, centerHistory: [...(ticket.centerHistory || []), entry] });
      notify({ toCenter: form.to, title: `تذكرة ${ticket.ticketNumber || ''} اتحوّلت لمركزكم`, body: entry.reason, view: 'center_portal', from: by });
      showSuccess(`اتحولت لـ ${form.to}`); setMode(''); setForm({});
    } catch (e) { console.error(e); showError('معرفتش أحوّل التذكرة'); }
    finally { setBusy(false); }
  };

  const requestParts = async () => {
    const items = String(form.items || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = /^(.*?)(?:\s*[x×*]\s*(\d+))?$/.exec(l);
      return { name: m[1].trim(), qty: Number(m[2]) || 1 };
    });
    if (!items.length) { showError('اكتب القطع المطلوبة (كل قطعة في سطر)'); return; }
    setBusy(true);
    try {
      const rec = {
        ticketId: ticket.id, ticketNumber: ticket.ticketNumber || '', device: [ticket.device, ticket.deviceModel].filter(Boolean).join(' '),
        center: ticket.assignedMaintenanceCenter || '', branch: ticket.assignedCenter || 'main', fromWarehouse: form.fromWarehouse || 'main',
        items, note: form.note || '', status: 'pending', requestedBy: by, createdAt: serverTimestamp(),
        log: [{ status: 'pending', at: new Date().toISOString(), by }],
      };
      const r = await addDoc(collection(db, 'partRequests'), rec);
      setRelated((x) => ({ ...x, parts: [{ id: r.id, ...rec }, ...x.parts] }));
      ['admin', 'main_warehouse_manager'].forEach((role) => notify({ toRole: role, title: `طلب قطع غيار — ${ticket.ticketNumber || ''}`, body: items.map((i) => `${i.name}×${i.qty}`).join('، '), view: 'network', from: by }));
      showSuccess('اتبعت طلب القطع'); setMode(''); setForm({});
    } catch (e) { console.error(e); showError('معرفتش أبعت الطلب'); }
    finally { setBusy(false); }
  };

  const addDefective = async () => {
    if (!String(form.partName || '').trim()) { showError('اكتب اسم القطعة'); return; }
    setBusy(true);
    try {
      const rec = { ticketId: ticket.id, ticketNumber: ticket.ticketNumber || '', model: ticket.deviceModel || ticket.device || '', partName: form.partName.trim(), serial: form.partSerial || '',
        center: ticket.assignedMaintenanceCenter || '', status: 'removed', createdAt: serverTimestamp(), by, log: [{ status: 'removed', at: new Date().toISOString(), by }] };
      const r = await addDoc(collection(db, 'defectiveParts'), rec);
      setRelated((x) => ({ ...x, defective: [{ id: r.id, ...rec }, ...x.defective] }));
      showSuccess('اتسجلت القطعة التالفة'); setMode(''); setForm({});
    } catch (e) { console.error(e); showError('معرفتش أسجلها'); }
    finally { setBusy(false); }
  };

  const createClaim = async () => {
    setBusy(true);
    try {
      const rec = { ...claimFromTicket(ticket, centers), note: form.claimNote || '', createdBy: by, createdAt: serverTimestamp(), log: [{ status: 'draft', at: new Date().toISOString(), by }] };
      const r = await addDoc(collection(db, 'warrantyClaims'), rec);
      setRelated((x) => ({ ...x, claims: [{ id: r.id, ...rec }, ...x.claims] }));
      showSuccess('اتعملت مسودة المطالبة — كمّلها من شاشة "شبكة المراكز"'); setMode(''); setForm({});
    } catch (e) { console.error(e); showError('معرفتش أعمل المطالبة'); }
    finally { setBusy(false); }
  };

  const tab = (id, label, icon) => (
    <button type="button" onClick={() => setMode(mode === id ? '' : id)} className={`${btn} ${mode === id ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'}`}>{icon} {label}</button>
  );

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between px-4 py-3 text-right">
        <span className="flex items-center gap-2 font-black text-slate-800 dark:text-white text-sm"><Building2 size={16} className="text-teal-600" /> المركز وقطع الغيار والضمان
          <span className="text-[11px] font-normal text-slate-500">{ticket.assignedMaintenanceCenter ? `· ${ticket.assignedMaintenanceCenter}` : '· من غير مركز'}</span></span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 anim-fade">
          {segs.length > 1 && (
            <div className="text-xs bg-white dark:bg-slate-800 rounded-lg p-2 border border-slate-100 dark:border-slate-700">
              <b>الوقت عند كل مركز:</b> {segs.map((x) => `${x.center}: ${formatDuration(x.ms)}`).join(' · ')}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {tab('transfer', 'تحويل لمركز تاني', <ArrowLeftRight size={14} />)}
            {tab('parts', 'طلب قطع غيار', <PackagePlus size={14} />)}
            {tab('defective', 'قطعة تالفة للمصنع', <PackageX size={14} />)}
            {ticket.warrantyStatus === 'in_warranty' && tab('claim', 'مطالبة ضمان من المصنع', <FileBadge size={14} />)}
          </div>

          {mode === 'transfer' && (
            <div className="grid sm:grid-cols-3 gap-2 anim-fade">
              <select aria-label="المركز الجديد" value={form.to || ''} onChange={(e) => setForm({ ...form, to: e.target.value })} className={inp}>
                <option value="">-- المركز الجديد --</option>{centers.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <input aria-label="سبب التحويل" value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="سبب التحويل" className={inp} />
              <button type="button" onClick={transfer} disabled={busy} className={`${btn} bg-teal-600 text-white justify-center`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />} حوّل</button>
            </div>
          )}
          {mode === 'parts' && (
            <div className="grid sm:grid-cols-2 gap-2 anim-fade">
              <textarea aria-label="القطع المطلوبة" rows={3} value={form.items || ''} onChange={(e) => setForm({ ...form, items: e.target.value })} placeholder={'كل قطعة في سطر، والكمية بعد ×\nبورد باور × 1\nريموت'} className={inp} />
              <div className="space-y-2">
                <select aria-label="من مخزن" value={form.fromWarehouse || 'main'} onChange={(e) => setForm({ ...form, fromWarehouse: e.target.value })} className={inp}>
                  {(warehouses.length ? warehouses : [{ id: 'main', name: 'الرئيسي' }]).map((w) => <option key={w.id} value={w.id}>من: {w.name}</option>)}
                </select>
                <input aria-label="ملاحظة الطلب" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="ملاحظة (اختياري)" className={inp} />
                <button type="button" onClick={requestParts} disabled={busy} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <PackagePlus size={14} />} ابعت الطلب</button>
              </div>
            </div>
          )}
          {mode === 'defective' && (
            <div className="grid sm:grid-cols-3 gap-2 anim-fade">
              <input aria-label="اسم القطعة التالفة" value={form.partName || ''} onChange={(e) => setForm({ ...form, partName: e.target.value })} placeholder="اسم القطعة اللي اتشالت" className={inp} />
              <input aria-label="سيريال القطعة" value={form.partSerial || ''} onChange={(e) => setForm({ ...form, partSerial: e.target.value })} placeholder="سيريال القطعة (لو موجود)" className={inp} />
              <button type="button" onClick={addDefective} disabled={busy} className={`${btn} bg-teal-600 text-white justify-center`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <PackageX size={14} />} سجّل</button>
            </div>
          )}
          {mode === 'claim' && (
            <div className="space-y-2 anim-fade text-xs">
              {(() => { const c = claimFromTicket(ticket, centers); return <p className="text-slate-600 dark:text-slate-300">الموديل: <b>{c.model}</b> · العطل: <b>{c.fault || '—'}</b> · قطع: <b>{c.parts.length}</b> ({c.partsCost.toLocaleString()} ج) · مصنعية: <b>{c.laborCost.toLocaleString()} ج</b></p>; })()}
              <input aria-label="ملاحظة المطالبة" value={form.claimNote || ''} onChange={(e) => setForm({ ...form, claimNote: e.target.value })} placeholder="ملاحظة للمصنع (اختياري)" className={inp} />
              <button type="button" onClick={createClaim} disabled={busy} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FileBadge size={14} />} اعمل مسودة مطالبة</button>
            </div>
          )}

          {(related.parts.length > 0 || related.defective.length > 0 || related.claims.length > 0) && (
            <div className="text-xs space-y-1 border-t border-slate-200 dark:border-slate-700 pt-2">
              {related.parts.map((p) => <p key={p.id}>📦 طلب قطع: {p.items.map((i) => `${i.name}×${i.qty}`).join('، ')} — <b>{PART_REQUEST_FLOW[p.status]?.label || p.status}</b></p>)}
              {related.defective.map((p) => <p key={p.id}>♻️ قطعة تالفة: {p.partName} — <b>{DEFECTIVE_FLOW[p.status]?.label || p.status}</b></p>)}
              {related.claims.map((c) => <p key={c.id}>🧾 مطالبة ضمان — <b>{CLAIM_FLOW[c.status]?.label || c.status}</b>{c.approvedAmount ? ` · ${Number(c.approvedAmount).toLocaleString()} ج` : ''}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
