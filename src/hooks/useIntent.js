import { useEffect, useRef } from 'react';
import { consumeIntent, onIntent } from '../utils/appEvents';

// الشاشة بتستلم طلب "افتح سجل معيّن" — سواء الطلب جه قبل ما تتحمّل أو وهي مفتوحة
export function useIntent(kind, handler) {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  useEffect(() => {
    const t = setTimeout(() => { const v = consumeIntent(kind); if (v) ref.current(v); }, 0);
    const off = onIntent(kind, (v) => setTimeout(() => ref.current(v), 0));
    return () => { clearTimeout(t); off(); };
  }, [kind]);
}
