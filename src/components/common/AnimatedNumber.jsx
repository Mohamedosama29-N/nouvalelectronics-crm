import React, { useEffect, useRef, useState } from 'react';

// 🔢 رقم بيعد من القيمة السابقة للجديدة بحركة ناعمة (count-up).
// لو المستخدم مفعّل "تقليل الحركة" في النظام بيعرض الرقم النهائي على طول.
const defaultFormat = (n) => Math.round(n).toLocaleString();

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function AnimatedNumber({ value, duration = 700, format = defaultFormat, suffix = '', className = '' }) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [display, setDisplay] = useState(0);
  const lastRef = useRef(0);

  useEffect(() => {
    const from = lastRef.current;
    if (from === target || prefersReducedMotion()) {
      lastRef.current = target;
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      lastRef.current = p < 1 ? from + (target - from) * eased : target;
      setDisplay(lastRef.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  const shown = prefersReducedMotion() ? target : display;
  return <span className={className}>{format(shown)}{suffix}</span>;
}
