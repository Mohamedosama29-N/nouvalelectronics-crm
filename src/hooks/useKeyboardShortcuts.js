import React, { useEffect } from 'react';

export function useKeyboardShortcuts(handlers) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = `${e.ctrlKey ? 'ctrl+' : ''}${e.altKey ? 'alt+' : ''}${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`;
      
      const shortcuts = {
        'ctrl+f': handlers.onSearch,
        'ctrl+n': handlers.onAdd,
        'ctrl+s': handlers.onSave,
        'f5': handlers.onRefresh,
        'escape': handlers.onCancel,
        'ctrl+d': handlers.onDashboard,
        'ctrl+i': handlers.onInventory,
        'ctrl+t': handlers.onTransactions,
        'ctrl+c': handlers.onCustomers,
        'ctrl+shift+e': handlers.onExport,
        'ctrl+shift+p': handlers.onPrint,
        'ctrl+shift+d': handlers.onBulkDelete,
        'ctrl+shift+i': handlers.onImport,
        'ctrl+alt+r': handlers.onRefreshAll,
        'ctrl+alt+h': handlers.onHelp
      };
      
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

// ==========================================================================
// 🌙 DARK MODE
// ==========================================================================
