// src/utils/thermalPrint.js
//
// أدوات طباعة مشتركة مُحسّنة لطابعات حرارية 80mm (مثل Xprinter XP-V320N).
//
// ملاحظة فنية مهمة عن مشكلة "الورقة بتطبع منقطة/فيها مشاكل":
// الطابعات الحرارية زي XP-V320N بتطبع بالأبيض والأسود فقط (1-bit)، بدون
// درجات رمادي حقيقية. أي عنصر CSS فيه لون رمادي فاتح (#ccc, #f0f0f0) أو
// حدود متقطعة (dashed/dotted borders) بيتحول المتصفح يرسمه بتنعيم حواف
// (anti-aliasing) بدرجات رمادي، والطابعة/الدرايفر بيحاول يقلد الرمادي ده
// بنقاط متبعثرة (dithering) — وده بالظبط اللي بيظهر كـ"ورقة منقطة" أو غير
// واضحة. نفس الكلام على الإيموجي: كتير من درايفرات الطابعات الحرارية معندهاش
// خط بيدعم الإيموجي فبيطبعها كرموز مشوّهة أو نقط.
//
// الحل المتبع هنا:
// - ألوان أبيض/أسود فقط (#000 / #fff)، بدون أي رمادي.
// - خطوط فاصلة بحروف نصية عادية (---- أو ====) بدل CSS borders متقطعة.
// - بدون إيموجي في أي نص هيتطبع فعلياً.
// - خط سميك (font-weight 600-700) وحجم خط لا يقل عن 12px لوضوح أفضل على رأس
//   الطباعة الحراري (203dpi).

import { getInvoiceDisplayRef } from '../services/invoiceNumberService'
import toast from 'react-hot-toast'
import { logger } from './logger'
import { APP_VERSION } from '../version'
import QRCode from 'qrcode'

// عرض الورق الفعلي بالمليمتر حسب إعداد paperSize في النظام
const PAPER_WIDTHS_MM = { '58mm': 58, '76mm': 76, '80mm': 80 }

export const RECEIPT_WIDTH_MM = 80

// ⚠️ الطابعات الحرارية مش بتطبع على عرض الورقة كله: ورق 80مم منطقة الطباعة
// الفعلية فيه 72مم بس (576 نقطة في XP-V320N)، و58مم → 48مم. لو الفاتورة
// اتبنت على 80مم كاملة، الطرف بيتقص (وده اللي كان بيظهر في الأرقام على الشمال).
export const DEFAULT_PRINTABLE_MM = { '58mm': 48, '76mm': 64, '80mm': 72 }

// إعدادات الطباعة الفعلية: عرض منطقة الطباعة + إزاحة يمين/شمال للمعايرة.
// بيقبل إما نص مقاس الورق ('80mm') أو كائن إعدادات النظام كله.
export const resolvePrintLayout = (paperSizeOrSettings = '80mm') => {
  const settings = typeof paperSizeOrSettings === 'string' ? { paperSize: paperSizeOrSettings } : (paperSizeOrSettings || {})
  const paperSize = PAPER_WIDTHS_MM[settings.paperSize] ? settings.paperSize : '80mm'
  const custom = Number(settings.printableWidthMm)
  const widthMm = Number.isFinite(custom) && custom >= 30 && custom <= 80 ? custom : DEFAULT_PRINTABLE_MM[paperSize]
  const offset = Number(settings.printOffsetMm)
  const offsetMm = Number.isFinite(offset) ? Math.max(-10, Math.min(10, offset)) : 0
  return { paperSize, widthMm, offsetMm }
}

