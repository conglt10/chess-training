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

export type AppView = 'list' | 'theory' | 'exercise' | 'vision' | 'coach' | 'masters' | 'review';

export interface MoveEntry {
  moveNumber: number;
  white?: string;
  black?: string;
}

// ── Master games ───────────────────────────────────────────────────────────
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface MasterGame {
  id: string;
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  event: string;
  date: string;
  year: number | null;
  result: GameResult;
  eco: string;
  opening: string;
  plies: number;
  collectionKey: string;
  collection: string;
  moves: string[];
  uciMoves: string[];
}

export type MasterGameSummary = Omit<MasterGame, 'moves' | 'uciMoves'>;

export interface Collection {
  key: string;
  label: string;
  count: number;
  category?: 'elite' | 'player' | 'opening';
  group?: 'e4' | 'd4' | 'other';
  popular?: boolean;
}

export interface CollectionGamesResponse {
  games: MasterGameSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MoveStat {
  san: string;
  uci: string;
  gameCount: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
}

export interface ExplorerResult {
  fen: string;
  moves: MoveStat[];
  totalGames: number;
  games: MasterGameSummary[];
  total: number;
  page: number;
  pageSize: number;
}
