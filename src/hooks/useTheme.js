import React, { useContext } from 'react';

export const ThemeContext = React.createContext(null);

// برّه ThemeProvider (زي الطباعة أو الاختبارات) بنرجّع الوضع الحالي من الصفحة بدل ما نوقع
const fallback = () => ({
  darkMode: typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  toggleDarkMode: () => {},
});

export const useTheme = () => useContext(ThemeContext) || fallback();
