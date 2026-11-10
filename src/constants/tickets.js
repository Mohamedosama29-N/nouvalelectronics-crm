export const TICKET_STATUSES = [
  // مرتبة بترتيب الشغل الطبيعي عشان القايمة تبقى مفهومة
  { value: 'created', label: 'إنشاء', color: 'gray' },
  { value: 'received_maintenance', label: 'تم استلام الجهاز وهو تحت الصيانة', color: 'blue' },
  { value: 'waiting_customer_approval_cost', label: 'في انتظار موافقة العميل على التكلفة', color: 'yellow' },
  { value: 'customer_approved_cost', label: 'العميل موافق على التكلفة', color: 'green' },
  { value: 'maintenance_after_approval', label: 'تحت الصيانة بعد موافقة العميل', color: 'blue' },
  { value: 'waiting_spare_parts', label: 'انتظار قطع الغيار', color: 'orange' },
  { value: 'spare_parts_unavailable', label: 'قطع الغيار غير متوفرة', color: 'red' },
  { value: 'sent_to_factory', label: 'تم الارسال الى المصنع للصيانة', color: 'purple' },
  { value: 'factory_maintenance_done', label: 'تمت الصيانة في المصنع', color: 'green' },
  { value: 'sent_from_factory', label: 'تم الارسال من المصنع بعد الانتهاء', color: 'green' },
  { value: 'factory_rejected', label: 'تم رفض الصيانة من المصنع', color: 'red' },
  // 🆕 نهاية الصيانة الفعلية + المراجعات قبل التسليم
  { value: 'maintenance_done', label: 'تمت الصيانة', color: 'green' },
  { value: 'financial_reviewed', label: 'تمت المراجعة ماليًا', color: 'emerald' },
  { value: 'material_reviewed', label: 'تمت المراجعة ماديًا', color: 'emerald' },
  { value: 'contacted_customer', label: 'تم التواصل مع العميل لاستلام الجهاز', color: 'blue' },
  { value: 'delivered_to_customer', label: 'تم التسليم للعميل', color: 'green' },
  { value: 'waiting_shipping_company', label: 'انتظار ارسال شركة الشحن', color: 'yellow' },
  { value: 'shipped_asc', label: 'تم الشحن ASC', color: 'sky' },
  { value: 'delivered_asc', label: 'تم التسليم ASC', color: 'green' },
  { value: 'rejected_by_customer', label: 'مرفوض من قبل العميل', color: 'red' },
  { value: 'rejected_and_delivered', label: 'مرفوض وتم التسليم', color: 'red' },
  { value: 'damaged_disposed', label: 'اتلاف و اهلاك', color: 'gray' },
  { value: 'closed', label: 'مغلق', color: 'gray' },
];

// 🆕 الحالات اللي معناها «الصيانة نفسها خلصت» — منها بيتحسب متوسط وقت الصيانة الفعلي
export const REPAIR_DONE_STATUSES = ['maintenance_done', 'factory_maintenance_done'];

// ✨ ميزة جديدة: تتبع SLA للتذاكر - الحالات دي بتعتبر "نهائية" (التذكرة
// خلصت)، فمينفعش تتحسب عليها مهلة SLA زي التذاكر المفتوحة

export const TICKET_TERMINAL_STATUSES = [
  'delivered_to_customer', 'closed', 'rejected_and_delivered',
  'delivered_asc', 'damaged_disposed', 'rejected_by_customer'
];

// بيحسب حالة SLA لتذكرة معينة: هل هي متأخرة، قريبة من الموعد، في الموعد،
// أو خلصت. بيرجع null لو مفيش تاريخ إنشاء أو أولوية غير معروفة.

export const ticketStatusOptions = TICKET_STATUSES.map(status => ({
  value: status.value,
  label: status.label
}));

// ==========================================================================
// 🏷️ TAG MANAGER
// ==========================================================================
