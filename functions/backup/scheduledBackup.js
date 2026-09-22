import { onSchedule } from 'firebase-functions/v2/scheduler';
import pkg from '@google-cloud/firestore';
import { logger } from 'firebase-functions';

// 🛠️ FIX: الاستيراد المسمّى { v1 } من @google-cloud/firestore (حزمة
// CommonJS) مش مضمون يشتغل بشكل موثوق مع ESM - اتأكد ده فعليًا بمحاولة
// تحميل حقيقية للملف رجّعت بالظبط الخطأ ده. الاستيراد الافتراضي بعده
// استخراج v1 هو الطريقة الموصى بيها من Node نفسه لما بيحصل الموقف ده.
const { v1 } = pkg;

// 🛠️ FIX: إنشاء عميل Firestore Admin (اتصال gRPC) كان بيحصل وقت تحميل
// الملف نفسه (خارج الفانكشن) - ده بالظبط اللي بيسبب خطأ النشر "Cannot
// determine backend specification. Timeout after 10000" لأن أداة Firebase
// بتحمّل كل ملفات الفانكشنز وتحللها وقت النشر، ولو ملف فيه تهيئة تقيلة
// على المستوى العام ده بياخد وقت طويل أو يعلّق، العملية كلها بتفشل بتايم
// آوت. الحل الموصى بيه من جوجل نفسها (رابط موجود في رسالة الخطأ): تأجيل
// أي تهيئة تقيلة لحد ما الفانكشن فعليًا تتنفذ، مش وقت تحميل الملف.
let firestoreAdminClient = null;
const getFirestoreAdminClient = () => {
  if (!firestoreAdminClient) {
    firestoreAdminClient = new v1.FirestoreAdminClient();
  }
  return firestoreAdminClient;
};

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
// ⚠️ قبل التفعيل، لازم خطوة واحدة بس:
//   تدّوا الـ service account بتاع Cloud Functions صلاحية
//   "Cloud Datastore Import Export Admin" من IAM في Google Cloud Console.
//   (مفيش حاجة تانية مطلوبة - بيستخدم bucket التخزين الافتراضي بتاع
//   المشروع نفسه تلقائيًا، تقدروا تغيروه بمتغير بيئة BACKUP_BUCKET لو
//   حابين تستخدموا bucket مخصص بدل الافتراضي).
const getBackupBucket = (projectId) =>
  process.env.BACKUP_BUCKET || `gs://${projectId}.appspot.com`;

export const scheduledFirestoreBackup = onSchedule(
  {
    schedule: 'every day 03:00', // بتوقيت السيرفر (UTC) - عدّلها لو حابب توقيت تاني
    timeZone: 'Africa/Cairo',
    region: 'europe-west1',
    retryCount: 2,
  },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    const firestoreAdminClient = getFirestoreAdminClient();
    const databaseName = firestoreAdminClient.databasePath(projectId, '(default)');
    const backupBucket = getBackupBucket(projectId);

    try {
      const [operation] = await firestoreAdminClient.exportDocuments({
        name: databaseName,
        outputUriPrefix: `${backupBucket}/${new Date().toISOString().split('T')[0]}`,
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