// CSS أساسي مشترك لأي مستند هيتطبع على الطابعة الحرارية.
// ⚠️ أبعاد ثابتة 100%: كل المقاسات بوحدات فيزيائية (mm للمسافات و pt للخطوط)
// مش px أو نسب مئوية، عشان الفاتورة تطلع بنفس المقاس بالظبط على أي متصفح
// أو جهاز أو حجم شاشة. ومقاس الورقة نفسه (@page) بيتحسب بالمللي من الطول
// الحقيقي للفاتورة قبل الطباعة مباشرة (شوف openThermalPrintWindow) - لأن
// "size: 80mm auto" مش قيمة صحيحة وChrome كان بيتجاهلها ويطبع على مقاس
// الورق الافتراضي (A4) ويصغّر/يزحزح الفاتورة حسب المتصفح.
export const buildThermalCss = (widthMm = DEFAULT_PRINTABLE_MM['80mm'], offsetMm = 0) => {
  const isNarrow = widthMm <= 52
  const base = isNarrow ? 10.5 : 12      // pt  (≈ 14px / 16px)
  const title = isNarrow ? 14 : 16.5     // pt  (≈ 19px / 22px)
  const padX = isNarrow ? 1 : 1.5        // mm (منطقة الطباعة أصلاً من غير هوامش)
  // خط Cairo مدمج مع السيستم نفسه (في public/fonts) - عشان الفاتورة تطلع بنفس
  // الخط بالظبط على أي جهاز، مش حسب الخطوط المتسطبة على ويندوز.
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const AR = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC'
  const LAT = 'U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122,U+2212'
  return `
  @font-face { font-family: 'PosCairo'; font-weight: 700; font-display: block; src: url('${origin}/fonts/cairo-arabic-700-normal.woff2') format('woff2'); unicode-range: ${AR}; }
  @font-face { font-family: 'PosCairo'; font-weight: 800; font-display: block; src: url('${origin}/fonts/cairo-arabic-800-normal.woff2') format('woff2'); unicode-range: ${AR}; }
  @font-face { font-family: 'PosCairo'; font-weight: 700; font-display: block; src: url('${origin}/fonts/cairo-latin-700-normal.woff2') format('woff2'); unicode-range: ${LAT}; }
  @font-face { font-family: 'PosCairo'; font-weight: 800; font-display: block; src: url('${origin}/fonts/cairo-latin-800-normal.woff2') format('woff2'); unicode-range: ${LAT}; }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-font-smoothing: none;
    font-smooth: never;
  }
  html {
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background: #fff;
  }
  html, body {
    width: ${widthMm}mm;
    min-width: ${widthMm}mm;
    max-width: ${widthMm}mm;
    height: auto;
    overflow: hidden;
    zoom: 1;
  }
  body { transform: translateX(${offsetMm}mm); }
  @page { margin: 0; }
  @media print {
    html, body { width: ${widthMm}mm; margin: 0 !important; }
    .no-print { display: none !important; }
  }
  body {
    /* Cairo تخين وواضح جداً على رأس الطباعة الحراري. Courier New كان رفيع
       والحروف العربي فيه بتتكسر وتتنقّط. Tahoma/Arial احتياطي بس. */
    font-family: 'PosCairo', Tahoma, Arial, sans-serif;
    margin: 0;
    padding: 3mm ${padX}mm;
    direction: rtl;
    font-size: ${base}pt;
    font-weight: 700;
    line-height: 1.4;
    color: #000;
    background: #fff;
  }
  img { max-width: 100%; }
  .ltr { direction: ltr; unicode-bidi: embed; }
  .center { text-align: center; }
  .bold { font-weight: 800; }
  .title { font-size: ${title}pt; font-weight: 800; text-align: center; margin-bottom: 1mm; }
  .subtitle { font-size: ${base - 0.75}pt; text-align: center; margin: 0.6mm 0; }
  .line {
    border-top: 0.5mm solid #000;
    margin: 2mm 0;
    height: 0;
    width: 100%;
  }
  .line-solid { border-top: 0.5mm solid #000; margin: 2mm 0; height: 0; width: 100%; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin: 1.3mm 0;
    font-size: ${base}pt;
    gap: 2mm;
    flex-wrap: wrap;
    page-break-inside: avoid;
  }
  .row.total-row { font-size: ${base + 2}pt; font-weight: 800; }
  .row .label { flex: 1; text-align: right; min-width: 0; word-break: break-word; }
  .row .value { direction: ltr; text-align: left; font-weight: 800; }
  .item-block { margin-bottom: 2mm; page-break-inside: avoid; }
  .badge {
    display: inline-block;
    border: 0.5mm solid #000;
    padding: 0.8mm 2.5mm;
    font-weight: 800;
    font-size: ${base + 0.75}pt;
    margin: 1.3mm 0;
  }
  .logo { max-height: 22mm; max-width: 75%; margin: 0 auto 1.5mm; display: block; object-fit: contain; }
  .qr-block { text-align: center; margin-top: 2.5mm; page-break-inside: avoid; }
  .qr-block .subtitle { margin-top: 1mm; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th {
    font-size: ${base - 1.5}pt;
    font-weight: 800;
    border-bottom: 0.5mm solid #000;
    padding: 1.3mm 1mm;
    text-align: center;
    overflow-wrap: break-word;
  }
  td {
    padding: 1.3mm 0.5mm;
    text-align: center;
    font-size: ${base - 0.75}pt;
    font-weight: 700;
    overflow-wrap: break-word;
    word-break: break-word;
    page-break-inside: avoid;
  }
  .item-name { text-align: right; font-size: ${base - 0.75}pt; }
  th, .num { white-space: nowrap; }
  .ticket-no { text-align: center; font-size: ${title + 2}pt; font-weight: 800; margin: 1mm 0 2mm; }
  .ticket-no span { display: inline-block; border: 0.6mm solid #000; padding: 0 3mm; margin-right: 1.5mm; }
  .ticket-meta td { padding: 0.8mm 0; text-align: right; vertical-align: middle; font-size: ${base}pt; }
  .ticket-meta .meta-label { width: 28%; font-weight: 700; }
  .ticket-meta .meta-value { font-weight: 800; }
  .ticket-items td { padding: 1.2mm 0; vertical-align: top; text-align: right; font-size: ${base + 2}pt; font-weight: 800; }
  .ticket-items .ticket-qty { width: 13%; white-space: nowrap; }
  .ticket-items tr + tr td { border-top: 0.3mm dashed #000; }
  .num { font-size: ${isNarrow ? base - 1.5 : base - 0.75}pt; }
  .col-name { width: ${isNarrow ? 38 : 44}%; text-align: right; }
  .col-qty { width: ${isNarrow ? 14 : 12}%; }
  .col-price { width: ${isNarrow ? 22 : 20}%; }
  .col-total { width: ${isNarrow ? 26 : 24}%; }
  .row .value { white-space: nowrap; }
  .item-notes { text-align: right; font-size: ${base - 1.5}pt; font-weight: 700; padding-right: 1mm; margin-top: 0.5mm; }
`
}

