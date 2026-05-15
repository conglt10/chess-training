import { useState, useEffect } from 'react';
import { ThemeConfig, BoardTheme, PieceTheme } from '../types';

const STORAGE_KEY = 'chess-trainer-theme';

const defaultTheme: ThemeConfig = {
  board: 'brown',
  pieces: 'standard',
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
    // Apply CSS variables for board theme
    document.documentElement.setAttribute('data-board-theme', theme.board);
  }, [theme]);

  const setBoardTheme = (board: BoardTheme) => setTheme(t => ({ ...t, board }));
  const setPieceTheme = (pieces: PieceTheme) => setTheme(t => ({ ...t, pieces }));

  return { theme, setBoardTheme, setPieceTheme };
}
