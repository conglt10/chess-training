/**
 * browserAnalyzer.ts
 *
 * Asynchronous client-side analysis pipeline for the frontend-only Game
 * Review (WhyBlunder spec: chess.js precomputation → StockfishWorkerPool →
 * two-phase search → evaluation pipeline).
 *
 * Two-phase ply dispatch:
 *   Phase 1 (pre-move): every pre-move FEN at depth 18, MultiPV=3. When the
 *     played move matches MultiPV line 1, evaluation is complete.
 *   Phase 2 (post-move refutation): when the played move was suboptimal and
 *     missing from MultiPV lines 2–3, a targeted search of the post-move FEN
 *     at depth 16 computes the opponent's precise refutation line (used for
 *     accurate eval-after AND for the situation recognizer's missedChance).
 *
 * Positions dispatch concurrently (out-of-order) across the worker pool;
 * there is no shared transposition table between plies (spec trade-off).
 */

import { Chess } from 'chess.js';
import { getReviewEnginePool, type EngineResult } from './engine/stockfishWorkerPool';

export const PHASE1_DEPTH = 18;
export const PHASE2_DEPTH = 16;
export const REVIEW_MULTIPV = 3;

const EVAL_CLAMP = 1000;

export interface AnalyzedPosition {
  /** Best-move score, side-to-move perspective (cp; mate → ±100000). */
  scoreSTM: number;
  /** 2nd-best score, same perspective (null when unavailable). */
  score2STM: number | null;
  bestUci: string | null;
  /** Best line (UCI). */
  pv: string[];
  /** Mate distance, side-to-move perspective (null when no mate). */
  mate: number | null;
  /** Best eval, white perspective (cp, clamped). */
  whiteEval: number;
}

export interface PositionEvals {
  /** Per-ply pre-move evals (length = moves). */
  pre: AnalyzedPosition[];
  /**
   * Per-ply post-move evals (length = moves). Equals the Phase-2 refutation
   * search when one ran, otherwise the next pre-move eval negated — so the
   * caller can always use `pre[i]` / `post[i]` as before/after for move i.
   */
  post: AnalyzedPosition[];
  /** Opponent refutation lines (UCI) for moves that triggered Phase 2. */
  refutations: string[][];
}

export interface AnalysisRun {
  promise: Promise<PositionEvals>;
  cancel: () => void;
}

function sideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function toAnalyzed(fen: string, res: EngineResult): AnalyzedPosition {
  const stm = sideToMove(fen);
  const scoreSTM = res.pvs[0]?.score ?? 0;
  const score2STM = res.pvs[1]?.score ?? null;
  const pv = res.pvs[0]?.moves ?? [];
  let bestUci: string | null = pv[0] ?? res.bestMove ?? null;
  if (!bestUci || bestUci === '(none)') bestUci = null;
  const whiteRaw = stm === 'w' ? scoreSTM : -scoreSTM;
  return {
    scoreSTM,
    score2STM,
    bestUci,
    pv,
    mate: res.mateIn,
    whiteEval: clamp(whiteRaw, -EVAL_CLAMP, EVAL_CLAMP),
  };
}

function neutralEval(_fen: string): AnalyzedPosition {
  return {
    scoreSTM: 0, score2STM: null, bestUci: null, pv: [],
    mate: null, whiteEval: 0,
  };
}

/**
 * Start analysis of all positions in a game.
 *
 * @param fens      FENs for every position (length = moves + 1)
 * @param uciMoves  played moves in UCI (length = moves)
 * @param onProgress  called with a 0..1 fraction as the pipeline advances
 *   (Phase 1 maps to 0..0.7, Phase 2 to 0.7..1).
 */
