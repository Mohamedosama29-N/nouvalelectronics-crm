import * as XLSX from 'xlsx';

export const exportToCSV = (data, filename) => {
  if (!data || !data.length) return false;
  try {
    const headers = Object.keys(data[0]);
    const csvContent = [
      "\uFEFF" + headers.join(','),
      ...data.map(row => 
        headers.map(f => {
          const val = row[f];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
          if (val instanceof Date) return `"${val.toLocaleString()}"`;
          return val;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
    return true;
  } catch (error) {
    console.error("Export error:", error);
    return false;
  }
};

// ✨ ميزة جديدة: تصدير Excel حقيقي (.xlsx) بدل CSV بس، باستخدام SheetJS

export const exportToExcel = (data, filename, sheetName = 'Sheet1') => {
  if (!data || !data.length) return false;
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    return true;
  } catch (error) {
    console.error("Excel export error:", error);
    return false;
  }
};
