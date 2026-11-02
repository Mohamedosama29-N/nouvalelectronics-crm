// 🤖 عميل الذكاء الاصطناعي: Gemini عن طريق Firebase AI Logic (Gemini Developer API).
// - مجاني على خطة Spark (من غير ربط بطاقة دفع) في حدود الطبقة المجانية.
// - مفيش مفتاح في الكود: Firebase بيدير المفتاح للمشروع.
// - المكتبة بتتحمّل عند أول استخدام بس (dynamic import) عشان متكبّرش حجم السيستم.
// - التفعيل لازم من: Firebase Console → AI Logic → Get started → Gemini Developer API.
import { firebaseApp } from '../firebase/config';

export const DEFAULT_AI_MODEL = 'gemini-3.6-flash';

export const getAISettings = (systemSettings) => {
  const ai = systemSettings?.ai || {};
  return {
    enabled: ai.enabled === true,
    model: (ai.model || DEFAULT_AI_MODEL).trim(),
    features: {
      ask: ai.features?.ask !== false,
      tickets: ai.features?.tickets !== false,
      messages: ai.features?.messages !== false,
    },
    dailyLimit: Number(ai.dailyLimit) > 0 ? Number(ai.dailyLimit) : 150,
  };
};

export const isAIFeatureOn = (systemSettings, feature) => {
  const s = getAISettings(systemSettings);
  return s.enabled && s.features[feature] !== false;
};

// ---------- حماية الحصة المجانية: حد يومي لكل جهاز + فاصل بين الطلبات ----------
const USAGE_KEY = 'erp_ai_usage';
const today = () => new Date().toISOString().slice(0, 10);
const readUsage = () => {
  try {
    const u = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    return u.day === today() ? u : { day: today(), count: 0, last: 0 };
  } catch { return { day: today(), count: 0, last: 0 }; }
};
const writeUsage = (u) => { try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch { /* ignore */ } };

export class AIUserError extends Error {
  constructor(message, code = 'ai-error') { super(message); this.code = code; }
}

// رسائل عربية واضحة بدل أخطاء جوجل الخام
export const friendlyAIError = (e) => {
  if (e instanceof AIUserError) return e.message;
  const code = e?.code || '';
  const status = e?.customErrorData?.status;
  const msg = String(e?.message || '');
  if (code === 'api-not-enabled' || /not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
    return 'خدمة الذكاء الاصطناعي مش متفعّلة في مشروع Firebase. فعّلها من Firebase Console ← AI Logic ← Gemini Developer API.';
  }
  if (status === 429 || /quota|RESOURCE_EXHAUSTED|rate/i.test(msg)) {
    return 'وصلنا للحد المجاني المسموح من جوجل دلوقتي. جرّب كمان شوية أو بكرة.';
  }
  if (status === 404 || code === 'no-model' || /models\/.*not found/i.test(msg)) {
    return 'اسم موديل الذكاء الاصطناعي في الإعدادات مش متاح. غيّره من الإعدادات ← الذكاء الاصطناعي.';
  }
  if (code === 'fetch-error' || /network|Failed to fetch/i.test(msg)) {
    return 'مفيش اتصال بخدمة الذكاء الاصطناعي. اتأكد من الإنترنت وجرّب تاني.';
  }
  if (code === 'parse-failed' || code === 'invalid-content') {
    return 'الرد رجع بشكل غير مفهوم. جرّب تصيغ الطلب بشكل تاني.';
  }
  return 'حصلت مشكلة في خدمة الذكاء الاصطناعي. جرّب تاني بعد شوية.';
};

let aiPromise = null;
const loadAI = () => {
  if (!aiPromise) {
    aiPromise = import('firebase/ai').then((m) => ({
      m,
      ai: m.getAI(firebaseApp, { backend: new m.GoogleAIBackend() }),
    })).catch((e) => { aiPromise = null; throw e; });
  }
  return aiPromise;
};

const guard = (settings) => {
  if (!settings.enabled) throw new AIUserError('الذكاء الاصطناعي مقفول. الأدمن يقدر يفعّله من الإعدادات ← الذكاء الاصطناعي.', 'disabled');
  const u = readUsage();
  if (u.count >= settings.dailyLimit) {
    throw new AIUserError(`وصلت للحد اليومي (${settings.dailyLimit} طلب) على الجهاز ده. الحد بيتجدد بكرة.`, 'daily-limit');
  }
  if (Date.now() - (u.last || 0) < 2000) throw new AIUserError('استنى ثانيتين بين كل طلب والتاني.', 'too-fast');
  writeUsage({ ...u, count: u.count + 1, last: Date.now() });
};

const run = async (systemSettings, { system, prompt, json, schema, temperature = 0.3 }) => {
  const settings = getAISettings(systemSettings);
  guard(settings);
  const { m, ai } = await loadAI();
  // 4096: الموديلات الحديثة بتصرف جزء من الحد على "التفكير"، فحد صغير كان ممكن يقطع الرد
  const generationConfig = { temperature, maxOutputTokens: 4096 };
  if (json) {
    generationConfig.responseMimeType = 'application/json';
    if (schema) generationConfig.responseJsonSchema = schema;
  }
  const model = m.getGenerativeModel(ai, { model: settings.model, systemInstruction: system, generationConfig });
  const result = await model.generateContent(prompt);
  return result.response.text();
};

export const askText = (systemSettings, opts) => run(systemSettings, { ...opts, json: false });

export const askJSON = async (systemSettings, opts) => {
  const text = await run(systemSettings, { ...opts, json: true });
  try {
    return JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AIUserError('الرد رجع بشكل غير مفهوم. جرّب تاني.', 'parse-failed');
  }
};
