// 🔗 الخدمات اللي بتستخدم Gemini (كلها بتبعت نصوص متشالة منها البيانات الشخصية)
import { askJSON, askText, isAIFeatureOn, friendlyAIError } from './aiClient';
import { buildIntentPrompt, enforceScope, INTENT_SCHEMA, parseFollowUp, parseQuestionLocally, sanitizeIntent } from './askIntent';
import { redactText, firstName } from './redact';
import { statusLabel } from './ticketAssist';

// السؤال ← intent. الترتيب: سؤال متابعة على اللي فات ← Gemini (لو متفعّل) ← المحلّل المحلي.
export async function understandQuestion(question, { systemSettings, user, warehouses, previous = null }) {
  const follow = parseFollowUp(question, previous, warehouses);
  if (follow) return { intent: enforceScope(follow, user), note: null };

  let intent = null;
  let note = null;
  if (isAIFeatureOn(systemSettings, 'ask')) {
    try {
      const { system, prompt } = buildIntentPrompt(redactText(question), warehouses, new Date(), previous);
      intent = sanitizeIntent(await askJSON(systemSettings, { system, prompt, schema: INTENT_SCHEMA, temperature: 0 }), warehouses);
    } catch (e) {
      note = `${friendlyAIError(e)} استخدمت الفهم المحلي بدلها.`;
    }
  }
  if (!intent || intent.metric === 'unsupported') {
    const local = parseQuestionLocally(question, warehouses);
    if (local) intent = local;
  }
  return { intent: enforceScope(intent, user), note };
}

const DIAG_SCHEMA = {
  type: 'object',
  properties: {
    likelyFaults: { type: 'array', items: { type: 'object', properties: { fault: { type: 'string' }, reason: { type: 'string' } }, required: ['fault', 'reason'] } },
    suggestedParts: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['likelyFaults', 'suggestedParts', 'checks'],
};

// اقتراح تشخيص: الوصف + التذاكر المشابهة (من غير أي بيانات عميل)
export async function suggestDiagnosis(systemSettings, ticket, matches) {
  const history = matches.slice(0, 5).map((m) => ({ device: m.device, issue: redactText(m.issue).slice(0, 200), fault: m.fault, parts: m.parts, solved: m.solved }));
  const res = await askJSON(systemSettings, {
    system: 'أنت فني صيانة أجهزة إلكترونية ومنزلية خبير في مصر. اقترح الأعطال الأرجح وقطع الغيار وخطوات الفحص بإيجاز وبالعامية المصرية المهنية. اعتمد على التذاكر السابقة المشابهة لو مفيدة. لا تخترع أكواد قطع. لو المعلومات قليلة قول كده في note.',
    prompt: JSON.stringify({
      device: [ticket.device, ticket.deviceModel].filter(Boolean).join(' '),
      productCode: ticket.productCode || '',
      issue: redactText(ticket.issue || '').slice(0, 800),
      similarPastTickets: history,
    }),
    schema: DIAG_SCHEMA,
    temperature: 0.2,
  });
  return {
    likelyFaults: (res.likelyFaults || []).slice(0, 4),
    suggestedParts: (res.suggestedParts || []).slice(0, 6),
    checks: (res.checks || []).slice(0, 5),
    note: res.note || '',
  };
}

// تحسين رسالة العميل (الاسم الأول بس، من غير تليفون)
export async function polishCustomerMessage(systemSettings, ticket, draft, { companyName = '', tone = 'ودود' } = {}) {
  const text = await askText(systemSettings, {
    system: 'اكتب رسالة واتساب قصيرة (3-5 سطور) لعميل مركز صيانة في مصر، بالعامية المصرية المهذبة. حافظ على كل المعلومات والأرقام الموجودة في المسودة بالظبط بدون إضافة وعود أو مواعيد أو أسعار جديدة. بدون إيموجي كتير. رجّع نص الرسالة بس.',
    prompt: JSON.stringify({ tone, customerFirstName: firstName(ticket.customerName), status: statusLabel(ticket.status), company: companyName, draft: redactText(draft) }),
    temperature: 0.5,
  });
  return String(text || '').trim() || draft;
}

// ملخص ذكي للتذكرة (للمدير/الفني)
export async function summarizeTicketAI(systemSettings, ticket) {
  const comments = (ticket.comments || []).slice(-10).map((c) => redactText(c.text || c.comment || '')).filter(Boolean);
  const hist = (ticket.statusHistory || []).slice(-10).map((h) => ({ status: statusLabel(h.status), at: h.timestamp }));
  const text = await askText(systemSettings, {
    system: 'لخّص تذكرة صيانة في 3-4 نقاط قصيرة بالعامية المصرية: الوضع الحالي، اللي اتعمل، المشكلة لو فيه تأخير، والخطوة الجاية المقترحة. متخترعش معلومات.',
    prompt: JSON.stringify({
      device: [ticket.device, ticket.deviceModel].filter(Boolean).join(' '),
      issue: redactText(ticket.issue || ''),
      fault: [ticket.mainFaultDescription, ticket.subFaultDescription].filter(Boolean).join(' - '),
      status: statusLabel(ticket.status),
      parts: (ticket.spareParts || []).map((p) => p.name),
      cost: ticket.totalCost || 0, paid: ticket.totalPaid || 0,
      history: hist, comments,
    }),
    temperature: 0.2,
  });
  return String(text || '').trim();
}

// 💡 شرح إجابة رقمية: Gemini بيشوف الأرقام المحسوبة (مش البيانات الخام) ويقول معناها وإيه الخطوة الجاية
export async function explainAnswer(systemSettings, intent, answer) {
  const aliases = new Map();
  const list = (answer.list || []).map((x) => {
    if (intent.metric !== 'technician_performance') return { name: x.name, value: x.right };
    if (!aliases.has(x.name)) aliases.set(x.name, `فني ${aliases.size + 1}`);
    return { name: aliases.get(x.name), value: x.right };
  });
  let text = await askText(systemSettings, {
    system: 'أنت محلل أعمال لمحل إلكترونيات ومركز صيانة في مصر. اشرح النتيجة دي في 2-4 نقاط قصيرة بالعامية المصرية المهنية: معناها إيه، هل كويسة ولا محتاجة انتباه، وخطوة عملية واحدة أو اتنين. استخدم الأرقام الموجودة بس. كل نقطة في سطر يبدأ بـ "•".',
    prompt: JSON.stringify({ question: answer.title, scope: answer.scope, result: answer.headline, details: answer.details, change: answer.change, list }),
    temperature: 0.3,
  });
  aliases.forEach((alias, name) => { text = String(text).split(alias).join(name); });
  return String(text || '').trim();
}

// ================================================================ المرحلة 7: ذكاء متقدم
const str = { type: 'string' };
const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['invoice', 'serial_label', 'warranty_card', 'other'] },
    serial: str, model: str, brand: str, deviceType: str, purchaseDate: { type: 'string', description: 'YYYY-MM-DD أو فاضي' },
    invoiceNumber: str, store: str, warrantyMonths: { type: 'number' }, confidence: { type: 'number' }, note: str,
  },
  required: ['kind', 'confidence'],
};

