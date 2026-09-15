// ==========================================================================
// 📤 إرسال المستند لمصلحة الضرائب
// ==========================================================================
const SUBMIT_URLS = {
  preprod: 'https://api.preprod.invoicing.eta.gov.eg/api/v1.0/documentsubmissions',
  production: 'https://api.invoicing.eta.gov.eg/api/v1.0/documentsubmissions',
};

// الرد بيرجع HTTP 202 (تم الاستلام للمعالجة، مش "معتمدة" لسه) مع
// submissionUUID. الحالة النهائية (cleared/rejected) بتتعرف لاحقًا إما
// بالاستعلام عن حالة الـ submission، أو webhook لو المصلحة بتوفره.
export async function submitETADocument(document, { accessToken, env = 'preprod' }) {
  const url = SUBMIT_URLS[env];
  if (!url) {
    throw new Error(`بيئة ETA غير معروفة: ${env}`);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ documents: [document] }),
  });

  const data = await res.json().catch(() => null);

  if (res.status !== 202 && !res.ok) {
    throw new Error(`فشل إرسال الفاتورة لـ ETA (${res.status}): ${JSON.stringify(data)}`);
  }

  return data; // يحتوي submissionUUID والأخطاء لو فيه أي سطر مرفوض فورًا
}
