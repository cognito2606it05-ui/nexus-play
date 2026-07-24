import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

export const lightColors = {
  bg: '#FFFFFF',
  surface: '#F8F9FA',
  surfaceAlt: '#E9ECEF',
  border: '#DEE2E6',
  text: '#000000',
  textDim: '#333333',
  textFaint: 'rgba(0, 0, 0, 0.5)',
  primary: '#0D47A1',
  accent: '#D32F2F',
  like: '#D32F2F',
  breaking: '#D32F2F',
  success: '#2E7D32',
  warning: '#F57C00',
  error: '#D32F2F',
  placeholder: 'rgba(0, 0, 0, 0.4)',
  cardBg: '#FFFFFF',
  textInverse: '#FFFFFF',
  headerBg: 'rgba(255, 255, 255, 0.85)',
};

export const darkColors = {
  bg: '#0F172A',
  surface: '#1E293B',
  surfaceAlt: '#334155',
  border: '#475569',
  text: '#F8FAFC',
  textDim: '#94A3B8',
  textFaint: 'rgba(248, 250, 252, 0.4)',
  primary: '#3B82F6',
  accent: '#EF4444',
  like: '#EF4444',
  breaking: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  placeholder: 'rgba(248, 250, 252, 0.4)',
  cardBg: '#1E293B',
  textInverse: '#0F172A',
  headerBg: 'rgba(15, 23, 42, 0.85)',
};

export type ThemeColors = typeof lightColors;

interface ThemeContextType {
  themeMode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'nexus.theme.mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  useEffect(() => {
    (async () => {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedMode === 'light' || savedMode === 'dark') {
          setThemeMode(savedMode);
        }
      } catch (err) {
        console.error('Failed to load saved theme:', err);
      }
    })();
  }, []);

  const toggleTheme = () => {
    setThemeMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      void AsyncStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  };

  const colors = themeMode === 'light' ? lightColors : darkColors;
  const isDark = themeMode === 'dark';

  return (
    <ThemeContext.Provider value={{ themeMode, colors, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
