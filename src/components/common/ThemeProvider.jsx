import React, { useState, useEffect } from 'react';
import { ThemeContext } from '../../hooks/useTheme';

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    try { const saved = localStorage.getItem('darkMode'); return saved ? JSON.parse(saved) : false; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('darkMode', JSON.stringify(darkMode)); } catch { /* التخزين مش متاح */ }
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}


// ==========================================================================
// 👤 عرض ملف الموظف
// ==========================================================================
