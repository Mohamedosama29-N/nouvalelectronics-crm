// ملف: public/workers/inventoryImportWorker.js

self.onmessage = async function(e) {
  const { data, batchSize } = e.data;
  const totalItems = data.length;
  let processed = 0;
  let failed = 0;
  
  try {
    for (let i = 0; i < totalItems; i += batchSize) {
      const chunk = data.slice(i, i + batchSize);
      
      // محاكاة معالجة الدفعة
      for (const item of chunk) {
        // تحقق من صحة البيانات
        if (!item.serialNumber || !item.name) {
          failed++;
          continue;
        }
        
        // معالجة الصنف
        processed++;
      }
      
      // إرسال التقدم
      self.postMessage({
        type: 'progress',
        processed,
        failed,
        total: totalItems
      });
      
      // تأخير صغير لمنع التحميل الزائد
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    self.postMessage({
      type: 'complete',
      processed,
      failed,
      total: totalItems
    });
    
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message
    });
  }
};