// 🔑 (57) صلاحيات أدق: صلاحيات "مسموح افتراضيًا" بتتقفل بس لو الأدمن شالها، وحدود رقمية/زمنية لكل موظف
export const OPT_OUT = new Set(['exportData', 'editClosedTickets']);

export function hasPerm(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const v = user.permissions?.[key];
  return OPT_OUT.has(key) ? v !== false : !!v;
}

export const canSeeCost = (user) => !!user && (user.role === 'admin' || user.role === 'main_warehouse_manager' || !!user.permissions?.viewCostPrices);

// حد الخصم بالنسبة المئوية (فاضي = مفيش حد)
export function discountCheck(user, subtotal, discountAmount) {
  const max = Number(user?.limits?.maxDiscountPercent);
  if (!user || user.role === 'admin' || !(max >= 0) || user?.limits?.maxDiscountPercent === '' || user?.limits?.maxDiscountPercent === undefined || user?.limits?.maxDiscountPercent === null) return { ok: true, max: null };
  const pct = subtotal > 0 ? (Number(discountAmount) / subtotal) * 100 : 0;
  return { ok: pct <= max + 1e-9, max, pct: Math.round(pct * 10) / 10 };
}

// مواعيد الدخول المسموحة "HH:MM" (لو from > to يبقى وردية بالليل بتعدّي نص الليل)
export function workHoursCheck(user, now = new Date()) {
  const from = user?.limits?.workFrom; const to = user?.limits?.workTo;
  if (!user || user.role === 'admin' || !from || !to) return { ok: true };
  const m = (s) => { const [h, mm] = String(s).split(':').map(Number); return h * 60 + (mm || 0); };
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = m(from); const b = m(to);
  const ok = a <= b ? cur >= a && cur <= b : cur >= a || cur <= b;
  return { ok, from, to };
}

// حارس التصدير: App بيضبطه حسب المستخدم الحالي، ودوال التصدير بتسأله قبل أي ملف
let exportGuard = null;
export const setExportGuard = (fn) => { exportGuard = fn; };
export const exportAllowed = () => (exportGuard ? exportGuard() : true);
