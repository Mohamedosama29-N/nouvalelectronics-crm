import { onSchedule } from 'firebase-functions/v2/scheduler';
import { v1 } from '@google-cloud/firestore';
import { logger } from 'firebase-functions';

const firestoreAdminClient = new v1.FirestoreAdminClient();

// ==========================================================================
// 💾 نسخ احتياطي تلقائي يومي لقاعدة البيانات كاملة
// ==========================================================================
// بيستخدم "Managed Export" الرسمي بتاع Firestore (مش قراءة كل مستند
// يدويًا زي getAllDocs في الواجهة) - ده الأسلوب الموصى بيه من جوجل نفسها
// لأنه:
//   - مش محدود بحجم الذاكرة/وقت تنفيذ الـ function حتى لو قاعدة البيانات
//     كبرت جدًا مستقبلًا.
//   - بيحافظ على نوع البيانات بالظبط (Timestamps, References...) بدل
//     تحويلها لـ JSON عادي.
//   - ممكن تستخدمه لاستعادة قاعدة البيانات كاملة بأمر واحد لو احتجت.
//
// ⚠️ قبل التفعيل، لازم:
//   1. تنشئوا Cloud Storage bucket مخصص للنسخ الاحتياطية (أو تستخدموا
//      الافتراضي بتاع المشروع).
//   2. تدّوا الـ service account بتاع Cloud Functions صلاحية
//      "Cloud Datastore Import Export Admin" من IAM في Google Cloud Console.
//   3. تظبطوا BACKUP_BUCKET تحت كمتغير بيئة أو تغيروه هنا مباشرة.
const BACKUP_BUCKET = process.env.BACKUP_BUCKET || 'gs://YOUR_PROJECT_ID-backups';

export const scheduledFirestoreBackup = onSchedule(
  {
    schedule: 'every day 03:00', // بتوقيت السيرفر (UTC) - عدّلها لو حابب توقيت تاني
    timeZone: 'Africa/Cairo',
    region: 'europe-west1',
    retryCount: 2,
  },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    const databaseName = firestoreAdminClient.databasePath(projectId, '(default)');

    try {
      const [operation] = await firestoreAdminClient.exportDocuments({
        name: databaseName,
        outputUriPrefix: `${BACKUP_BUCKET}/${new Date().toISOString().split('T')[0]}`,
        // فاضية = كل الكوليكشنز. لو حابب تستثني كوليكشن معين (زي activity_logs
        // الكبيرة نسبيًا)، ضيف اسمه في مصفوفة الاستثناء بدل كده.
        collectionIds: [],
      });
      logger.info('بدأ النسخ الاحتياطي بنجاح', { operationName: operation.name });
    } catch (error) {
      logger.error('فشل النسخ الاحتياطي التلقائي', error);
      throw error; // يخلي retryCount يشتغل
    }
  }
);
