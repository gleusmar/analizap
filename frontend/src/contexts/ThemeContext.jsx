import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    // Carregar do localStorage ou usar dark como padrão
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    // Salvar no localStorage quando mudar
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    // Adicionar/remover classe dark do body
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const colors = isDark ? {
    bg: '#111b21',
    bgSecondary: '#202c33',
    bgTertiary: '#2a3942',
    bg4: '#324048',
    text: '#e9edef',
    textSecondary: '#8696a0',
    text3: '#8b9ca6',
    border: '#2a3942',
    border2: '#323037',
    primary: '#00a884',
    primaryHover: '#008f6f',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
    meMessageBg: '#005c4b',
    meMessageText: '#ffffff'
  } : {
    bg: '#ffffff',
    bgSecondary: '#f0f2f5',
    bgTertiary: '#e4e6eb',
    bg4: '#f0f2f5',
    text: '#111b21',
    textSecondary: '#54656f',
    text3: '#656769',
    border: '#e4e6eb',
    border2: '#ebebeb',
    primary: '#00a884',
    primaryHover: '#008f6f',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
    meMessageBg: '#d9fdd3',
    meMessageText: '#111b21'
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};