// نسخة ثابتة (80مم) - موجودة برضه للتوافق مع أي استخدام قديم بيستورد الاسم ده
export const THERMAL_BASE_CSS = buildThermalCss(DEFAULT_PRINTABLE_MM['80mm'])

// خط فاصل بصري فاضي (border بس، من غير أي محتوى نصي جواه إطلاقاً) - أبسط
// وأضمن شكل ممكن يطبع صح على أي درايفر طابعة حرارية.
export const dividerHtml = (className = 'line') =>
  `<div class="${className}"></div>`

// ============================================================================
// محرك الطباعة: إطار مخفي (iframe) جوه نفس الصفحة + طابور طباعة.
//
// ليه مش نافذة منبثقة (popup) زي الأول؟
// - Chrome بيسمح بنافذة منبثقة واحدة بس لكل ضغطة زرار. في البيع المباشر
//   تذكرة البار كانت بتفتح نافذة الأول، فالفاتورة اللي بعدها كانت بتتمنع
//   في صمت (ده سبب "الفاتورة مش بتطلع تلقائي أول مرة").
// - كمان نافذتين بيطلبوا طباعة في نفس اللحظة كانوا بيتخانقوا على نافذة
//   الطباعة فواحدة منهم بتضيع.
// الإطار المخفي مش بيتأثر بمانع النوافذ المنبثقة، والطابور بيضمن إن كل
// ورقة (تذكرة بار، تذكرة مطبخ، فاتورة) تتطبع واحدة ورا التانية بالترتيب.
// وكل أنواع الطباعة (أول مرة أو إعادة طباعة من أي مكان) بتعدي من هنا،
// فالشكل والمقاس واحد بالظبط كل مرة.
// ============================================================================

const PX_TO_MM = 25.4 / 96
const printQueue = []
let printBusy = false

const buildPrintDocument = (title, bodyHtml, widthMm, offsetMm) => `<!DOCTYPE html>
<html dir="rtl" lang="ar">
  <head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <style>${buildThermalCss(widthMm, offsetMm)}</style>
  </head>
  <body>${bodyHtml}</body>
</html>`

