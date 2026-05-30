import { useState, useEffect } from 'react';
import { ThemeConfig, BoardTheme, PieceTheme, AppMode } from '../types';
import { DEFAULT_PIECE_THEME } from '../pieces/themes';

const STORAGE_KEY = 'chess-trainer-theme';

const defaultTheme: ThemeConfig = {
  board: 'brown',
  pieces: DEFAULT_PIECE_THEME,
  mode: 'dark',
};

export function useTheme() {
  const [theme, setTheme] = useState<ThemeConfig>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    
    // Apply board theme
    document.documentElement.setAttribute('data-board-theme', theme.board);
    
    // Apply app mode
    const applyMode = (m: 'light' | 'dark') => {
      document.documentElement.classList.remove('light-mode', 'dark-mode');
      document.documentElement.classList.add(`${m}-mode`);
    };

    if (theme.mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyMode(mediaQuery.matches ? 'dark' : 'light');
      
      handleChange(); // Initial check
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      applyMode(theme.mode);
    }
  }, [theme]);

  const setBoardTheme = (board: BoardTheme) => setTheme(t => ({ ...t, board }));
  const setPieceTheme = (pieces: PieceTheme) => setTheme(t => ({ ...t, pieces }));
  const setAppMode = (mode: AppMode) => setTheme(t => ({ ...t, mode }));

  return { theme, setBoardTheme, setPieceTheme, setAppMode };
}
