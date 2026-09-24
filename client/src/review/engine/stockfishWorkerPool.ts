/**
 * stockfishWorkerPool.ts
 *
 * Client-side parallel engine pool for the (frontend-only) Game Review.
 *
 * Each worker loads the Stockfish lite-single WASM bundle shipped in
 * `client/public/` (a self-contained worker script: it posts UCI lines via
 * `postMessage` and consumes UCI commands via `onmessage`, loading its
 * sibling `.wasm` from the same directory). No SharedArrayBuffer / COOP-COEP
 * ceremony is required for the single-threaded flavor.
 *
 * Pool sizing heuristic (WhyBlunder spec):
 *   poolSize = max(2, min(hardwareConcurrency >= 4 ? hw - 1 : hw, 6))
 *
 * Every worker is initialized with a 32 MB hash table and MultiPV=3, and each
 * search enforces an explicit 20s execution cap so a hung WASM position
 * (complex endgames) can never stall a full-game review.
 */

export interface EnginePV {
  rank: number;
  /** Score in centipawns, SIDE-TO-MOVE perspective (mate mapped to ±100000). */
  score: number;
  /** Mate distance in moves, side-to-move perspective (null when no mate). */
  mate: number | null;
  /** Principal variation as UCI moves. */
  moves: string[];
}

export interface EngineResult {
  bestMove: string;
  mateIn: number | null;
  pvs: EnginePV[];
}

export interface PoolAnalyzeOptions {
  depth: number;
  multiPV?: number;
  /** Per-position cap in ms (default 20_000 per spec). */
  timeoutMs?: number;
}

export interface AnalysisHandle {
  promise: Promise<EngineResult>;
  cancel: () => void;
}

