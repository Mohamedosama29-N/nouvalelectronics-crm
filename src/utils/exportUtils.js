import { writeObjectsToXlsx } from './xlsxIO';
import { exportAllowed } from './permissions';
import { showError } from './alerts';

const blocked = () => { if (exportAllowed()) return false; showError('مش مسموح لك بتصدير البيانات. كلّم مدير النظام.'); return true; };

export const exportToCSV = (data, filename) => {
  if (!data || !data.length || blocked()) return false;
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
  if (!data || !data.length || blocked()) return false;
  try {
    // async في الخلفية: الدالة بتفضل ترجّع true فورًا زي الأول، والخطأ بيتسجل في الكونسول
    writeObjectsToXlsx(data, filename, sheetName).catch((error) => console.error('Excel export error:', error));
    return true;
  } catch (error) {
    console.error("Excel export error:", error);
    return false;
  }
};
