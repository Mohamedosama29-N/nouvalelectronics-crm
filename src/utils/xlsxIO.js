// 📄 قراءة/كتابة ملفات Excel (.xlsx) بمكتبة exceljs بدل xlsx (SheetJS) اللي عليها ثغرات
// بدون إصلاح متاح من npm. الواجهة هنا بسيطة وبتغطي الاستخدام الفعلي بس.
import ExcelJS from 'exceljs';

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// يرجّع أول شيت كـ CSV نصي (نفس شكل XLSX.utils.sheet_to_csv اللي كان مستخدم)
export const readFirstSheetAsCSV = async (arrayBuffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return '';
  const lines = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    // row.values بيبدأ من index 1
    const max = row.cellCount;
    for (let c = 1; c <= max; c++) {
      const cell = row.getCell(c);
      // cell.text بيرجّع النص المعروض (بيحل الصيغ والتواريخ)
      values.push(csvCell(cell.text));
    }
    lines.push(values.join(','));
  });
  return lines.join('\n');
};

// يكتب مصفوفة كائنات في ملف xlsx ويحمّله للمستخدم
export const writeObjectsToXlsx = async (data, filename, sheetName = 'Sheet1') => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(String(sheetName).slice(0, 31) || 'Sheet1');
  const headers = Object.keys(data[0] || {});
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(12, Math.min(40, h.length + 4)) }));
  ws.getRow(1).font = { bold: true };
  data.forEach((rowObj) => ws.addRow(rowObj));
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};