// بيستنى الخطوط والصور (اللوجو) تتحمّل قبل القياس والطباعة
const waitForDocumentReady = (doc) => new Promise((resolve) => {
  let done = false
  const finish = () => { if (!done) { done = true; resolve() } }
  setTimeout(finish, 2500) // أمان: لو حاجة علّقت
  // بنطلب تحميل الخط صراحة (fonts.ready لوحدها ممكن ترجع قبل ما التحميل يبدأ)
  const loadFonts = doc.fonts?.load
    ? Promise.all([
        doc.fonts.load("700 12pt 'PosCairo'", 'فاتورة 0123'),
        doc.fonts.load("800 12pt 'PosCairo'", 'فاتورة 0123')
      ]).catch(() => {})
    : Promise.resolve()
  const fontsReady = loadFonts.then(() => (doc.fonts?.ready ? doc.fonts.ready : null))
  fontsReady.then(() => {
    const pending = Array.from(doc.images || []).filter(img => !img.complete)
    if (!pending.length) return setTimeout(finish, 30)
    let left = pending.length
    pending.forEach(img => { img.onload = img.onerror = () => { if (--left === 0) finish() } })
  }).catch(finish)
})

// اللوجو الملوّن بيطلع باهت ومنقّط على الطابعة الحرارية (بتحوّل الألوان
// والرمادي لنقط). هنا بنحوّله لأبيض وأسود صريح قبل الطباعة: كل بكسل غامق
// يبقى أسود تمام وكل فاتح يبقى أبيض - فبيطلع واضح وحاد.
const makeLogosMonochrome = (doc) => Promise.all(
  Array.from(doc.querySelectorAll('img[data-mono]')).map(img => new Promise((resolve) => {
    try {
      if (!img.naturalWidth) return resolve()
      const scale = Math.min(1, 600 / img.naturalWidth)
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = doc.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h)
      const px = data.data
      for (let i = 0; i < px.length; i += 4) {
        const alpha = px[i + 3] / 255
        // اللون فوق خلفية بيضا (للصور الشفافة) وبعدين الإضاءة
        const r = px[i] * alpha + 255 * (1 - alpha)
        const g = px[i + 1] * alpha + 255 * (1 - alpha)
        const b = px[i + 2] * alpha + 255 * (1 - alpha)
        const lum = 0.299 * r + 0.587 * g + 0.114 * b
        const v = lum < 170 ? 0 : 255
        px[i] = px[i + 1] = px[i + 2] = v
        px[i + 3] = 255
      }
      ctx.putImageData(data, 0, 0)
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = canvas.toDataURL('image/png')
      setTimeout(resolve, 800)
    } catch {
      resolve() // صورة من دومين تاني (canvas محمي) - نطبعها زي ما هي
    }
  }))
)

