import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2 } from 'lucide-react';

// قارئ باركود بالكاميرا. بيستخدم BarcodeDetector المدمج في المتصفح (Chrome/Android)
// ولو مش متاح بيحمّل مكتبة ZXing وقت الحاجة بس (مش بتتحمل مع التطبيق).
// الكاميرا بتشتغل بس على https أو localhost.
export function BarcodeScannerModal({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);
  const doneRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; });

  useEffect(() => {
    let stream = null;
    let rafId = 0;
    let zxingControls = null;
    let cancelled = false;

    const finish = (value) => {
      if (doneRef.current || !value) return;
      doneRef.current = true;
      onDetectedRef.current(String(value).trim());
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('الكاميرا غير متاحة في المتصفح ده (محتاج https).');
        setStarting(false);
        return;
      }
      try {
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
          const video = videoRef.current;
          video.srcObject = stream;
          await video.play();
          setStarting(false);
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code']
          });
          const tick = async () => {
            if (cancelled || doneRef.current) return;
            try {
              const codes = await detector.detect(video);
              if (codes.length) return finish(codes[0].rawValue);
            } catch { /* بنكمل المحاولة */ }
            rafId = requestAnimationFrame(tick);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (cancelled) return;
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            videoRef.current,
            (result) => { if (result) finish(result.getText()); }
          );
          setStarting(false);
        }
      } catch (e) {
        console.error(e);
        setError(e?.name === 'NotAllowedError' ? 'لازم تسمح للمتصفح باستخدام الكاميرا.' : 'تعذر تشغيل الكاميرا: ' + (e?.message || ''));
        setStarting(false);
      }
    };
    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      zxingControls?.stop?.();
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[130] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-4 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2"><Camera size={18} className="text-teal-600"/> مسح الباركود</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500"><X size={18}/></button>
        </div>
        {error ? (
          <p className="text-sm font-bold text-rose-600 py-8 text-center">{error}</p>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            {starting && <div className="absolute inset-0 flex items-center justify-center text-white"><Loader2 className="animate-spin"/></div>}
            <div className="absolute inset-x-6 top-1/2 h-0.5 bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.9)]" />
          </div>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 text-center">وجّه الكاميرا ناحية الباركود وهيتقرا تلقائيًا.</p>
      </div>
    </div>
  );
}
