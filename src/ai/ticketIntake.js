// 📋 إدخال تذكرة من رسالة العميل (واتساب/مكالمة): استخراج البيانات محليًا.
// الاسم والتليفون بيتطلعوا هنا محليًا بس، ومش بيتبعتوا لأي ذكاء اصطناعي.
import { normalizeArabic } from './ticketAssist';
import { toLatinDigits } from './redact';

const DEVICES = [
  ['شاشة', ['شاشه', 'شاشة', 'تلفزيون', 'تليفزيون', 'تلفاز', 'tv', 'smart tv']],
  ['غسالة', ['غساله', 'غسالة', 'washing']],
  ['غسالة أطباق', ['غساله اطباق', 'غسالة أطباق', 'dishwasher']],
  ['ثلاجة', ['ثلاجه', 'ثلاجة', 'تلاجه', 'تلاجة', 'fridge', 'refrigerator']],
  ['ديب فريزر', ['ديب فريزر', 'فريزر', 'freezer']],
  ['تكييف', ['تكييف', 'تكيف', 'مكيف', 'تكييفات', 'air conditioner', 'ac']],
  ['بوتاجاز', ['بوتاجاز', 'بوتجاز', 'بوتوجاز', 'فرن غاز', 'cooker']],
  ['ميكروويف', ['ميكروويف', 'ميكرويف', 'مايكرويف', 'microwave']],
  ['سخان', ['سخان', 'heater']],
  ['مكنسة', ['مكنسه', 'مكنسة', 'vacuum']],
  ['خلاط', ['خلاط', 'blender']],
  ['مروحة', ['مروحه', 'مروحة', 'fan']],
  ['موبايل', ['موبايل', 'تليفون محمول', 'mobile', 'phone']],
  ['لابتوب', ['لابتوب', 'لاب توب', 'laptop']],
  ['ريسيفر', ['ريسيفر', 'رسيفر', 'receiver']],
  ['سماعة', ['ساوند بار', 'سماعه', 'سماعة', 'soundbar', 'speaker']],
  ['كاتيل', ['كاتيل', 'غلايه', 'غلاية', 'kettle']],
  ['مكواة', ['مكواه', 'مكواة', 'iron']],
];
const BRANDS = [
  ['Samsung', ['سامسونج', 'سامسونغ', 'samsung']], ['LG', ['ال جي', 'إل جي', 'lg']], ['Sharp', ['شارب', 'sharp']],
  ['Toshiba', ['توشيبا', 'toshiba']], ['Sony', ['سوني', 'sony']], ['Tornado', ['تورنيدو', 'tornado']],
  ['Fresh', ['فريش', 'fresh']], ['Unionaire', ['يونيون اير', 'يونيون إير', 'unionaire']], ['Carrier', ['كاريير', 'كارير', 'carrier']],
  ['Zanussi', ['زانوسي', 'zanussi']], ['Ideal', ['ايديال', 'إيديال', 'ideal']], ['Ariston', ['اريستون', 'ariston']],
  ['Beko', ['بيكو', 'beko']], ['Haier', ['هاير', 'haier']], ['Hisense', ['هايسنس', 'هيسنس', 'hisense']],
  ['TCL', ['تي سي ال', 'tcl']], ['Philips', ['فيليبس', 'philips']], ['Kiriazi', ['كريازي', 'kiriazi']],
  ['White Whale', ['وايت ويل', 'white whale']], ['Noval', ['نوفال', 'نوڤال', 'noval']],
];
const URGENT = ['ضروري', 'مستعجل', 'بسرعه', 'بسرعة', 'حالا', 'فورا', 'شرار', 'شراره', 'ريحه شياط', 'ريحة شياط', 'دخان', 'حريق', 'كهربا بتلسع', 'بيكهرب', 'ماس', 'تسريب غاز', 'ريحه غاز', 'ريحة غاز'];
const RELAXED = ['مش مستعجل', 'براحتكم', 'مفيش استعجال', 'على مهلكم'];
const GREETINGS = /^(?:\s*(?:السلام عليكم(?: ورحمه الله(?: وبركاته)?)?|السلام عليكم ورحمة الله(?: وبركاته)?|صباح الخير|مساء الخير|اهلا|أهلا|ازيكم|ازيك|لو سمحت|لو سمحتوا|من فضلك|hello|hi)[\s,،.!]*)+/i;
const NAME_STOP = new Set(['عندي', 'عندى', 'و', 'من', 'في', 'الجهاز', 'جهاز', 'رقمي', 'رقم', 'تليفوني', 'موبايلي', 'عميل', 'عايز', 'عاوز', 'محتاج', 'ساكن', 'من', 'الشاشه', 'الغساله', 'التلاجه', 'التكييف']);

const findIn = (norm, dict) => {
  let best = null;
  dict.forEach(([label, words]) => words.forEach((w) => {
    const nw = normalizeArabic(w);
    const re = new RegExp(`(^|[^\\u0600-\\u06FFa-z0-9])(?:[وبف]?ال|لل)?${nw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\u0600-\\u06FFa-z0-9])`);
    if (re.test(norm) && (!best || nw.length > best.len)) best = { label, len: nw.length };
  }));
  return best?.label || '';
};

