export interface Opening {
  eco: string;
  name: string;
  pgn: string;
  moves: string[];
  family: string;
}

export interface OpeningsResponse {
  openings: Opening[];
  total: number;
  page: number;
  pageSize: number;
}

export type BoardTheme = 'brown' | 'blue' | 'green' | 'purple' | 'dark' | 'ice';

export type PieceTheme = 'wikipedia' | 'alpha' | 'uscf' | 'classic' | 'business' | 'chess24';

export type AppMode = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  board: BoardTheme;
  pieces: PieceTheme;
  mode: AppMode;
}

export type AppView = 'list' | 'theory' | 'exercise';

export interface MoveEntry {
  moveNumber: number;
  white?: string;
  black?: string;
}
