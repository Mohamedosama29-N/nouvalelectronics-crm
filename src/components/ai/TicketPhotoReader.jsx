import React, { useRef, useState } from 'react';
import { Camera, Loader2, Check, ScanLine, ChevronDown } from 'lucide-react';
import { isAIFeatureOn, friendlyAIError } from '../../ai/aiClient';
import { readDocumentImage } from '../../ai/aiServices';
import { detectBarcodes, fileToResizedBase64 } from '../../utils/imageTools';
import { showError, showSuccess } from '../../utils/alerts';

const FIELDS = { deviceSerial: 'السيريال', deviceModel: 'الموديل', device: 'الجهاز', invoiceDate: 'تاريخ الفاتورة', invoiceNumber: 'رقم الفاتورة', store: 'المحل' };

// 📷 (7) صوّر الفاتورة أو ملصق السيريال ← السيستم يملأ السيريال والموديل وتاريخ الشراء
export function TicketPhotoReader({ systemSettings, onApply }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const [res, setRes] = useState(null);
  const [codes, setCodes] = useState([]);
  const fileRef = useRef(null);
  const aiOn = isAIFeatureOn(systemSettings, 'tickets');

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setRes(null); setCodes([]);
    try {
      const [img, found] = await Promise.all([fileToResizedBase64(file), detectBarcodes(file)]);
      setPreview(img.preview); setCodes(found);
      let out = { deviceSerial: found[0] || '' };
      if (aiOn) {
        try {
          const r = await readDocumentImage(systemSettings, img);
          out = { deviceSerial: r.serial || found[0] || '', deviceModel: r.model, device: [r.deviceType, r.brand].filter(Boolean).join(' '), invoiceDate: r.purchaseDate, invoiceNumber: r.invoiceNumber, store: r.store, confidence: r.confidence, kind: r.kind, note: r.note };
        } catch (err) { showError(`${friendlyAIError(err)}${found.length ? ' — استخدمت الباركود اللي في الصورة.' : ''}`); }
      }
      if (!Object.keys(FIELDS).some((k) => out[k])) showError(aiOn ? 'مقدرتش أقرا بيانات واضحة من الصورة — صوّرها أقرب وفي نور كويس' : 'مفيش باركود واضح في الصورة. فعّل الذكاء الاصطناعي عشان يقرا الكلام المكتوب.');
      setRes(out);
    } catch (err) { console.error(err); showError('الملف ده مش صورة'); }
    setBusy(false);
  };

  const apply = () => {
    const p = {};
    ['deviceSerial', 'deviceModel', 'device', 'invoiceDate'].forEach((k) => { if (res?.[k]) p[k] = res[k]; });
    const extra = [res?.invoiceNumber && `رقم الفاتورة: ${res.invoiceNumber}`, res?.store && `اتشرى من: ${res.store}`].filter(Boolean).join(' · ');
    if (extra) p.__appendNotes = extra;
    onApply?.(p);
    showSuccess('اتملت البيانات من الصورة — راجعها');
    setOpen(false); setRes(null); setPreview('');
  };

  return (
    <div className="rounded-2xl border border-dashed border-sky-300 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-right rounded-2xl">
        <span className="flex items-center gap-2 text-sm font-black text-sky-700 dark:text-sky-300"><Camera size={16} /> صوّر الفاتورة أو ملصق السيريال</span>
        <ChevronDown size={16} className={`text-sky-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 anim-fade">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} aria-label="صورة الفاتورة أو الملصق" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} اختار/صوّر صورة
            </button>
            <span className="text-[11px] text-slate-500">{aiOn ? 'بيقرا الباركود والكلام المكتوب (الصورة مش بتتحفظ).' : 'وضع مجاني: بيقرا الباركود بس. فعّل الذكاء الاصطناعي لقراءة الفاتورة كلها.'}</span>
          </div>
          {res && (
            <div className="anim-pop bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-3 flex flex-col sm:flex-row gap-3">
              {preview && <img src={preview} alt="الصورة" className="w-28 h-28 object-cover rounded-lg border" />}
              <div className="flex-1 space-y-2">
                <div className="grid sm:grid-cols-2 gap-2">
                  {Object.entries(FIELDS).map(([k, l]) => (
                    <div key={k} className={`text-xs rounded-lg p-2 ${res[k] ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-slate-50 dark:bg-slate-900/40 opacity-60'}`}><span className="text-slate-500">{l}: </span><b dir="auto">{res[k] || '—'}</b></div>
                  ))}
                </div>
                {codes.length > 1 && <p className="text-[11px] text-slate-500">باركودات تانية في الصورة: {codes.slice(1).join(' · ')}</p>}
                {res.confidence !== undefined && <p className="text-[11px] text-slate-500">درجة الثقة: {Math.round(res.confidence * 100)}%{res.note ? ` · ${res.note}` : ''}</p>}
                <button type="button" onClick={apply} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold"><Check size={14} /> املأ التذكرة</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
