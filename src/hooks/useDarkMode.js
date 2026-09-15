import React, { useState, useEffect } from 'react';

const DARK_MODE_KEY = 'nouval_dark_mode';

const getInitialDarkMode = () => {
  const saved = localStorage.getItem(DARK_MODE_KEY);
  if (saved !== null) {
    return saved === 'true';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const useDarkMode = () => {
  const [isDark, setIsDark] = useState(getInitialDarkMode);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(DARK_MODE_KEY, isDark);
  }, [isDark]);

  const toggle = () => setIsDark(!isDark);

  return { isDark, toggle };
};

// ==========================================================================
// 🔄 SYNC MANAGER (للمزامنة مع السيرفر)
// ==========================================================================
