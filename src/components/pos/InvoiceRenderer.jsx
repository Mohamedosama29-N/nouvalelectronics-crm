import React, { useEffect, useRef, useState } from 'react';
import html2canvas from "html2canvas";
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  ArrowRightLeft,
  Printer,
  Mail,
  MessageCircle,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useTheme } from '../common/ThemeProvider';
import { showError, showSuccess } from '../../utils/alerts';
import { sendEmail, sendWhatsApp, generateInvoiceHTML } from '../../utils/communications';
import { formatDate } from '../../utils/format';
import { db, functions } from '../../firebase/config';

export function InvoiceRenderer({ data, systemSettings, onBack }) {
  const {} = useTheme();
  const printRef = useRef();

  // 🆕 حالة إرسال الفاتورة الضريبية لمصلحة الضرائب (ETA) - بتتابع مستند
  // einvoices/{id} اللي بتكتبه الـ Cloud Function submitInvoiceToETA فقط.
  const [etaStatus, setEtaStatus] = useState(null);
  const [etaSubmitting, setEtaSubmitting] = useState(false);

  useEffect(() => {
    if (!data?.id) return;
    const unsub = onSnapshot(doc(db, 'einvoices', data.id), (snap) => {
      setEtaStatus(snap.exists() ? snap.data() : null);
    });
    return () => unsub();
  }, [data?.id]);

  const handleSubmitToETA = async () => {
    if (!data?.id) {
      showError('لا يمكن إرسال الفاتورة لمصلحة الضرائب قبل حفظها');
      return;
    }
    setEtaSubmitting(true);
    try {
      const submit = httpsCallable(functions, 'submitInvoiceToETA');
      await submit({ invoiceId: data.id });
      showSuccess('تم إرسال الفاتورة لمصلحة الضرائب - جاري المعالجة');
    } catch (error) {
      showError(`فشل الإرسال لمصلحة الضرائب: ${error?.message || error}`);
    } finally {
      setEtaSubmitting(false);
    }
  };

  // تصدير الفاتورة كصورة
  const exportInvoiceImage = async () => {
    const element = document.getElementById("invoice-print");
    if (!element) return;
    const canvas = await html2canvas(element);
    const image = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = image;
    link.download = `invoice-${data.invoiceNumber}.png`;
    link.click();
  };

  useEffect(() => { 
    const timer = setTimeout(() => window.print(), 800); 
    return () => clearTimeout(timer);
  }, [data]);
  
  const template = systemSettings.invoiceTemplate || {
    showLogo: true,
    showStoreName: true,
    showCustomerInfo: true,
    showItems: true,
    showFooter: true,
    showPaymentMethod: true,
    showNotes: true,
    showTechnician: true,
    fontSize: 'normal',
    paperSize: '80mm'
  };

  const getPaperWidth = () => {
    switch(template.paperSize) {
      case '58mm': return 'max-w-[58mm]';
      case '80mm': return 'max-w-[80mm]';
      case 'A4': return 'max-w-[210mm]';
      default: return 'max-w-[80mm]';
    }
  };

  const getFontSize = () => {
    switch(template.fontSize) {
      case 'small': return 'text-xs';
      case 'large': return 'text-lg';
      default: return 'text-sm';
    }
  };

  const formatCurrency = (value) => {
    return Number(value || 0).toLocaleString() + ' ج.م';
  };

  // ✅ حساب الإجمالي النهائي (شامل الضريبة والرسوم والخدمات)
  const finalTotal = Number(data.finalTotal) || 0;

  // ✅ حساب إجمالي القطع (للعلم فقط - لا يظهر في الفاتورة)
  const itemsTotal = (data.items || []).reduce((sum, item) => {
    if (item.isService) return sum;
    const price = item.underWarranty ? 0 : (Number(item.price) || 0);
    return sum + (price * (item.quantity || 1));
  }, 0);

  // ✅ حساب الخدمات (للعلم فقط - لا يظهر في الفاتورة)
  const servicesTotal = (data.items || []).reduce((sum, item) => {
    if (!item.isService) return sum;
    return sum + ((Number(item.price) || 0) * (item.quantity || 1));
  }, 0);

  const handleSendWhatsApp = () => {
    if (data.phone) {
      const message = `فاتورة رقم ${data.invoiceNumber}\n`;
      const itemsText = (data.items || []).map(item => 
        `- ${item.name} × ${item.quantity || 1}`
      ).join('\n');
      sendWhatsApp(data.phone, message + itemsText + `\nالإجمالي: ${finalTotal} ج`);
    }
  };

  const handleSendEmail = async () => {
    if (data.email) {
      const html = generateInvoiceHTML(data, systemSettings);
      const webhookUrl = systemSettings.emailWebhookUrl || '';
      const sent = await sendEmail(data.email, `فاتورة رقم ${data.invoiceNumber}`, html, [], webhookUrl);
      if (sent) {
        showSuccess("تم إرسال الفاتورة إلى البريد الإلكتروني");
      } else {
        showError("فشل إرسال البريد الإلكتروني. تأكد من ضبط رابط خدمة البريد في الإعدادات");
      }
    }
  };

  return (
    <div id="invoice-print" className="flex justify-center p-6 bg-slate-100 dark:bg-slate-900 min-h-full" dir="rtl">
      <div ref={printRef} className={`bg-white dark:bg-slate-800 ${getPaperWidth()} w-full p-6 text-black dark:text-white border shadow-lg print:shadow-none print:border-none print:m-0 ${getFontSize()}`}>
        
        {/* ===== الشعار واسم المتجر ===== */}
        {template.showLogo && systemSettings.invoiceLogo && (
          <div className="text-center mb-4">
            <img src={systemSettings.invoiceLogo} alt="Logo" className="max-h-16 mx-auto" crossOrigin="anonymous" />
          </div>
        )}

        {template.showStoreName && (
          <div className="text-center border-b border-black dark:border-white border-dashed pb-4 mb-4">
            <h1 className="font-black text-xl">{systemSettings.storeName}</h1>
            <p className="text-[11px] font-bold mt-1">فاتورة مبيعات #{data.invoiceNumber}</p>
            <p className="text-[10px] mt-1 text-gray-600 dark:text-gray-400">{formatDate(data.date)}</p>
          </div>
        )}

        {/* ===== معلومات العميل ===== */}
        {template.showCustomerInfo && (
          <div className="text-[11px] mb-4 space-y-1.5 font-bold text-right">
            <div className="flex justify-between"><span>العميل:</span><span>{data.customerName}</span></div>
            <div className="flex justify-between"><span>الهاتف:</span><span dir="ltr">{data.phone || '-'}</span></div>
            {data.technicianName && <div className="flex justify-between"><span>الفني المختص:</span><span>{data.technicianName}</span></div>}
            {/* 🛠️ FIX: كان بيعرض data.ticketId وهو الـ Firestore document ID
                الخام (سلسلة عشوائية طويلة زي مشفّرة)، بدل رقم التذكرة
                الحقيقي المقروء (TKT-000123) الموجود في data.ticketNumber */}
            {(data.ticketNumber || data.ticketId) && <div className="flex justify-between"><span>رقم التذكرة:</span><span>{data.ticketNumber || data.ticketId}</span></div>}
            <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>الكاشير:</span><span>{data.operator}</span></div>
            {data.notes && <div className="text-[9px] text-gray-500 dark:text-gray-500 mt-2">{data.notes}</div>}
          </div>
        )}

        {/* ===== جدول الأصناف (اسم + كمية فقط) ===== */}
        {template.showItems && (data.items || []).length > 0 && (
          <table className="w-full text-[11px] border-y border-black dark:border-white border-dashed py-2 mb-4 text-right">
            <thead>
              <tr className="font-bold border-b border-gray-300 dark:border-gray-600">
                <th className="pb-2 text-right">الصنف</th>
                <th className="pb-2 text-center">الكمية</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).filter(item => !item.isService).map((item, idx) => (
                <tr key={idx}>
                  <td className="py-2 text-right font-bold">
                    {item.name}
                    <br/>
                    <span className="text-[9px] font-mono text-gray-500 dark:text-gray-500 mt-0.5 block">{item.serialNumber}</span>
                  </td>
                  <td className="text-center py-2 font-bold">{item.quantity || 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ===== الإجمالي النهائي فقط (شامل الضريبة والرسوم) ===== */}
        <div className="text-center border-t-2 border-black dark:border-white pt-4 mb-4">
          <div className="flex justify-between text-[16px] font-black">
            <span>الإجمالي شامل الضريبة:</span>
            <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(finalTotal)}</span>
          </div>
          
          {/* ===== طريقة الدفع ===== */}
          {template.showPaymentMethod && data.paymentMethod && (
            <div className="flex justify-between text-[10px] text-gray-600 dark:text-gray-400 mt-2">
              <span>طريقة الدفع:</span>
              <span>
                {data.paymentMethod === 'cash' ? 'نقداً' : 
                 data.paymentMethod === 'card' ? 'بطاقة' : 
                 data.paymentMethod === 'transfer' ? 'تحويل' : data.paymentMethod}
              </span>
            </div>
          )}
        </div>

        {/* ===== التذييل ===== */}
        {template.showFooter && (
          <div className="text-center text-[9px] font-bold italic text-gray-700 dark:text-gray-400 leading-relaxed border-t border-black dark:border-white border-dashed pt-4">
            <p>{systemSettings.footerText || 'شكراً لتعاملكم معنا'}</p>
          </div>
        )}

        {/* ===== أزرار الإجراءات ===== */}
        <div className="mt-8 flex flex-wrap gap-2 print:hidden">
          <button onClick={() => window.print()} className="flex-1 bg-black text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-gray-800">
            <Printer size={16}/> طباعة
          </button>
          <button onClick={exportInvoiceImage} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-indigo-700">
            تحميل صورة
          </button>
          {data.phone && (
            <button onClick={handleSendWhatsApp} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-green-700">
              <MessageCircle size={16}/> واتساب
            </button>
          )}
          {data.email && (
            <button onClick={handleSendEmail} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-blue-700">
              <Mail size={16}/> بريد
            </button>
          )}
          <button onClick={onBack} className="flex-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-slate-300 dark:hover:bg-slate-600">
            <ArrowRightLeft size={16}/> إغلاق
          </button>
        </div>

        {/* ===== الفاتورة الضريبية الإلكترونية (ETA) =====
            🛑 مخفي افتراضيًا خلف systemSettings.eta?.enabled لحد ما يتم
            تأكيد شكل مستند ETA الصحيح (راجع functions/eta/documentBuilder.js).
            فعّلها من الإعدادات بس بعد التأكد إن الإرسال الفعلي شغال صح على
            بيئة الـ Sandbox. */}
        {systemSettings?.eta?.enabled && (
          <div className="mt-3 print:hidden">
            {!etaStatus && (
              <button
                onClick={handleSubmitToETA}
                disabled={etaSubmitting || !data?.id}
                className="w-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
              >
                {etaSubmitting ? <Loader2 size={16} className="animate-spin"/> : <FileText size={16}/>}
                {etaSubmitting ? 'جاري الإرسال...' : 'إرسال للفاتورة الضريبية'}
              </button>
            )}
            {etaStatus?.status && etaStatus.status !== 'failed' && (
              <div className="w-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm">
                <CheckCircle2 size={16}/> حالة ETA: {etaStatus.status}
              </div>
            )}
            {etaStatus?.status === 'failed' && (
              <div className="w-full bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm" title={etaStatus.error}>
                <XCircle size={16}/> فشل الإرسال - راجع السجل
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// ==========================================================================
// 📝 مدير قالب الفاتورة
// ==========================================================================