// مقاس الورقة بالظبط: عرض منطقة الطباعة × طول المحتوى الحقيقي
const applyExactPageSize = (doc, widthMm) => {
  const heightMm = Math.max(30, Math.ceil(doc.body.getBoundingClientRect().height * PX_TO_MM) + 4)
  const style = doc.createElement('style')
  style.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`
  doc.head.appendChild(style)
}

// احتياطي نادر: لو المتصفح مش بيدعم الطباعة من إطار، نفتح نافذة
const printViaPopup = (job) => {
  const winWidth = Math.round(job.widthMm / PX_TO_MM) + 40
  const w = window.open('', '_blank', `width=${winWidth},height=700`)
  if (!w) {
    logger.error('Thermal print popup blocked')
    toast.error('المتصفح منع الطباعة - اسمح بالنوافذ المنبثقة (Popups) لهذا الموقع', { duration: 8000 })
    return
  }
  w.document.open()
  w.document.write(job.html)
  w.document.close()
  waitForDocumentReady(w.document).then(() => makeLogosMonochrome(w.document)).then(() => {
    applyExactPageSize(w.document, job.widthMm)
    w.focus()
    w.print()
  })
}

const runNextPrintJob = () => {
  if (printBusy || printQueue.length === 0) return
  printBusy = true
  const job = printQueue.shift()

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('tabindex', '-1')
  // الإطار بعرض الورقة بالظبط عشان القياس يطلع صح، ومستخبي برا الشاشة
  Object.assign(iframe.style, {
    position: 'fixed', left: '-10000px', top: '0',
    width: `${job.widthMm}mm`, height: '200mm', border: '0', visibility: 'hidden'
  })
  document.body.appendChild(iframe)

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    // مهلة صغيرة قبل الورقة اللي بعدها عشان الطابعة/الدرايفر يلحق
    setTimeout(() => {
      iframe.remove()
      printBusy = false
      runNextPrintJob()
    }, 400)
  }

  try {
    const win = iframe.contentWindow
    const doc = iframe.contentDocument || win.document
    doc.open()
    doc.write(job.html)
    doc.close()

    waitForDocumentReady(doc).then(() => makeLogosMonochrome(doc)).then(() => {
      try {
        applyExactPageSize(doc, job.widthMm)
        win.addEventListener('afterprint', finish, { once: true })
        win.focus()
        win.print() // في Chrome بتوقف لحد ما نافذة الطباعة تتقفل
        // لو المتصفح مبعتش afterprint (بعض المتصفحات)، نكمل بعد مهلة
        setTimeout(finish, 1500)
      } catch (err) {
        logger.error('Iframe print failed, falling back to popup:', err)
        printViaPopup(job)
        finish()
      }
    })
  } catch (err) {
    logger.error('Iframe print setup failed, falling back to popup:', err)
    printViaPopup(job)
    finish()
  }
}

/**
 * طباعة أي مستند على الطابعة الحرارية (فاتورة، تذكرة بار/مطبخ، ورقة اختبار).
 * بيتحط في طابور ويتطبع بالترتيب. بيقبل مقاس الورق ('80mm') أو إعدادات النظام كلها.
 * (الاسم القديم متساب زي ما هو عشان كل الأماكن اللي بتستخدمه.)
 */
export const openThermalPrintWindow = (title, bodyHtml, paperSizeOrSettings = '80mm') => {
  const { widthMm, offsetMm } = resolvePrintLayout(paperSizeOrSettings)
  printQueue.push({ title, widthMm, html: buildPrintDocument(title, bodyHtml, widthMm, offsetMm) })
  runNextPrintJob()
  return true
}

// كلمات مفتاحية لتصنيف الصنف "مشروب/بار" تلقائياً من اسم المنتج أو تصنيفه.
// ممكن تتوسع بسهولة من هنا لو ظهرت أصناف جديدة بتتصنف غلط.
const BAR_KEYWORDS = [
  'مشروب', 'مشروبات', 'قهوة', 'كوفي', 'شاي', 'عصير', 'كوكتيل', 'سموذي',
  'كابتشينو', 'لاتيه', 'اسبريسو', 'إسبريسو', 'نسكافيه', 'شيك', 'ميلك شيك',
  'موهيتو', 'فيمتو', 'كولا', 'بيبسي', 'سفن أب', 'مياه', 'مياه غازية',
  'ساخن', 'بارد', 'فرابيه', 'ماتشا', 'هوت شوكليت', 'شوكولاتة ساخنة',
  'coffee', 'tea', 'juice', 'drink', 'shake', 'soda', 'water', 'latte',
  'cappuccino', 'espresso', 'mojito', 'smoothie'
]

/**
 * تصنيف الصنف "بار" أو "مطبخ" عشان كل قسم ياخد تذكرته لوحده.
 * بيقرأ أولاً حقل item.destination لو محدد يدوي، بعدين تصنيف المنتج
 * (category)، وأخيراً بيدور على كلمات مفتاحية في اسم الصنف.
 * افتراضياً (لو مش متأكدين) بيتصنف "مطبخ".
 */
export const classifyItemDestination = (item) => {
  if (item?.destination === 'bar' || item?.destination === 'kitchen') {
    return item.destination
  }
  const haystack = `${item?.category || ''} ${item?.name || ''}`.toLowerCase()
  return BAR_KEYWORDS.some((kw) => haystack.includes(kw.toLowerCase())) ? 'bar' : 'kitchen'
}

// تقسيم أصناف الأوردر لقسمين: بار ومطبخ
export const splitOrderItemsByDestination = (items = []) => {
  const bar = []
  const kitchen = []
  items.forEach((item) => {
    if (classifyItemDestination(item) === 'bar') bar.push(item)
    else kitchen.push(item)
  })
  return { bar, kitchen }
}

/**
 * بناء محتوى تذكرة البار أو المطبخ (بدون إيموجي أو ألوان رمادية) اللي
 * تتطبع فوراً لما يتسجل أوردر، وكمان تُستخدم لإعادة الطباعة من شاشة المطبخ.
 * `items` هنا هي الأصناف المطلوب طباعتها فقط (بعد الفلترة حسب القسم)،
 * و`sectionLabel` هو اسم القسم اللي هيظهر في عنوان التذكرة.
 */
export const buildBarTicketHtml = (order, items = order.items || [], sectionLabel = 'بار / مطبخ') => {
  const createdAt = order.createdAt instanceof Date
    ? order.createdAt
    : (order.createdAt?.toDate ? order.createdAt.toDate() : new Date())
  const orderRef = getInvoiceDisplayRef(order)

  const orderTypeLabel = order.orderType === 'takeaway'
    ? 'تيك أواي'
    : order.orderType === 'delivery'
      ? 'ديليفري'
      : 'صالة'

  // جدول بدل صفوف flex: العنوان والقيمة في نفس السطر بالظبط (قبل كده القيم
  // كانت بتتزحلق نص سطر عن عناوينها في الطباعة)
  const metaRow = (label, value, cls = '') => `
    <tr><td class="meta-label">${label}</td><td class="meta-value ${cls}">${value}</td></tr>`

  const itemsHtml = items
    .map(
      (item) => `
        <tr class="ticket-item">
          <td class="ticket-qty">${escapeHtml(String(item.quantity))}×</td>
          <td class="ticket-name">
            ${escapeHtml(item.name)}
            ${item.notes ? `<div class="item-notes">ملاحظة: ${escapeHtml(item.notes)}</div>` : ''}
          </td>
        </tr>`
    )
    .join('')

  return `
    <div class="title">تذكرة ${escapeHtml(sectionLabel)}</div>
    <div class="ticket-no">طلب رقم <span>${escapeHtml(String(orderRef))}</span></div>
    ${dividerHtml()}
    <table class="ticket-meta">
      ${metaRow('النوع', `${orderTypeLabel}${order.tableNumber ? ` - طاولة ${escapeHtml(String(order.tableNumber))}` : ''}`)}
      ${metaRow('الوقت', createdAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }))}
      ${order.customerName ? metaRow('العميل', escapeHtml(order.customerName)) : ''}
      ${order.cashierName ? metaRow('الكاشير', escapeHtml(order.cashierName)) : ''}
    </table>
    ${dividerHtml()}
    <table class="ticket-items">${itemsHtml}</table>
    ${dividerHtml()}
    <div class="center subtitle">عدد الأصناف: ${items.reduce((n, it) => n + (Number(it.quantity) || 0), 0)}</div>
  `
}

// حماية بسيطة عند إدراج نصوص المستخدم داخل HTML يُطبع مباشرة
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// QR Code كـ SVG (متزامن ومن غير نت): مربعات سودا صريحة بحواف حادة، فبيطلع
// واضح جداً على الطابعة الحرارية وأي موبايل يقراه.
export const buildQrSvg = (text, sizeMm = 26) => {
  try {
    const qr = QRCode.create(String(text), { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    const quiet = 2
    const total = n + quiet * 2
    let rects = ''
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.get(r, c)) rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges" style="display:block;margin:0 auto"><rect width="${total}" height="${total}" fill="#fff"/><g fill="#000">${rects}</g></svg>`
  } catch (error) {
    logger.error('QR generation failed:', error)
    return ''
  }
}

