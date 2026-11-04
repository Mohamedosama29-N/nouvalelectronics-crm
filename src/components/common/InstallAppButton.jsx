import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { showInfo } from '../../utils/alerts';

// 📱 زرار "ثبّت التطبيق" (أندرويد/كمبيوتر بيظهر نافذة التثبيت، والآيفون بيقول الطريقة)
let deferred = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('erp:installable')); });
}
const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');

export function InstallAppButton({ className = '' }) {
  const [can, setCan] = useState(() => !!deferred);
  const [installed, setInstalled] = useState(() => standalone());
  useEffect(() => {
    const on = () => setCan(true);
    const done = () => { setInstalled(true); setCan(false); };
    window.addEventListener('erp:installable', on); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('erp:installable', on); window.removeEventListener('appinstalled', done); };
  }, []);
  if (installed || (!can && !isIOS())) return null;
  const install = async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); if (r?.outcome === 'accepted') setInstalled(true); deferred = null; setCan(false); return; }
    showInfo('على الآيفون: افتح الموقع من Safari ← زرار المشاركة ⬆️ ← "إضافة إلى الشاشة الرئيسية".');
  };
  return (
    <button type="button" onClick={install} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold ${className}`}>
      <Smartphone size={14} /> ثبّت التطبيق على الموبايل
    </button>
  );
}
