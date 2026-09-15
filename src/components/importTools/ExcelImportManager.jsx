import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  collection, addDoc, getDocs, serverTimestamp
} from 'firebase/firestore';
import {
  Download,
  Loader2,
  UploadCloud,
  Info
} from 'lucide-react';
import { db } from '../../firebase/config';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';

export function ExcelImportManager() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importLog, setImportLog] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importStats, setImportStats] = useState({ products: 0, models: 0, mainFaults: 0, subFaults: 0 });

  // تحميل قالب الاستيراد الجاهز
  const downloadTemplate = () => {
    const templateRows = [
      ['product_name', 'model_name', 'main_fault_code', 'main_fault_description', 'sub_fault_code', 'sub_fault_description', 'product_code'],
      ['نوفال مكنسة', 'LM5700', 'ERR-001', 'الجهاز لا يعمل', 'SUB-001', 'لا يوجد طاقة', 'NV-MK-001'],
      ['نوفال مكنسة', 'LM5700', 'ERR-001', 'الجهاز لا يعمل', 'SUB-002', 'سلك الكهرباء مقطوع', 'NV-MK-002'],
      ['نوفال مكنسة', 'LM5700', 'ERR-002', 'شفط ضعيف', 'SUB-003', 'فلتر مسدود', 'NV-MK-003'],
      ['خلاط نوفال', 'BL-2000', 'ERR-101', 'الموتور لا يعمل', 'SUB-101', 'دوار الموتور تالف', 'NV-BL-001'],
      ['خلاط نوفال', 'BL-2000', 'ERR-101', 'الموتور لا يعمل', 'SUB-102', 'مكثف تالف', 'NV-BL-002'],
      ['تكييف نوفال', 'AC-1.5', 'ERR-201', 'لا يبرد', 'SUB-201', 'نقص غاز', 'NV-AC-001'],
      ['تكييف نوفال', 'AC-1.5', 'ERR-201', 'لا يبرد', 'SUB-202', 'كمبروسر تالف', 'NV-AC-002'],
      ['تكييف نوفال', 'AC-2.25', 'ERR-201', 'لا يبرد', 'SUB-201', 'نقص غاز', 'NV-AC-003'],
      ['غسالة نوفال', 'WM-800', 'ERR-301', 'لا تصرف الماء', 'SUB-301', 'طلمبة تالفة', 'NV-WM-001'],
      ['غسالة نوفال', 'WM-800', 'ERR-302', 'لا تعصر', 'SUB-302', 'حزام تالف', 'NV-WM-002']
    ];
    
    // إنشاء محتوى CSV
    const csvContent = templateRows.map(row => {
      // التعامل مع الخلايا التي قد تحتوي على فواصل داخل النص
      return row.map(cell => {
        if (cell.includes(',')) {
          return `"${cell}"`;
        }
        return cell;
      }).join(',');
    }).join('\n');
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'products_models_faults_template_5levels.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    showSuccess("تم تحميل قالب الاستيراد (5 مستويات)");
  };

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    const isCSV = selectedFile.name.toLowerCase().endsWith('.csv');
    const isXLSX = selectedFile.name.toLowerCase().endsWith('.xlsx');
    if (!isCSV && !isXLSX) {
      showError("يرجى رفع ملف CSV أو Excel فقط");
      return;
    }
    
    setFile(selectedFile);
    setImportLog([]);
    setImportStats({ products: 0, models: 0, mainFaults: 0, subFaults: 0 });
    
    const reader = new FileReader();

    // 🛠️ FIX: كان بيقبل ملفات .xlsx في الواجهة، لكن بيقراها بـ readAsText
    // كأنها نص عادي! ملفات Excel الحقيقية (.xlsx) هي ملفات ثنائية (ZIP)
    // مش نص، فقراءتها كنص كان بينتج بيانات تالفة (يظهر غالبًا كخطأ
    // "الأعمدة المطلوبة غير موجودة" أو استيراد بيانات مشوّهة). دلوقتي
    // بنستخدم SheetJS لقراءة ملفات .xlsx الحقيقية، وبنسيبها CSV زي ما هي.
    if (isXLSX) {
      reader.onload = (event) => {
        try {
          const workbook = XLSX.read(event.target.result, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const csvText = XLSX.utils.sheet_to_csv(firstSheet);
          const parsedData = parseCSVData(csvText);
          setPreviewData(parsedData.slice(0, 100));
          setShowPreview(true);
        } catch (error) {
          console.error('Excel parse error:', error);
          showError("فشل قراءة ملف Excel، تأكد إن الملف سليم وغير تالف");
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    } else {
      reader.onload = (event) => {
        const text = event.target.result;
        const parsedData = parseCSVData(text);
        setPreviewData(parsedData.slice(0, 100));
        setShowPreview(true);
      };
      reader.readAsText(selectedFile, 'UTF-8');
    }
  };

  const parseCSVData = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    // قراءة الهيدر (الأعمدة)
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    
    // التأكد من وجود الأعمدة المطلوبة
    const requiredColumns = ['product_name', 'model_name'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      showError(`الأعمدة المطلوبة غير موجودة: ${missingColumns.join(', ')}`);
      return [];
    }
    
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 2) continue;
      
      const row = {
        product_name: values[0]?.trim(),
        model_name: values[1]?.trim(),
        main_fault_code: values[2]?.trim(),
        main_fault_description: values[3]?.trim(),
        sub_fault_code: values[4]?.trim(),
        sub_fault_description: values[5]?.trim(),
        product_code: values[6]?.trim()
      };
      
      // تخطي الصفوف الفارغة أو التي لا تحتوي على منتج وموديل
      if (row.product_name && row.model_name) {
        results.push(row);
      }
    }
    
    return results;
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const addLog = (message, type = 'info') => {
    setImportLog(prev => [...prev, { type, message, timestamp: new Date().toLocaleTimeString() }]);
  };

  const getLogColor = (type) => {
    switch(type) {
      case 'success': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30';
      case 'error': return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30';
      case 'warning': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50';
    }
  };

  const handleImport = async () => {
    if (!previewData.length) {
      showError("لا توجد بيانات للاستيراد");
      return;
    }
    
    const confirmed = await showConfirm(
      'تأكيد الاستيراد',
      `سيتم استيراد ${previewData.length} صف من البيانات. سيتم إنشاء المنتجات والموديلات وأكواد الأعطال (رئيسية وفرعية) تلقائياً مع الربط بينها.`,
      'info',
      'نعم، استيراد'
    );
    
    if (!confirmed) return;
    
    setLoading(true);
    setImportLog([{ type: 'info', message: 'بدء عملية الاستيراد...', timestamp: new Date().toLocaleTimeString() }]);
    
    let productsCreated = 0;
    let modelsCreated = 0;
    let mainFaultsCreated = 0;
    let subFaultsCreated = 0;
    let errors = [];
    
    try {
      // جلب البيانات الموجودة مسبقاً لتجنب التكرار
      const existingProductsSnap = await getDocs(collection(db, 'products'));
      const existingProducts = new Map();
      existingProductsSnap.docs.forEach(doc => {
        existingProducts.set(doc.data().name, doc.id);
      });
      
      const existingModelsSnap = await getDocs(collection(db, 'models'));
      const existingModels = new Map();
      existingModelsSnap.docs.forEach(doc => {
        const key = `${doc.data().productId}_${doc.data().name}`;
        existingModels.set(key, doc.id);
      });
      
      const existingMainFaultsSnap = await getDocs(collection(db, 'mainFaultCodes'));
      const existingMainFaults = new Map();
      existingMainFaultsSnap.docs.forEach(doc => {
        const key = `${doc.data().modelId}_${doc.data().code}`;
        existingMainFaults.set(key, doc.id);
      });
      
      const existingSubFaultsSnap = await getDocs(collection(db, 'subFaultCodes'));
      const existingSubFaults = new Set();
      existingSubFaultsSnap.docs.forEach(doc => {
        existingSubFaults.add(`${doc.data().mainFaultId}_${doc.data().code}`);
      });
      
      let processed = 0;
      const total = previewData.length;
      
      for (const row of previewData) {
        try {
          processed++;
          addLog(`جاري معالجة ${processed}/${total}: ${row.product_name} - ${row.model_name}`, 'info');
          
          // 1. إنشاء المنتج إذا لم يكن موجوداً
          let productId = existingProducts.get(row.product_name);
          if (!productId) {
            const productRef = await addDoc(collection(db, 'products'), {
              name: row.product_name,
              createdAt: serverTimestamp()
            });
            productId = productRef.id;
            existingProducts.set(row.product_name, productId);
            productsCreated++;
            addLog(`✅ تم إنشاء المنتج: ${row.product_name}`, 'success');
          }
          
          // 2. إنشاء الموديل إذا لم يكن موجوداً
          const modelKey = `${productId}_${row.model_name}`;
          let modelId = existingModels.get(modelKey);
          if (!modelId) {
            const modelRef = await addDoc(collection(db, 'models'), {
              productId: productId,
              name: row.model_name,
              createdAt: serverTimestamp()
            });
            modelId = modelRef.id;
            existingModels.set(modelKey, modelId);
            modelsCreated++;
            addLog(`✅ تم إنشاء الموديل: ${row.model_name} (تابع لـ ${row.product_name})`, 'success');
          }
          
          // 3. إنشاء كود العطل الرئيسي إذا كان موجوداً في البيانات
          if (row.main_fault_code && row.main_fault_description) {
            const mainFaultKey = `${modelId}_${row.main_fault_code}`;
            let mainFaultId = existingMainFaults.get(mainFaultKey);
            if (!mainFaultId) {
              const mainFaultRef = await addDoc(collection(db, 'mainFaultCodes'), {
                modelId: modelId,
                code: row.main_fault_code,
                description: row.main_fault_description,
                createdAt: serverTimestamp()
              });
              mainFaultId = mainFaultRef.id;
              existingMainFaults.set(mainFaultKey, mainFaultId);
              mainFaultsCreated++;
              addLog(`✅ تم إنشاء كود العطل الرئيسي: ${row.main_fault_code} - ${row.main_fault_description.substring(0, 30)}...`, 'success');
            }
            
            // 4. إنشاء كود العطل الفرعي إذا كان موجوداً في البيانات
            if (row.sub_fault_code && row.sub_fault_description) {
              const subFaultKey = `${mainFaultId}_${row.sub_fault_code}`;
              if (!existingSubFaults.has(subFaultKey)) {
                await addDoc(collection(db, 'subFaultCodes'), {
                  mainFaultId: mainFaultId,
                  code: row.sub_fault_code,
                  description: row.sub_fault_description,
                  productCode: row.product_code || '',
                  createdAt: serverTimestamp()
                });
                existingSubFaults.add(subFaultKey);
                subFaultsCreated++;
                addLog(`✅ تم إنشاء كود العطل الفرعي: ${row.sub_fault_code} - ${row.sub_fault_description.substring(0, 30)}...${row.product_code ? ` (كود المنتج: ${row.product_code})` : ''}`, 'success');
              } else {
                addLog(`⚠️ كود العطل الفرعي ${row.sub_fault_code} موجود مسبقاً`, 'warning');
              }
            }
          }
          
        } catch (err) {
          errors.push(`${row.product_name} - ${row.model_name}: ${err.message}`);
          addLog(`❌ خطأ في استيراد: ${row.product_name} - ${row.model_name}: ${err.message}`, 'error');
        }
      }
      
      setImportStats({
        products: productsCreated,
        models: modelsCreated,
        mainFaults: mainFaultsCreated,
        subFaults: subFaultsCreated
      });
      
      addLog(`✅ تم اكتمال الاستيراد!`, 'success');
      addLog(`📦 المنتجات: تم إنشاء ${productsCreated} منتج جديد`, 'success');
      addLog(`🔧 الموديلات: تم إنشاء ${modelsCreated} موديل جديد`, 'success');
      addLog(`⚠️ أكواد الأعطال الرئيسية: تم إنشاء ${mainFaultsCreated} كود جديد`, 'success');
      addLog(`🔹 أكواد الأعطال الفرعية: تم إنشاء ${subFaultsCreated} كود جديد`, 'success');
      
      if (errors.length > 0) {
        addLog(`⚠️ عدد الأخطاء: ${errors.length}`, 'warning');
      }
      
      showSuccess(`تم استيراد ${previewData.length} صف بنجاح. تم إنشاء ${productsCreated} منتج، ${modelsCreated} موديل، ${mainFaultsCreated} كود رئيسي، ${subFaultsCreated} كود فرعي.`);
      
      setFile(null);
      setPreviewData([]);
      setShowPreview(false);
      document.getElementById('excelFileInput').value = '';
      
    } catch (error) {
      console.error('Import error:', error);
      addLog(`❌ خطأ عام في الاستيراد: ${error.message}`, 'error');
      showError("حدث خطأ أثناء عملية الاستيراد");
    }
    
    setLoading(false);
  };
  
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* شرح طريقة الاستيراد */}
      <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
        <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
          <Info size={18}/> تعليمات استيراد البيانات (5 مستويات)
        </h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li>قم بتحميل قالب Excel من الزر أدناه</li>
          <li>املأ البيانات في الأعمدة: product_name, model_name, main_fault_code, main_fault_description, sub_fault_code, sub_fault_description, product_code</li>
          <li>نفس المنتج يمكن أن يتكرر مع عدة موديلات</li>
          <li>نفس الموديل يمكن أن يتكرر مع عدة أكواد أعطال رئيسية</li>
          <li>نفس الكود الرئيسي يمكن أن يتكرر مع عدة أكواد فرعية</li>
          <li>كود المنتج (product_code) مرتبط بالكود الفرعي ويمكن إدخاله يدوياً</li>
          <li>البيانات المكررة لن تُضاف مرة أخرى (يتم تخطيها تلقائياً)</li>
        </ul>
      </div>
      
      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-teal-50 dark:bg-teal-900/30 p-3 rounded-xl text-center">
          <p className="text-xs text-teal-600 dark:text-teal-400">المنتجات</p>
          <p className="text-xl font-black">{importStats.products}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl text-center">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">الموديلات</p>
          <p className="text-xl font-black">{importStats.models}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl text-center">
          <p className="text-xs text-amber-600 dark:text-amber-400">أكواد رئيسية</p>
          <p className="text-xl font-black">{importStats.mainFaults}</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-xl text-center">
          <p className="text-xs text-purple-600 dark:text-purple-400">أكواد فرعية</p>
          <p className="text-xl font-black">{importStats.subFaults}</p>
        </div>
      </div>
      
      {/* أزرار التحميل والرفع */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={downloadTemplate}
          className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <Download size={18}/> تحميل قالب Excel (5 مستويات)
        </button>
        
        <label className="bg-teal-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-teal-700 transition-colors cursor-pointer flex items-center gap-2">
          <UploadCloud size={18}/> اختيار ملف
          <input
            type="file"
            id="excelFileInput"
            accept=".csv,.xlsx"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>
      
      {/* معاينة البيانات */}
      {showPreview && previewData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
            <h4 className="font-bold">معاينة البيانات المستوردة ({previewData.length} صف)</h4>
            <button
              onClick={() => setShowPreview(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              إلغاء
            </button>
          </div>
          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="p-2 text-right">المنتج</th>
                  <th className="p-2 text-right">الموديل</th>
                  <th className="p-2 text-right">الكود الرئيسي</th>
                  <th className="p-2 text-right">وصف الرئيسي</th>
                  <th className="p-2 text-right">الكود الفرعي</th>
                  <th className="p-2 text-right">وصف الفرعي</th>
                  <th className="p-2 text-right">كود المنتج</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {previewData.map((row, idx) => (
                  <tr key={idx}>
                    <td className="p-2 font-bold">{row.product_name}</td>
                    <td className="p-2">{row.model_name}</td>
                    <td className="p-2 font-mono text-amber-600">{row.main_fault_code || '-'}</td>
                    <td className="p-2 text-amber-600">{row.main_fault_description || '-'}</td>
                    <td className="p-2 font-mono text-purple-600">{row.sub_fault_code || '-'}</td>
                    <td className="p-2 text-purple-600">{row.sub_fault_description || '-'}</td>
                    <td className="p-2 font-mono text-teal-600">{row.product_code || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t bg-slate-50 dark:bg-slate-800">
            <button
              onClick={handleImport}
              disabled={loading}
              className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin"/> : <UploadCloud size={18}/>}
              {loading ? 'جاري الاستيراد...' : `تأكيد استيراد ${previewData.length} صف`}
            </button>
          </div>
        </div>
      )}
      
      {/* سجل العمليات */}
      {importLog.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
            <h4 className="font-bold">سجل الاستيراد</h4>
            <button
              onClick={() => setImportLog([])}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              مسح السجل
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-2 space-y-1 font-mono text-xs">
            {importLog.map((log, idx) => (
              <div key={idx} className={`p-2 rounded-lg ${getLogColor(log.type)}`}>
                <span className="text-slate-400 ml-2">[{log.timestamp}]</span>
                <span className="whitespace-pre-wrap">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* حالة التحميل */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
            <p className="text-lg font-bold">جاري استيراد البيانات...</p>
            <p className="text-sm text-slate-500">يرجى الانتظار، قد تستغرق العملية بضع ثوانٍ</p>
          </div>
        </div>
      )}
      
    </div>
  );
}


// ==========================================================================
// 🛡️ تنبيهات اقتراب انتهاء الضمان - Warranty Alerts View
// (ميزة جديدة: تتبع ضمان المنتجات المباعة وتنبيه العملاء/الإدارة قبل الانتهاء)
// ==========================================================================
