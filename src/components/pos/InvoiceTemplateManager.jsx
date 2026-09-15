import React, { useState, useEffect, useRef } from 'react';
import {
  doc, setDoc
} from 'firebase/firestore';
import {
  Save,
  Printer as PrinterIcon
} from 'lucide-react';
import { db } from '../../firebase/config';
import { showError, showSuccess } from '../../utils/alerts';

export function InvoiceTemplateManager({ systemSettings, setSettings }) {
  const [template, setTemplate] = useState(systemSettings.invoiceTemplate || {
    showLogo: true,
    showStoreName: true,
    showCustomerInfo: true,
    showItems: true,
    showPrices: true,
    showDiscount: true,
    showTax: true,
    showFees: true,
    showFooter: true,
    showPaymentMethod: true,
    showNotes: true,
    showTechnician: true,
    fontSize: 'normal',
    paperSize: '80mm'
  });

  // 🛠️ FIX: نفس مشكلة SettingsManager - template المحلي كان بياخد نسخة
  // وقت أول رندر بس وميتزامنش مع أي تحديث لاحق في systemSettings.
  const lastSyncedRef = useRef(systemSettings.invoiceTemplate);
  useEffect(() => {
    if (JSON.stringify(template) === JSON.stringify(lastSyncedRef.current)) {
      setTemplate(systemSettings.invoiceTemplate || template);
    }
    lastSyncedRef.current = systemSettings.invoiceTemplate;
  }, [systemSettings.invoiceTemplate]);

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'settings', 'general'), {
        invoiceTemplate: template
      }, { merge: true });
      setSettings({...systemSettings, invoiceTemplate: template});
      showSuccess("تم حفظ قالب الفاتورة بنجاح");
    } catch (error) {
      console.error("Error saving template:", error);
      showError("حدث خطأ أثناء حفظ القالب");
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
      <h3 className="font-black text-lg mb-6 text-slate-800 dark:text-white flex items-center gap-2">
        <PrinterIcon className="text-teal-600" size={20}/> تخصيص شكل الفاتورة
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="font-bold text-sm text-slate-600 dark:text-slate-400 border-b pb-2">عناصر الفاتورة</h4>
          
          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showLogo} onChange={e => setTemplate({...template, showLogo: e.target.checked})} />
            <span className="text-xs font-bold">عرض الشعار</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showStoreName} onChange={e => setTemplate({...template, showStoreName: e.target.checked})} />
            <span className="text-xs font-bold">عرض اسم المتجر</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showCustomerInfo} onChange={e => setTemplate({...template, showCustomerInfo: e.target.checked})} />
            <span className="text-xs font-bold">عرض معلومات العميل</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showItems} onChange={e => setTemplate({...template, showItems: e.target.checked})} />
            <span className="text-xs font-bold">عرض الأصناف</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showPrices} onChange={e => setTemplate({...template, showPrices: e.target.checked})} />
            <span className="text-xs font-bold">عرض الأسعار</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showDiscount} onChange={e => setTemplate({...template, showDiscount: e.target.checked})} />
            <span className="text-xs font-bold">عرض الخصم</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showTax} onChange={e => setTemplate({...template, showTax: e.target.checked})} />
            <span className="text-xs font-bold">عرض الضريبة</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showFees} onChange={e => setTemplate({...template, showFees: e.target.checked})} />
            <span className="text-xs font-bold">عرض الرسوم الإضافية</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showFooter} onChange={e => setTemplate({...template, showFooter: e.target.checked})} />
            <span className="text-xs font-bold">عرض تذييل الفاتورة</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showPaymentMethod} onChange={e => setTemplate({...template, showPaymentMethod: e.target.checked})} />
            <span className="text-xs font-bold">عرض طريقة الدفع</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showNotes} onChange={e => setTemplate({...template, showNotes: e.target.checked})} />
            <span className="text-xs font-bold">عرض الملاحظات</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={template.showTechnician} onChange={e => setTemplate({...template, showTechnician: e.target.checked})} />
            <span className="text-xs font-bold">عرض اسم الفني</span>
          </label>
        </div>

        <div className="space-y-4">
          <h4 className="font-bold text-sm text-slate-600 dark:text-slate-400 border-b pb-2">إعدادات الطباعة</h4>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">حجم الخط</label>
            <select className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-teal-500 text-sm bg-white dark:bg-slate-900" value={template.fontSize} onChange={e => setTemplate({...template, fontSize: e.target.value})}>
              <option value="small">صغير</option>
              <option value="normal">عادي</option>
              <option value="large">كبير</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">حجم الورق</label>
            <select className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-teal-500 text-sm bg-white dark:bg-slate-900" value={template.paperSize} onChange={e => setTemplate({...template, paperSize: e.target.value})}>
              <option value="58mm">58 مم (فاتورة صغيرة)</option>
              <option value="80mm">80 مم (فاتورة عادية)</option>
              <option value="A4">A4</option>
            </select>
          </div>

          <div className="mt-6 p-4 bg-teal-50 dark:bg-teal-900/30 rounded-xl border border-teal-100 dark:border-teal-800">
            <h5 className="font-bold text-xs text-teal-900 dark:text-teal-300 mb-2">معاينة سريعة</h5>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-lg text-[10px]">
              <p className="font-black text-center">{systemSettings.storeName}</p>
              {template.showItems && (
                <div className="border-t border-dashed my-2 pt-2">
                  <p>منتج 1 ........ 100 ج</p>
                  <p>منتج 2 ........ 200 ج</p>
                </div>
              )}
              {template.showPrices && <p className="font-black mt-2">الإجمالي: 300 ج</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={handleSave} className="bg-teal-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-teal-700 transition-colors flex items-center gap-2">
          <Save size={16}/> حفظ قالب الفاتورة
        </button>
      </div>
    </div>
  );
}

// ==========================================================================
// 📊 لوحة التحكم المحسنة مع إحصائيات متقدمة
// ==========================================================================