const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish-18-lite-single.js`;
const DEFAULT_TIMEOUT_MS = 20_000;
const HASH_MB = 32;

// ── UCI line parsing ─────────────────────────────────────────────────────────

function parseInfoLine(line: string): { depth: number; slot: number; cp: number; mate: number | null; pv: string[] } | null {
  if (!line.startsWith('info') || !line.includes(' pv ')) return null;
  const t = line.split(' ');
  const numAfter = (key: string): number | null => {
    const i = t.indexOf(key);
    if (i === -1 || i + 1 >= t.length) return null;
    const v = parseInt(t[i + 1], 10);
    return Number.isFinite(v) ? v : null;
  };
  const depth = numAfter('depth') ?? 0;
  const slot = numAfter('multipv') ?? 1;
  const si = t.indexOf('score');
  let cp = 0;
  let mate: number | null = null;
  if (si !== -1 && si + 2 < t.length) {
    const kind = t[si + 1];
    const val = parseInt(t[si + 2], 10);
    if (kind === 'mate' && Number.isFinite(val)) {
      mate = val;
      cp = val > 0 ? 100_000 : -100_000;
    } else if (kind === 'cp' && Number.isFinite(val)) {
      cp = val;
    }
  }
  const pvi = t.indexOf('pv');
  const pv = pvi !== -1 ? t.slice(pvi + 1) : [];
  if (pv.length === 0) return null;
  return { depth, slot, cp, mate, pv };
}

// ── Single worker wrapper (one search at a time) ─────────────────────────────

type WorkerState = 'starting' | 'ready' | 'searching';

class PooledWorker {
  private worker: Worker | null = null;
  private state: WorkerState = 'starting';
  private readyWaiters: Array<() => void> = [];
  private readyFailed = false;
  /** Set synchronously by the pool on acquire; cleared on release. */
  claimed = false;

  // In-flight search state
  private pvs = new Map<number, EnginePV & { depth: number }>();
  private bestMove = '';
  private mateIn: number | null = null;
  private settle: ((r: EngineResult) => void) | null = null;
  private rejectSearch: ((e: Error) => void) | null = null;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;

  /** Spawn the underlying Web Worker (lazy — first search or warmUp). */
  ensureStarted(): void {
    if (this.worker) return;
    try {
      this.worker = new Worker(ENGINE_URL);
    } catch {
      this.readyFailed = true;
      this.state = 'ready';
      this.readyWaiters.splice(0).forEach(fn => fn());
      return;
    }
    this.worker.onmessage = (e: MessageEvent<string>) => this.onLine(String(e.data));
    this.worker.onerror = () => {
      // Fail open: unblock waiters; searches resolve best-effort (empty).
      this.readyFailed = true;
      if (this.settle) this.finish('timeout');
      this.state = 'ready';
      this.readyWaiters.splice(0).forEach(fn => fn());
    };
    this.worker.postMessage('uci');
  }

  warmUp(): void {
    this.ensureStarted();
  }

  private onLine(line: string): void {
    if (this.state === 'starting') {
      if (line === 'uciok') {
        this.worker?.postMessage(`setoption name Hash value ${HASH_MB}`);
        this.worker?.postMessage('setoption name MultiPV value 3');
        this.worker?.postMessage('isready');
      } else if (line === 'readyok') {
        this.state = 'ready';
        this.readyWaiters.splice(0).forEach(fn => fn());
      }
      return;
    }
    if (this.state !== 'searching') return;

    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      this.bestMove = parts[1] ?? '';
      this.finish(this.cancelled ? 'cancelled' : 'done');
      return;
    }
    const info = parseInfoLine(line);
    if (info) {
      const prev = this.pvs.get(info.slot);
      if (!prev || info.depth >= prev.depth) {
        this.pvs.set(info.slot, {
          rank: info.slot, score: info.cp, mate: info.mate, moves: info.pv, depth: info.depth,
        });
        if (info.slot === 1) this.mateIn = info.mate;
      }
    }
  }

  private waitReady(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve();
    return new Promise(resolve => this.readyWaiters.push(resolve));
  }

  get busy(): boolean {
    return this.claimed || this.state === 'searching';
  }

  analyze(fen: string, opts: PoolAnalyzeOptions): AnalysisHandle {
    this.ensureStarted();
    let cancelFn: () => void = () => {};
    let cancelledBeforeStart = false;
    // Pre-start cancel (e.g. user hit Cancel while the engine handshake or a
    // pool queue was pending) must prevent the search from ever starting.
    cancelFn = () => { cancelledBeforeStart = true; };
    const promise = (async (): Promise<EngineResult> => {
      await this.waitReady();
      if (cancelledBeforeStart) throw new Error('cancelled');
      if (this.readyFailed || !this.worker) {
        return { bestMove: '', mateIn: null, pvs: [] };
      }
      // A worker handles one search at a time; the pool guarantees idleness.
      this.state = 'searching';
      this.pvs = new Map();
      this.bestMove = '';
      this.mateIn = null;
      this.cancelled = false;

      const result = new Promise<EngineResult>((resolve, reject) => {
        this.settle = resolve;
        this.rejectSearch = reject;
      });

      cancelFn = () => {
        if (this.state !== 'searching' || this.cancelled) return;
        this.cancelled = true;
        try { this.worker?.postMessage('stop'); } catch { /* noop */ }
      };

      this.worker.postMessage(`setoption name MultiPV value ${opts.multiPV ?? 3}`);
      this.worker.postMessage('ucinewgame');
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${opts.depth}`);

      // Safety cap: ask the engine to stop; `bestmove` settles best-effort.
      const budget = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      this.safetyTimer = setTimeout(() => {
        if (this.state === 'searching') {
          try { this.worker?.postMessage('stop'); } catch { /* noop */ }
          // If even `stop` yields nothing, settle with what we have.
          setTimeout(() => {
            if (this.state === 'searching') this.finish('timeout');
          }, 2500);
        }
      }, budget);

      return result;
    })();

    return { promise, cancel: () => cancelFn() };
  }

  /** Settle the in-flight search exactly once. */
  private finish(kind: 'done' | 'cancelled' | 'timeout'): void {
    if (this.safetyTimer) { clearTimeout(this.safetyTimer); this.safetyTimer = null; }
    const resolve = this.settle;
    const reject = this.rejectSearch;
    this.settle = null;
    this.rejectSearch = null;
    this.state = 'ready';
    this.cancelled = false;
    if (kind === 'cancelled') {
      reject?.(new Error('cancelled'));
      return;
    }
    if (!resolve) return;
    const pvs: EnginePV[] = [...this.pvs.values()]
      .sort((a, b) => a.rank - b.rank)
      .map(({ rank, score, mate, moves }) => ({ rank, score, mate, moves }));
    resolve({ bestMove: this.bestMove, mateIn: this.mateIn, pvs });
  }

  terminate(): void {
    try { this.worker?.terminate(); } catch { /* noop */ }
    this.worker = null;
  }
}

