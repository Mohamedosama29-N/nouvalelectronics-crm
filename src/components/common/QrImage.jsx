import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// QR بيتولّد محليًا في المتصفح (من غير ما البيانات تتبعت لأي موقع خارجي)
export function QrImage({ text, size = 200, className = '' }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (!text) return undefined;
    QRCode.toDataURL(String(text), { margin: 1, width: size }).then((url) => { if (!cancelled) setSrc(url); }).catch(() => {});
    return () => { cancelled = true; };
  }, [text, size]);
  return src ? <img src={src} alt="QR Code" className={className} width={size} height={size} /> : <div className={className} style={{ width: size, height: size }} />;
}
