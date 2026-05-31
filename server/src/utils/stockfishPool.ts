/**
 * stockfishPool.ts
 *
 * A fixed-size pool of StockfishEngine instances.
 *
 * Why a pool?  Three analysis tasks can be in flight simultaneously per game:
 *   1. Pre-analysis  (background, fires when it becomes the player's turn)
 *   2. Post-analysis (fires right after the player moves)
 *   3. Coach move    (fires after commentary is done)
 *
 * With a single engine they would serialize (each cancels the previous).
 * With a pool of 3 they run in parallel on independent engines.
 *
 * Usage:
 *   const { promise, cancel } = getPool().analyze(fen, opts);
 */

import { StockfishEngine } from './stockfishEngine';
import type { AnalysisResult, AnalyzeOptions, AnalysisHandle } from './stockfishEngine';

// Re-export types so callers only need to import from this file
export type { PV, AnalysisResult, AnalyzeOptions, AnalysisHandle } from './stockfishEngine';

const POOL_SIZE = 3;

// ── Pool class ─────────────────────────────────────────────────────────────────

class StockfishPool {
  /** Populated one-by-one as engines finish their UCI handshake. */
  private readonly engines: StockfishEngine[] = [];
  private readonly idle: Set<StockfishEngine> = new Set();
  private readonly waiters: Array<(engine: StockfishEngine) => void> = [];

  /**
   * Promise that resolves when all engines are initialised.
   * Sequential init is required because stockfish-18-lite-single.js mutates
   * module.exports as a side-effect of its factory, so each engine must clear
   * the require cache and get a fresh module before the next one starts.
   */
  private readonly readyPromise: Promise<void>;

  constructor(size: number) {
    this.readyPromise = this.initSequentially(size);
  }

  /** Initialise engines one at a time to avoid require-cache races. */
  private async initSequentially(size: number): Promise<void> {
    for (let i = 0; i < size; i++) {
      const engine = new StockfishEngine();
      await engine.initPromise;
      this.engines.push(engine);
      // Use release() so any queued waiters get dispatched immediately
      this.release(engine);
    }
  }

  /** Resolves when all engines have completed their UCI handshake. */
  warmUp(): Promise<void> {
    return this.readyPromise;
  }

  // ── Private acquire / release ────────────────────────────────────────────

  /**
   * Acquire an idle engine.  Waits in a queue if none are available.
   * Called automatically by `analyze()`.
   */
  private acquire(): Promise<StockfishEngine> {
    // Pick the first idle engine
    for (const engine of this.idle) {
      this.idle.delete(engine);
      return Promise.resolve(engine);
    }

    // All busy — queue until one is released
    return new Promise(resolve => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Return an engine to the idle pool.
   * If waiters are queued, immediately hands the engine to the next one.
   */
  private release(engine: StockfishEngine): void {
    const next = this.waiters.shift();
    if (next) {
      next(engine);          // hand directly to the waiting caller
    } else {
      this.idle.add(engine); // back to idle pool
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Analyze a position.  Returns `{ promise, cancel }`.
   *
   * `cancel()` stops the engine mid-search, rejects the promise with
   * `Error('cancelled')`, and releases the engine back to the pool immediately.
   */
  analyze(fen: string, opts: AnalyzeOptions): AnalysisHandle {
    let engineRef: StockfishEngine | null = null;
    let innerCancel: (() => void) | null = null;
    let settled = false;

    const promise = this.acquire().then(engine => {
      engineRef = engine;

      // Wait for the engine to finish its UCI handshake before starting work
      return engine.initPromise.then(() => {
        const handle = engine.analyze(fen, opts);
        innerCancel = handle.cancel;

        return handle.promise.finally(() => {
          settled = true;
          this.release(engine);
        });
      });
    });

    const cancel = () => {
      if (settled) return;
      settled = true;
      if (innerCancel) {
        innerCancel(); // rejects the inner promise (and calls release via finally)
      } else if (engineRef) {
        // acquired but inner handle not set yet (extremely rare race)
        this.release(engineRef);
      }
    };

    return { promise, cancel };
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

let _pool: StockfishPool | null = null;

export function getPool(): StockfishPool {
  if (!_pool) _pool = new StockfishPool(POOL_SIZE);
  return _pool;
}
