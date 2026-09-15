# الفاتورة الإلكترونية الضريبية (ETA) — دليل الإعداد

## اللي جاهز ومتأكد منه ✅
- **المصادقة (OAuth2)**: `functions/eta/auth.js` — بيطلب توكن من خدمة هوية
  ETA (client_credentials grant) وبيكاشه لحد قبل انتهاء صلاحيته بدقيقتين.
  الـ endpoints والنمط ده موثقين ومتفق عليهم في كل المصادر الرسمية وغير
  الرسمية اللي راجعتها.
- **الإرسال**: `functions/eta/submit.js` — بيبعت المستند لـ
  `POST /api/v1.0/documentsubmissions` ويستقبل `submissionUUID`.
- **البنية الأمنية**: كل حاجة بتتم من Cloud Function (`functions/index.js`)،
  مش من المتصفح مباشرة — المفاتيح السرية (Client Secret) وأي شهادة توقيع
  محتاجين يفضلوا سيرفر-سايد بالكامل. الواجهة (`InvoiceRenderer.jsx`) بس
  بتنادي الـ function وتعرض الحالة، من غير ما تشوف أي سر.
- **Firestore**: كوليكشن جديد `einvoices/{transactionId}` بيتابع حالة كل
  فاتورة (`building → submitted → pending_clearance → cleared/failed`).
  الكتابة فيه ممنوعة من المتصفح تمامًا (`firestore.rules`) - بس الـ Cloud
  Function (Admin SDK) اللي بيكتب فيه.

## اللي لسه STUB ومحتاج منكم ⚠️
`functions/eta/documentBuilder.js` — شكل مستند الفاتورة نفسه (أسماء
الحقول، الحالات الفرعية الإجبارية، كود الصنف GS1/EGS، خوارزمية التوقيع
الرقمي X.509) **مش منشور علنًا**. المصلحة بتنشره بس عن طريق:

1. الدخول على بيئة الـ **Sandbox** (`id.preprod.eta.gov.eg`) بحساباتكم
   الفعلية.
2. استدعاء `GET /api/v1/documenttypes/{type}/version/{version}` عشان
   تجيبوا الـ schema الدقيق.
3. تشغيل **أداة التوقيع الرسمية (Integration Toolkit)** اللي المفروض
   جاتلكم مع التسجيل (Docker/NuGet/CLI) — التوقيع بشهادة X.509 مش عملية
   ممكن تتعمل بجافاسكريبت عادي، غالبًا محتاجة الأداة دي تشتغل كـ
   service/sidecar منفصل يتنادي من الـ Cloud Function، أو نستخدم مكتبة
   رسمية لو موفرينها بلغة تدعمها Node.js.

**ابعتولي استجابة الخطوة 2 (أو الصقوها هنا)** وأنا أظبط
`documentBuilder.js` على الشكل الصحيح فعليًا، بدل التخمين في حاجة ضريبية.

## خطوات التفعيل (بعد ما documentBuilder.js يتظبط)
```bash
cd functions
npm install
firebase functions:secrets:set ETA_CLIENT_ID
firebase functions:secrets:set ETA_CLIENT_SECRET
firebase deploy --only functions
```
بعدين في `settings/general` على Firestore، ضيفوا:
```json
{
  "eta": {
    "enabled": true,
    "issuerInfo": { "taxRegistrationNumber": "...", "name": "...", "address": "..." },
    "branchInfo": { "activityCode": "..." }
  }
}
```
زرار "إرسال للفاتورة الضريبية" في شاشة الفاتورة (`InvoiceRenderer.jsx`)
هيظهر بس بعد ما `eta.enabled = true` — مقصود عشان محدش يستخدمها قبل
التأكد إنها شغالة فعليًا على بيئة الـ Sandbox.

## اختبار قبل الإنتاج
- خلوا `ETA_ENV=preprod` (القيمة الافتراضية) لحد ما تتأكدوا إن فاتورة
  تجريبية بتتقبل (`cleared`) فعليًا على بيئة الـ Sandbox.
- **متحولوش لـ `production` إلا بعد اختبار حقيقي** — المفاتيح مختلفة
  تمامًا بين البيئتين.
