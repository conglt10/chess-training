/**
 * moveClassifier.ts
 *
 * Classifies a played move into the Chess.com-style taxonomy from Stockfish
 * analysis, and holds the display metadata (label, color, glyph) for each class.
 *
 * The classification is heuristic — it mirrors how chess.com presents moves as
 * closely as is practical from raw engine evals: centipawn loss for the base
 * tier, plus special handling for book / forced / brilliant / great / miss.
 */

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'
  | 'forced';

export interface ClassificationMeta {
  label: string;
  /** Annotation symbol shown next to the move (may be empty) */
  symbol: string;
  /** Glyph drawn inside the colored board/list icon */
  glyph: string;
  color: string;
}

export const CLASSIFICATION_META: Record<Classification, ClassificationMeta> = {
  brilliant:  { label: 'Brilliant',  symbol: '!!', glyph: '!!', color: '#26c2a3' },
  great:      { label: 'Great',      symbol: '!',  glyph: '!',  color: '#749bbf' },
  best:       { label: 'Best',       symbol: '',   glyph: '★',  color: '#81b64c' },
  excellent:  { label: 'Excellent',  symbol: '',   glyph: '✓',  color: '#81b64c' },
  good:       { label: 'Good',       symbol: '',   glyph: '✓',  color: '#95b776' },
  book:       { label: 'Book',       symbol: '',   glyph: '♟',  color: '#a88865' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', glyph: '?!', color: '#f7c631' },
  mistake:    { label: 'Mistake',    symbol: '?',  glyph: '?',  color: '#ffa459' },
  miss:       { label: 'Miss',       symbol: '×',  glyph: '✕',  color: '#ee6b55' },
  blunder:    { label: 'Blunder',    symbol: '??', glyph: '??', color: '#fa412d' },
  forced:     { label: 'Forced',     symbol: '',   glyph: '□',  color: '#9b9b9b' },
};

/** Order used for the summary report (left → right, best → worst). */
export const CLASSIFICATION_ORDER: Classification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good',
  'book', 'inaccuracy', 'miss', 'mistake', 'blunder',
];

export interface ClassifyInput {
  /** Did the player play the engine's top move? */
  isBest: boolean;
  /** Only one legal move was available */
  isOnlyMove: boolean;
  /** This move is part of the recognised opening book line */
  isBookMove: boolean;
  /**
   * NET material (points) the mover is still down after the reply line settles
   * (> 0 ⇒ a genuine, unrecovered sacrifice). Used for Brilliant.
   */
  sacrificeAmount: number;
  /** Centipawn gap between the best and 2nd-best move (large = critical/only-good) */
  secondBestGap: number;
  /** Mover's win probability (0–100) before the move */
  winBefore: number;
  /** Mover's win probability (0–100) after the move */
  winAfter: number;
}

/**
 * Classify a move using the WIN-PROBABILITY drop, the way chess.com does — not
 * raw centipawns. This makes the rating position-aware: giving up 3 pawns while
 * already completely winning barely changes the win chance and is NOT a blunder,
 * whereas a small centipawn loss in a balanced position can be a real mistake.
 */
export function classifyMove(i: ClassifyInput): Classification {
  const { isBest, isOnlyMove, isBookMove, sacrificeAmount, secondBestGap, winBefore, winAfter } = i;

  if (isOnlyMove) return 'forced';
  if (isBookMove) return 'book';

  const winDrop = Math.max(0, winBefore - winAfter); // percentage points

  // Brilliant: a sound, unrecovered piece sacrifice (≥ a minor piece) that is the
  // engine's best move, played in a still-competitive game (not already won/lost),
  // and that keeps a good position.
  if (isBest && sacrificeAmount >= 2 && winBefore >= 25 && winBefore <= 80 && winAfter >= 50 && winDrop < 2) {
    return 'brilliant';
  }

  // Great: the only strong move in a sharp position (the alternatives are much
  // worse) while the game is still in the balance.
  if ((isBest || winDrop < 2) && secondBestGap >= 200 && winBefore > 15 && winBefore < 85) {
    return 'great';
  }

  if (isBest) return 'best';
  if (winDrop < 2) return 'excellent';
  if (winDrop < 5) return 'good';
  if (winDrop < 10) return 'inaccuracy';

  // Big drop: a Miss when the mover was at least equal and let a real chance slip,
  // otherwise a Mistake (≤ 20 pts) or Blunder (> 20 pts).
  if (winDrop < 20) return winBefore >= 50 ? 'miss' : 'mistake';
  return winBefore >= 50 ? 'miss' : 'blunder';
}
