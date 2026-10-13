// 🛠️ FIX: النسخة القديمة كانت بتستخدم jsPDF مع خط 'cairo' غير مسجّل، فالنص
// العربي كان بيطلع فاضي أو مقلوب. دلوقتي بنرسم التقرير كصفحات HTML (RTL، بنفس
// خطوط المتصفح اللي بتشكّل العربي صح) ونحوّلها لصور داخل PDF. المكتبات بتتحمّل
// وقت التصدير بس.
const ROWS_PER_PAGE = 28;
const MAX_ROWS = 600;

const esc = (v) => String(v ?? '-').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const buildPageHtml = ({ title, headers, rows, summary, pageNo, pageCount, first, notice }) => `
  <div dir="rtl" style="width:1000px;min-height:1400px;box-sizing:border-box;padding:40px;background:#fff;color:#0f172a;font-family:'Segoe UI',Tahoma,Arial,sans-serif;position:relative">
    ${first ? `
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:30px;font-weight:800">${esc(title)}</div>
        <div style="font-size:14px;color:#64748b;margin-top:6px">تاريخ التقرير: ${esc(new Date().toLocaleDateString('ar-EG'))}</div>
      </div>
      ${summary?.length ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px">${summary.map(s => `
        <div style="flex:1;min-width:150px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:10px 14px;text-align:center">
          <div style="font-size:12px;color:#475569">${esc(s.label)}</div>
          <div style="font-size:20px;font-weight:800;color:#0f766e">${esc(s.value)}</div>
        </div>`).join('')}</div>` : ''}
      ${notice ? `<div style="font-size:12px;color:#b45309;margin-bottom:10px">${esc(notice)}</div>` : ''}
    ` : ''}
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr>${headers.map(h => `<th style="background:#0f766e;color:#fff;padding:8px 6px;text-align:right;border:1px solid #0f766e">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">${headers.map(h => `<td style="padding:7px 6px;border:1px solid #e2e8f0;text-align:right">${esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <div style="position:absolute;bottom:18px;left:0;right:0;text-align:center;font-size:11px;color:#94a3b8">صفحة ${pageNo} من ${pageCount}</div>
  </div>`;

export const exportToPDF = async (data, title, headers, options = {}) => {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const hdrs = headers || Object.keys(data[0] || {});
  const all = data.slice(0, MAX_ROWS);
  const notice = data.length > MAX_ROWS ? `تم عرض أول ${MAX_ROWS} سجل من ${data.length}. استخدم Excel للتصدير الكامل.` : '';
  const chunks = [];
  for (let i = 0; i < all.length; i += ROWS_PER_PAGE) chunks.push(all.slice(i, i + ROWS_PER_PAGE));
  if (chunks.length === 0) chunks.push([]);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;';
  document.body.appendChild(host);
  try {
    for (let i = 0; i < chunks.length; i++) {
      host.innerHTML = buildPageHtml({
        title, headers: hdrs, rows: chunks[i], summary: options.summary,
        pageNo: i + 1, pageCount: chunks.length, first: i === 0, notice
      });
      const el = host.firstElementChild;
      const canvas = await html2canvas(el, { scale: 1.6, backgroundColor: '#ffffff' });
      if (i > 0) pdf.addPage();
      const imgH = (canvas.height * pageW) / canvas.width;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, Math.min(imgH, pageH));
    }
  } finally {
    host.remove();
  }
  pdf.save(`${title}_${new Date().toISOString().split('T')[0]}.pdf`);
};
