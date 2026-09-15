// ==========================================================================
// 🔐 مصادقة OAuth2 مع خدمة هوية مصلحة الضرائب (ETA Identity Service)
// ==========================================================================
// النمط ده موثق ومتفق عليه في كل المصادر (بوابة preprod و production
// بتستخدم نفس نمط OAuth2 client_credentials)، فهو الجزء "الآمن" اللي أقدر
// أبنيه بثقة من غير ما أحتاج SDK مصلحة الضرائب الرسمي.
//
// المتغيرات دي بتتحط في Firebase Functions secrets (مش .env العادي بتاع
// الواجهة - أبدًا متتحطش هنا بيانات client secret في كود يوصل للمتصفح):
//   firebase functions:secrets:set ETA_CLIENT_ID
//   firebase functions:secrets:set ETA_CLIENT_SECRET
//
// TOKEN_URL بيتغير حسب البيئة:
//   Sandbox (preprod):  https://id.preprod.eta.gov.eg/connect/token
//   Production:         https://id.eta.gov.eg/connect/token

const TOKEN_URLS = {
  preprod: 'https://id.preprod.eta.gov.eg/connect/token',
  production: 'https://id.eta.gov.eg/connect/token',
};

let cachedToken = null; // { accessToken, expiresAt }

export async function getETAAccessToken({ clientId, clientSecret, env = 'preprod' }) {
  const now = Date.now();

  // التوكن صالح 60 دقيقة تقريبًا - بنكاشه ونجدده قبل ما ينتهي بدقيقتين
  // احتياطًا، بدل ما نطلب توكن جديد مع كل استدعاء (أداء + حدود استخدام).
  if (cachedToken && cachedToken.expiresAt - 2 * 60 * 1000 > now) {
    return cachedToken.accessToken;
  }

  const tokenUrl = TOKEN_URLS[env];
  if (!tokenUrl) {
    throw new Error(`بيئة ETA غير معروفة: ${env} (المتاح: preprod, production)`);
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`فشل الحصول على توكن ETA (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.accessToken;
}
