// 🖼️ تصغير الصورة في المتصفح قبل إرسالها (أسرع وأوفر في الحصة المجانية) — مفيش رفع لأي سيرفر تخزين
export function fileToResizedBase64(file, { max = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(Object.assign(new Error('not-image'), { code: 'not-image' })); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(Object.assign(new Error('bad-image'), { code: 'bad-image' }));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        if (!ctx) { const s = String(reader.result); resolve({ base64: s.split(',')[1], mimeType: file.type, preview: s }); return; }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', quality);
        resolve({ base64: url.split(',')[1], mimeType: 'image/jpeg', preview: url });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// قراءة باركود السيريال محليًا (Chrome/Edge على أندرويد وويندوز فيهم BarcodeDetector) — مجاني ومن غير نت
export async function detectBarcodes(file) {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return [];
  try {
    const bmp = await createImageBitmap(file);
    const det = new window.BarcodeDetector();
    const codes = await det.detect(bmp);
    return [...new Set(codes.map((c) => String(c.rawValue || '').trim()).filter((v) => v.length >= 4))];
  } catch { return []; }
}
