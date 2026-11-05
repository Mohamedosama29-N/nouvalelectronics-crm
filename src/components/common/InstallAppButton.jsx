import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { showInfo } from '../../utils/alerts';

// 📱 زرار "ثبّت التطبيق" (أندرويد/كمبيوتر بيظهر نافذة التثبيت، والآيفون بيقول الطريقة)
let deferred = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('erp:installable')); });
}
const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
const isIOS = () => /iphone|ipad|ipod/i.test(ua());

// لو المتصفح مطلّعش نافذة التثبيت لوحده، بنقول الطريقة حسب المتصفح
function manualInstallSteps() {
  const u = ua();
  if (isIOS()) return 'على الآيفون: افتح الموقع من Safari ← زرار المشاركة ⬆️ تحت ← «إضافة إلى الشاشة الرئيسية» ← «إضافة».';
  if (/SamsungBrowser/i.test(u)) return 'في متصفح سامسونج: اضغط القايمة ☰ تحت ← «إضافة الصفحة إلى» ← «الشاشة الرئيسية». أو افتح الموقع من Chrome وهيظهر «تثبيت التطبيق».';
  if (/Android/i.test(u)) return 'على أندرويد من Chrome: اضغط ⋮ فوق ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».';
  return 'على الكمبيوتر من Chrome أو Edge: اضغط أيقونة التثبيت ⊕ في آخر شريط العنوان، أو ⋮ ← «تثبيت نوڤال».';
}

export function InstallAppButton({ className = '', variant = 'teal' }) {
  const [can, setCan] = useState(() => !!deferred);
  const [installed, setInstalled] = useState(() => standalone());
  useEffect(() => {
    const on = () => setCan(true);
    const done = () => { setInstalled(true); setCan(false); };
    window.addEventListener('erp:installable', on); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('erp:installable', on); window.removeEventListener('appinstalled', done); };
  }, []);
  if (installed) return null;
  const install = async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); if (r?.outcome === 'accepted') setInstalled(true); deferred = null; setCan(false); return; }
    showInfo(manualInstallSteps());
  };
  return (
    <button type="button" onClick={install} className={variant === 'sidebar' ? `w-full px-4 py-2 bg-teal-700/30 text-teal-200 font-bold flex items-center justify-center gap-2 hover:bg-teal-700 hover:text-white rounded-lg transition-colors text-sm mb-2 ${className}` : `inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold ${className}`}>
      <Smartphone size={14} /> {variant === 'sidebar' ? 'ثبّت التطبيق' : `ثبّت التطبيق على الموبايل${can ? '' : ' (الطريقة)'}`}
    </button>
  );
}
