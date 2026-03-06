// public/workers/inventoryImportWorker.js
self.onmessage = async function(e) {
  const { data, batchSize, userId, userName } = e.data;
  const totalItems = data.length;
  let processed = 0;
  let failed = 0;
  let currentBatch = [];
  
  try {
    for (let i = 0; i < totalItems; i++) {
      const item = data[i];
      
      // التحقق من صحة البيانات
      if (!item.serialNumber || !item.name) {
        failed++;
        self.postMessage({
          type: 'progress',
          processed,
          failed,
          total: totalItems,
          currentItem: i + 1
        });
        continue;
      }
      
      // تجهيز البيانات للإضافة
      currentBatch.push({
        serialNumber: item.serialNumber.trim().toUpperCase(),
        name: item.name.trim(),
        quantity: parseInt(item.quantity) || 1,
        price: parseFloat(item.price) || 0,
        minStock: parseInt(item.minStock) || 2,
        category: item.category || 'عام',
        location: item.location || '',
        notes: item.notes || '',
        searchKey: `${item.name} ${item.serialNumber}`.toLowerCase().trim().replace(/\s+/g, ' ')
      });
      
      // إذا اكتملت الدفعة أو وصلنا لآخر عنصر
      if (currentBatch.length >= batchSize || i === totalItems - 1) {
        // إرسال الدفعة للمعالجة في الصفحة الرئيسية
        self.postMessage({
          type: 'batch',
          batch: currentBatch,
          batchIndex: Math.floor(processed / batchSize),
          totalBatches: Math.ceil(totalItems / batchSize)
        });
        
        processed += currentBatch.length;
        currentBatch = [];
        
        // إرسال تقدم العملية
        self.postMessage({
          type: 'progress',
          processed,
          failed,
          total: totalItems,
          currentItem: i + 1
        });
        
        // تأخير صغير لمنع التحميل الزائد
        await new Promise(resolve => setTimeout(resolve, 10));
      }
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