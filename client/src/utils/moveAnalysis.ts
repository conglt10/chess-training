/**
 * moveAnalysis.ts
 *
 * On-demand analysis of a SINGLE move (used by Master Games "review mode").
 * It evaluates the position before and after a move with Stockfish and returns
 * the same classification + coaching the full Game Review produces, so the two
 * features stay consistent.
 *
 * (The batch Game Review in useGameReview.ts keeps its own consecutive-position
 * optimization; this helper is for the one-move-at-a-time case.)
 */

import { Chess } from 'chess.js';
import { getStockfishService } from './stockfishService';
import { classifyMove, type Classification } from './moveClassifier';
import { generateReviewComment, tipFor, type ReviewComment } from './reviewCommentator';
import { cpToWinPercent } from './winPercent';

const ANALYSIS = { skillLevel: 20, depth: 16, multiPV: 3 };
const CLAMP = 1000;
const SAC_PLY_WINDOW = 8;

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function materialFor(fen: string, color: 'w' | 'b'): number {
  const board = fen.split(' ')[0];
  let total = 0;
  for (const ch of board) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue;
    const isWhite = ch === ch.toUpperCase();
    if ((color === 'w') === isWhite) total += PIECE_VALUE[ch.toLowerCase()] ?? 0;
  }
  return total;
}

function materialNet(fen: string, mover: 'w' | 'b'): number {
  return materialFor(fen, mover) - materialFor(fen, mover === 'w' ? 'b' : 'w');
}

function sideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Net material still sacrificed once the reply line's captures settle. */
function sacrificeAmount(fenBefore: string, fenAfter: string, replyPv: string[], mover: 'w' | 'b'): number {
  try {
    const baselineNet = materialNet(fenBefore, mover);
    const chess = new Chess(fenAfter);
    let settledNet: number | null = null;
    for (const m of replyPv.slice(0, SAC_PLY_WINDOW)) {
      const res = chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.length === 5 ? m[4] : undefined });
      if (!res) break;
      if (res.captured) settledNet = materialNet(chess.fen(), mover);
    }
    if (settledNet === null) return 0;
    return baselineNet - settledNet;
  } catch {
    return 0;
  }
}

export interface SingleMoveReview {
  classification: Classification;
  comment: ReviewComment;
  tip?: string;
  bestUci: string | null;
  bestSan: string | null;
  /** Eval after the move, WHITE's perspective (cp, clamped) */
  evalAfter: number;
  mateAfter: number | null;
  cpLoss: number;
}

/**
 * Analyze one move (the position before it and after it) and return its
 * classification, coach commentary, and the engine's best move.
 */
export async function reviewSingleMove(
  fenBefore: string,
  playedUci: string,
  opts: { isBookMove?: boolean; openingName?: string | null } = {},
): Promise<SingleMoveReview> {
  const svc = getStockfishService();
  await svc.waitReady();

  const mover = sideToMove(fenBefore);

  // Replay the move to get the resulting position + capture/check context.
  const chess = new Chess(fenBefore);
  const mv = chess.move({
    from: playedUci.slice(0, 2),
    to: playedUci.slice(2, 4),
    promotion: playedUci.length === 5 ? playedUci[4] : undefined,
  });
  if (!mv) throw new Error('illegal move');
  const fenAfter = chess.fen();
  const playedSan = mv.san;
  const isCapture = !!mv.captured;
  const givesCheck = chess.isCheck();

  const [before, after] = await Promise.all([
    svc.analyze(fenBefore, ANALYSIS).promise,
    svc.analyze(fenAfter, ANALYSIS).promise,
  ]);

  const scoreBefore = before.pvs[0]?.score ?? 0; // mover perspective
  const scoreAfter = after.pvs[0]?.score ?? 0;    // opponent perspective
  const evalBeforeForMover = scoreBefore;
  const evalAfterForMover = -scoreAfter;
  const cpLoss = clamp(Math.max(0, evalBeforeForMover - evalAfterForMover), 0, CLAMP);
  const winBefore = cpToWinPercent(evalBeforeForMover);
  const winAfter = cpToWinPercent(evalAfterForMover);

  const bestUci = before.pvs[0]?.moves[0] ?? before.bestMove ?? null;
  let bestSan: string | null = null;
  if (bestUci && bestUci !== '(none)') {
    try {
      const c = new Chess(fenBefore);
      bestSan = c.move({
        from: bestUci.slice(0, 2),
        to: bestUci.slice(2, 4),
        promotion: bestUci.length === 5 ? bestUci[4] : undefined,
      })?.san ?? null;
    } catch { bestSan = null; }
  }

  const isBest = !!bestUci && bestUci.toLowerCase() === playedUci.toLowerCase();
  let isOnlyMove = false;
  try { isOnlyMove = new Chess(fenBefore).moves().length === 1; } catch { /* noop */ }

  const secondBestGap = before.pvs[1] != null
    ? Math.max(0, (before.pvs[0]?.score ?? 0) - (before.pvs[1]?.score ?? 0))
    : 0;

  const sacrifice = isBest
    ? sacrificeAmount(fenBefore, fenAfter, after.pvs[0]?.moves ?? [], mover)
    : 0;

  const classification = classifyMove({
    isBest, isOnlyMove,
    isBookMove: opts.isBookMove ?? false,
    sacrificeAmount: sacrifice,
    secondBestGap, winBefore, winAfter,
  });

  const afterStm = sideToMove(fenAfter);
  const evalAfterWhite = clamp(afterStm === 'w' ? scoreAfter : -scoreAfter, -CLAMP, CLAMP);
  const mateAfterWhite = after.mateIn != null ? (afterStm === 'w' ? after.mateIn : -after.mateIn) : null;
  const mateForMover = after.mateIn != null ? -after.mateIn : null;

  const comment = generateReviewComment({
    classification,
    san: playedSan,
    bestSan: isBest ? null : bestSan,
    cpLoss,
    evalForMover: evalAfterForMover,
    mateForMover,
    isCapture,
    givesCheck,
    openingName: opts.openingName ?? null,
  });

  return {
    classification,
    comment,
    tip: tipFor(classification, playedSan.length + cpLoss),
    bestUci: bestUci && bestUci !== '(none)' ? bestUci : null,
    bestSan,
    evalAfter: evalAfterWhite,
    mateAfter: mateAfterWhite,
    cpLoss,
  };
}
