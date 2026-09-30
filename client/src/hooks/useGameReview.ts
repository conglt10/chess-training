/**
 * useGameReview.ts
 *
 * Frontend-only full-game analysis for the Game Review feature (WhyBlunder
 * spec): chess.js state precomputation → StockfishWorkerPool (two-phase
 * search) → evaluation & diagnosis pipeline (win probability, ECO book
 * filtering, tactical situation recognition) → interactive UI state.
 *
 * Completed reviews persist in the client-side LRU `AnalysisCache`
 * (`whyblunder_analysis_cache_v1`) — re-reviewing the same PGN or Lichess
 * URL is instantaneous. No backend is involved.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { ParsedGame } from '../utils/pgnImport';
import {
  classifyMove, CLASSIFICATION_ORDER,
  type Classification,
} from '../utils/moveClassifier';
import { generateReviewComment, tipFor, type ReviewComment } from '../utils/reviewCommentator';
import { cpToWinPercent, moveAccuracy, sideAccuracy, type AccuracyMove } from '../utils/winPercent';
import { startPositionAnalysis, uciToSan } from '../review/browserAnalyzer';
import { getReviewEnginePool } from '../review/engine/stockfishWorkerPool';
import { identifyOpeningLocal, isBookPly } from '../review/openings/openingDetector';
import { recognizeSituation } from '../review/tactics/situationRecognizer';
import {
  fingerprintPgn, getCachedReview, setCachedReview, type CachedMove,
} from '../review/cache/analysisCache';

// ── Tunables ───────────────────────────────────────────────────────────────────

const CP_LOSS_CAP = 1000;         // cap centipawn loss so mate swings stay sane
const SAC_PLY_WINDOW = 8;         // plies of the reply line to settle material over

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
    brilliant: 0, great: 0, best: 0,
    book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0,
  };
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

  const start = useCallback(async (game: ParsedGame, cacheKey?: string) => {
    cancelAll();
    cancelledRef.current = false;

    setState({ ...EMPTY_STATE, phase: 'analyzing', game });

    // ── Cache lookup (LRU fingerprint) ──────────────────────────────────────
    const key = cacheKey ?? fingerprintPgn(game.sanMoves.join(' '));
    try {
      const cached = getCachedReview(key);
      if (cached) {
        if (cancelledRef.current) return;
        setState({
          phase: 'done',
          progress: 1,
          error: null,
          game,
          moves: cached.moves as ReviewedMove[],
          evalSeries: cached.evalSeries,
          openingName: cached.openingName,
          openingEco: cached.openingEco,
          accuracy: cached.accuracy,
          counts: cached.counts,
          currentPly: cached.moves.length > 0 ? 0 : -1,
        });
        return;
      }
    } catch { /* cache read failure — analyze fresh */ }

    // Kick off opening identification in parallel with the engine analysis.
    const openingPromise = identifyOpeningLocal(game.sanMoves).catch(() => null);
    // Warm up the worker pool while the first positions queue.
    try { getReviewEnginePool().warmUp(); } catch { /* noop */ }

    try {
      const fens = game.fens; // length = moves + 1

      // ── Two-phase browser analysis (depth 18 pre-move, depth 16 refute) ──
      const run = startPositionAnalysis(fens, game.uciMoves, (fraction) => {
        setState(s => (s.phase === 'analyzing' ? { ...s, progress: fraction } : s));
      });
      inflightCancels.current.push(run.cancel);
      let evals;
      try {
        evals = await run.promise;
      } catch (err) {
        if (cancelledRef.current) return;
        throw err;
      } finally {
        inflightCancels.current = inflightCancels.current.filter(c => c !== run.cancel);
      }

      if (cancelledRef.current) return;

      // ── Resolve opening for book detection ──────────────────────────────────
      const opening = await openingPromise;

      // White-perspective win% for every position (for volatility weighting).
      const winWhite = [
        cpToWinPercent(evals.pre[0]?.whiteEval ?? 0),
        ...evals.post.map(p => cpToWinPercent(p.whiteEval)),
      ];

      // ── Build per-move review data ───────────────────────────────────────────
      const moves: ReviewedMove[] = [];
      const evalSeries: number[] = [];
      const counts = { white: emptyCounts(), black: emptyCounts() };
      const accMoves: AccuracyMove[] = [];

      for (let i = 0; i < game.sanMoves.length; i++) {
        const before = evals.pre[i];
        const after = evals.post[i];
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
        const bestSan = uciToSan(fenBefore, bestUci);

        const isBest = !!bestUci && bestUci.toLowerCase() === uci.toLowerCase();

        // Only one legal move? (Great/Best per spec — no more 'forced' class)
        let isOnlyMove = false;
        try {
          isOnlyMove = new Chess(fenBefore).moves().length === 1;
        } catch { isOnlyMove = false; }

        const isBookMove = isBookPly(i, opening);

        // 2nd-best info (critical-move + brilliant gating)
        const secondBestGap = before.score2STM !== null
          ? Math.max(0, before.scoreSTM - before.score2STM)
          : 0;
        const winSecondBest = before.score2STM !== null
          ? cpToWinPercent(before.score2STM)
          : null;

        // Sacrifice detection (for Brilliant): only meaningful when the played
        // move is the engine's best — replay the opponent's reply line and see
        // how much NET material stays sacrificed after captures settle.
        const replyPv = evals.refutations[i].length > 0 ? evals.refutations[i] : after.pv;
        const sacrifice = isBest
          ? sacrificeAmount(fenBefore, fenAfter, replyPv, moverColor)
          : 0;

        const classification = classifyMove({
          isBest, isOnlyMove, isBookMove, sacrificeAmount: sacrifice,
          secondBestGap, winSecondBest, winBefore, winAfter,
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

        // Tactical diagnosis for non-book, non-best moves.
        let flaw: string | null = null;
        let missedChance: string | null = null;
        let betterLine: string | null = null;
        let tags: string[] = [];
        if (!isBest && !isBookMove) {
          try {
            const report = recognizeSituation({
              fenBefore,
              fenAfter,
              playedUci: uci,
              bestUci,
              bestSan,
              refutationPv: evals.refutations[i],
              playedSan: game.sanMoves[i],
            });
            flaw = report.flaw;
            missedChance = report.missedChance;
            betterLine = report.betterLine;
            tags = report.tags;
          } catch { /* diagnosis is best-effort */ }
        }

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
          flaw,
          missedChance,
          betterLine,
          tags,
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

      const doneState: UseGameReviewState = {
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
      };
      setState(doneState);

      // ── Persist to the LRU cache (best-effort) ──────────────────────────────
      try {
        const cacheMoves: CachedMove[] = moves.map(m => ({ ...m }));
        setCachedReview(key, {
          white: game.white,
          black: game.black,
          result: game.result,
          moves: cacheMoves,
          evalSeries,
          openingName: doneState.openingName,
          openingEco: doneState.openingEco,
          accuracy: doneState.accuracy,
          counts: doneState.counts,
        });
      } catch { /* persistence is best-effort */ }
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
