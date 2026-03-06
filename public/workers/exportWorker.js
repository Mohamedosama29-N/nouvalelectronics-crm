// ملف: public/workers/exportWorker.js

self.onmessage = function(e) {
  const { data, type, filters } = e.data;
  
  try {
    let processed = data;
    
    // تطبيق الفلاتر
    if (filters) {
      processed = data.filter(item => {
        for (const [key, value] of Object.entries(filters)) {
          if (value && item[key] !== value) return false;
        }
        return true;
      });
    }
    
    // تحويل إلى CSV
    const convertToCSV = (items) => {
      if (!items.length) return '';
      const headers = Object.keys(items[0]);
      const csv = [
        headers.join(','),
        ...items.map(row => 
          headers.map(f => {
            const val = row[f];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
            return val;
          }).join(',')
        )
      ].join('\n');
      return "\uFEFF" + csv; // BOM for UTF-8
    };
    
    const csv = convertToCSV(processed);
    
    self.postMessage({ csv, count: processed.length });
    
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};