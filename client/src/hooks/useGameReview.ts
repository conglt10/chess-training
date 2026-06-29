/**
 * useGameReview.ts
 *
 * Runs a full-game Stockfish analysis for the Game Review feature and derives
 * everything chess.com shows: per-move classification, coach commentary,
 * centipawn evals (for the graph), accuracy %, and per-side move counts.
 *
 * Analysis strategy: each position in the game (start … final) is evaluated
 * once with multi-PV. The eval AFTER a move equals the (negated) best eval of
 * the next position, so a single pass over N+1 positions yields both the
 * "before" and "after" evals for every move — no double analysis needed.
 * Positions are analyzed with a small concurrency pool that matches the
 * server's engine pool.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { getStockfishService } from '../utils/stockfishService';
import type { ParsedGame } from '../utils/pgnImport';
import {
  classifyMove, CLASSIFICATION_ORDER,
  type Classification,
} from '../utils/moveClassifier';
import { generateReviewComment, tipFor, type ReviewComment } from '../utils/reviewCommentator';
import { cpToWinPercent, moveAccuracy, sideAccuracy, type AccuracyMove } from '../utils/winPercent';
import { identifyOpening } from '../api/importGame';

// ── Tunables ───────────────────────────────────────────────────────────────────

// Fixed depth (no movetime cap) → consistent evals, which the win%/cpLoss math
// depends on. multiPV gives us the 2nd-best move for "Great"/"only-move" detection.
const ANALYSIS = { skillLevel: 20, depth: 16, multiPV: 3 };
const CONCURRENCY = 3;            // matches the server engine pool
const EVAL_CLAMP = 1000;         // cp clamp for display/graph (±10 pawns)
const CP_LOSS_CAP = 1000;        // cap centipawn loss so mate swings stay sane
const SAC_PLY_WINDOW = 8;        // plies of the reply line to settle material over

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReviewedMove {
  ply: number;                 // 0-based index into the move list
  moveNumber: number;          // full-move number (1, 1, 2, 2, …)
  san: string;
  color: 'w' | 'b';
  from: string;
  to: string;
  uci: string;
  classification: Classification;
  comment: ReviewComment;
  tip?: string;
  /** Whether the move captured a piece (for move/capture sound playback) */
  isCapture: boolean;
  cpLoss: number;
  /** Eval after this move, WHITE's perspective (cp, clamped) */
  evalAfter: number;
  mateAfter: number | null;
  /** Engine's best move at the position BEFORE this move */
  bestUci: string | null;
  bestSan: string | null;
  fenBefore: string;
  fenAfter: string;
}

export type ReviewPhase = 'idle' | 'analyzing' | 'done' | 'error';

interface PositionEval {
  scoreSTM: number;        // best move score, side-to-move perspective (cp)
  score2STM: number | null; // 2nd-best score, same perspective (cp)
  bestUci: string | null;
  pv: string[];            // best line (UCI), used for sacrifice detection
  mate: number | null;     // mate distance, side-to-move perspective
  whiteEval: number;       // best eval, white perspective (cp, clamped)
}

export interface UseGameReviewState {
  phase: ReviewPhase;
  progress: number;         // 0..1
  error: string | null;
  game: ParsedGame | null;
  moves: ReviewedMove[];
  evalSeries: number[];     // white-pov cp after each move (clamped), length = moves
  openingName: string | null;
  openingEco: string | null;
  accuracy: { white: number; black: number };
  counts: { white: Record<Classification, number>; black: Record<Classification, number> };
  currentPly: number;       // -1 = start position; otherwise index into moves
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Total material (points) for one color from a FEN. */
function materialFor(fen: string, color: 'w' | 'b'): number {
  const board = fen.split(' ')[0];
  let total = 0;
  for (const ch of board) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue;
    const isWhite = ch === ch.toUpperCase();
    if ((color === 'w') === isWhite) {
      total += PIECE_VALUE[ch.toLowerCase()] ?? 0;
    }
  }
  return total;
}

/** Net material (mover − opponent) from a FEN. */
function materialNet(fen: string, mover: 'w' | 'b'): number {
  return materialFor(fen, mover) - materialFor(fen, mover === 'w' ? 'b' : 'w');
}

/**
 * How much NET material the mover is still down once the reply line's captures
 * settle (measured after the last capture). > 0 ⇒ a genuine, unrecovered
 * sacrifice; equal trades net to ~0. Robust against window boundaries cutting
 * mid-exchange because it anchors on the last capture, not a fixed ply count.
 */
