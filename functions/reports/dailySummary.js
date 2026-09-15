import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

// ==========================================================================
// 📊 تقرير يومي مجدول - بيتبعت على webhook البريد المضبوط في الإعدادات
// ==========================================================================
// نفس آلية الإرسال المستخدمة في باقي التطبيق (utils/communications.js
// sendEmail) - webhook قابل للتخصيص (Zapier/Make/n8n/أي endpoint بيستقبل
// {to, subject, body}) بدل ما نربط مباشرة بمزود بريد معين.
//
// ⚠️ التقرير هيتبعت بس لو:
//   1. settings/general.emailWebhookUrl مضبوط.
//   2. settings/general.dailyReportRecipients فيها إيميل واحد على الأقل.
export const dailySummaryReport = onSchedule(
  {
    schedule: 'every day 08:00',
    timeZone: 'Africa/Cairo',
    region: 'europe-west1',
  },
  async () => {
    const db = getFirestore();
    const settingsSnap = await db.collection('settings').doc('general').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};

    const webhookUrl = settings.emailWebhookUrl;
    const recipients = settings.dailyReportRecipients || [];
    if (!webhookUrl || recipients.length === 0) {
      logger.info('التقرير اليومي متخطى - مفيش webhook أو مستلمين مضبوطين');
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const salesSnap = await db.collection('transactions')
      .where('type', '==', 'sell')
      .where('timestamp', '>=', Timestamp.fromDate(yesterday))
      .where('timestamp', '<', Timestamp.fromDate(todayStart))
      .get();

    let totalRevenue = 0;
    salesSnap.docs.forEach((d) => {
      totalRevenue += Number(d.data().finalTotal || d.data().total || 0);
    });

    const newTicketsSnap = await db.collection('tickets')
      .where('createdAt', '>=', Timestamp.fromDate(yesterday))
      .where('createdAt', '<', Timestamp.fromDate(todayStart))
      .get();

    const dateLabel = yesterday.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const body = `
      <h2>ملخص يوم ${dateLabel}</h2>
      <p>عدد الفواتير: ${salesSnap.size}</p>
      <p>إجمالي المبيعات: ${totalRevenue.toLocaleString()} ج</p>
      <p>تذاكر صيانة جديدة: ${newTicketsSnap.size}</p>
    `;

    await Promise.all(recipients.map((to) =>
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject: `الملخص اليومي - ${dateLabel}`, body }),
      })
    ));

    logger.info(`تم إرسال التقرير اليومي لـ ${recipients.length} مستلم`);
  }
);
