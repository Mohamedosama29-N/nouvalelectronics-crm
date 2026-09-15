import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Webhook
} from 'lucide-react';

export const exportToPDF = async (data, title, headers) => {
  const doc = new jsPDF();
  
  doc.setFont('cairo', 'normal');
  doc.setFontSize(20);
  doc.text(title, 105, 15, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(`تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}`, 105, 25, { align: 'center' });
  
  autoTable(doc, {
    head: [headers],
    body: data.map(row => headers.map(h => row[h] || '-')),
    theme: 'striped',
    styles: { 
      font: 'cairo', 
      halign: 'right',
      fontSize: 8,
      cellPadding: 3
    },
    headStyles: { 
      fillColor: [79, 70, 229],
      textColor: 255,
      fontSize: 9
    },
    margin: { top: 35 }
  });
  
  doc.save(`${title}_${new Date().toISOString().split('T')[0]}.pdf`);
};

// ==========================================================================
// 📧 EMAIL SERVICE
// ==========================================================================
// ✨ FIX: كان الرابط هنا نص وهمي ثابت 'YOUR_EMAIL_API_ENDPOINT' لم يتم ضبطه
// أبدًا، فكل محاولة إرسال بريد كانت تفشل بصمت (والواجهة كانت تعرض "تم
// الإرسال بنجاح" دايمًا بغض النظر عن النتيجة الحقيقية). دلوقتي بيستخدم
// رابط Webhook قابل للإعداد من الإعدادات (نفس أسلوب تنبيهات النواقص)
// بدل رابط وهمي أبدًا لن يعمل.
