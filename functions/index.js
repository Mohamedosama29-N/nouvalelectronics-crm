import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { getETAAccessToken } from './eta/auth.js';
import { buildETADocument } from './eta/documentBuilder.js';
import { submitETADocument } from './eta/submit.js';

export { onNewTicket, onLowStockCrossed } from './notifications/triggers.js';
export { scheduledFirestoreBackup } from './backup/scheduledBackup.js';
export { dailySummaryReport } from './reports/dailySummary.js';

initializeApp();
const db = getFirestore();

// 🔐 الأسرار دي بتتحط عن طريق:
//   firebase functions:secrets:set ETA_CLIENT_ID
//   firebase functions:secrets:set ETA_CLIENT_SECRET
// أبدًا متتحطش في .env بتاع الواجهة (Vite) لأنه بيوصل للمتصفح.
const ETA_CLIENT_ID = defineSecret('ETA_CLIENT_ID');
const ETA_CLIENT_SECRET = defineSecret('ETA_CLIENT_SECRET');
// 'preprod' وقت الاختبار، غيّرها لـ 'production' لما تتأكدوا إن كل حاجة شغالة
const ETA_ENV = process.env.ETA_ENV || 'preprod';

// ==========================================================================
// 📞 submitInvoiceToETA — يتنادى من الواجهة عن طريق httpsCallable
// ==========================================================================
// بياخد invoiceId بس، بيقرأ باقي البيانات من Firestore بنفسه (بدل ما
// يثق في أي بيانات جاية من المتصفح مباشرة - أمان أساسي).
export const submitInvoiceToETA = onCall(
  { secrets: [ETA_CLIENT_ID, ETA_CLIENT_SECRET], region: 'europe-west1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'لازم تسجل دخول الأول');
    }

    const { invoiceId } = request.data || {};
    if (!invoiceId) {
      throw new HttpsError('invalid-argument', 'invoiceId مطلوب');
    }

    const invoiceRef = db.collection('transactions').doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) {
      throw new HttpsError('not-found', 'الفاتورة غير موجودة');
    }
    const invoice = invoiceSnap.data();

    // إعدادات المنشأة (الرقم الضريبي، بيانات الفرع) لازم تتحط في
    // settings/general أو مستند مخصص - حسب هيكلة بياناتكم الفعلية.
    const settingsSnap = await db.collection('settings').doc('general').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};

    const einvoiceRef = db.collection('einvoices').doc(invoiceId);

    try {
      await einvoiceRef.set({
        invoiceId,
        status: 'building',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // ⚠️ لسه STUB - راجع functions/eta/documentBuilder.js
      const document = buildETADocument(invoice, {
        issuerInfo: settings.eta?.issuerInfo,
        branchInfo: settings.eta?.branchInfo,
      });

      const accessToken = await getETAAccessToken({
        clientId: ETA_CLIENT_ID.value(),
        clientSecret: ETA_CLIENT_SECRET.value(),
        env: ETA_ENV,
      });

      await einvoiceRef.set({ status: 'submitted', updatedAt: FieldValue.serverTimestamp() }, { merge: true });

      const result = await submitETADocument(document, { accessToken, env: ETA_ENV });

      await einvoiceRef.set({
        status: 'pending_clearance',
        submissionUUID: result?.submissionUUID || null,
        rawResponse: result,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { success: true, submissionUUID: result?.submissionUUID || null };
    } catch (error) {
      await einvoiceRef.set({
        status: 'failed',
        error: String(error?.message || error),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw new HttpsError('internal', `فشل إرسال الفاتورة: ${error?.message || error}`);
    }
  }
);