// أي تسلسل أرقام بفواصل؛ بعدين بنتحقق إنه موبايل مصري فعلًا
export const PHONE_RE = /(?:\+|00)?\d[\d\s-]{8,16}\d/g;
export const normalizeEgPhone = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  while (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('20') && d.length === 12) d = `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith('1')) d = `0${d}`;
  return /^01[0125]\d{8}$/.test(d) ? d : '';
};

export function extractTicketFromMessage(message, { governorates = [] } = {}) {
  const original = toLatinDigits(String(message || '')).replace(/\r/g, '').trim();
  if (!original) return null;
  const norm = normalizeArabic(original);

  const phones = [...new Set((original.match(PHONE_RE) || []).map(normalizeEgPhone).filter(Boolean))];

  // الاسم: بعد "أنا / اسمي / معاك" (كلمتين بالكتير)
  let customerName = '';
  let namePhrase = '';
  const m = /(?:^|[\s,،.])(?:انا|أنا|إنا|اسمي|إسمي|معاك|معاكم|معك)\s+(?:اسمي\s+)?([؀-ۿ]+(?:\s+[؀-ۿ]+){0,2})/.exec(original);
  if (m) {
    const words = m[1].split(/\s+/).filter(Boolean);
    const kept = [];
    for (const w of words) { if (NAME_STOP.has(normalizeArabic(w)) || kept.length >= 2) break; kept.push(w); }
    if (kept.length) { customerName = kept.join(' '); namePhrase = m[0].trim(); }
  }

  const device = findIn(norm, DEVICES);
  const brand = findIn(norm, BRANDS);

  // الموديل: "موديل XXX" أو كود حروف+أرقام (مش تليفون)
  let deviceModel = '';
  const mm = /(?:موديل|model|موديله)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9\- /]{1,20})/i.exec(original)
    || /\b([A-Za-z]{1,5}[- ]?\d{2,}[A-Za-z0-9-]{0,10})\b/.exec(original);
  if (mm && !normalizeEgPhone(mm[1])) deviceModel = mm[1].trim().replace(/\s{2,}/g, ' ');
  const size = /(\d{2,3})\s*(?:بوصه|بوصة|انش|inch|")/i.exec(original);
  if (size && !deviceModel.includes(`${size[1]} بوصة`)) deviceModel = [deviceModel, `${size[1]} بوصة`].filter(Boolean).join(' ');

  let governorate = '';
  governorates.forEach((g) => { if (!governorate && norm.includes(normalizeArabic(g).replace(/^ال/, ''))) governorate = g; });

  let priority = 'medium';
  if (RELAXED.some((w) => norm.includes(normalizeArabic(w)))) priority = 'low';
  else if (URGENT.some((w) => norm.includes(normalizeArabic(w)))) priority = 'high';

  // المشكلة = الرسالة من غير التحية والاسم والتليفونات
  let issue = original.replace(PHONE_RE, (x) => (normalizeEgPhone(x) ? ' ' : x));
  if (namePhrase) issue = issue.replace(namePhrase, ' ');
  issue = issue.replace(/(?:رقمي|رقم تليفوني|تليفوني|موبايلي|رقم الموبايل|ده رقمي|وده رقمي)\s*[:：]?/g, ' ');
  issue = issue.replace(GREETINGS, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n').replace(/^[\s,،.:-]+|[\s,،.:-]+$/g, '').trim();

  return {
    customerName,
    customerPhone: phones[0] || '',
    secondPhone: phones[1] || '',
    governorate,
    device: [device, brand].filter(Boolean).join(' '),
    deviceModel,
    issue,
    priority,
  };
}

// النص اللي ممكن يتبعت للذكاء الاصطناعي: من غير تليفونات ومن غير جملة الاسم
export function textForAI(message, extracted) {
  let t = toLatinDigits(String(message || '')).replace(PHONE_RE, (x) => (normalizeEgPhone(x) ? ' [تليفون] ' : x));
  if (extracted?.customerName) t = t.split(extracted.customerName).join('[العميل]');
  return t.replace(/\s{2,}/g, ' ').trim().slice(0, 1200);
}

export const INTAKE_SCHEMA = {
  type: 'object',
  properties: {
    device: { type: 'string', description: 'نوع الجهاز بالعربي مع الماركة لو موجودة' },
    deviceModel: { type: 'string' },
    issue: { type: 'string', description: 'وصف مختصر ومهني للمشكلة بالعربي (سطر أو اتنين)' },
    priority: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['device', 'issue', 'priority'],
};

// دمج: الذكاء الاصطناعي يحسّن الجهاز/الموديل/الوصف/الأولوية بس، والاسم والتليفون محليين دايمًا
export function mergeIntake(local, ai) {
  if (!ai || typeof ai !== 'object') return local;
  const pick = (a, b) => (typeof a === 'string' && a.trim() ? a.trim().slice(0, 300) : b);
  return {
    ...local,
    device: pick(ai.device, local.device),
    deviceModel: pick(ai.deviceModel, local.deviceModel),
    issue: pick(ai.issue, local.issue),
    priority: ['high', 'medium', 'low'].includes(ai.priority) ? ai.priority : local.priority,
  };
}
