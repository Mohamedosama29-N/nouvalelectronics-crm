export const parseCSV = (text) => {
  try {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const results = [];
    
    if (lines.length > 1000) {
      return parseCSVWithWorker(text);
    }
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = [];
      let current = '';
      let inQuotes = false;
      const line = lines[i];
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));
      
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      results.push(row);
    }
    
    return results;
  } catch (error) {
    console.error('CSV Parse Error:', error);
    return [];
  }
};

export const parseCSVWithWorker = (text) => {
  return new Promise((resolve) => {
    const worker = new Worker('/workers/csvParser.js');
    worker.postMessage(text);
    worker.onmessage = (e) => resolve(e.data);
  });
};

// ==========================================================================
// 🔔 NOTIFICATION SERVICE
// ==========================================================================