// (7) قراءة صورة فاتورة أو ملصق السيريال/الموديل
export async function readDocumentImage(systemSettings, { base64, mimeType }) {
  const r = await askJSON(systemSettings, {
    system: 'أنت بتقرا صور فواتير شراء وملصقات أجهزة (ستيكر السيريال والموديل) في مركز صيانة مصري. استخرج بالظبط اللي مكتوب، ومتخمّنش. السيريال اكتبه زي ما هو بالحروف والأرقام اللاتينية. التاريخ بصيغة YYYY-MM-DD. أي حاجة مش واضحة سيبها فاضية. confidence من 0 لـ 1.',
    prompt: [{ text: 'استخرج بيانات الجهاز/الفاتورة من الصورة دي.' }, { inlineData: { mimeType, data: base64 } }],
    schema: LABEL_SCHEMA,
    temperature: 0,
  });
  return {
    kind: r.kind || 'other', serial: String(r.serial || '').trim(), model: String(r.model || '').trim(), brand: String(r.brand || '').trim(),
    deviceType: String(r.deviceType || '').trim(), purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(r.purchaseDate || '') ? r.purchaseDate : '',
    invoiceNumber: String(r.invoiceNumber || '').trim(), store: String(r.store || '').trim(), warrantyMonths: Number(r.warrantyMonths) || 0,
    confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)), note: r.note || '',
  };
}

const DAMAGE_SCHEMA = {
  type: 'object',
  properties: {
    summary: str,
    damages: { type: 'array', items: { type: 'object', properties: { part: str, issue: str, severity: { type: 'string', enum: ['خفيف', 'متوسط', 'شديد'] } }, required: ['part', 'issue'] } },
    physicalDamage: { type: 'boolean', description: 'true لو فيه كسر/خبطة/سوائل/حرق/صدأ ناتج عن سوء استخدام' },
    likelyCause: str, nextChecks: { type: 'array', items: str }, warrantyNote: str, confidence: { type: 'number' },
  },
  required: ['summary', 'physicalDamage', 'confidence'],
};

