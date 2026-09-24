/**
 * chessEvaluator.ts
 *
 * Win-probability model + move classification for the frontend-only Game
 * Review (WhyBlunder spec §2).
 *
 * Engine centipawn scores (cp) convert to winning probabilities (WP ∈ [0,1])
 * via the standard logistic model centered at zero:
 *
 *   WP = 1 / (1 + 10^(-cp/400))
 *
 * Mate scores map to a bounded centipawn scale:
 *   cp = sign(m) * (10000 - 10 * |m|)   for mate in m moves.
 *
 * Classification (ΔWP = WP_before − WP_after, both mover perspective):
 *
 * | Class      | Condition                                              |
 * | Brilliant  | best ∧ true sacrifice ∧ WP_after ≥ .60 ∧ WP_2nd ≤ .90  |
 * |            |   ∧ (WP_after − WP_2nd) ≥ .05                           |
 * | Great      | best ∧ critical/only-move (large 2nd-best gap)          |
 * | Best       | best ∧ (isOnlyMove ∨ ΔWP ≤ .01)                         |
 * | Book       | ECO line match (ply ≤ 16)                               |
 * | Inaccuracy | .04 ≤ ΔWP < .10 (downgraded from mistake if WP > .90)   |
 * | Mistake    | .10 ≤ ΔWP < .22                                        |
 * | Blunder    | ΔWP ≥ .22 ∨ missed win (before ≥ .85 ∧ after < .55);    |
 * |            |   no blunder when simplifying (WP ≥ .95 ∧ ΔWP < .15)    |
 *
 * Win probabilities are exposed on the 0–100 scale (WP × 100) to stay
 * compatible with the accuracy pipeline (`moveAccuracy`/`sideAccuracy`).
 */

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

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
  book:       { label: 'Book',       symbol: '',   glyph: '♟',  color: '#a88865' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', glyph: '?!', color: '#f7c631' },
  mistake:    { label: 'Mistake',    symbol: '?',  glyph: '?',  color: '#ffa459' },
  blunder:    { label: 'Blunder',    symbol: '??', glyph: '??', color: '#fa412d' },
};

/** Order used for the summary report (left → right, best → worst). */
export const CLASSIFICATION_ORDER: Classification[] = [
  'brilliant', 'great', 'best', 'book', 'inaccuracy', 'mistake', 'blunder',
];

// ── Win probability ──────────────────────────────────────────────────────────

/** Bounded centipawn equivalent of a mate-in-m score (mover perspective). */
export function mateToCp(mateInMoves: number): number {
  const sign = mateInMoves > 0 ? 1 : -1;
  return sign * (10_000 - 10 * Math.abs(mateInMoves));
}

/** Win probability ∈ [0,1] from a centipawn eval (mover perspective). */
export function cpToWinProb(cp: number): number {
  return 1 / (1 + Math.pow(10, -cp / 400));
}

/** Win probability on the 0–100 scale (accuracy-pipeline compatible). */
export function cpToWinPercent(cp: number): number {
  return cpToWinProb(cp) * 100;
}

/** Win probability (0–100) when the engine reports a forced mate. */
export function mateToWinPercent(mateInMoves: number): number {
  return mateInMoves > 0 ? 100 : 0;
}

// ── Classification ───────────────────────────────────────────────────────────

export interface ClassifyInput {
  /** Did the player play the engine's top move? */
  isBest: boolean;
  /** Only one legal move was available (maps to Great/Best per spec). */
  isOnlyMove: boolean;
  /** This move is part of the recognised opening book line (ply ≤ 16). */
  isBookMove: boolean;
  /**
   * NET material (points) the mover is still down after the reply line
   * settles (> 0 ⇒ genuine, unrecovered sacrifice). Used for Brilliant.
   */
  sacrificeAmount: number;
  /** Centipawn gap between the best and 2nd-best move (critical-move signal). */
  secondBestGap: number;
  /** Mover's win probability (0–100) for the 2nd-best move, if known. */
  winSecondBest?: number | null;
  /** Mover's win probability (0–100) before the move. */
  winBefore: number;
  /** Mover's win probability (0–100) after the move. */
  winAfter: number;
}

/** Centipawn gap that marks a position as sharp / only-one-good-move. */
const CRITICAL_GAP_CP = 150;

export function classifyMove(i: ClassifyInput): Classification {
  const {
    isBest, isOnlyMove, isBookMove, sacrificeAmount, secondBestGap,
    winBefore, winAfter,
  } = i;
  const winSecondBest = i.winSecondBest ?? null;

  if (isBookMove) return 'book';

  // Work on the 0–1 scale from here (spec thresholds).
  const wb = winBefore / 100;
  const wa = winAfter / 100;
  const drop = Math.max(0, wb - wa);

  // Brilliant: sound unrecovered sacrifice that is the engine's best move,
  // keeping a good position while the 2nd-best line is clearly worse.
  if (isBest && sacrificeAmount >= 2 && wa >= 0.60) {
    const gapToSecond = winSecondBest !== null ? wa - winSecondBest / 100 : 0;
    const secondOk = winSecondBest === null || winSecondBest / 100 <= 0.90;
    if (secondOk && gapToSecond >= 0.05) return 'brilliant';
    // Without 2nd-best info, still reward a true best-move sacrifice that
    // keeps a clear edge in a competitive position.
    if (winSecondBest === null && wb >= 0.2 && wb <= 0.9 && drop < 0.02) return 'brilliant';
  }

  // Great: the only strong move in a sharp position (alternatives much
  // worse) — the "critical move" find. Best: engine's top move otherwise.
  if (isBest) {
    if (secondBestGap >= CRITICAL_GAP_CP && wb > 0.15 && wb < 0.85) return 'great';
    if (isOnlyMove || drop <= 0.01) return 'best';
    return 'best';
  }

  // Simplifying guard: barely denting a fully-won position is never a blunder.
  const simplifying = wb >= 0.95 && drop < 0.15;

  // Missed win escalates straight to blunder.
  const missedWin = wb >= 0.85 && wa < 0.55;
  if (missedWin) return 'blunder';
  if (drop >= 0.22) return simplifying ? 'mistake' : 'blunder';
  if (drop >= 0.10) {
    // Downgrade from mistake while converting a clearly-won game.
    if (wb > 0.90) return 'inaccuracy';
    return 'mistake';
  }
  if (drop >= 0.04) return 'inaccuracy';

  // Negligible drop but not the top move → still best-like; spec folds this
  // into Great/Best (ΔWP ≤ .01). Anything slightly larger already returned.
  return 'best';
}
