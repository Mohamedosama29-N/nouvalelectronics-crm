import {
  Webhook
} from 'lucide-react';

export const sendEmail = async (to, subject, body, attachments = [], webhookUrl = '') => {
  if (!webhookUrl) {
    console.warn('sendEmail: لم يتم ضبط رابط خدمة البريد (emailWebhookUrl) في الإعدادات');
    return false;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        body,
        attachments
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

// ==========================================================================
// 🔔 WEBHOOK NOTIFICATIONS (تنبيهات عامة عبر خدمات وسيطة مثل Zapier/Make/n8n)
// ==========================================================================

export const sendWebhookNotification = async (webhookUrl, payload) => {
  if (!webhookUrl) return false;
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch (error) {
    console.error('Webhook notification error:', error);
    return false;
  }
};

// ==========================================================================
// 💬 WHATSAPP INTEGRATION
// ==========================================================================

export const sendWhatsApp = (phone, message) => {
  const cleanPhone = phone.replace(/\D/g, '');
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

// ==========================================================================
// 🧾 توليد HTML للفاتورة (لإرسالها بالبريد الإلكتروني)
// ==========================================================================
// 🛠️ FIX (باگ حقيقي): الدالة دي كانت بتتنادى من زرار "إرسال بالبريد
// الإلكتروني" في شاشة الفاتورة (InvoiceRenderer) من غير ما تكون معرّفة في
// أي مكان في الكود كله - يعني الميزة دي كانت بترمي خطأ (ReferenceError)
// وتفشل تمامًا كل مرة حد يدوس عليها. دلوقتي اتعرّفت بشكل بسيط يبني جدول
// HTML للأصناف والإجمالي عشان يتبعت فعليًا في متن البريد.
export const generateInvoiceHTML = (data, systemSettings = {}) => {
  const items = data.items || [];
  const rows = items.map((item) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.name || ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity || 1}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:left;">${(Number(item.price) || 0).toLocaleString()} ج</td>
    </tr>
  `).join('');

  const finalTotal = data.finalTotal ?? data.total ?? 0;

  return `
    <div style="font-family: Tahoma, Arial, sans-serif; direction: rtl; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom:4px;">${systemSettings.storeName || systemSettings.systemName || ''}</h2>
      <p style="color:#555;margin-top:0;">فاتورة رقم ${data.invoiceNumber || '-'}</p>
      <p style="color:#555;">العميل: ${data.customerName || '-'} ${data.phone ? `- ${data.phone}` : ''}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:6px 8px;text-align:right;">الصنف</th>
            <th style="padding:6px 8px;text-align:center;">الكمية</th>
            <th style="padding:6px 8px;text-align:left;">السعر</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="text-align:left;font-weight:bold;margin-top:12px;">الإجمالي: ${Number(finalTotal).toLocaleString()} ج</p>
      ${systemSettings.footerText ? `<p style="color:#888;font-size:12px;">${systemSettings.footerText}</p>` : ''}
    </div>
  `;
};

// ==========================================================================
// 🔑 API KEYS MANAGEMENT
// ==========================================================================
