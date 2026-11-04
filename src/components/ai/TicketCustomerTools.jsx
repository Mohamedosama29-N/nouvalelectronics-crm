import React, { useState } from 'react';
import { Printer, Link2, Copy, ExternalLink, MessageSquareReply, Loader2, Wand2, MapPin } from 'lucide-react';
import { syncTracking, trackUrlFor } from '../../utils/ticketTracking';
import { printReceipt } from '../../utils/ticketReceipt';
import { suggestReply } from '../../ai/customerReply';
import { whatsappLink } from '../../ai/ticketAssist';
import { polishCustomerMessage } from '../../ai/aiServices';
import { friendlyAIError, isAIFeatureOn } from '../../ai/aiClient';
import { showError, showSuccess } from '../../utils/alerts';
import { requestNavigation } from '../../utils/appEvents';

// 🧾 أدوات العميل جوه التذكرة: إيصال استلام بـ QR، رابط التتبع، ورد مقترح على رسالته
export function TicketCustomerTools({ ticket, systemSettings, warehouseMap = {}, onTokenCreated }) {
  const [busy, setBusy] = useState('');
  const [link, setLink] = useState(ticket?.trackToken ? trackUrlFor(ticket.trackToken) : '');
  const [incoming, setIncoming] = useState('');
  const [reply, setReply] = useState('');
  const [showReply, setShowReply] = useState(false);
  const aiOn = isAIFeatureOn(systemSettings, 'messages');
  if (!ticket) return null;
  const opts = { centerName: warehouseMap?.[ticket.assignedCenter] || '', company: systemSettings?.storeName || '', companyPhone: systemSettings?.storePhone || '' };

  const ensureLink = async () => {
    const token = await syncTracking(ticket.id, ticket, opts);
    if (!ticket.trackToken && token) onTokenCreated?.(token);
    const url = trackUrlFor(token);
    setLink(url);
    return url;
  };

  const doReceipt = async (format) => {
    setBusy(`receipt-${format}`);
    try { const url = await ensureLink(); await printReceipt(ticket, { ...opts, trackUrl: url, format }); }
    catch (e) { showError(e?.code === 'popup-blocked' ? 'المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة' : 'معرفتش أجهّز الإيصال'); console.error(e); }
    finally { setBusy(''); }
  };

  const doLink = async () => {
    setBusy('link');
    try { const url = await ensureLink(); await navigator.clipboard?.writeText(url).catch(() => {}); showSuccess('رابط التتبع اتنسخ'); }
    catch (e) { showError('معرفتش أعمل الرابط'); console.error(e); }
    finally { setBusy(''); }
  };

  const buildReply = async (polish) => {
    setBusy(polish ? 'polish' : 'reply');
    try {
      const url = link || await ensureLink();
      let text = suggestReply(ticket, incoming, { trackUrl: url, company: opts.company, expectedLabel: ticket.estimatedDuration || '' }).text;
      if (polish) text = await polishCustomerMessage(systemSettings, ticket, text, { companyName: opts.company, tone: /اعتذار|بنعتذر/.test(text) ? 'معتذر ومتعاطف' : 'ودود' });
      setReply(text);
    } catch (e) { showError(friendlyAIError(e)); }
    finally { setBusy(''); }
  };

  const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50';
  const wa = reply ? whatsappLink(ticket.customerPhone, reply) : link ? whatsappLink(ticket.customerPhone, `تقدر تتابع حالة جهازك من هنا: ${link}`) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => doReceipt('a5')} disabled={!!busy} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>{busy === 'receipt-a5' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} إيصال استلام</button>
        <button type="button" onClick={() => doReceipt('thermal')} disabled={!!busy} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200`}>{busy === 'receipt-thermal' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} إيصال حراري 80مم</button>
        <button type="button" onClick={doLink} disabled={!!busy} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200`}>{busy === 'link' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} رابط التتبع</button>
        <button type="button" onClick={() => requestNavigation('tech_hub', { kind: 'visit-new', prefill: { customerName: ticket.customerName || '', phone: ticket.customerPhone || '', device: [ticket.device, ticket.deviceModel].filter(Boolean).join(' '), ticketNumber: ticket.ticketNumber || '', ticketId: ticket.id, governorate: ticket.governorate || '', city: ticket.city || '', address: ticket.customerAddress || '', technician: ticket.assignedTechnician || '' } })}
          className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200`}><MapPin size={14} /> زيارة منزلية</button>
        <button type="button" onClick={() => setShowReply((v) => !v)} className={`${btn} bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100`}><MessageSquareReply size={14} /> رد على رسالة العميل</button>
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}><ExternalLink size={14} /> واتساب</a>}
      </div>
      {link && <p className="text-[11px] text-slate-500 break-all" dir="ltr">{link}</p>}
      {showReply && (
        <div className="anim-fade rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2">
          <textarea value={incoming} onChange={(e) => setIncoming(e.target.value)} rows={2} aria-label="رسالة العميل الواردة" placeholder="الصق رسالة العميل هنا (مثلاً: الجهاز خلص ولا لسه؟)"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => buildReply(false)} disabled={!!busy} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>{busy === 'reply' ? <Loader2 size={14} className="animate-spin" /> : <MessageSquareReply size={14} />} اقترح رد</button>
            {aiOn && <button type="button" onClick={() => buildReply(true)} disabled={!!busy} className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>{busy === 'polish' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} رد بالذكاء الاصطناعي</button>}
            {reply && <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(reply); showSuccess('اتنسخ'); } catch { showError('النسخ مش مدعوم'); } }} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200`}><Copy size={14} /> نسخ</button>}
          </div>
          {reply && <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={6} aria-label="الرد المقترح" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm" />}
        </div>
      )}
    </div>
  );
}