// (8) تحليل صور العطل/التلف (بيتحفظ التحليل بس، مش الصورة)
export async function assessDamagePhoto(systemSettings, { base64, mimeType, device = '', issue = '' }) {
  const r = await askJSON(systemSettings, {
    system: 'أنت فني فحص في مركز صيانة أجهزة منزلية وإلكترونية في مصر. وصف اللي ظاهر في الصورة بس بالعامية المهنية: الأجزاء التالفة وشدة التلف، وهل فيه تلف خارجي (كسر، خبطة، سوائل، حرق، صدأ، فيران) ممكن يخرج الجهاز من الضمان. متأكدش حاجة مش باينة. confidence من 0 لـ 1.',
    prompt: [{ text: JSON.stringify({ device, issue: redactText(issue).slice(0, 300) }) }, { inlineData: { mimeType, data: base64 } }],
    schema: DAMAGE_SCHEMA,
    temperature: 0.1,
  });
  return {
    summary: String(r.summary || '').slice(0, 300), damages: (r.damages || []).slice(0, 6), physicalDamage: !!r.physicalDamage,
    likelyCause: r.likelyCause || '', nextChecks: (r.nextChecks || []).slice(0, 4), warrantyNote: r.warrantyNote || '',
    confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
  };
}

// (18) توسيع كلمات البحث بمرادفات الأعطال
export async function expandSearchQuery(systemSettings, q) {
  const r = await askJSON(systemSettings, {
    system: 'أنت مساعد بحث في تذاكر صيانة أجهزة في مصر. ادي كلمات ومرادفات (عامية مصرية وفصحى وإنجليزي وأسماء قطع) ممكن تكون مكتوبة في تذاكر بنفس معنى البحث. كلمات قصيرة بس.',
    prompt: redactText(q).slice(0, 200),
    schema: { type: 'object', properties: { keywords: { type: 'array', items: str } }, required: ['keywords'] },
    temperature: 0.2,
  });
  return (r.keywords || []).map((k) => String(k).trim()).filter(Boolean).slice(0, 15);
}

// (6) صياغة مقال قاعدة معرفة من تذكرة أو مجموعة تذاكر
export async function draftKbArticle(systemSettings, base) {
  const r = await askJSON(systemSettings, {
    system: 'أنت كبير فنيين في مركز صيانة مصري. اكتب مقال قصير لقاعدة المعرفة الداخلية للفنيين بالعامية المهنية: عنوان، الأعراض، السبب الأرجح، خطوات الفحص والإصلاح بالترتيب، والقطع. متخترعش أكواد قطع.',
    prompt: JSON.stringify({ ...base, symptoms: redactText(base.symptoms || '').slice(0, 500), steps: (base.steps || []).map((s) => redactText(s).slice(0, 200)) }),
    schema: { type: 'object', properties: { title: str, symptoms: str, cause: str, steps: { type: 'array', items: str }, parts: { type: 'array', items: str }, tips: str }, required: ['title', 'steps'] },
    temperature: 0.3,
  });
  return { ...base, title: r.title || base.title, symptoms: r.symptoms || base.symptoms, cause: r.cause || base.cause, steps: (r.steps || []).slice(0, 10), parts: r.parts?.length ? r.parts : base.parts, tips: r.tips || '' };
}

// (9) قراءة أدق لمزاج العميل من كلامه
export async function analyzeSentimentAI(systemSettings, text) {
  const r = await askJSON(systemSettings, {
    system: 'حلّل مزاج عميل مركز صيانة مصري من كلامه. label واحدة من: angry, unhappy, neutral, happy. escalate = true لو بيهدد بشكوى رسمية أو سوشيال أو محامي. reason جملة قصيرة، وsuggestion أحسن خطوة للموظف.',
    prompt: redactText(text).slice(0, 1200),
    schema: { type: 'object', properties: { label: { type: 'string', enum: ['angry', 'unhappy', 'neutral', 'happy'] }, escalate: { type: 'boolean' }, reason: str, suggestion: str }, required: ['label'] },
    temperature: 0,
  });
  return { label: r.label || 'neutral', escalate: !!r.escalate, reason: r.reason || '', suggestion: r.suggestion || '' };
}