// طباعة تذكرة واحدة (كل الأصناف مع بعض) - بتفضل شغالة لأي استخدام قديم
export const printBarTicket = (order, paperSizeOrSettings = '80mm') => {
  const orderRef = getInvoiceDisplayRef(order)
  return openThermalPrintWindow(`تذكرة بار #${orderRef}`, buildBarTicketHtml(order), paperSizeOrSettings)
}

/**
 * طباعة تذكرتين منفصلتين: واحدة للبار (المشروبات) وواحدة للمطبخ (الأكل)،
 * كل واحدة في ورقة لوحدها. لو قسم فاضي من الأصناف مبيطبعش له ورقة أصلاً.
 * `systemSettings` اختيارية - بتُستخدم بس لقراءة عرض الورق (paperSize).
 */
export const printOrderTickets = (order, systemSettings = {}) => {
  const printSettings = systemSettings || {}
  const orderRef = getInvoiceDisplayRef(order)
  const allItems = order.items || []
  if (allItems.length === 0) return []

  // الافتراضي: الطلب كله في تذكرة واحدة. التقسيم لبار/مطبخ اختياري من
  // إعدادات النظام (splitKitchenTickets) لو كل قسم ليه طابعة أو مكان منفصل.
  if (!printSettings.splitKitchenTickets) {
    openThermalPrintWindow(`طلب #${orderRef}`, buildBarTicketHtml(order, allItems, 'الطلب'), printSettings)
    return ['order']
  }

  const { bar, kitchen } = splitOrderItemsByDestination(allItems)
  const printed = []
  if (bar.length > 0) {
    openThermalPrintWindow(`تذكرة بار #${orderRef}`, buildBarTicketHtml(order, bar, 'بار'), printSettings)
    printed.push('bar')
  }
  if (kitchen.length > 0) {
    // الطابور بيطبعها بعد تذكرة البار مباشرة (مفيش تداخل)
    openThermalPrintWindow(`تذكرة مطبخ #${orderRef}`, buildBarTicketHtml(order, kitchen, 'مطبخ'), printSettings)
    printed.push('kitchen')
  }
  return printed
}