// ── Pool ─────────────────────────────────────────────────────────────────────

function defaultPoolSize(): number {
  const hw = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 4;
  return Math.max(2, Math.min(hw >= 4 ? hw - 1 : hw, 6));
}

class StockfishWorkerPool {
  private workers: PooledWorker[] = [];
  private waiters: Array<(w: PooledWorker) => void> = [];
  readonly size: number;

  constructor(size?: number) {
    this.size = size ?? defaultPoolSize();
  }

  /** Pre-spawn workers + run the UCI handshake in the background. */
  warmUp(): void {
    while (this.workers.length < this.size) {
      const w = new PooledWorker();
      this.workers.push(w);
      w.warmUp();
    }
  }

  private acquire(): Promise<PooledWorker> {
    for (const w of this.workers) {
      if (!w.busy) {
        // Reserve synchronously — JS runs acquire() to completion before any
        // awaiting continuation, so no two callers can claim the same worker.
        w.claimed = true;
        return Promise.resolve(w);
      }
    }
    if (this.workers.length < this.size) {
      const w = new PooledWorker();
      w.claimed = true;
      this.workers.push(w);
      return Promise.resolve(w);
    }
    return new Promise(resolve => this.waiters.push(resolve));
  }

  private release(w: PooledWorker): void {
    w.claimed = false;
    const next = this.waiters.shift();
    if (next) {
      // Hand directly to the waiter, already claimed.
      w.claimed = true;
      next(w);
    }
  }

  analyze(fen: string, opts: PoolAnalyzeOptions): AnalysisHandle {
    let innerCancel: (() => void) | null = null;
    let workerRef: PooledWorker | null = null;
    let settled = false;
    let cancelledEarly = false;

    const promise = this.acquire().then(worker => {
      workerRef = worker;
      const handle = worker.analyze(fen, opts);
      innerCancel = handle.cancel;
      // Cancel arrived while queued (or in the worker handshake): forward it
      // so the search never starts, then propagate the cancellation.
      if (cancelledEarly) {
        handle.cancel();
        handle.promise.catch(() => {});
        this.release(worker);
        throw new Error('cancelled');
      }
      return handle.promise.finally(() => {
        settled = true;
        this.release(worker);
      });
    });
    // Swallow the throw above when nobody listens yet: callers that cancel
    // always attach handlers via browserAnalyzer's tracked promise chain.
    promise.catch(() => {});

    const cancel = () => {
      if (settled) return;
      settled = true;
      cancelledEarly = true;
      if (innerCancel) innerCancel();
      else if (workerRef) this.release(workerRef);
      // Else: still queued in acquire() — the continuation above releases the
      // worker immediately on arrival and rejects with 'cancelled'.
    };

    return { promise, cancel };
  }

  terminate(): void {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.waiters.splice(0);
  }
}

// ── Singleton (one pool per page — workers are expensive) ────────────────────

let _pool: StockfishWorkerPool | null = null;

export function getReviewEnginePool(): StockfishWorkerPool {
  if (!_pool) _pool = new StockfishWorkerPool();
  return _pool;
}

export function reviewPoolSize(): number {
  return getReviewEnginePool().size;
}
