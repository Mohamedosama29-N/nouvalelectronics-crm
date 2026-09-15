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

export const showError = (message, title = 'خطأ') => {
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
