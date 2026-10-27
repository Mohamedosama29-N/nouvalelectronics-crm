import Swal from 'sweetalert2';

export const showConfirm = async (title, text, icon = 'warning', confirmText = 'نعم، تأكيد') => {
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: confirmText,
    cancelButtonText: 'إلغاء',
    reverseButtons: true
  });
  return result.isConfirmed;
};

export const showSuccess = (message, title = 'تم بنجاح') => {
  Swal.fire({
    title,
    text: message,
    icon: 'success',
    timer: 2000,
    showConfirmButton: false
  });
};

// 🛠️ تنظيف رسائل الخطأ قبل ما تظهر للمستخدم: رسائل Firebase الخام بتحتوي لينكات إنشاء
// Index وكلام تقني بالإنجليزي ملوش لازمة لموظف الكاشير. بنخفي كل ده ونكتب رسالة مفهومة،
// والتفاصيل الكاملة بتفضل في الكونسول للمطوّر.
export const friendlyMessage = (message) => {
  const raw = String(message ?? '');
  const sep = raw.indexOf(': ');
  const prefix = sep > 0 && /[\u0600-\u06FF]/.test(raw.slice(0, sep)) ? raw.slice(0, sep + 2) : '';
  const body = prefix ? raw.slice(sep + 2) : raw;
  const hasArabicBody = /[\u0600-\u06FF]/.test(body);
  let friendly = null;
  if (/requires an index|index.*(create|building)|console\.firebase\.google\.com/i.test(body)) {
    friendly = 'العملية دي محتاجة تجهيز بسيط في قاعدة البيانات. بلّغ مدير النظام (السبب: Index ناقص).';
  } else if (/insufficient permissions|permission-denied|PERMISSION_DENIED/i.test(body)) {
    friendly = 'ليس لديك صلاحية لتنفيذ هذه العملية.';
  } else if (/offline|unavailable|network|failed to fetch|ERR_INTERNET/i.test(body)) {
    friendly = 'مشكلة في الاتصال بالإنترنت. تأكد من الاتصال وحاول مرة أخرى.';
  } else if (/quota|resource-exhausted|too-many-requests/i.test(body)) {
    friendly = 'تم تجاوز حد الاستخدام المسموح مؤقتاً. حاول بعد قليل.';
  } else if (/deadline-exceeded|timeout|timed out/i.test(body)) {
    friendly = 'العملية أخذت وقتاً أطول من المتوقع. حاول مرة أخرى.';
  } else if (/^(Firebase|FirebaseError)/i.test(body) || (!hasArabicBody && /[A-Za-z]{4,}/.test(body) && body.length > 40)) {
    friendly = 'حدث خطأ غير متوقع. حاول مرة أخرى، ولو استمرت المشكلة بلّغ مدير النظام.';
  }
  if (friendly) {
    console.warn('[friendlyMessage] original error:', raw);
    return prefix ? `${prefix}${friendly}` : friendly;
  }
  return raw.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim();
};

export const showError = (rawMessage, title = 'خطأ') => {
  const message = friendlyMessage(rawMessage);
  Swal.fire({
    title,
    text: message,
    icon: 'error',
    confirmButtonText: 'حسناً'
  });
};

export const showWarning = (message, title = 'تنبيه') => {
  Swal.fire({
    title,
    text: message,
    icon: 'warning',
    confirmButtonText: 'فهمت'
  });
};

export const showInfo = (message, title = 'معلومة') => {
  Swal.fire({
    title,
    text: message,
    icon: 'info',
    confirmButtonText: 'حسناً'
  });
};

// ==========================================================================
// 💾 INDEXEDDB SETUP (Offline Storage)
// ==========================================================================
