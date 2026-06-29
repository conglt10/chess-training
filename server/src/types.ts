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
  eco: string;             // ECO code (e.g. "B90"), '' if absent
  opening: string;         // opening name (header, or derived from ECO), '' if unknown
  plies: number;           // half-move count (for move-count sort/display)
  collectionKey: string;   // which collection this game came from
  collection: string;      // human-readable collection label
  moves: string[];     // SAN, full game
  uciMoves: string[];  // UCI, same length as moves
}

/** A player/source collection of games. */
export interface Collection {
  key: string;
  label: string;
  count: number;
}

/** Game metadata without the (heavy) move lists — used in explorer game lists. */
export type MasterGameSummary = Omit<MasterGame, 'moves' | 'uciMoves'>;

/** Aggregated stats for one move played from a given position. */
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
  moves: MoveStat[];            // sorted by gameCount desc
  totalGames: number;          // distinct games reaching this position
  games: MasterGameSummary[];  // paginated slice
  total: number;
  page: number;
  pageSize: number;
}
