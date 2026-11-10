// 🔮 توقعات التذكرة من تاريخ التذاكر (محلي ومجاني):
//   تصنيف العطل، المدة المتوقعة، القطع والتكلفة المعتادة، أنسب فني،
//   مراجعة جودة البيانات قبل الحفظ، ودرجة خطورة التأخير للتذاكر المفتوحة.
import { normalizeArabic, rankSimilar, tokenize } from './ticketAssist';
import { analyzeTicket, quantile, formatDuration } from './repairTime';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { toDate } from '../utils/liveStats';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const norm = (s) => normalizeArabic(String(s || '')).trim();
const devType = (t) => norm(String(t.device || '').split(/\s+/)[0]);
const median = (arr) => quantile([...arr].sort((a, b) => a - b), 0.5);

// ---------------------------------------------------------------- 1) تصنيف العطل
// faults: [{ id, code, description }] — بيرجّع أعلى 3 مع نسبة ثقة وسبب
export function classifyFaults(draft, faults = [], pool = [], { codeField = 'mainFaultCode' } = {}) {
  if (!faults.length) return [];
  const issueTokens = new Set(tokenize(`${draft.issue || ''}`));
  const byCode = new Map(faults.map((f) => [norm(f.code), f]));

  // تطابق نص الوصف مع وصف الكود
  const textScore = new Map();
  faults.forEach((f) => {
    const ft = tokenize(f.description || '');
    if (!ft.length || !issueTokens.size) return;
    const hit = ft.filter((w) => issueTokens.has(w) || [...issueTokens].some((x) => x.length >= 3 && (x.startsWith(w) || w.startsWith(x)))).length;
    textScore.set(f.id, hit / ft.length);
  });

  // تصويت التذاكر القديمة المشابهة اللي عندها نفس الأكواد
  const votes = new Map();
  let voteTotal = 0;
  const withCodes = pool.filter((t) => t[codeField] && byCode.has(norm(t[codeField])));
  rankSimilar(draft, withCodes, { minScore: 0.08 }).slice(0, 15).forEach(({ ticket, score }) => {
    const f = byCode.get(norm(ticket[codeField]));
    votes.set(f.id, (votes.get(f.id) || 0) + score);
    voteTotal += score;
  });

  return faults.map((f) => {
    const ts = textScore.get(f.id) || 0;
    const vs = voteTotal ? (votes.get(f.id) || 0) / voteTotal : 0;
    const n = [...withCodes].filter((t) => norm(t[codeField]) === norm(f.code)).length;
    const score = 0.5 * ts + 0.5 * vs;
    const reasons = [];
    if (ts >= 0.5) reasons.push('الوصف قريب من وصف الكود');
    if (vs > 0) reasons.push(`اتسجل في تذاكر مشابهة${n ? ` (${n})` : ''}`);
    return { id: f.id, code: f.code, description: f.description, confidence: Math.min(0.99, score), reason: reasons.join(' · ') };
  }).filter((x) => x.confidence >= 0.12).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

// ---------------------------------------------------------------- 2) المدة المتوقعة
// analyzed = تذاكر خلصت ومحللة (analyzeTicket) ومعاها الأصل في .t
export const analyzePool = (pool = []) => pool.map((t) => {
  const a = analyzeTicket(t);
  return a && a.outcome === 'repaired' && a.completedAt ? { ...a, t } : null;
}).filter(Boolean);

export function predictDuration(draft, analyzed = [], { minCount = 3 } = {}) {
  const model = norm(draft.deviceModel);
  const fault = norm(draft.mainFaultCode);
  const type = devType(draft);
  const levels = [
    ['نفس الموديل ونفس العطل', (a) => model && fault && norm(a.t.deviceModel) === model && norm(a.t.mainFaultCode) === fault],
    ['نفس العطل', (a) => fault && norm(a.t.mainFaultCode) === fault],
    ['نفس الموديل', (a) => model && norm(a.t.deviceModel) === model],
    ['نفس نوع الجهاز', (a) => type && devType(a.t) === type],
    ['كل التذاكر', () => true],
  ];
  for (const [basis, fn] of levels) {
    const list = analyzed.filter(fn);
    if (list.length >= minCount) {
      const tot = list.map((a) => a.total).sort((x, y) => x - y);
      return {
        basis, count: list.length,
        median: quantile(tot, 0.5), low: quantile(tot, 0.25), high: quantile(tot, 0.75),
        netMedian: median(list.map((a) => a.net)),
        label: `${formatDuration(quantile(tot, 0.25))} – ${formatDuration(quantile(tot, 0.75))}`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------- 5) القطع والتكلفة المعتادة
export function predictPartsAndCost(draft, pool = [], { limit = 20 } = {}) {
  const done = pool.filter((t) => TICKET_TERMINAL_STATUSES.includes(t.status) && t.status !== 'rejected_by_customer');
  let similar = rankSimilar(draft, done, { minScore: 0.2 }).slice(0, limit).map((x) => x.ticket);
  if (similar.length < 3 && draft.deviceModel) similar = done.filter((t) => norm(t.deviceModel) === norm(draft.deviceModel)).slice(0, limit);
  if (!similar.length) return null;
  const parts = new Map();
  similar.forEach((t) => new Set((t.spareParts || []).map((p) => String(p.name || '').trim()).filter(Boolean)).forEach((n) => parts.set(n, (parts.get(n) || 0) + 1)));
  const costs = similar.map((t) => Number(t.totalCost) || 0).filter((c) => c > 0).sort((a, b) => a - b);
  return {
    basedOn: similar.length,
    parts: [...parts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, share: n / similar.length })),
    cost: costs.length >= 2 ? { median: quantile(costs, 0.5), low: quantile(costs, 0.25), high: quantile(costs, 0.75), count: costs.length } : null,
  };
}

// ---------------------------------------------------------------- 4) أنسب فني
export function suggestTechnicians(draft, analyzed = [], openTickets = [], technicians = []) {
  const names = [...new Set([...technicians, ...analyzed.map((a) => a.technician)].filter((n) => n && n !== 'غير محدد'))];
  if (!names.length) return [];
  const type = devType(draft);
  const model = norm(draft.deviceModel);
  const relevant = (a) => (model && norm(a.t.deviceModel) === model) || (type && devType(a.t) === type);
  const globalMed = median(analyzed.filter(relevant).map((a) => a.net)) || median(analyzed.map((a) => a.net)) || DAY;
  const load = new Map();
  openTickets.forEach((t) => { if (t.assignedTechnician) load.set(t.assignedTechnician, (load.get(t.assignedTechnician) || 0) + 1); });
  const maxLoad = Math.max(1, ...load.values());

  const rows = names.map((name) => {
    const mine = analyzed.filter((a) => a.technician === name);
    const rel = mine.filter(relevant);
    const med = rel.length ? median(rel.map((a) => a.net)) : (mine.length ? median(mine.map((a) => a.net)) : null);
    const speed = med ? Math.max(0, Math.min(1, globalMed / med / 2)) : 0.25; // 0.5 = زي المتوسط
    const exp = Math.min(1, rel.length / 10);
    const l = load.get(name) || 0;
    const score = 0.4 * exp + 0.35 * speed + 0.25 * (1 - l / maxLoad);
    const reasons = [];
    if (rel.length) reasons.push(`صلّح ${rel.length} ${type ? 'جهاز مشابه' : 'تذكرة'}`);
    if (med) {
      const pct = Math.round((1 - med / globalMed) * 100);
      reasons.push(pct >= 10 ? `أسرع من المتوسط بـ ${pct}%` : pct <= -10 ? `أبطأ من المتوسط بـ ${-pct}%` : 'سرعته زي المتوسط');
    }
    reasons.push(l ? `عليه ${l} تذكرة مفتوحة` : 'مفيش عليه تذاكر مفتوحة');
    return { name, score, reasons, openLoad: l };
  });
  return rows.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ---------------------------------------------------------------- 17) مراجعة جودة التذكرة
const PERIOD_MONTHS = { '6_months': 6, '1_year': 12, '2_years': 24, '3_years': 36, '5_years': 60 };
const phoneOk = (p) => /^01[0125]\d{8}$/.test(String(p || '').replace(/\D/g, '').replace(/^20(?=1)/, '0'));

export function qualityCheck(draft, { openForPhone = [], now = new Date() } = {}) {
  const out = [];
  if (!String(draft.customerName || '').trim()) out.push({ level: 'error', field: 'customerName', text: 'اسم العميل فاضي' });
  if (!String(draft.customerPhone || '').trim()) out.push({ level: 'error', field: 'customerPhone', text: 'رقم الموبايل فاضي' });
  else if (!phoneOk(draft.customerPhone)) out.push({ level: 'warn', field: 'customerPhone', text: 'رقم الموبايل شكله مش مصري صحيح (11 رقم يبدأ بـ 010/011/012/015)' });
  if (draft.secondPhone && String(draft.secondPhone).replace(/\D/g, '') === String(draft.customerPhone).replace(/\D/g, '')) out.push({ level: 'warn', field: 'secondPhone', text: 'الرقم التاني زي الأول' });
  if (!String(draft.device || '').trim()) out.push({ level: 'warn', field: 'device', text: 'نوع الجهاز مش محدد' });
  if (String(draft.issue || '').trim().length < 10) out.push({ level: 'warn', field: 'issue', text: 'وصف المشكلة قصير — اكتب تفاصيل أكتر عشان الفني' });
  if (!draft.mainFaultCode && draft.deviceModel) out.push({ level: 'info', field: 'mainFaultCode', text: 'مفيش كود عطل — بيأثر على التقارير وتوقع المدة' });

  const inv = draft.invoiceDate ? new Date(`${draft.invoiceDate}T00:00:00`) : null;
  if (inv && inv > now) out.push({ level: 'error', field: 'invoiceDate', text: 'تاريخ الفاتورة في المستقبل' });
  if (draft.warrantyStatus === 'in_warranty') {
    if (!inv) out.push({ level: 'warn', field: 'invoiceDate', text: 'داخل الضمان من غير تاريخ فاتورة شراء' });
    const months = PERIOD_MONTHS[draft.warrantyPeriod];
    if (inv && months) {
      const end = new Date(inv); end.setMonth(end.getMonth() + months);
      if (end < now) out.push({ level: 'warn', field: 'warrantyStatus', text: `الضمان انتهى فعلًا في ${end.toLocaleDateString('ar-EG')} — راجع حالة الضمان` });
    }
  }
  if (draft.status && TICKET_TERMINAL_STATUSES.includes(draft.status)) out.push({ level: 'warn', field: 'status', text: 'التذكرة الجديدة متسجلة بحالة نهائية' });

  const sameDevice = openForPhone.filter((t) => !TICKET_TERMINAL_STATUSES.includes(t.status));
  if (sameDevice.length) {
    const dup = sameDevice.find((t) => devType(t) && devType(t) === devType(draft));
    out.push({ level: 'warn', field: 'duplicate', text: dup ? `فيه تذكرة مفتوحة لنفس العميل ونفس نوع الجهاز: ${dup.ticketNumber || ''}` : `العميل عنده ${sameDevice.length} تذكرة مفتوحة: ${sameDevice.slice(0, 2).map((t) => t.ticketNumber).join('، ')}`, ticketId: (dup || sameDevice[0]).id });
  }
  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// ---------------------------------------------------------------- 3) خطورة التأخير
const WAITING = ['waiting_spare_parts', 'spare_parts_unavailable', 'waiting_customer_approval_cost', 'sent_to_factory'];

export function riskOf(ticket, { expectedMs = null, slaHours = { high: 4, medium: 24, low: 72 }, now = new Date() } = {}) {
  if (TICKET_TERMINAL_STATUSES.includes(ticket.status)) return null;
  const created = toDate(ticket.createdAt);
  if (!created) return null;
  const sla = (slaHours?.[ticket.priority || 'medium'] ?? 24) * HOUR;
  const elapsed = now - created;
  if (elapsed > sla) return { level: 'overdue', score: 1, elapsed, sla, reason: 'عدّت مهلة الـ SLA' };
  let score = elapsed / sla;
  const reasons = [];
  if (expectedMs && expectedMs > sla) { score = Math.max(score, Math.min(0.95, expectedMs / sla * 0.8)); reasons.push(`التذاكر المشابهة بتاخد ${formatDuration(expectedMs)}`); }
  if (WAITING.includes(ticket.status)) { score += 0.2; reasons.push('مستنية (قطع/موافقة/مصنع)'); }
  if (elapsed / sla >= 0.6) reasons.push(`عدّى ${Math.round(elapsed / sla * 100)}% من المهلة`);
  score = Math.min(0.99, score);
  return { level: score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low', score, elapsed, sla, remaining: sla - elapsed, reason: reasons.join(' · ') };
}

// المدة المتوقعة حسب نوع الجهاز (لحساب الخطورة في الداشبورد)
export function expectedByType(analyzed = []) {
  const m = new Map();
  analyzed.forEach((a) => { const k = devType(a.t); if (!m.has(k)) m.set(k, []); m.get(k).push(a.total); });
  const out = new Map();
  m.forEach((list, k) => { if (list.length >= 3) out.set(k, median(list)); });
  const all = analyzed.map((a) => a.total);
  return (t) => out.get(devType(t)) || (all.length >= 3 ? median(all) : null);
}
