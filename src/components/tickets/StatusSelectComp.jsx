import { memo } from 'react';
import { TICKET_STATUSES } from '../../constants/tickets';

export const StatusSelectComp = memo(({ value, onChange, ticketId }) => {
  const handleChange = (e) => {
    // ✅ منع انتشار الحدث لأعلى
    e.stopPropagation();
    e.preventDefault();
    // ✅ تنفيذ التغيير
    onChange(ticketId, e.target.value);
  };

  const handleClick = (e) => {
    // ✅ منع انتشار حدث النقر
    e.stopPropagation();
  };

  const handleMouseDown = (e) => {
    // ✅ منع انتشار حدث الضغط بالماوس
    e.stopPropagation();
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onTouchStart={(e) => e.stopPropagation()}
      className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 bg-white dark:bg-slate-900 font-bold cursor-pointer hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400 relative z-10"
    >
      {TICKET_STATUSES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
});