export function startPositionAnalysis(
  fens: string[],
  uciMoves: string[],
  onProgress?: (fraction: number) => void,
): AnalysisRun {
  const cancels = new Set<() => void>();
  let cancelled = false;

  const track = <T>(h: { promise: Promise<T>; cancel: () => void }): Promise<T> => {
    cancels.add(h.cancel);
    return h.promise.finally(() => cancels.delete(h.cancel));
  };

  const promise = (async (): Promise<PositionEvals> => {
    const pool = getReviewEnginePool();
    const n = uciMoves.length;
    let done1 = 0;
    const tick1 = () => onProgress?.((++done1 / Math.max(1, n)) * 0.7);

    // ── Phase 1: all pre-move FENs, depth 18, MultiPV=3 ─────────────────────
    const preFens = fens.slice(0, n);
    const preResults = await Promise.all(
      preFens.map(async (fen) => {
        if (cancelled) { tick1(); return neutralEval(fen); }
        try {
          const res = await track(pool.analyze(fen, { depth: PHASE1_DEPTH, multiPV: REVIEW_MULTIPV }));
          tick1();
          if (cancelled) return neutralEval(fen);
          return toAnalyzed(fen, res);
        } catch {
          tick1();
          return neutralEval(fen);
        }
      }),
    );
    if (cancelled) throw new Error('cancelled');

    const pre = preResults;
    const post: AnalyzedPosition[] = new Array(n);
    const refutations: string[][] = new Array(n);

    // Which moves need a Phase-2 refutation? Played move is suboptimal AND
    // absent from the visible MultiPV lines (2–3), so we lack its refutation.
    const needPhase2: number[] = [];
    for (let i = 0; i < n; i++) {
      const played = uciMoves[i].toLowerCase();
      const best = (pre[i].bestUci ?? '').toLowerCase();
      if (!best || best === played) {
        post[i] = postFromNextPre(pre, i, n);
        refutations[i] = [];
        continue;
      }
      // Reconstruct first moves of PV slots 2–3 for the "missing" check. The
      // pool keeps only the latest info per slot in `pvs`, so approximate:
      // Phase 2 runs whenever the played move is not the best move. This is
      // slightly broader than the spec's lines-2–3 check but guarantees the
      // refutation line (and thus accurate eval-after) for every suboptimal
      // move — the case the diagnosis pipeline needs most.
      needPhase2.push(i);
    }

    // ── Phase 2: post-move FENs, depth 16 ────────────────────────────────────
    let done2 = 0;
    const tick2 = () => onProgress?.(0.7 + (++done2 / Math.max(1, needPhase2.length)) * 0.3);
    await Promise.all(
      needPhase2.map(async (i) => {
        const postFen = fens[i + 1];
        if (cancelled) {
          post[i] = postFromNextPre(pre, i, n);
          refutations[i] = [];
          tick2();
          return;
        }
        try {
          const res = await track(pool.analyze(postFen, { depth: PHASE2_DEPTH, multiPV: REVIEW_MULTIPV }));
          tick2();
          if (cancelled) {
            post[i] = postFromNextPre(pre, i, n);
            refutations[i] = [];
            return;
          }
          post[i] = toAnalyzed(postFen, res);
          refutations[i] = res.pvs[0]?.moves ?? [];
        } catch {
          tick2();
          post[i] = postFromNextPre(pre, i, n);
          refutations[i] = [];
        }
      }),
    );
    if (needPhase2.length === 0) onProgress?.(1);
    if (cancelled) throw new Error('cancelled');

    // Fill any gaps (shouldn't happen, but keeps the contract total).
    for (let i = 0; i < n; i++) {
      if (!post[i]) {
        post[i] = postFromNextPre(pre, i, n);
        refutations[i] = refutations[i] ?? [];
      }
    }

    return { pre, post, refutations };
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      cancels.forEach(c => { try { c(); } catch { /* noop */ } });
      cancels.clear();
    },
  };
}

/**
 * Fallback eval-after: reuse the NEXT pre-move eval (analyzed from the
 * opponent's perspective, exactly like the old single-pass pipeline). The
 * caller negates its STM score to get the mover's perspective. Exact when no
 * refutation search ran.
 */
function postFromNextPre(pre: AnalyzedPosition[], i: number, n: number): AnalyzedPosition {
  if (i + 1 < n) return pre[i + 1];
  // Last move: post-move position is the final FEN. Without a Phase-2 search
  // (best move played), mirror the pre-move eval.
  const p = pre[i];
  return { ...p };
}

/** UCI → SAN at a FEN (null when illegal). Exported for the hook. */
export function uciToSan(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  try {
    const c = new Chess(fen);
    const mv = c.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });
    return mv?.san ?? null;
  } catch {
    return null;
  }
}