function sacrificeAmount(fenBefore: string, fenAfter: string, replyPv: string[], mover: 'w' | 'b'): number {
  try {
    const baselineNet = materialNet(fenBefore, mover);
    const chess = new Chess(fenAfter);
    let settledNet: number | null = null;
    for (const m of replyPv.slice(0, SAC_PLY_WINDOW)) {
      const res = chess.move({
        from: m.slice(0, 2),
        to: m.slice(2, 4),
        promotion: m.length === 5 ? m[4] : undefined,
      });
      if (!res) break;
      if (res.captured) settledNet = materialNet(chess.fen(), mover);
    }
    if (settledNet === null) return 0; // no captures in the reply ⇒ no sacrifice
    return baselineNet - settledNet;
  } catch {
    return 0;
  }
}

function sideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function emptyCounts(): Record<Classification, number> {
  return {
    brilliant: 0, great: 0, best: 0, excellent: 0, good: 0,
    book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, forced: 0,
  };
}

/** Run async tasks over `items` with bounded concurrency, reporting progress. */
async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress: (done: number) => void,
  isCancelled: () => boolean,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  async function runner() {
    while (true) {
      if (isCancelled()) return;
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      done++;
      onProgress(done);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, runner);
  await Promise.all(runners);
  return results;
}

const EMPTY_STATE: UseGameReviewState = {
  phase: 'idle',
  progress: 0,
  error: null,
  game: null,
  moves: [],
  evalSeries: [],
  openingName: null,
  openingEco: null,
  accuracy: { white: 100, black: 100 },
  counts: { white: emptyCounts(), black: emptyCounts() },
  currentPly: -1,
};

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useGameReview() {
  const [state, setState] = useState<UseGameReviewState>(EMPTY_STATE);
  const cancelledRef = useRef(false);
  const inflightCancels = useRef<Array<() => void>>([]);

  const cancelAll = useCallback(() => {
    cancelledRef.current = true;
    inflightCancels.current.forEach(c => { try { c(); } catch { /* noop */ } });
    inflightCancels.current = [];
  }, []);

  useEffect(() => () => cancelAll(), [cancelAll]);

  const setCurrentPly = useCallback((ply: number) => {
    setState(s => ({ ...s, currentPly: ply }));
  }, []);

  const reset = useCallback(() => {
    cancelAll();
    cancelledRef.current = false;
    setState(EMPTY_STATE);
  }, [cancelAll]);

  const start = useCallback(async (game: ParsedGame) => {
    cancelAll();
    cancelledRef.current = false;

    setState({ ...EMPTY_STATE, phase: 'analyzing', game });

    // Kick off opening identification in parallel with the engine analysis.
    const openingPromise = identifyOpening(game.sanMoves).catch(() => null);

    try {
      const svc = getStockfishService();
      await svc.waitReady();
      if (cancelledRef.current) return;

      const fens = game.fens; // length = moves + 1
      const total = fens.length;

      // ── Analyze every position once ─────────────────────────────────────────
      const positions = await runPool<string, PositionEval>(
        fens,
        CONCURRENCY,
        async (fen) => {
          const { promise, cancel } = svc.analyze(fen, ANALYSIS);
          inflightCancels.current.push(cancel);
          let res;
          try {
            res = await promise;
          } catch {
            // cancelled or engine error — treat as neutral
            return { scoreSTM: 0, score2STM: null, bestUci: null, pv: [], mate: null, whiteEval: 0 };
          }
          const stm = sideToMove(fen);
          const scoreSTM = res.pvs[0]?.score ?? 0;
          const score2STM = res.pvs[1]?.score ?? null;
          const pv = res.pvs[0]?.moves ?? [];
          const bestUci = pv[0] ?? res.bestMove ?? null;
          const whiteRaw = stm === 'w' ? scoreSTM : -scoreSTM;
          return {
            scoreSTM,
            score2STM,
            bestUci: bestUci && bestUci !== '(none)' ? bestUci : null,
            pv,
            mate: res.mateIn,
            whiteEval: clamp(whiteRaw, -EVAL_CLAMP, EVAL_CLAMP),
          };
        },
        (done) => setState(s => (s.phase === 'analyzing' ? { ...s, progress: done / total } : s)),
        () => cancelledRef.current,
      );

      if (cancelledRef.current) return;

      // ── Resolve opening for book detection ──────────────────────────────────
      const opening = await openingPromise;
      const openingPly = opening?.ply ?? 0;

      // White-perspective win% for every position (for volatility weighting).
      const winWhite = positions.map(p => cpToWinPercent(p.whiteEval));

      // ── Build per-move review data ───────────────────────────────────────────
      const moves: ReviewedMove[] = [];
      const evalSeries: number[] = [];
      const counts = { white: emptyCounts(), black: emptyCounts() };
      const accMoves: AccuracyMove[] = [];

      for (let i = 0; i < game.sanMoves.length; i++) {
        const before = positions[i];
        const after = positions[i + 1];
        const fenBefore = fens[i];
        const fenAfter = fens[i + 1];
        const moverColor = sideToMove(fenBefore);
        const uci = game.uciMoves[i];

        // Evals from the mover's perspective
        const evalBeforeForMover = before.scoreSTM;
        const evalAfterForMover = -after.scoreSTM;
        const cpLoss = clamp(Math.max(0, evalBeforeForMover - evalAfterForMover), 0, CP_LOSS_CAP);

        const winBefore = cpToWinPercent(evalBeforeForMover);
        const winAfter = cpToWinPercent(evalAfterForMover);

        // Best move (uci → san) at the position before the move
        const bestUci = before.bestUci;
        let bestSan: string | null = null;
        if (bestUci) {
          try {
            const c = new Chess(fenBefore);
            const mv = c.move({
              from: bestUci.slice(0, 2),
              to: bestUci.slice(2, 4),
              promotion: bestUci.length === 5 ? bestUci[4] : undefined,
            });
            bestSan = mv?.san ?? null;
          } catch { bestSan = null; }
        }

        const isBest = !!bestUci && bestUci.toLowerCase() === uci.toLowerCase();

        // Forced (only legal move)?
        let isOnlyMove = false;
        try {
          isOnlyMove = new Chess(fenBefore).moves().length === 1;
        } catch { isOnlyMove = false; }

        const isBookMove = i < openingPly;

        // 2nd-best gap (critical / only-good move detection)
        const secondBestGap = before.score2STM !== null
          ? Math.max(0, before.scoreSTM - before.score2STM)
          : 0;

        // Sacrifice detection (for Brilliant): only meaningful when the played
        // move is the engine's best — replay the opponent's reply line and see
        // how much NET material stays sacrificed after captures settle.
        const sacrifice = isBest
          ? sacrificeAmount(fenBefore, fenAfter, after.pv, moverColor)
          : 0;

        const classification = classifyMove({
          isBest, isOnlyMove, isBookMove, sacrificeAmount: sacrifice,
          secondBestGap, winBefore, winAfter,
        });

        // Is the played move a capture / check? (replay it for context)
        let isCapture = false;
        let givesCheck = false;
        try {
          const c = new Chess(fenBefore);
          const mv = c.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.length === 5 ? uci[4] : undefined,
          });
          isCapture = !!mv?.captured;
          givesCheck = c.isCheck();
        } catch { /* keep defaults */ }

        // mate (mover perspective) after the move = negated opponent mate
        const mateForMover = after.mate !== null ? -after.mate : null;

        const comment = generateReviewComment({
          classification,
          san: game.sanMoves[i],
          bestSan: isBest ? null : bestSan,
          cpLoss,
          evalForMover: evalAfterForMover,
          mateForMover,
          isCapture,
          givesCheck,
          openingName: opening?.name ?? null,
        });

        // White-perspective eval & mate after this move (for board/graph)
        const whiteMate = after.mate !== null
          ? (sideToMove(fenAfter) === 'w' ? after.mate : -after.mate)
          : null;

        moves.push({
          ply: i,
          moveNumber: Math.floor(i / 2) + 1,
          san: game.sanMoves[i],
          color: moverColor,
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          uci,
          classification,
          comment,
          tip: tipFor(classification, i),
          isCapture,
          cpLoss,
          evalAfter: after.whiteEval,
          mateAfter: whiteMate,
          bestUci,
          bestSan,
          fenBefore,
          fenAfter,
        });

        evalSeries.push(after.whiteEval);

        counts[moverColor === 'w' ? 'white' : 'black'][classification]++;
        accMoves.push({
          ply: i,
          color: moverColor,
          accuracy: moveAccuracy(winBefore, winAfter),
          winBefore,
        });
      }

      if (cancelledRef.current) return;

      setState({
        phase: 'done',
        progress: 1,
        error: null,
        game,
        moves,
        evalSeries,
        openingName: opening?.name ?? null,
        openingEco: opening?.eco ?? null,
        accuracy: {
          white: sideAccuracy(accMoves, winWhite, 'w'),
          black: sideAccuracy(accMoves, winWhite, 'b'),
        },
        counts,
        currentPly: moves.length > 0 ? 0 : -1,
      });
    } catch (err) {
      if (cancelledRef.current) return;
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setState(s => ({ ...s, phase: 'error', error: message }));
    } finally {
      inflightCancels.current = [];
    }
  }, [cancelAll]);

  return { state, start, reset, setCurrentPly, CLASSIFICATION_ORDER };
}
