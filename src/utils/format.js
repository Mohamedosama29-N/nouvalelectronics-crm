export const formatDate = (timestamp) => {
  if (!timestamp) return '-';
  try {
    if (timestamp?.toDate) {
      return timestamp.toDate().toLocaleString('ar-EG', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleString('ar-EG');
    }
    return new Date(timestamp).toLocaleString('ar-EG');
  } catch {
    return '-';
  }
};

// 🛠️ FIX: formatDate بيحوّل أي قيمة لـ toLocaleString اللي بتضيف وقت دايمًا.
// لو القيمة تاريخ بس (YYYY-MM-DD من input type="date")، JS بيفسرها كـ UTC
// منتصف الليل، وبعدين toLocaleString بيحولها للتوقيت المحلي (مصر)، فبتظهر
// وكأنها الساعة 2 أو 3 صباحًا ثابتة كل مرة - رغم إنه مفيش وقت اتسجل أصلاً.
// الدالة دي بتاخد التاريخ كـ "محلي" مباشرة من غير أي تحويل UTC، وبتعرض
// التاريخ لوحده من غير وقت وهمي.

export const formatDateOnly = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
    return new Date(dateStr).toLocaleDateString('ar-EG');
  } catch {
    return '-';
  }
};

// 🆕 بيرجع الوقت الفعلي الحالي بصيغة HH:MM عشان نملأه تلقائيًا في خانات
// الوقت (input type="time") لما المستخدم يختار تاريخ من غير ما يحدد وقت

export const getCurrentTimeHHMM = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

// 🆕 FIX: رقم التذكرة كان بيتولد من آخر 8 أرقام في التوقيت الحالي
// (Date.now())، فكان بيبان عشوائي تمامًا. دلوقتي رقم تسلسلي حقيقي بيتولد
// من عداد واحد في قاعدة البيانات (counters/tickets) جوه transaction، عشان
// لو تذكرتين اتعملوا في نفس اللحظة بالظبط من جهازين مختلفين، الرقمين
// يفضلوا مختلفين عن بعض (مفيش تكرار أو تعارض)
