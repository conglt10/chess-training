/**
 * winPercent.ts
 *
 * Converts engine centipawn evaluations into win-probability and accuracy,
 * following the Lichess / chess.com CAPS-style approach.
 *
 * Game accuracy mirrors chess.com more closely than a plain average:
 *   - per-move accuracy from the mover's win-probability drop
 *   - already-decided positions are excluded (a dead-lost endgame full of
 *     "only moves" should not inflate the losing side's score)
 *   - moves are weighted by local volatility (how sharp the position is)
 *   - the score blends a volatility-weighted mean with a volatility-weighted
 *     harmonic mean, so a few bad moves pull the score down realistically
 */

/** Win probability (0–100) for the side the eval is measured from. */
export function cpToWinPercent(cp: number): number {
  const clamped = Math.max(-2000, Math.min(2000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/** Accuracy (0–100) for a single move from the mover's win-probability drop. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

export interface AccuracyMove {
  /** ply index into the full game (0-based) */
  ply: number;
  color: 'w' | 'b';
  /** per-move accuracy (0–100) */
  accuracy: number;
  /** mover's win probability before the move (0–100) */
  winBefore: number;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function harmonicMean(values: number[]): number {
  if (values.length === 0) return 100;
  return values.length / values.reduce((s, v) => s + 1 / Math.max(v, 0.01), 0);
}

/**
 * Accuracy (0–100) for one side across the game.
 *
 * @param moves     every move's accuracy/win data, both colors
 * @param winWhite  white-perspective win% for each position (length = plies + 1)
 * @param color     side to score
 */
export function sideAccuracy(moves: AccuracyMove[], winWhite: number[], color: 'w' | 'b'): number {
  const ofColor = moves.filter(m => m.color === color);
  if (ofColor.length === 0) return 100;

  // Exclude already-decided positions so forced dead-position moves don't inflate.
  let pool = ofColor.filter(m => m.winBefore > 2 && m.winBefore < 98);
  if (pool.length === 0) pool = ofColor; // whole game was decided — fall back

  const windowSize = Math.max(2, Math.min(8, Math.ceil(moves.length / 10)));
  const N = winWhite.length;
  const weightOf = (ply: number): number => {
    const lo = Math.max(0, ply - windowSize);
    const hi = Math.min(N, ply + windowSize + 1);
    return Math.max(stdev(winWhite.slice(lo, hi)), 0.05);
  };

  const accs = pool.map(m => m.accuracy);
  const weights = pool.map(m => weightOf(m.ply));
  const sumW = weights.reduce((a, b) => a + b, 0);

  const weightedMean = pool.reduce((s, m, k) => s + m.accuracy * weights[k], 0) / sumW;
  const weightedHarmonic = sumW / pool.reduce((s, m, k) => s + weights[k] / Math.max(m.accuracy, 0.01), 0);

  // Blend keeps a few errors influential (harmonic) while honoring volatility.
  const blended = (weightedMean + weightedHarmonic) / 2;
  // Guard against degenerate inputs.
  return Number.isFinite(blended) ? Math.max(0, Math.min(100, blended)) : harmonicMean(accs);
}
