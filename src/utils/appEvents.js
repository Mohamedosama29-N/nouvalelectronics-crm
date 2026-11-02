// 🔀 أحداث تنقل داخل السيستم: أي مكان (البحث السريع، المساعد، مركز المهام)
// يقدر يطلب "افتح الشاشة الفلانية وافتح السجل الفلاني جواها".
// الطلب بيتحفظ لحد ما الشاشة المستهدفة تتحمّل وتستهلكه (لأن الشاشات lazy).
const pending = {};
const NAV = 'erp:navigate';
const ASK = 'erp:ask';

export function requestNavigation(view, intent = null) {
  if (intent?.kind) pending[intent.kind] = intent;
  window.dispatchEvent(new CustomEvent(NAV, { detail: { view, intent } }));
}

export function consumeIntent(kind) {
  const v = pending[kind];
  delete pending[kind];
  return v || null;
}

// للشاشة المفتوحة بالفعل: تسمع الطلبات الجديدة
export function onIntent(kind, cb) {
  const h = (e) => {
    if (e.detail?.intent?.kind !== kind) return;
    const v = consumeIntent(kind);
    if (v) cb(v);
  };
  window.addEventListener(NAV, h);
  return () => window.removeEventListener(NAV, h);
}

export function onNavigate(cb) {
  const h = (e) => cb(e.detail?.view, e.detail?.intent);
  window.addEventListener(NAV, h);
  return () => window.removeEventListener(NAV, h);
}

export const askAssistant = (question) => window.dispatchEvent(new CustomEvent(ASK, { detail: { question } }));
export function onAsk(cb) {
  const h = (e) => cb(e.detail?.question || '');
  window.addEventListener(ASK, h);
  return () => window.removeEventListener(ASK, h);
}