/**
 * طباعة فاتورة البيع النهائية (إيصال العميل) - مستقلة عن أي state لمكوّن
 * معيّن، عشان تتنفذ من أي مكان في النظام (شاشة الكاشير أو شاشة المطبخ
 * لحظة التسليم) بنفس الشكل الموحّد.
 */
export const printInvoiceReceipt = (invoice, systemSettings = {}) => {
  const items = Array.isArray(invoice.items) ? invoice.items : []
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  // 25 بدل 25.00 - أقصر وبيمنع الرقم يتكسر على سطرين في الورق الضيق
  const money = (v) => { const x = n(v); return Number.isInteger(x) ? String(x) : x.toFixed(2) }
  const subtotal = invoice.subtotal != null ? n(invoice.subtotal) : items.reduce((sum, item) => sum + n(item.price) * n(item.quantity), 0)
  const discountAmount = n(invoice.discount?.amount)
  const tax = n(invoice.tax)
  const taxRate = n(invoice.taxRate)
  const total = invoice.total != null ? n(invoice.total) : (subtotal - discountAmount + tax)
  const amountPaid = invoice.amountPaid != null && invoice.amountPaid !== 0 ? n(invoice.amountPaid) : total
  const change = n(invoice.change)
  // وقت الفاتورة الحقيقي (مهم في إعادة الطباعة من الأرشيف) - مش وقت الطباعة
  const rawDate = invoice.timestamp || invoice.createdAt
  const invoiceDate = rawDate?.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : new Date())
  const currency = systemSettings?.currency || 'ج.م'

  const logoHtml = systemSettings?.cafeLogo
    ? `<img src="${systemSettings.cafeLogo}" class="logo" ${systemSettings?.receiptLogoMono === false ? '' : 'data-mono="1"'} alt="logo" />`
    : ''

  const qrUrl = (systemSettings?.receiptQrUrl || '').trim()
  const qrHref = qrUrl && !/^https?:\/\//i.test(qrUrl) ? `https://${qrUrl}` : qrUrl
  const qrSvg = systemSettings?.receiptQrEnabled !== false && qrHref ? buildQrSvg(qrHref, 26) : ''
  const qrHtml = qrSvg
    ? `<div class="qr-block">${qrSvg}<div class="subtitle bold">${escapeHtml(systemSettings?.receiptQrLabel || 'تابعونا')}</div></div>`
    : ''

  const bodyHtml = `
    <div class="center">
      ${logoHtml}
      <div class="title">${escapeHtml(systemSettings?.cafeName || 'مقهى')}</div>
      ${systemSettings?.cafeAddress ? `<div class="subtitle">${escapeHtml(systemSettings.cafeAddress)}</div>` : ''}
      ${systemSettings?.cafePhone ? `<div class="subtitle">${escapeHtml(systemSettings.cafePhone)}</div>` : ''}
      <div class="subtitle">${invoiceDate.toLocaleString('ar-EG')}</div>
      <div class="badge">رقم الفاتورة: ${escapeHtml(getInvoiceDisplayRef(invoice))}</div>
      ${invoice.customerName ? `<div class="subtitle">العميل: ${escapeHtml(invoice.customerName)}</div>` : ''}
      <div class="subtitle">الكاشير: ${escapeHtml(invoice.cashierName || 'كاشير')}</div>
    </div>
    ${dividerHtml('line-solid')}
    <table>
      <thead>
        <tr>
          <th class="col-name">المنتج</th>
          <th class="col-qty">كمية</th>
          <th class="col-price">سعر</th>
          <th class="col-total">إجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td class="item-name">${escapeHtml(item.name?.length > 24 ? item.name.substring(0, 22) + '…' : item.name)}</td>
            <td class="num">${n(item.quantity)}</td>
            <td class="ltr num">${money(item.price)}</td>
            <td class="ltr bold num">${money(item.total ?? n(item.price) * n(item.quantity))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${dividerHtml('line-solid')}
    <div class="row"><span class="label">المجموع الفرعي</span><span class="value">${money(subtotal)} ${currency}</span></div>
    ${discountAmount > 0 ? `<div class="row"><span class="label">الخصم</span><span class="value">- ${money(discountAmount)} ${currency}</span></div>` : ''}
    ${tax > 0 ? `<div class="row"><span class="label">الضريبة (${taxRate}%)</span><span class="value">${money(tax)} ${currency}</span></div>` : ''}
    <div class="line-solid"></div>
    <div class="row total-row"><span class="label">الإجمالي</span><span class="value">${money(total)} ${currency}</span></div>
    <div class="row"><span class="label">المدفوع</span><span class="value">${money(amountPaid)} ${currency}</span></div>
    <div class="row"><span class="label">الباقي</span><span class="value">${change > 0 ? money(change) : '0'} ${currency}</span></div>
    ${dividerHtml('line-solid')}
    <div class="center">
      <div class="subtitle bold">${escapeHtml(systemSettings?.receiptFooter || 'شكراً لزيارتكم')}</div>
      <div class="subtitle">نتشرف بخدمتكم مرة أخرى</div>
    </div>
    ${qrHtml}
  `

  return openThermalPrintWindow('فاتورة البيع', bodyHtml, systemSettings || {})
}


