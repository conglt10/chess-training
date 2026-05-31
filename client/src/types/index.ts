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

export type FirstMoveTab = 'e4' | 'd4' | 'other';

export interface FamilySummary {
  name: string;
  count: number;
  previewMoves: string[];
}

export interface FamilySummariesResponse {
  families: FamilySummary[];
  total: number;
  page: number;
  pageSize: number;
  tabCounts: Record<FirstMoveTab, number>;
}

export type BoardTheme = 'brown' | 'blue' | 'green' | 'purple' | 'dark' | 'ice' | 'walnut' | 'maple' | 'mahogany';

export type PieceTheme = 'neo' | 'wikipedia' | 'alpha' | 'uscf' | 'classic' | 'business' | 'chess24';

export type AppMode = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  board: BoardTheme;
  pieces: PieceTheme;
  mode: AppMode;
}

export type AppView = 'list' | 'theory' | 'exercise' | 'vision' | 'coach';

export interface MoveEntry {
  moveNumber: number;
  white?: string;
  black?: string;
}
