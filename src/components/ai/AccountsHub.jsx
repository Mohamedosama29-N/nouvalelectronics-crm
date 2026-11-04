import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, arrayUnion, collection, doc, getDocs, increment, limit, orderBy, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { Truck, ClipboardCheck, Wallet, FileText, TrendingUp, Barcode, Loader2, RefreshCw, Plus, Save, Trash2, PackageCheck, Printer, Search, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { db } from '../../firebase/config';
import { PO_STATUS, applyReceipt, countDiffs, countSummary, customerStatement, marginReport, poPaid, poReceivedValue, poTotal, shiftExpected, supplierBalances, weightedAvgCost } from '../../ai/accounts';
import { buildLabelsHtml, buildStatementHtml, LABEL_SIZES, openPrintWindow } from '../../utils/printDocs';
import { buildInventorySearchTokens, normalizePhone, normalizeSearch, normalizeSerial } from '../../utils/search';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { exportToExcel } from '../../utils/exportUtils';
import { useIntent } from '../../hooks/useIntent';
import { useMyShift } from '../../hooks/useMyShift';
import { toDate } from '../../utils/liveStats';

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const inp = 'border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50';
const th = 'p-2 text-[11px] text-slate-500 font-bold text-right';
const td = 'p-2 text-xs';
const money = (v) => `${Math.round(Number(v) || 0).toLocaleString()} ج`;
const fmt = (d) => (d ? d.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const isAdmin = (u) => u?.role === 'admin';
const canManage = (u) => isAdmin(u) || u?.role === 'main_warehouse_manager';
const me = (u) => u?.name || u?.email || 'موظف';
const myWh = (u) => u?.assignedWarehouseId || 'main';
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

function useWarehouses() {
  const [list, setList] = useState([{ id: 'main', name: 'المخزن الرئيسي' }]);
  useEffect(() => {
    getDocs(collection(db, 'warehouses')).then((s) => {
      const extra = s.docs.map((d) => ({ id: d.id, name: d.data().name || d.id })).filter((w) => w.id !== 'main');
      setList([{ id: 'main', name: 'المخزن الرئيسي' }, ...extra]);
    }).catch(() => {});
  }, []);
  return list;
}

const findInventory = async (serial, warehouseId) => {
  const s = await getDocs(query(collection(db, 'inventory'), where('serialNumber', '==', normalizeSerial(serial)), where('warehouseId', '==', warehouseId), limit(1)));
  return s.empty ? null : s.docs[0];
};

// ================================================================ (48) الموردين وأوامر الشراء
function SuppliersTab({ appUser, warehouses, draft, onDraftUsed, onLabels }) {
  const [suppliers, setSuppliers] = useState(null);
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newSup, setNewSup] = useState({ name: '', phone: '', notes: '' });
  const [form, setForm] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const load = async () => {
    setBusy(true);
    try {
      const [s, p] = await Promise.all([
        getDocs(query(collection(db, 'suppliers'), orderBy('createdAt', 'desc'), limit(300))),
        getDocs(query(collection(db, 'purchaseOrders'), orderBy('createdAt', 'desc'), limit(300))),
      ]);
      setSuppliers(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPos(p.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); showError('معرفتش أحمّل الموردين وأوامر الشراء'); }
    setBusy(false);
  };
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!draft) return undefined;
    const t = setTimeout(() => { setForm({ supplierId: '', warehouseId: draft.warehouseId || myWh(appUser), notes: 'من توقع النفاد', items: draft.items?.length ? draft.items : [{ serialNumber: '', name: '', qty: 1, cost: 0, receivedQty: 0 }] }); onDraftUsed?.(); }, 0);
    return () => clearTimeout(t);
  }, [draft, appUser, onDraftUsed]);

  const balances = useMemo(() => supplierBalances(pos || []), [pos]);
  const balOf = (id) => balances.find((b) => b.supplierId === id);

  const addSupplier = async () => {
    if (!newSup.name.trim()) return showError('اكتب اسم المورد');
    try {
      await addDoc(collection(db, 'suppliers'), { name: newSup.name.trim(), phone: normalizePhone(newSup.phone), notes: newSup.notes.trim(), createdAt: serverTimestamp(), createdBy: me(appUser) });
      setNewSup({ name: '', phone: '', notes: '' }); showSuccess('اتضاف المورد'); load();
    } catch (e) { console.error(e); showError('معرفتش أضيف المورد'); }
  };

  const setLine = (i, patch) => setForm((f) => ({ ...f, items: f.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  const lookupLine = async (i) => {
    const line = form.items[i];
    if (!line.serialNumber.trim()) return;
    try {
      const d = await findInventory(line.serialNumber, form.warehouseId) || await findInventory(line.serialNumber, 'main');
      if (d) setLine(i, { name: line.name || d.data().name, cost: Number(line.cost) || Number(d.data().avgCost || d.data().cost) || 0 });
    } catch { /* مش لازم */ }
  };

  const savePO = async (status) => {
    const sup = (suppliers || []).find((s) => s.id === form.supplierId);
    if (!sup) return showError('اختار المورد');
    const items = form.items.filter((i) => i.serialNumber.trim() && Number(i.qty) > 0).map((i) => ({ serialNumber: normalizeSerial(i.serialNumber), name: i.name.trim() || i.serialNumber, qty: Math.floor(Number(i.qty)), cost: Number(i.cost) || 0, receivedQty: 0 }));
    if (!items.length) return showError('ضيف صنف واحد على الأقل بسيريال وكمية');
    setBusy(true);
    try {
      const counterRef = doc(db, 'counters', 'purchaseOrders');
      const poRef = doc(collection(db, 'purchaseOrders'));
      await runTransaction(db, async (tx) => {
        const c = await tx.get(counterRef);
        const next = (c.exists() ? Number(c.data().value) || 0 : 0) + 1;
        tx.set(counterRef, { value: next }, { merge: true });
        tx.set(poRef, { poNumber: `PO-${String(next).padStart(5, '0')}`, supplierId: sup.id, supplierName: sup.name, warehouseId: form.warehouseId, items, status, notes: form.notes || '', payments: [], createdAt: serverTimestamp(), createdBy: me(appUser), log: [{ status, at: new Date().toISOString(), by: me(appUser) }] });
      });
      showSuccess('اتسجل أمر الشراء'); setForm(null); load();
    } catch (e) { console.error(e); showError('معرفتش أحفظ أمر الشراء'); }
    setBusy(false);
  };

  const setStatus = async (po, status) => {
    try { await updateDoc(doc(db, 'purchaseOrders', po.id), { status, updatedAt: serverTimestamp(), log: arrayUnion({ status, at: new Date().toISOString(), by: me(appUser) }) }); load(); } catch (e) { console.error(e); showError('معرفتش أغيّر الحالة'); }
  };

  // استلام: بنحدّد مستندات المخزون الأول (برّه الـ transaction) وبعدين نقرا ونكتب كله مرة واحدة
  const receive = async () => {
    const po = receiving.po;
    const plan = applyReceipt(po, receiving.qty);
    if (!plan.moves.length) return showError('اكتب الكميات اللي وصلت');
    setBusy(true);
    try {
      // مستند المخزون لكل سطر لسه ليه باقي (حتى لو حد تاني استلم جزء في نفس اللحظة)
      const refs = await Promise.all((po.items || []).map(async (i) => {
        if (Number(i.receivedQty) >= Number(i.qty)) return null;
        const d = await findInventory(i.serialNumber, po.warehouseId);
        return d ? d.ref : null;
      }));
      const poRef = doc(db, 'purchaseOrders', po.id);
      await runTransaction(db, async (tx) => {
        const fresh = await tx.get(poRef);
        const snaps = await Promise.all(refs.map((r) => (r ? tx.get(r) : null)));
        const current = { ...po, ...fresh.data() };
        const again = applyReceipt(current, receiving.qty);
        if (!again.moves.length) throw Object.assign(new Error('nothing'), { code: 'nothing-left' });
        again.moves.forEach((m) => {
          const snap = snaps[m.idx];
          const cost = Number(m.item.cost) || 0;
          if (snap && snap.exists()) {
            const d = snap.data();
            const avg = cost > 0 ? weightedAvgCost(Math.max(0, Number(d.quantity) || 0), Number(d.avgCost || d.cost) || 0, m.qty, cost) : (Number(d.avgCost) || 0);
            tx.update(snap.ref, { quantity: increment(m.qty), ...(cost > 0 ? { cost, avgCost: avg } : {}), lastPurchaseAt: serverTimestamp(), updatedAt: serverTimestamp() });
          } else {
            const ref = doc(collection(db, 'inventory'));
            const serial = normalizeSerial(m.item.serialNumber);
            tx.set(ref, { serialNumber: serial, name: m.item.name, price: 0, quantity: m.qty, minStock: 2, category: 'عام', location: '', tags: [], notes: `اتضاف من ${current.poNumber}`, warehouseId: current.warehouseId, cost, avgCost: cost, searchKey: normalizeSearch(`${m.item.name} ${serial} عام`), searchTokens: buildInventorySearchTokens(m.item.name, serial, 'عام'), createdAt: serverTimestamp(), isDeleted: false });
          }
        });
        tx.update(poRef, { items: again.items, status: again.status, updatedAt: serverTimestamp(), log: arrayUnion({ status: again.status, at: new Date().toISOString(), by: me(appUser), received: again.moves.map((m) => ({ serial: m.item.serialNumber, qty: m.qty })) }) });
      });
      showSuccess('اتستلمت البضاعة واتزودت في المخزن'); setReceiving(null); load();
    } catch (e) { console.error(e); showError(e?.code === 'nothing-left' ? 'الأمر ده اتستلم بالكامل خلاص' : 'معرفتش أكمّل الاستلام'); }
    setBusy(false);
  };

  const pay = async () => {
    const amount = Number(payFor.amount);
    if (!(amount > 0)) return showError('اكتب مبلغ صحيح');
    try {
      await updateDoc(doc(db, 'purchaseOrders', payFor.po.id), { payments: arrayUnion({ amount, at: new Date().toISOString(), by: me(appUser), method: payFor.method || 'cash', note: payFor.note || '' }), updatedAt: serverTimestamp() });
      showSuccess('اتسجلت الدفعة'); setPayFor(null); load();
    } catch (e) { console.error(e); showError('معرفتش أسجل الدفعة'); }
  };

  const whName = (id) => warehouses.find((w) => w.id === id)?.name || id;
  if (!suppliers) return <div className={card}><Loader2 className="animate-spin text-teal-600" /></div>;
  return (
    <div className="space-y-4">
      <div className={`${card} grid md:grid-cols-[1fr_auto] gap-3`}>
        <div className="flex flex-wrap gap-2 items-end">
          <input className={inp} placeholder="اسم المورد" value={newSup.name} onChange={(e) => setNewSup({ ...newSup, name: e.target.value })} />
          <input className={inp} placeholder="الموبايل" dir="ltr" value={newSup.phone} onChange={(e) => setNewSup({ ...newSup, phone: e.target.value })} />
          <input className={`${inp} flex-1 min-w-40`} placeholder="ملاحظات (اختياري)" value={newSup.notes} onChange={(e) => setNewSup({ ...newSup, notes: e.target.value })} />
          <button type="button" onClick={addSupplier} className={`${btn} bg-slate-800 text-white`}><Plus size={14} /> مورد جديد</button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setForm({ supplierId: '', warehouseId: myWh(appUser), notes: '', items: [{ serialNumber: '', name: '', qty: 1, cost: 0, receivedQty: 0 }] })} className={`${btn} bg-teal-600 text-white`}><Plus size={14} /> أمر شراء</button>
          <button type="button" onClick={load} disabled={busy} className={`${btn} bg-slate-100 dark:bg-slate-700`}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      {suppliers.length > 0 && (
        <div className={`${card} overflow-x-auto`}>
          <h3 className="font-black text-sm mb-2">أرصدة الموردين</h3>
          <table className="w-full"><thead><tr><th className={th}>المورد</th><th className={th}>الموبايل</th><th className={th}>استلمنا بقيمة</th><th className={th}>دفعنا</th><th className={th}>علينا</th><th className={th}>أوامر مفتوحة</th></tr></thead>
            <tbody>{suppliers.map((s) => { const b = balOf(s.id) || {}; return (
              <tr key={s.id} className="border-t border-slate-100 dark:border-slate-700"><td className={`${td} font-bold`}>{s.name}</td><td className={td} dir="ltr">{s.phone || '—'}</td><td className={td}>{money(b.received)}</td><td className={td}>{money(b.paid)}</td><td className={`${td} font-black ${b.due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(b.due)}</td><td className={td}>{b.open || 0}</td></tr>
            ); })}</tbody></table>
        </div>
      )}

      {form && (
        <div className={`${card} border-teal-300 anim-pop space-y-3`}>
          <div className="flex flex-wrap gap-2">
            <select className={inp} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}><option value="">— اختار المورد —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select className={inp} value={form.warehouseId} disabled={!canManage(appUser)} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>{warehouses.map((w) => <option key={w.id} value={w.id}>استلام في: {w.name}</option>)}</select>
            <input className={`${inp} flex-1`} placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <table className="w-full"><thead><tr><th className={th}>السيريال/الكود</th><th className={th}>الصنف</th><th className={th}>الكمية</th><th className={th}>تكلفة الوحدة</th><th className={th}>الإجمالي</th><th /></tr></thead>
            <tbody>{form.items.map((l, i) => (
              <tr key={i}>
                <td className="p-1"><input className={`${inp} w-full font-mono`} dir="ltr" value={l.serialNumber} onBlur={() => lookupLine(i)} onChange={(e) => setLine(i, { serialNumber: e.target.value })} /></td>
                <td className="p-1"><input className={`${inp} w-full`} value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} /></td>
                <td className="p-1"><input type="number" min="1" className={`${inp} w-20`} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
                <td className="p-1"><input type="number" min="0" step="0.01" className={`${inp} w-24`} value={l.cost} onChange={(e) => setLine(i, { cost: e.target.value })} /></td>
                <td className={td}>{money((Number(l.qty) || 0) * (Number(l.cost) || 0))}</td>
                <td className="p-1"><button type="button" aria-label="مسح" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, k) => k !== i) }))} className="text-rose-500"><Trash2 size={14} /></button></td>
              </tr>
            ))}</tbody></table>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { serialNumber: '', name: '', qty: 1, cost: 0, receivedQty: 0 }] }))} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Plus size={14} /> سطر</button>
            <p className="font-black text-sm">الإجمالي: {money(poTotal(form))}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(null)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>إلغاء</button>
              <button type="button" disabled={busy} onClick={() => savePO('draft')} className={`${btn} bg-slate-700 text-white`}><Save size={14} /> مسودة</button>
              <button type="button" disabled={busy} onClick={() => savePO('sent')} className={`${btn} bg-teal-600 text-white`}><Truck size={14} /> حفظ واتبعت للمورد</button>
            </div>
          </div>
        </div>
      )}

      <div className={`${card} overflow-x-auto`}>
        <h3 className="font-black text-sm mb-2">أوامر الشراء</h3>
        <table className="w-full"><thead><tr><th className={th}>الرقم</th><th className={th}>المورد</th><th className={th}>المخزن</th><th className={th}>القيمة</th><th className={th}>اتستلم</th><th className={th}>اتدفع</th><th className={th}>الحالة</th><th className={th}>إجراءات</th></tr></thead>
          <tbody>
            {(pos || []).length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-400 text-xs">مفيش أوامر شراء لسه</td></tr>}
            {(pos || []).map((po) => (
              <tr key={po.id} className="border-t border-slate-100 dark:border-slate-700 align-top">
                <td className={`${td} font-mono font-bold`}>{po.poNumber}<div className="text-[10px] text-slate-400 font-sans">{fmt(toDate(po.createdAt))}</div></td>
                <td className={td}>{po.supplierName}</td><td className={td}>{whName(po.warehouseId)}</td>
                <td className={td}>{money(poTotal(po))}<div className="text-[10px] text-slate-400">{(po.items || []).length} صنف</div></td>
                <td className={td}>{money(poReceivedValue(po))}</td><td className={td}>{money(poPaid(po))}</td>
                <td className={td}><span className={`px-2 py-0.5 rounded-lg font-bold ${po.status === 'received' ? 'bg-emerald-100 text-emerald-700' : po.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : po.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{PO_STATUS[po.status] || po.status}</span></td>
                <td className={`${td} flex flex-wrap gap-1`}>
                  {po.status === 'draft' && <button type="button" onClick={() => setStatus(po, 'sent')} className={`${btn} bg-sky-600 text-white`}>اتبعت</button>}
                  {['sent', 'partial', 'draft'].includes(po.status) && <button type="button" onClick={() => setReceiving({ po, qty: {} })} className={`${btn} bg-teal-600 text-white`}><PackageCheck size={14} /> استلام</button>}
                  {po.status !== 'cancelled' && <button type="button" onClick={() => setPayFor({ po, amount: '', method: 'cash' })} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Wallet size={14} /> دفعة</button>}
                  {poReceivedValue(po) > 0 && <button type="button" onClick={() => onLabels((po.items || []).filter((i) => i.receivedQty > 0).map((i) => ({ serialNumber: i.serialNumber, name: i.name, price: 0, copies: i.receivedQty })))} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Barcode size={14} /> ملصقات</button>}
                  {['draft', 'sent'].includes(po.status) && <button type="button" onClick={async () => { if (await showConfirm('إلغاء أمر الشراء؟', po.poNumber)) setStatus(po, 'cancelled'); }} className={`${btn} text-rose-600`}>إلغاء</button>}
                </td>
              </tr>
            ))}
          </tbody></table>
      </div>

      {receiving && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className={`${card} w-full max-w-xl anim-pop space-y-3 max-h-[85vh] overflow-y-auto`}>
            <h3 className="font-black">استلام {receiving.po.poNumber} — {whName(receiving.po.warehouseId)}</h3>
            {(receiving.po.items || []).map((i, idx) => { const left = Math.max(0, i.qty - (i.receivedQty || 0)); return (
              <div key={idx} className="flex items-center justify-between gap-2 text-xs border-b border-slate-100 dark:border-slate-700 pb-2">
                <div><b>{i.name}</b> <span className="font-mono text-slate-400">{i.serialNumber}</span><div className="text-slate-500">مطلوب {i.qty} · اتستلم {i.receivedQty || 0} · باقي {left}</div></div>
                <div className="flex gap-1 items-center"><input type="number" min="0" max={left} disabled={!left} className={`${inp} w-20`} aria-label={`كمية ${i.name}`} value={receiving.qty[idx] ?? ''} onChange={(e) => setReceiving((r) => ({ ...r, qty: { ...r.qty, [idx]: e.target.value } }))} />
                  {left > 0 && <button type="button" className="text-teal-600 font-bold" onClick={() => setReceiving((r) => ({ ...r, qty: { ...r.qty, [idx]: left } }))}>الكل</button>}</div>
              </div>
            ); })}
            <p className="text-[11px] text-slate-500">الكمية بتتزود في المخزن، ومتوسط التكلفة بيتحسب تلقائي. الصنف اللي مش موجود في المخزن ده بيتعمل جديد (حط سعر البيع بعدها).</p>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setReceiving(null)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>إلغاء</button><button type="button" disabled={busy} onClick={receive} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />} تأكيد الاستلام</button></div>
          </div>
        </div>
      )}
      {payFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className={`${card} w-full max-w-sm anim-pop space-y-3`}>
            <h3 className="font-black">دفعة للمورد {payFor.po.supplierName}</h3>
            <p className="text-xs text-slate-500">{payFor.po.poNumber} · استلمنا بـ {money(poReceivedValue(payFor.po))} · اتدفع {money(poPaid(payFor.po))}</p>
            <input type="number" min="0" className={`${inp} w-full`} placeholder="المبلغ" aria-label="المبلغ" value={payFor.amount} onChange={(e) => setPayFor({ ...payFor, amount: e.target.value })} />
            <select className={`${inp} w-full`} value={payFor.method} onChange={(e) => setPayFor({ ...payFor, method: e.target.value })}><option value="cash">كاش</option><option value="transfer">تحويل</option><option value="cheque">شيك</option></select>
            <input className={`${inp} w-full`} placeholder="ملاحظة" value={payFor.note || ''} onChange={(e) => setPayFor({ ...payFor, note: e.target.value })} />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setPayFor(null)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>إلغاء</button><button type="button" onClick={pay} className={`${btn} bg-teal-600 text-white`}><Save size={14} /> سجّل</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================ (49) الجرد
function CountTab({ appUser, warehouses }) {
  const [counts, setCounts] = useState(null);
  const [active, setActive] = useState(null);
  const [wh, setWh] = useState(myWh(appUser));
  const [scan, setScan] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const scanRef = useRef(null);

  const load = async () => {
    try {
      const s = await getDocs(query(collection(db, 'stockCounts'), orderBy('createdAt', 'desc'), limit(50)));
      setCounts(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => canManage(appUser) || c.warehouseId === myWh(appUser)));
    } catch (e) { console.error(e); showError('معرفتش أحمّل الجرد'); setCounts([]); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- مرة واحدة
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, []);

  const start = async () => {
    setBusy(true);
    try {
      const s = await getDocs(query(collection(db, 'inventory'), where('warehouseId', '==', wh), limit(3000)));
      const lines = {};
      s.docs.forEach((d) => { const x = d.data(); if (x.isDeleted) return; lines[d.id] = { serialNumber: x.serialNumber, name: x.name || x.serialNumber, systemQty: Number(x.quantity) || 0, countedQty: null, cost: Number(x.avgCost || x.cost) || 0, price: Number(x.price) || 0 }; });
      const ref = await addDoc(collection(db, 'stockCounts'), { warehouseId: wh, status: 'open', lines, createdAt: serverTimestamp(), createdBy: me(appUser) });
      setActive({ id: ref.id, warehouseId: wh, status: 'open', lines, createdBy: me(appUser) });
      showSuccess(`بدأ الجرد على ${Object.keys(lines).length} صنف`);
      load();
    } catch (e) { console.error(e); showError('معرفتش أبدأ الجرد'); }
    setBusy(false);
  };

  const bump = (e) => {
    e.preventDefault();
    const v = normalizeSerial(scan);
    if (!v || !active) return;
    const id = Object.keys(active.lines).find((k) => normalizeSerial(active.lines[k].serialNumber) === v);
    if (!id) { showError(`الكود ${scan} مش في المخزن ده`); setScan(''); return; }
    setActive((a) => ({ ...a, dirty: true, lines: { ...a.lines, [id]: { ...a.lines[id], countedQty: (Number(a.lines[id].countedQty) || 0) + 1 } } }));
    setScan('');
    scanRef.current?.focus();
  };
  const setCounted = (id, v) => setActive((a) => ({ ...a, dirty: true, lines: { ...a.lines, [id]: { ...a.lines[id], countedQty: v === '' ? null : Number(v) } } }));

  const save = async () => {
    setBusy(true);
    try { await updateDoc(doc(db, 'stockCounts', active.id), { lines: active.lines, updatedAt: serverTimestamp() }); setActive((a) => ({ ...a, dirty: false })); showSuccess('اتحفظ الجرد'); } catch (e) { console.error(e); showError('معرفتش أحفظ'); }
    setBusy(false);
  };

  const rows = useMemo(() => (active ? countDiffs(active.lines) : []), [active]);
  const sum = useMemo(() => countSummary(rows), [rows]);
  const shown = rows.filter((r) => (filter === 'diff' ? r.diff !== null && r.diff !== 0 : filter === 'pending' ? r.counted === null : true)).slice(0, 500);

  // التسوية بتزود/تنقص الفرق بس (increment) عشان أي بيع حصل أثناء الجرد مايضيعش
  const apply = async () => {
    if (!isAdmin(appUser)) return showError('التسوية للأدمن بس');
    const diffs = rows.filter((r) => r.diff);
    if (!(await showConfirm('تطبيق تسوية الجرد؟', `${diffs.length} صنف هيتعدل (عجز ${sum.shortage} / زيادة ${sum.surplus}). الأصناف اللي ماتعدّتش مش هتتغير.`))) return;
    setBusy(true);
    try {
      for (let i = 0; i < diffs.length; i += 400) {
        const b = writeBatch(db);
        diffs.slice(i, i + 400).forEach((r) => b.update(doc(db, 'inventory', r.serial), { quantity: increment(r.diff), lastCountAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        await b.commit();
      }
      await updateDoc(doc(db, 'stockCounts', active.id), { lines: active.lines, status: 'applied', appliedAt: serverTimestamp(), appliedBy: me(appUser), summary: sum });
      showSuccess('اتطبقت التسوية'); setActive(null); load();
    } catch (e) { console.error(e); showError('معرفتش أطبق التسوية'); }
    setBusy(false);
  };

  const exportRows = () => exportToExcel(rows.map((r) => ({ 'الصنف': r.name, 'السيريال': r.serialNumber, 'رصيد السيستم': r.systemQty, 'المعدود': r.counted ?? '', 'الفرق': r.diff ?? '', 'قيمة الفرق': r.valueDiff })), `Stock_Count_${todayStr()}`, 'الجرد');
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || id;

  if (!active) {
    return (
      <div className="space-y-4">
        <div className={`${card} flex flex-wrap items-end gap-2`}>
          <label className="text-xs font-bold">المخزن<select className={`${inp} block mt-1`} value={wh} disabled={!canManage(appUser)} onChange={(e) => setWh(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <button type="button" onClick={start} disabled={busy} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} ابدأ جرد جديد</button>
          <p className="text-[11px] text-slate-500 w-full">بناخد صورة من رصيد السيستم وقت البداية، وتعدّ بالباركود أو بإيدك. التسوية بتعدّل الفرق بس.</p>
        </div>
        <div className={card}>
          <h3 className="font-black text-sm mb-2">عمليات الجرد</h3>
          {!counts ? <Loader2 className="animate-spin text-teal-600" /> : counts.length === 0 ? <p className="text-xs text-slate-400">مفيش جرد قبل كده</p> : counts.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 py-2 text-xs">
              <span><b>{whName(c.warehouseId)}</b> · {fmt(toDate(c.createdAt))} · {c.createdBy} · {Object.keys(c.lines || {}).length} صنف</span>
              <span className="flex items-center gap-2">
                {c.status === 'applied' ? <span className="text-emerald-600 font-bold">اتسوّى {c.summary ? `(فرق ${money(c.summary.valueDiff)})` : ''}</span> : c.status === 'cancelled' ? <span className="text-slate-400">ملغي</span> : <button type="button" onClick={() => setActive(c)} className={`${btn} bg-teal-600 text-white`}>كمّل</button>}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black">جرد {whName(active.warehouseId)} {active.dirty && <span className="text-[11px] text-amber-600">(فيه تعديلات مش محفوظة)</span>}</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setActive(null)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>رجوع</button>
            <button type="button" onClick={exportRows} className={`${btn} bg-slate-100 dark:bg-slate-700`}>Excel</button>
            <button type="button" onClick={save} disabled={busy} className={`${btn} bg-slate-800 text-white`}><Save size={14} /> حفظ</button>
            {isAdmin(appUser) && <button type="button" onClick={apply} disabled={busy || !sum.mismatched} className={`${btn} bg-teal-600 text-white`}><CheckCircle2 size={14} /> تطبيق التسوية</button>}
          </div>
        </div>
        <form onSubmit={bump} className="flex gap-2"><input ref={scanRef} autoFocus className={`${inp} flex-1 font-mono`} dir="ltr" placeholder="امسح الباركود (كل مسحة = +1)" aria-label="مسح باركود الجرد" value={scan} onChange={(e) => setScan(e.target.value)} /><button type="submit" className={`${btn} bg-teal-600 text-white`}>+1</button></form>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-2"><b className="block text-lg">{sum.counted}/{sum.total}</b>اتعدّ</div>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-2"><b className="block text-lg">{sum.mismatched}</b>فيه فرق</div>
          <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 p-2"><b className="block text-lg text-rose-600">{sum.shortage}</b>عجز (قطعة)</div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-2"><b className="block text-lg text-emerald-600">+{sum.surplus}</b>زيادة (قطعة)</div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-2"><b className={`block text-lg ${sum.valueDiff < 0 ? 'text-rose-600' : ''}`}>{money(sum.valueDiff)}</b>قيمة الفرق</div>
        </div>
        <div className="flex gap-1.5">{[['all', 'الكل'], ['pending', 'لسه ماتعدّش'], ['diff', 'فيه فرق']].map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`${btn} ${filter === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{l}</button>)}</div>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full"><thead><tr><th className={th}>الصنف</th><th className={th}>السيريال</th><th className={th}>السيستم</th><th className={th}>المعدود</th><th className={th}>الفرق</th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.serial} className={`border-t border-slate-100 dark:border-slate-700 ${r.diff ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
              <td className={`${td} font-bold`}>{r.name}</td><td className={`${td} font-mono`}>{r.serialNumber}</td><td className={td}>{r.systemQty}</td>
              <td className="p-1"><input type="number" min="0" className={`${inp} w-20`} aria-label={`المعدود ${r.name}`} value={r.counted ?? ''} onChange={(e) => setCounted(r.serial, e.target.value)} /></td>
              <td className={`${td} font-black ${r.diff < 0 ? 'text-rose-600' : r.diff > 0 ? 'text-emerald-600' : ''}`}>{r.diff === null ? '—' : r.diff > 0 ? `+${r.diff}` : r.diff}</td>
            </tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}

// ================================================================ (50) الوردية والخزنة
const loadShiftTxs = async (shift) => {
  const from = toDate(shift.openedAt) || new Date();
  const s = await getDocs(query(collection(db, 'transactions'), where('timestamp', '>=', from), orderBy('timestamp', 'asc'), limit(3000)));
  return s.docs.map((d) => d.data());
};

function ShiftTab({ appUser }) {
  const [shift, reload] = useMyShift(appUser);
  const [opening, setOpening] = useState('');
  const [move, setMove] = useState({ kind: 'out', amount: '', note: '' });
  const [calc, setCalc] = useState(null);
  const [counted, setCounted] = useState('');
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadHistory = async () => {
    try {
      const s = await getDocs(query(collection(db, 'cashShifts'), orderBy('openedAt', 'desc'), limit(60)));
      setHistory(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => canManage(appUser) || x.operator === me(appUser)));
    } catch (e) { console.error(e); setHistory([]); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- مرة واحدة
  useEffect(() => { const t = setTimeout(loadHistory, 0); return () => clearTimeout(t); }, []);

  const open = async () => {
    setBusy(true);
    try { await addDoc(collection(db, 'cashShifts'), { operator: me(appUser), warehouseId: myWh(appUser), openingCash: Number(opening) || 0, cashIn: [], cashOut: [], status: 'open', openedAt: serverTimestamp() }); setOpening(''); await reload(); loadHistory(); showSuccess('الوردية اتفتحت'); } catch (e) { console.error(e); showError('معرفتش أفتح الوردية'); }
    setBusy(false);
  };
  const addMove = async () => {
    const amount = Number(move.amount);
    if (!(amount > 0) || !move.note.trim()) return showError('اكتب المبلغ والسبب');
    try { await updateDoc(doc(db, 'cashShifts', shift.id), { [move.kind === 'in' ? 'cashIn' : 'cashOut']: arrayUnion({ amount, note: move.note.trim(), at: new Date().toISOString() }) }); setMove({ kind: move.kind, amount: '', note: '' }); reload(); showSuccess('اتسجلت الحركة'); } catch (e) { console.error(e); showError('معرفتش أسجل'); }
  };
  const compute = async () => {
    setBusy(true);
    try { setCalc(shiftExpected(shift, await loadShiftTxs(shift))); } catch (e) { console.error(e); showError('معرفتش أحسب المتوقع'); }
    setBusy(false);
  };
  const close = async () => {
    if (counted === '') return showError('اكتب الكاش اللي في الدرج فعلاً');
    setBusy(true);
    try {
      const r = shiftExpected({ ...shift, countedCash: Number(counted), closedAt: new Date() }, await loadShiftTxs(shift));
      if (r.diff !== 0 && !(await showConfirm('فيه فرق في الخزنة', `المتوقع ${money(r.expected)} والموجود ${money(Number(counted))} (فرق ${money(r.diff)}). تقفل الوردية؟`))) { setBusy(false); return; }
      await updateDoc(doc(db, 'cashShifts', shift.id), { status: 'closed', closedAt: serverTimestamp(), countedCash: Number(counted), expected: r.expected, diff: r.diff, summary: r });
      setCounted(''); setCalc(null); await reload(); loadHistory(); showSuccess('الوردية اتقفلت');
    } catch (e) { console.error(e); showError('معرفتش أقفل الوردية'); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      {shift === undefined ? <div className={card}><Loader2 className="animate-spin text-teal-600" /></div> : !shift ? (
        <div className={`${card} flex flex-wrap items-end gap-2`}>
          <label className="text-xs font-bold">الكاش في الدرج أول الوردية<input type="number" min="0" className={`${inp} block mt-1`} value={opening} onChange={(e) => setOpening(e.target.value)} /></label>
          <button type="button" onClick={open} disabled={busy} className={`${btn} bg-teal-600 text-white`}><Wallet size={14} /> افتح وردية</button>
        </div>
      ) : (
        <div className={`${card} space-y-3`}>
          <p className="font-black">ورديتك مفتوحة من {fmt(toDate(shift.openedAt))} · افتتاحي {money(shift.openingCash)}</p>
          <div className="flex flex-wrap gap-2 items-end">
            <select className={inp} value={move.kind} onChange={(e) => setMove({ ...move, kind: e.target.value })}><option value="out">مصروف / سحب من الدرج</option><option value="in">إيداع في الدرج</option></select>
            <input type="number" min="0" className={`${inp} w-28`} placeholder="المبلغ" value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} />
            <input className={`${inp} flex-1 min-w-40`} placeholder="السبب (مثلاً: بنزين، فكة...)" value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} />
            <button type="button" onClick={addMove} className={`${btn} bg-slate-800 text-white`}><Plus size={14} /> سجّل</button>
          </div>
          {[...(shift.cashIn || []).map((x) => ({ ...x, in: true })), ...(shift.cashOut || [])].map((x, i) => <p key={i} className="text-xs text-slate-500">{x.in ? '⬆️ إيداع' : '⬇️ مصروف'} {money(x.amount)} — {x.note}</p>)}
          <div className="flex flex-wrap gap-2 items-end border-t border-slate-100 dark:border-slate-700 pt-3">
            <button type="button" onClick={compute} disabled={busy} className={`${btn} bg-slate-100 dark:bg-slate-700`}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> احسب المتوقع</button>
            <label className="text-xs font-bold">الكاش الموجود فعلاً<input type="number" min="0" className={`${inp} block mt-1`} value={counted} onChange={(e) => setCounted(e.target.value)} /></label>
            <button type="button" onClick={close} disabled={busy} className={`${btn} bg-rose-600 text-white`}><Lock size={14} /> اقفل الوردية</button>
          </div>
          {calc && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs anim-fade">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-2"><b className="block">{money(calc.cashSales)}</b>مبيعات كاش ({calc.invoices} فاتورة)</div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-2"><b className="block">{money(calc.otherSales)}</b>فيزا/تحويل</div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-2"><b className="block">{money(calc.refunds)}</b>مرتجعات</div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-2"><b className="block">{money(calc.cashIn - calc.cashOut)}</b>إيداع - مصروف</div>
              <div className="rounded-xl bg-teal-50 dark:bg-teal-900/20 p-2"><b className="block text-teal-700 dark:text-teal-300">{money(calc.expected)}</b>المفروض في الدرج</div>
            </div>
          )}
        </div>
      )}
      <div className={`${card} overflow-x-auto`}>
        <h3 className="font-black text-sm mb-2">الورديات السابقة</h3>
        <table className="w-full"><thead><tr><th className={th}>الموظف</th><th className={th}>فتح</th><th className={th}>قفل</th><th className={th}>المتوقع</th><th className={th}>الموجود</th><th className={th}>الفرق</th></tr></thead>
          <tbody>{(history || []).map((h) => (
            <tr key={h.id} className="border-t border-slate-100 dark:border-slate-700"><td className={`${td} font-bold`}>{h.operator}</td><td className={td}>{fmt(toDate(h.openedAt))}</td><td className={td}>{h.status === 'open' ? <span className="text-teal-600 font-bold">مفتوحة</span> : fmt(toDate(h.closedAt))}</td><td className={td}>{h.expected !== undefined ? money(h.expected) : '—'}</td><td className={td}>{h.countedCash !== undefined ? money(h.countedCash) : '—'}</td>
              <td className={`${td} font-black ${h.diff < 0 ? 'text-rose-600' : h.diff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{h.diff === undefined || h.diff === null ? '—' : h.diff === 0 ? 'مظبوط' : money(h.diff)}</td></tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}

// ================================================================ (51) كشف حساب العميل
function StatementTab({ systemSettings, preset }) {
  const [phone, setPhone] = useState(preset || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (p0) => {
    const p = normalizePhone(p0 ?? phone);
    if (p.length < 8) return showError('اكتب رقم موبايل صحيح');
    setBusy(true);
    try {
      const [c, s, t] = await Promise.all([
        getDocs(query(collection(db, 'customers'), where('phone', '==', p), limit(1))),
        getDocs(query(collection(db, 'transactions'), where('phone', '==', p), limit(500))),
        getDocs(query(collection(db, 'tickets'), where('customerPhone', '==', p), limit(300))),
      ]);
      const sales = s.docs.map((d) => d.data()); const tickets = t.docs.map((d) => d.data()).filter((x) => !x.isDeleted);
      setData({ phone: p, name: c.docs[0]?.data().name || tickets[0]?.customerName || sales[0]?.customerName || '', sales, tickets });
    } catch (e) { console.error(e); showError('معرفتش أجيب معاملات العميل'); }
    setBusy(false);
  };
  useEffect(() => {
    if (!preset) return undefined;
    const t = setTimeout(() => { setPhone(preset); load(preset); }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- لما يجي رقم من شاشة تانية
  }, [preset]);

  const statement = useMemo(() => {
    if (!data) return null;
    const a = from ? new Date(from) : null; const b = to ? new Date(`${to}T23:59:59`) : null;
    const inRange = (d) => { const x = toDate(d); return !x || ((!a || x >= a) && (!b || x <= b)); };
    return customerStatement(data.sales.filter((x) => inRange(x.timestamp)), data.tickets.filter((x) => inRange(x.createdAt)));
  }, [data, from, to]);

  const print = () => {
    if (!openPrintWindow(buildStatementHtml({ customer: { name: data.name, phone: data.phone }, statement, company: systemSettings?.storeName, companyPhone: systemSettings?.storePhone, from, to }))) showError('المتصفح منع الطباعة — اسمح بالنوافذ المنبثقة');
  };

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className={`${card} flex flex-wrap items-end gap-2`}>
        <label className="text-xs font-bold">موبايل العميل<input className={`${inp} block mt-1`} dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="text-xs font-bold">من<input type="date" className={`${inp} block mt-1`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs font-bold">إلى<input type="date" className={`${inp} block mt-1`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="submit" disabled={busy} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} اعرض</button>
        {statement && <button type="button" onClick={print} className={`${btn} bg-slate-800 text-white`}><Printer size={14} /> طباعة / PDF</button>}
      </form>
      {statement && (
        <div className={`${card} overflow-x-auto anim-fade`}>
          <p className="font-black mb-2">{data.name || 'عميل'} <span className="font-mono text-xs text-slate-500" dir="ltr">{data.phone}</span></p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-2"><b className="block text-lg">{money(statement.totals.amount)}</b>الإجمالي</div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-2"><b className="block text-lg">{money(statement.totals.paid)}</b>المدفوع</div>
            <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 p-2"><b className="block text-lg text-rose-600">{money(statement.totals.remaining)}</b>المتبقي</div>
          </div>
          <table className="w-full"><thead><tr><th className={th}>التاريخ</th><th className={th}>النوع</th><th className={th}>المرجع</th><th className={th}>البيان</th><th className={th}>القيمة</th><th className={th}>المدفوع</th><th className={th}>المتبقي</th></tr></thead>
            <tbody>{statement.rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-xs text-slate-400">مفيش معاملات في الفترة دي</td></tr>}
              {statement.rows.map((r, i) => <tr key={i} className="border-t border-slate-100 dark:border-slate-700"><td className={td}>{r.date ? r.date.toLocaleDateString('ar-EG') : '—'}</td><td className={td}>{r.kind}</td><td className={`${td} font-mono`}>{r.ref}</td><td className={td}>{r.desc}</td><td className={td}>{money(r.amount)}</td><td className={td}>{money(r.paid)}</td><td className={`${td} ${r.remaining > 0 ? 'text-rose-600 font-bold' : ''}`}>{money(r.remaining)}</td></tr>)}
            </tbody></table>
        </div>
      )}
    </div>
  );
}

// ================================================================ (52) الأرباح والهامش
function MarginTab({ appUser, warehouses }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [wh, setWh] = useState(canManage(appUser) ? 'all' : myWh(appUser));
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const [tx, inv] = await Promise.all([
        getDocs(query(collection(db, 'transactions'), where('timestamp', '>=', new Date(from)), where('timestamp', '<=', new Date(`${to}T23:59:59`)), orderBy('timestamp', 'asc'), limit(8000))),
        getDocs(collection(db, 'inventory')),
      ]);
      const costs = new Map();
      inv.docs.forEach((d) => { const x = d.data(); const c = Number(x.avgCost || x.cost) || 0; if (c > 0) { costs.set(`${x.serialNumber}|${x.warehouseId || 'main'}`, c); if (!costs.has(x.serialNumber)) costs.set(x.serialNumber, c); } });
      const list = tx.docs.map((d) => d.data()).filter((t) => wh === 'all' || (t.warehouseId || 'main') === wh);
      setRep({ ...marginReport(list, (s, w) => costs.get(`${normalizeSerial(s)}|${w || 'main'}`) || costs.get(normalizeSerial(s))), truncated: tx.size >= 8000 });
    } catch (e) { console.error(e); showError(e?.code === 'failed-precondition' ? 'محتاج Index: firebase deploy --only firestore:indexes' : 'معرفتش أحسب الأرباح'); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-2`}>
        <label className="text-xs font-bold">من<input type="date" className={`${inp} block mt-1`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs font-bold">إلى<input type="date" className={`${inp} block mt-1`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-xs font-bold">المخزن<select className={`${inp} block mt-1`} value={wh} disabled={!canManage(appUser)} onChange={(e) => setWh(e.target.value)}><option value="all">كل المخازن</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <button type="button" onClick={run} disabled={busy} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />} احسب</button>
        {rep && <button type="button" onClick={() => exportToExcel(rep.rows.map((r) => ({ 'الصنف': r.name, 'الكود': r.key, 'الكمية': r.qty, 'المبيعات': r.revenue, 'التكلفة': r.cost, 'الربح': r.profit, 'الهامش %': r.margin === null ? 'تكلفة ناقصة' : Math.round(r.margin * 100) })), `Margins_${from}_${to}`, 'الأرباح')} className={`${btn} bg-slate-100 dark:bg-slate-700`}>Excel</button>}
      </div>
      {rep && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
            <div className={card}><b className="block text-xl">{money(rep.revenue)}</b>مبيعات قطع (ليها تكلفة)</div>
            <div className={card}><b className="block text-xl">{money(rep.cost)}</b>التكلفة</div>
            <div className={card}><b className="block text-xl text-emerald-600">{money(rep.profit)}</b>مجمل الربح</div>
            <div className={card}><b className="block text-xl">{rep.margin === null ? '—' : `${Math.round(rep.margin * 100)}%`}</b>الهامش · خدمات {money(rep.services)}</div>
          </div>
          {rep.missingCostLines > 0 && <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 flex items-center gap-2"><AlertTriangle size={14} /> {rep.missingCostLines} سطر بيع لأصناف مالهاش سعر تكلفة — مش داخلين في الربح. حط التكلفة من المخزون أو استلمهم بأمر شراء.</p>}
          {rep.truncated && <p className="text-xs text-amber-700">الفترة كبيرة — اتحسب أول 8000 حركة بس، صغّر الفترة.</p>}
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full"><thead><tr><th className={th}>الصنف</th><th className={th}>الكمية</th><th className={th}>المبيعات</th><th className={th}>التكلفة</th><th className={th}>الربح</th><th className={th}>الهامش</th></tr></thead>
              <tbody>{rep.rows.slice(0, 300).map((r) => (
                <tr key={r.key} className="border-t border-slate-100 dark:border-slate-700"><td className={`${td} font-bold`}>{r.name}</td><td className={td}>{r.qty}</td><td className={td}>{money(r.revenue)}</td><td className={td}>{r.missingCost ? <span className="text-amber-600">ناقصة</span> : money(r.cost)}</td><td className={`${td} font-black ${r.profit < 0 ? 'text-rose-600' : ''}`}>{r.missingCost ? '—' : money(r.profit)}</td><td className={td}>{r.margin === null ? '—' : `${Math.round(r.margin * 100)}%`}</td></tr>
              ))}</tbody></table>
          </div>
        </>
      )}
    </div>
  );
}

// ================================================================ (53) ملصقات الباركود
function LabelsTab({ appUser, systemSettings, preset }) {
  const [items, setItems] = useState([]);
  const [code, setCode] = useState('');
  const [size, setSize] = useState('50x30');
  const [showPrice, setShowPrice] = useState(true);
  const [showStore, setShowStore] = useState(true);
  useEffect(() => {
    if (!preset?.length) return undefined;
    const t = setTimeout(() => setItems(preset), 0);
    return () => clearTimeout(t);
  }, [preset]);

  const add = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      const d = await findInventory(code, myWh(appUser)) || await findInventory(code, 'main');
      const x = d ? d.data() : null;
      setItems((l) => [...l, { serialNumber: x?.serialNumber || code.trim(), name: x?.name || code.trim(), price: Number(x?.price) || 0, copies: 1 }]);
      if (!x) showError('الكود مش في المخزون — هيتطبع زي ما هو');
      setCode('');
    } catch (err) { console.error(err); showError('معرفتش أدوّر على الكود'); }
  };
  const print = () => {
    if (!items.length) return showError('ضيف أصناف الأول');
    if (!openPrintWindow(buildLabelsHtml(items, { size, showPrice, store: showStore ? systemSettings?.storeName : '' }))) showError('المتصفح منع الطباعة — اسمح بالنوافذ المنبثقة');
  };
  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-2`}>
        <form onSubmit={add} className="flex gap-2"><input className={`${inp} font-mono`} dir="ltr" placeholder="سيريال / باركود" aria-label="كود الصنف" value={code} onChange={(e) => setCode(e.target.value)} /><button type="submit" className={`${btn} bg-slate-800 text-white`}><Plus size={14} /> ضيف</button></form>
        <select className={inp} value={size} onChange={(e) => setSize(e.target.value)} aria-label="مقاس الملصق">{Object.entries(LABEL_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> السعر</label>
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={showStore} onChange={(e) => setShowStore(e.target.checked)} /> اسم المحل</label>
        <button type="button" onClick={print} className={`${btn} bg-teal-600 text-white`}><Printer size={14} /> اطبع {items.reduce((s, i) => s + (Number(i.copies) || 1), 0)} ملصق</button>
      </div>
      <div className={card}>
        {items.length === 0 ? <p className="text-xs text-slate-400">امسح أو اكتب كود الصنف وضيفه، أو اطبع ملصقات بضاعة أمر شراء من تبويب الموردين.</p> : items.map((i, k) => (
          <div key={k} className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-700 py-2 text-xs">
            <span><b>{i.name}</b> <span className="font-mono text-slate-400">{i.serialNumber}</span> {i.price ? `· ${money(i.price)}` : ''}</span>
            <span className="flex items-center gap-2">نسخ<input type="number" min="1" max="500" className={`${inp} w-16`} aria-label={`نسخ ${i.name}`} value={i.copies} onChange={(e) => setItems((l) => l.map((x, j) => (j === k ? { ...x, copies: e.target.value } : x)))} /><button type="button" aria-label="مسح" onClick={() => setItems((l) => l.filter((_, j) => j !== k))} className="text-rose-500"><Trash2 size={14} /></button></span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  ['suppliers', 'الموردين وأوامر الشراء', <Truck size={14} key="i" />],
  ['count', 'الجرد', <ClipboardCheck size={14} key="i" />],
  ['shift', 'الوردية والخزنة', <Wallet size={14} key="i" />],
  ['statement', 'كشف حساب عميل', <FileText size={14} key="i" />],
  ['margin', 'الأرباح الحقيقية', <TrendingUp size={14} key="i" />, (u) => canManage(u) || u?.permissions?.viewMargins],
  ['labels', 'ملصقات باركود', <Barcode size={14} key="i" />],
];

// 💰 المشتريات والمخزون والحسابات
export function AccountsHub({ appUser, systemSettings }) {
  const [tab, setTab] = useState('suppliers');
  const [poDraft, setPoDraft] = useState(null);
  const [phone, setPhone] = useState('');
  const [labels, setLabels] = useState(null);
  const warehouses = useWarehouses();
  useIntent('po-new', (v) => { setTab('suppliers'); setPoDraft({ items: v.items || [], warehouseId: v.warehouseId }); });
  useIntent('statement', (v) => { setTab('statement'); setPhone(v.phone || ''); });
  useIntent('labels', (v) => { setTab('labels'); setLabels(v.items || []); });
  useIntent('shift', () => setTab('shift'));
  const tabs = TABS.filter((t) => !t[3] || t[3](appUser));
  const clearDraft = React.useCallback(() => setPoDraft(null), []);
  return (
    <section className="space-y-4" dir="rtl">
      <div className={`${card} shadow-sm flex flex-wrap items-center justify-between gap-3 anim-up`}>
        <h2 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><Truck size={20} className="text-teal-600" /> المشتريات والجرد والخزنة</h2>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(([id, label, icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${tab === id ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>{icon} {label}</button>)}
        </div>
      </div>
      {tab === 'suppliers' && <SuppliersTab appUser={appUser} warehouses={warehouses} draft={poDraft} onDraftUsed={clearDraft} onLabels={(items) => { setLabels(items); setTab('labels'); }} />}
      {tab === 'count' && <CountTab appUser={appUser} warehouses={warehouses} />}
      {tab === 'shift' && <ShiftTab appUser={appUser} />}
      {tab === 'statement' && <StatementTab systemSettings={systemSettings} preset={phone} />}
      {tab === 'margin' && tabs.some((t) => t[0] === 'margin') && <MarginTab appUser={appUser} warehouses={warehouses} />}
      {tab === 'labels' && <LabelsTab appUser={appUser} systemSettings={systemSettings} preset={labels} />}
    </section>
  );
}

export default AccountsHub;
