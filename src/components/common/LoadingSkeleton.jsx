export function LoadingSkeleton({ type = 'table', count = 1 }) {
  if (type === 'table') {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded mb-4 w-1/4"></div>
        <div className="space-y-3">
          {[...Array(count)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/6"></div>
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/6"></div>
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/6"></div>
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/6"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
      <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
    </div>
  );
}
// ==========================================================================
// 📦 الثوابت والبيانات
// ==========================================================================
