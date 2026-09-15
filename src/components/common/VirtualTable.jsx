import React from 'react';
import { FixedSizeList as List } from 'react-window';

export function VirtualTable({ data, columns, height = 600, rowHeight = 50 }) {
  const Row = ({ index, style }) => {
    const item = data[index];
    return (
      <div style={style} className="flex border-b hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
        {columns.map((col, idx) => (
          <div
            key={idx}
            className="p-3 text-sm truncate"
            style={{ width: col.width || `${100 / columns.length}%` }}
          >
            {col.render ? col.render(item) : item[col.field]}
          </div>
        ))}
      </div>
    );
  };

  return (
    <List
      height={height}
      itemCount={data.length}
      itemSize={rowHeight}
      width="100%"
    >
      {Row}
    </List>
  );
}

// ==========================================================================
// 🎨 THEME PROVIDER (للتبديل بين الوضع الفاتح والداكن)
// ==========================================================================
