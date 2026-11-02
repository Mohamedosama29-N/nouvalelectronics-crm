// 🔗 الخدمات اللي بتستخدم Gemini (كلها بتبعت نصوص متشالة منها البيانات الشخصية)
import { askJSON, askText, isAIFeatureOn, friendlyAIError } from './aiClient';
import { buildIntentPrompt, enforceScope, INTENT_SCHEMA, parseQuestionLocally, sanitizeIntent } from './askIntent';
import { redactText, firstName } from './redact';
import { statusLabel } from './ticketAssist';

// السؤال ← intent. بنجرب Gemini لو متفعّل، ولو فشل أو مقفول بنستخدم المحلّل المحلي.
export async function understandQuestion(question, { systemSettings, user, warehouses }) {
  let intent = null;
  let note = null;
  if (isAIFeatureOn(systemSettings, 'ask')) {
    try {
      const { system, prompt } = buildIntentPrompt(redactText(question), warehouses);
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