/**
 * ورقة معايرة: إطار بعرض منطقة الطباعة بالظبط + مسطرة بالمللي.
 * لو الإطار كله ظاهر (الضلعين اليمين والشمال) يبقى العرض مظبوط. لو ضلع
 * مقصوص: قلّل "عرض منطقة الطباعة"، ولو الإطار مزحوح لجهة: عدّل "الإزاحة".
 */
export const printCalibrationTicket = (systemSettings = {}) => {
  const { widthMm, offsetMm, paperSize } = resolvePrintLayout(systemSettings)
  const ticks = []
  for (let mm = 0; mm <= widthMm; mm += 5) {
    ticks.push(`<div style="position:absolute;left:${mm}mm;top:0;height:${mm % 10 === 0 ? 4 : 2.5}mm;border-left:0.3mm solid #000"></div>`)
    if (mm % 10 === 0 && mm <= widthMm - 4) ticks.push(`<div style="position:absolute;left:${Math.max(0, mm - 2)}mm;top:4.5mm;font-size:7pt" class="ltr">${mm}</div>`)
  }
  const body = `
    <div style="border:0.5mm solid #000;padding:2mm 1mm;margin:-1.5mm">
      <div class="title">اختبار مقاس الطباعة</div>
      <div class="subtitle">الورق: ${paperSize} | العرض: ${widthMm} مم | الإزاحة: ${offsetMm} مم</div>
      <div class="subtitle">إصدار السيستم: ${APP_VERSION}</div>
      <div style="position:relative;height:9mm;direction:ltr;margin:2mm 0">${ticks.join('')}</div>
      <div class="row"><span class="label">الإجمالي</span><span class="value">1,234.50 ج.م</span></div>
      <div class="line-solid"></div>
      <div class="subtitle">لو الإطار كامل والضلعين ظاهرين = المقاس مظبوط</div>
      <div class="subtitle">ضلع مقصوص = قلّل العرض 1-2 مم</div>
      <div class="subtitle">الإطار مزحوح = عدّل الإزاحة</div>
    </div>`
  return openThermalPrintWindow('اختبار مقاس الطباعة', body, systemSettings)
}
