import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { X, Loader2, Download, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { db } from '../../firebase/config';
import { exportToCSV } from '../../utils/exportUtils';

const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);
const fmt = (d) => (d ? d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '-');
const ymd = (d) => d.toISOString().slice(0, 10);

// حركة صنف واحد: مبيعات + مرتجعات فواتير + تحويلات + مرتجعات المخزن.
// ملحوظة: مبنية على المستندات الموجودة (مفيش دفتر حركة منفصل)، فتعديلات
// الكمية اليدوية من شاشة المخزون مش بتظهر هنا.
export function ItemMovementModal({ item, warehouseMap, onClose }) {
  const today = new Date();
  const [from, setFrom] = useState(ymd(new Date(today.getTime() - 90 * 86400000)));
  const [to, setTo] = useState(ymd(today));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const wh = item.warehouseId;
  const whName = (id) => warehouseMap?.[id] || id || '-';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const start = Timestamp.fromDate(new Date(`${from}T00:00:00`));
        const end = Timestamp.fromDate(new Date(`${to}T23:59:59`));
        const [txSnap, trSnap, retSnap] = await Promise.all([
          getDocs(query(collection(db, 'transactions'), where('timestamp', '>=', start), where('timestamp', '<=', end), orderBy('timestamp', 'desc'), limit(1500))),
          getDocs(query(collection(db, 'transfers'), where('createdAt', '>=', start), where('createdAt', '<=', end), orderBy('createdAt', 'desc'), limit(1500))),
          getDocs(query(collection(db, 'returns'), where('createdAt', '>=', start), where('createdAt', '<=', end), orderBy('createdAt', 'desc'), limit(1500)))
        ]);
        const out = [];
        const matches = (i) => (i.id && i.id === item.id) || (i.serialNumber && i.serialNumber === item.serialNumber);

        txSnap.docs.forEach(d => {
          const t = d.data();
          if (t.warehouseId && t.warehouseId !== wh) return;
          const list = Array.isArray(t.items) && t.items.length ? t.items : [];
          const hit = list.filter(i => !i.isService && matches(i));
          const qty = hit.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
          if (!qty) return;
          const isReturn = t.type === 'return';
          out.push({
            date: toDate(t.timestamp), kind: isReturn ? 'مرتجع فاتورة' : 'بيع', delta: isReturn ? qty : -qty,
            ref: t.invoiceNumber || d.id.slice(0, 8), who: t.customerName || '-', by: t.operator || '-'
          });
        });

        trSnap.docs.forEach(d => {
          const t = d.data();
          const list = Array.isArray(t.items) && t.items.length ? t.items : [{ serialNumber: t.serialNumber, requestedQty: t.requestedQty }];
          const hit = list.filter(i => i.serialNumber === item.serialNumber);
          const qty = hit.reduce((s, i) => s + (Number(i.requestedQty) || 0), 0);
          if (!qty) return;
          const isOut = t.fromWarehouseId === wh;
          const isIn = t.toWarehouseId === wh;
          if (!isOut && !isIn) return;
          const legacyDone = t.status === 'approved' && !t.items; // النظام القديم كان بيحرّك المخزون وقت الموافقة
          const done = t.status === 'received' || legacyDone;
          const open = ['pending', 'approved', 'shipped'].includes(t.status) && !legacyDone;
          if (!done && !open) return; // مرفوض
          out.push({
            date: toDate(done ? (t.receivedAt || t.processedAt || t.createdAt) : t.createdAt),
            kind: isIn ? 'تحويل وارد' : 'تحويل صادر',
            delta: done ? (isIn ? qty : -qty) : 0,
            pending: !done, qty,
            ref: d.id.slice(0, 8),
            who: isIn ? whName(t.fromWarehouseId) : whName(t.toWarehouseId),
            by: t.receivedBy || t.processedBy || t.requestedBy || '-'
          });
        });

        retSnap.docs.forEach(d => {
          const r = d.data();
          const qty = Number(r.quantity) || 1;
          if (r.deductedInventoryId === item.id) {
            out.push({ date: toDate(r.createdAt), kind: 'مرتجع مخزن (خصم)', delta: -qty, ref: d.id.slice(0, 8), who: r.customerName || '-', by: r.createdBy || '-' });
            if (r.status === 'rejected') {
              out.push({ date: toDate(r.approvedAt) || toDate(r.createdAt), kind: 'رفض مرتجع (إعادة)', delta: qty, ref: d.id.slice(0, 8), who: '-', by: r.approvedBy || '-' });
            }
          }
          if (r.status === 'approved' && r.reason === 'new_spare_parts' && r.serialNumber === item.serialNumber && r.toWarehouse === wh) {
            out.push({ date: toDate(r.approvedAt) || toDate(r.createdAt), kind: 'مرتجع وارد', delta: qty, ref: d.id.slice(0, 8), who: whName(r.fromWarehouse), by: r.approvedBy || '-' });
          }
        });

        out.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
        if (!cancelled) setRows(out);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e.code === 'failed-precondition' ? 'محتاج Index في Firestore - شغّل firebase deploy --only firestore:indexes' : 'فشل تحميل الحركة: ' + e.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, item.id]);

  const totals = useMemo(() => {
    const t = { sold: 0, returned: 0, inQty: 0, outQty: 0 };
    rows.forEach(r => {
      if (r.pending) return;
      if (r.kind === 'بيع') t.sold += -r.delta;
      else if (r.kind === 'مرتجع فاتورة') t.returned += r.delta;
      else if (r.delta > 0) t.inQty += r.delta;
      else t.outQty += -r.delta;
    });
    return t;
  }, [rows]);

  const exportRows = () => exportToCSV(rows.map(r => ({
    'التاريخ': fmt(r.date), 'النوع': r.kind + (r.pending ? ' (لم يكتمل)' : ''), 'التغيير': r.pending ? 0 : r.delta,
    'المرجع': r.ref, 'الطرف الآخر': r.who, 'بواسطة': r.by
  })), `حركة_${item.serialNumber}`);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden text-right">
        <div className="p-5 border-b flex justify-between items-start">
          <div>
            <h3 className="font-black text-lg text-slate-800 dark:text-white">حركة الصنف</h3>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{item.name}</p>
            <p className="text-[11px] font-mono text-slate-500">{item.serialNumber} - {whName(wh)} - الرصيد الحالي: <b>{item.quantity}</b></p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500"><X size={20}/></button>
        </div>

        <div className="p-4 flex flex-wrap items-end gap-3 border-b bg-slate-50 dark:bg-slate-900/50">
          <label className="text-xs font-bold text-slate-500">من
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="block border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm bg-white dark:bg-slate-900" />
          </label>
          <label className="text-xs font-bold text-slate-500">إلى
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="block border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm bg-white dark:bg-slate-900" />
          </label>
          <button type="button" onClick={exportRows} disabled={!rows.length} className="mr-auto bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-40">
            <Download size={14}/> تصدير CSV
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4">
          {[['مبيعات', totals.sold, 'text-rose-600'], ['مرتجع فواتير', totals.returned, 'text-emerald-600'], ['وارد (تحويل/مرتجع)', totals.inQty, 'text-emerald-600'], ['صادر (تحويل/مرتجع)', totals.outQty, 'text-rose-600']].map(([l, v, c]) => (
            <div key={l} className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-slate-500">{l}</p>
              <p className={`text-xl font-black ${c}`}>{v}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-teal-600"/></div>
          ) : error ? (
            <p className="py-10 text-center text-sm font-bold text-rose-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-slate-400 font-bold">لا توجد حركة في الفترة دي</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-slate-500 border-b">
                <tr><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">النوع</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-right">المرجع</th><th className="p-2 text-right">الطرف الآخر</th><th className="p-2 text-right">بواسطة</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((r, i) => (
                  <tr key={i} className={r.pending ? 'opacity-60' : ''}>
                    <td className="p-2 whitespace-nowrap">{fmt(r.date)}</td>
                    <td className="p-2 font-bold">{r.kind}{r.pending && <span className="text-amber-600"> (لم يكتمل)</span>}</td>
                    <td className="p-2 text-center font-black">
                      {r.pending ? <span className="text-slate-400">{r.qty}</span> : r.delta > 0
                        ? <span className="text-emerald-600 inline-flex items-center gap-0.5"><ArrowDownLeft size={12}/>+{r.delta}</span>
                        : <span className="text-rose-600 inline-flex items-center gap-0.5"><ArrowUpRight size={12}/>{r.delta}</span>}
                    </td>
                    <td className="p-2 font-mono">{r.ref}</td>
                    <td className="p-2">{r.who}</td>
                    <td className="p-2">{r.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[10px] text-slate-400 mt-3">مبني على الفواتير والتحويلات والمرتجعات. تعديلات الكمية اليدوية من شاشة المخزون مش بتظهر هنا.</p>
        </div>
      </div>
    </div>
  );
}
