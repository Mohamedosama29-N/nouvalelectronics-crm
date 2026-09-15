// ==========================================================================
// 🧾 بناء مستند الفاتورة بصيغة ETA
// ==========================================================================
// ⚠️ الجزء ده لسه STUB (هيكل تقريبي) ومحتاج تأكيد قبل أي استخدام فعلي.
//
// السبب: الشكل الدقيق لمستند الفاتورة (أسماء الحقول بالحرف، الحروف
// الكبيرة/الصغيرة، الحقول الفرعية الإجبارية، وخوارزمية التوقيع الرقمي
// X.509/eSeal) مش منشورة في أي مكان عام - المصلحة بتنشرها بس من خلال:
//
//   1. GET /api/v1/documenttypes/{type}/version/{version}
//      على بيئة الـ Sandbox (بعد ما تتوصل بحساباتكم الفعلية) - ده بيرجع
//      الـ schema الدقيق المطلوب.
//   2. أداة التوقيع الرقمي (Integration Toolkit) اللي المصلحة بتوفرها
//      (Docker / NuGet / CLI) - التوقيع بشهادة X.509 (eSeal) مش عملية
//      ممكن تتعمل بجافاسكريبت عادي في Cloud Function، غالبًا محتاجة تشغيل
//      أداة التوقيع الرسمية دي كـ sidecar/service منفصل، أو استخدام مكتبة
//      رسمية بتوفرها المصلحة لو موجودة بلغة تدعمها Cloud Functions.
//
// الخطوة التالية العملية: شغّلوا أداة الـ Toolkit بتاعة ETA (اللي المفروض
// جالكم مع التسجيل) على بيئة الـ Sandbox، وشوفوا استجابة GetDocumentTypes/
// GetDocumentTypeVersion الفعلية، وابعتهالي (أو الصقها هنا) عشان أظبط
// الدالة دي على الشكل الصحيح 100%. الهيكل تحت تقريبي (مبني على النمط
// العام المعروف لأنظمة الفوترة الإلكترونية المشابهة زي السعودية والهند)
// ومحتاج تأكيد بند بند.

export function buildETADocument(invoice, { issuerInfo, branchInfo } = {}) {
  // TODO: تأكيد كل اسم حقل وشكله الدقيق مقابل استجابة GetDocumentTypeVersion
  return {
    issuer: {
      type: issuerInfo?.type || 'B', // B = Business
      id: issuerInfo?.taxRegistrationNumber, // الرقم الضريبي
      name: issuerInfo?.name,
      address: issuerInfo?.address,
    },
    receiver: {
      type: invoice.customerTaxId ? 'B' : 'P', // P = فرد (مستهلك نهائي)
      id: invoice.customerTaxId || undefined,
      name: invoice.customerName,
    },
    documentType: 'I', // I = Invoice
    documentTypeVersion: '1.0', // 🛑 تأكيد من GetDocumentTypeVersion
    dateTimeIssued: new Date(invoice.createdAt?.toDate?.() || invoice.createdAt || Date.now()).toISOString(),
    taxpayerActivityCode: branchInfo?.activityCode, // 🛑 كود النشاط الضريبي بتاع الفرع
    internalID: invoice.invoiceNumber,
    invoiceLines: (invoice.items || []).map((item, idx) => ({
      description: item.name,
      itemType: 'GS1', // أو EGS - 🛑 حسب نظام التكويد المستخدم فعليًا
      itemCode: item.gs1Code || item.sku || '',
      unitType: 'EA', // 🛑 تأكيد وحدة القياس الصحيحة
      quantity: item.quantity || 1,
      unitValue: {
        currencySold: 'EGP',
        amountEGP: Number(item.price) || 0,
      },
      salesTotal: (Number(item.price) || 0) * (item.quantity || 1),
      total: (Number(item.price) || 0) * (item.quantity || 1),
      // 🛑 taxableItems / الضرائب المطبقة (VAT 14% إلخ) محتاجة تتأكد شكلها بالظبط
    })),
    totalDiscountAmount: invoice.discount || 0,
    totalSalesAmount: invoice.subtotal || 0,
    netAmount: invoice.finalTotal || invoice.total || 0,
    totalAmount: invoice.finalTotal || invoice.total || 0,
    // signatures: [] // 🛑 التوقيع الرقمي بيتضاف هنا من أداة التوقيع الرسمية
  };
}
