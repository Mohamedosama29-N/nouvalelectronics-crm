// 🖨️ طباعة كشف حساب العميل وملصقات الباركود (من غير أي خدمة خارجية)
import JsBarcode from 'jsbarcode';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US');
const day = (d) => (d ? new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function buildStatementHtml({ customer = {}, statement, company = '', companyPhone = '', from = '', to = '' }) {
  const rows = statement.rows.map((r) => `<tr><td>${day(r.date)}</td><td>${esc(r.kind)}</td><td class="m">${esc(r.ref)}</td><td>${esc(r.desc)}</td><td class="n">${money(r.amount)}</td><td class="n">${money(r.paid)}</td><td class="n ${r.remaining > 0 ? 'due' : ''}">${money(r.remaining)}</td></tr>`).join('');
  const t = statement.totals;
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>كشف حساب ${esc(customer.name || customer.phone)}</title>
<style>body{font-family:Tahoma,Arial;margin:24px;color:#0f172a}h1{font-size:20px;margin:0}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d9488;padding-bottom:10px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #e2e8f0;padding:6px;text-align:right}th{background:#f1f5f9}.n{text-align:left;direction:ltr;font-weight:bold}.m{font-family:monospace}.due{color:#be123c}
.sum{display:flex;gap:12px;margin:14px 0}.sum div{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:8px}.sum b{display:block;font-size:16px}small{color:#64748b}@media print{button{display:none}}</style></head>
<body><header><div><h1>${esc(company || 'كشف حساب عميل')}</h1>${companyPhone ? `<small>${esc(companyPhone)}</small>` : ''}</div>
<div><b>كشف حساب</b><br><small>العميل: ${esc(customer.name || '—')} · ${esc(customer.phone || '')}</small><br><small>${from || to ? `الفترة: ${esc(from || 'البداية')} → ${esc(to || 'النهارده')}` : 'كل المعاملات'}</small><br><small>تاريخ الطباعة: ${day(new Date())}</small></div></header>
<div class="sum"><div><small>إجمالي المعاملات</small><b>${money(t.amount)} ج</b></div><div><small>المدفوع</small><b>${money(t.paid)} ج</b></div><div><small>المتبقي على العميل</small><b class="${t.remaining > 0 ? 'due' : ''}">${money(t.remaining)} ج</b></div></div>
<table><thead><tr><th>التاريخ</th><th>النوع</th><th>المرجع</th><th>البيان</th><th>القيمة</th><th>المدفوع</th><th>المتبقي</th></tr></thead><tbody>${rows || '<tr><td colspan="7" style="text-align:center">مفيش معاملات</td></tr>'}</tbody></table>
<p><small>الكشف ده مستخرج من السيستم، ولو فيه أي ملاحظة برجاء التواصل معانا.</small></p>
<button onclick="print()">طباعة / حفظ PDF</button><script>setTimeout(()=>print(),300)</script></body></html>`;
}

export const LABEL_SIZES = {
  '38x25': { w: 38, h: 25, label: '38×25 مم (ملصق صغير)', bh: 32 },
  '50x30': { w: 50, h: 30, label: '50×30 مم', bh: 40 },
  '58x40': { w: 58, h: 40, label: '58×40 مم', bh: 55 },
  a4: { w: 63, h: 38, label: 'ورقة A4 (21 ملصق)', bh: 45, sheet: true },
};

// بيرسم الباركود SVG كنص (Code128) — لو الكود مش صالح بيرجّع null
export function barcodeSvg(value, height = 40) {
  if (typeof document === 'undefined') return null;
  const draw = (displayValue) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, String(value), { format: 'CODE128', height, width: 1.4, margin: 0, displayValue, fontSize: 11 });
    return svg.outerHTML;
  };
  try { return draw(true); } catch {
    // لو المتصفح مش قادر يقيس النص، نرسم الخطوط بس ونكتب الكود تحته
    try { return `${draw(false)}<div class="m">${esc(value)}</div>`; } catch { return null; }
  }
}

export function buildLabelsHtml(items = [], { size = '50x30', showPrice = true, store = '' } = {}) {
  const s = LABEL_SIZES[size] || LABEL_SIZES['50x30'];
  const labels = [];
  items.forEach((it) => { for (let i = 0; i < Math.max(1, Math.min(500, Number(it.copies) || 1)); i += 1) labels.push(it); });
  const cells = labels.map((it) => `<div class="l">${store ? `<div class="s">${esc(store)}</div>` : ''}<div class="nm">${esc(it.name)}</div>${barcodeSvg(it.serialNumber, s.bh) || `<div class="m">${esc(it.serialNumber)}</div>`}${showPrice && it.price ? `<div class="p">${money(it.price)} ج</div>` : ''}</div>`).join('');
  const page = s.sheet ? '@page{size:A4;margin:8mm}.wrap{display:grid;grid-template-columns:repeat(3,63mm);gap:2mm}' : `@page{size:${s.w}mm ${s.h}mm;margin:0}.l{page-break-after:always}`;
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>ملصقات باركود</title><style>body{margin:0;font-family:Tahoma,Arial}${page}
.l{width:${s.w}mm;height:${s.h}mm;box-sizing:border-box;padding:1mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;text-align:center}.l svg{max-width:100%;height:auto}
.nm{font-size:9px;font-weight:bold;max-height:2.4em;overflow:hidden}.s{font-size:7px;color:#555}.p{font-size:11px;font-weight:bold}.m{font-family:monospace;font-size:11px}@media screen{.l{border:1px dashed #ccc;margin:2px}}</style></head>
<body><div class="wrap">${cells}</div><script>setTimeout(()=>print(),300)</script></body></html>`;
}

export function openPrintWindow(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
