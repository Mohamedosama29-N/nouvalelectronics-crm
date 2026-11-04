// 🧾 إيصال استلام الجهاز (A5 أو حراري 80مم) فيه QR بيودّي على صفحة التتبع
import QRCode from 'qrcode';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WARRANTY = { in_warranty: 'داخل الضمان', out_of_warranty: 'خارج الضمان', unidentified: 'غير معرّف', repair_invoice: 'فاتورة إصلاح' };

export const DEFAULT_RECEIPT_TERMS = [
  'يرجى الاحتفاظ بهذا الإيصال لاستلام الجهاز.',
  'التكلفة النهائية بتتحدد بعد الفحص وبموافقة العميل.',
  'الأجهزة اللي مايتمش استلامها خلال 60 يوم من إبلاغ العميل، المركز غير مسؤول عنها.',
  'تابع حالة جهازك أونلاين بمسح الكود.',
];

export async function buildReceiptHtml(ticket, { trackUrl = '', company = '', companyPhone = '', centerName = '', terms = DEFAULT_RECEIPT_TERMS, format = 'a5' } = {}) {
  const qr = trackUrl ? await QRCode.toDataURL(trackUrl, { margin: 1, width: 220, errorCorrectionLevel: 'M' }) : '';
  const created = ticket.createdAt?.toDate ? ticket.createdAt.toDate() : new Date(ticket.createdAt || Date.now());
  const thermal = format === 'thermal';
  const row = (k, v) => (v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : '');
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>إيصال استلام ${esc(ticket.ticketNumber)}</title>
<style>@page{size:${thermal ? '80mm auto' : 'A5'};margin:${thermal ? '3mm' : '10mm'}}
body{font-family:Tahoma,Arial,sans-serif;color:#0f172a;margin:0;font-size:${thermal ? '11px' : '13px'}}
.h{text-align:center;border-bottom:2px dashed #0d9488;padding-bottom:8px;margin-bottom:8px}.h b{font-size:${thermal ? '15px' : '18px'}}
.no{font-size:${thermal ? '16px' : '20px'};font-weight:900;letter-spacing:1px;margin:6px 0}
table{width:100%;border-collapse:collapse}th{text-align:right;color:#475569;font-weight:normal;width:32%;padding:3px 0;vertical-align:top}td{padding:3px 0;font-weight:bold}
.box{border:1px solid #cbd5e1;border-radius:6px;padding:6px;margin:8px 0;white-space:pre-wrap}
.qr{text-align:center;margin:8px 0}.qr img{width:${thermal ? '120px' : '140px'}}.qr small{display:block;color:#64748b;word-break:break-all;font-size:9px}
ol{padding-right:16px;margin:6px 0;color:#334155;font-size:${thermal ? '9px' : '11px'}}.sig{display:flex;justify-content:space-between;margin-top:18px;gap:12px}.sig div{flex:1;border-top:1px solid #94a3b8;text-align:center;padding-top:4px;font-size:10px;color:#64748b}</style></head><body>
<div class="h"><b>${esc(company || 'مركز الصيانة')}</b>${centerName ? `<div>${esc(centerName)}</div>` : ''}${companyPhone ? `<div>☎ ${esc(companyPhone)}</div>` : ''}
<div>إيصال استلام جهاز للصيانة</div><div class="no">${esc(ticket.ticketNumber || '')}</div><div>${esc(created.toLocaleString('ar-EG'))}</div></div>
<table>${row('العميل', ticket.customerName)}${row('الموبايل', ticket.customerPhone)}${row('الجهاز', [ticket.device, ticket.deviceModel].filter(Boolean).join(' '))}${row('السيريال', ticket.deviceSerial)}${row('الضمان', WARRANTY[ticket.warrantyStatus] || '')}${row('المدة المتوقعة', ticket.estimatedDuration)}${row('التكلفة التقديرية', Number(ticket.estimatedCost) ? `${Number(ticket.estimatedCost).toLocaleString()} ج` : '')}</table>
${ticket.issue ? `<div class="box"><b>المشكلة:</b> ${esc(ticket.issue)}</div>` : ''}
${qr ? `<div class="qr"><img src="${qr}" alt="QR"><small>امسح الكود لمتابعة حالة جهازك<br>${esc(trackUrl)}</small></div>` : ''}
<ol>${terms.filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
<div class="sig"><div>توقيع العميل</div><div>توقيع الموظف</div></div>
<script>window.onload=()=>{setTimeout(()=>window.print(),200)}</script></body></html>`;
}

export async function printReceipt(ticket, opts) {
  const w = window.open('', '_blank');
  if (!w) throw Object.assign(new Error('popup-blocked'), { code: 'popup-blocked' });
  w.document.open();
  w.document.write('<p style="font-family:Tahoma;text-align:center;margin-top:40px">جاري التحضير...</p>');
  const html = await buildReceiptHtml(ticket, opts);
  w.document.open(); w.document.write(html); w.document.close();
}
