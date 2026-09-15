import React from 'react';
import {
  Edit,
  Phone,
  Eye,
  HardHat,
  AlertCircle
} from 'lucide-react';
import { TICKET_STATUSES } from '../../constants/tickets';
import { formatDate } from '../../utils/format';

// 🛠️ تحسين أداء: TicketCard بيتعرض جوه list.map() لكل تذاكر الصفحة الحالية.
// من غير React.memo، أي تحديث في حالة الشاشة الأب (حتى لو مش متعلق
// بالتذكرة دي تحديدًا) كان بيعيد رسم كل الكروت من الأول.
export const TicketCard = React.memo(function TicketCard({ ticket, onStatusChange, onView, onEdit }) {
  const statusInfo = TICKET_STATUSES.find(s => s.value === ticket.status) || { label: ticket.status, color: 'gray' };

  // 🛠️ FIX: بناء اسم الكلاس ديناميكيًا زي `bg-${color}-100` مبيشتغلش صح في
  // الإنتاج، لأن Tailwind بيفحص الكود وقت البناء (build) بحثًا عن نصوص
  // كلاسات كاملة وحرفية بس، ومش بيقدر يفهم template literals متغيّرة،
  // فبيشيل (purge) الكلاسات دي من ملف الـ CSS النهائي. النتيجة: شارة حالة
  // التذكرة كانت بتظهر من غير أي لون خالص في نسخة الإنتاج، خصوصًا الألوان
  // اللي مالهاش استخدام حرفي تاني في الكود (yellow و red بالذات).
  const STATUS_COLOR_CLASSES = {
    gray: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    sky: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
  };
  const statusColorClasses = STATUS_COLOR_CLASSES[statusInfo.color] || STATUS_COLOR_CLASSES.gray;
  
  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'high': return 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'medium': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'low': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-all">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-teal-600 dark:text-teal-400">#{ticket.ticketNumber}</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${getPriorityColor(ticket.priority)}`}>
              {ticket.priority === 'high' ? 'عالية' : ticket.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
            </span>
          </div>
          <h4 className="font-bold text-slate-800 dark:text-white">{ticket.customerName}</h4>
        </div>
        <span className={`px-2 py-1 rounded-full text-[9px] font-bold border ${statusColorClasses}`}>
          {statusInfo.label}
        </span>
      </div>
      
      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 mb-4">
        <p className="flex items-center gap-1">
          <Phone size={12} className="text-slate-400" />
          {ticket.customerPhone}
        </p>
        {ticket.deviceType && (
          <p className="flex items-center gap-1">
            <HardHat size={12} className="text-slate-400" />
            {ticket.deviceType} {ticket.deviceModel && `- ${ticket.deviceModel}`}
            {ticket.deviceSerial && ` (${ticket.deviceSerial})`}
          </p>
        )}
        <p className="flex items-center gap-1">
          <AlertCircle size={12} className="text-slate-400" />
          {ticket.issue?.substring(0, 50)}{ticket.issue?.length > 50 ? '...' : ''}
        </p>
      </div>
      
      <div className="flex justify-between items-center">
        <div className="text-[9px] text-slate-400">
          <p>تاريخ الإنشاء: {formatDate(ticket.createdAt)}</p>
          {ticket.estimatedCost > 0 && <p>التكلفة: {ticket.estimatedCost} ج</p>}
        </div>
       <div className="flex gap-2">

          <select
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 bg-white dark:bg-slate-900"
            value={ticket.status}
            onChange={(e) => {
              // ✅ منع انتشار الحدث لأعلى (نفس إصلاح StatusSelectComp)
              e.stopPropagation();
              onStatusChange(ticket.id, e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {TICKET_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <button
            onClick={() => onView(ticket)}
            className="p-1.5 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded"
          >
            <Eye size={14} />
          </button>

          <button
            onClick={() => onEdit(ticket)}
            className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded"
          >
            <Edit size={14} />
          </button>

        </div>
      </div>
    </div>
  );
});

// ==========================================================================
// 🎫 مدير التذاكر المحسن مع فتح كامل للتذكرة وإدارة متكاملة
// ==========================================================================

// ==========================================================================
// 🎫 مدير التذاكر المحسن - كامل مع كل الإضافات
// ==========================================================================
// ==========================================================================
// 🎫 مدير التذاكر المحسن - كامل مع كل الإضافات (النظام الجديد 5 مستويات)
// ==========================================================================
// ==========================================================================
// 🎫 مدير التذاكر المحسن - كامل مع كل الإضافات
// ==========================================================================
// ==========================================================================
// 🎫 مدير التذاكر المحسن - كامل مع كل الإضافات
// ==========================================================================
// ==========================================================================
// ✅ مكون اختيار الحالة (مع منع انتشار الحدث بالكامل)
// 🛠️ FIX: هذا المكوّن كان مُعرَّفًا جوه EnhancedTicketManager نفسه (function
// داخل function)، يعني كل مرة الأب بيعيد الرسم (لأي سبب، حتى لو مش متعلق
// بالتذاكر خالص) كان React بيشوفه "component type" جديد كل مرة، فيهدم
// عنصر <select> القديم ويبني واحد جديد بدل منه. أي popup مفتوح من المتصفح
// (زي قائمة الاختيار) مرتبط بالـ DOM node القديم بالذات، فلما تنهدم بيتقفل
// القائمة فورًا - وده اللي كان بيبان "بيتقفل قبل ما ألحق أختار". نقله هنا
// كمكوّن ثابت على مستوى الملف بيحل المشكلة نهائيًا لأن هويته متتغيرش أبدًا.
// ==========================================================================
