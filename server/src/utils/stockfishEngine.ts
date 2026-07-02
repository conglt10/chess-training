/**
 * stockfishEngine.ts
 *
 * Wraps a single Stockfish WASM instance (Chess.com Node.js edition).
 * Used as the building block for StockfishPool — do not use directly.
 *
 * Engine output API:
 *   engine.listener = (line: string) => void   ← all UCI output
 *   engine.sendCommand(cmd: string)            ← sends UCI command
 *
 * `analyze()` returns { promise, cancel } so the pool can cancel without
 * destroying the engine instance.
 */

import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const initStockfish = require('stockfish') as (variant: string) => Promise<StockfishRaw>;

/**
 * Absolute path to the engine JS bundle.
 * stockfish-18-lite-single.js has a module.exports side-effect inside its
 * factory body: calling the exported function `t()` overwrites module.exports
 * with the inner Emscripten builder `inner_e`.  A second require() would
 * therefore return `inner_e` (not a function-returning-function), causing
 * `INIT_ENGINE()(engine)` inside stockfish/index.js to throw TypeError.
 *
 * Deleting the cache entry before each engine init forces Node.js to re-run
 * the IIFE, producing a fresh, independent module scope (and therefore an
 * independent WASM heap) for every engine instance.
 */
const ENGINE_BUNDLE_PATH = path.join(
  path.dirname(require.resolve('stockfish')),
  'bin',
  'stockfish-18-lite-single.js',
);

interface StockfishRaw {
  listener: ((line: string) => void) | null;
  sendCommand: (cmd: string) => void;
  terminate: () => void;
}

// ── Shared types ───────────────────────────────────────────────────────────────

export interface PV {
  rank: number;
  /** Score in centipawns from the SIDE-TO-MOVE's perspective (UCI convention) */
  score: number;
  moves: string[];
}

export interface AnalysisResult {
  bestMove: string;
  mateIn: number | null;
  pvs: PV[];
}

export interface AnalyzeOptions {
  skillLevel: number;
  depth: number;
  movetime?: number;
  multiPV?: number;
  /** Called for every `info depth N score cp M` line (multipv slot 1 only). */
  onInfo?: (depth: number, score: number) => void;
}

export interface AnalysisHandle {
  promise: Promise<AnalysisResult>;
  /** Stops the search immediately and rejects the promise with Error('cancelled'). */
  cancel: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseScore(tokens: string[]): { cp: number; mate: number | null } {
  const idx = tokens.indexOf('score');
  if (idx === -1) return { cp: 0, mate: null };
  const type = tokens[idx + 1];
  const val = parseInt(tokens[idx + 2], 10);
  if (type === 'mate') return { cp: val > 0 ? 100_000 : -100_000, mate: val };
  if (type === 'cp') return { cp: val, mate: null };
  return { cp: 0, mate: null };
}

function parseMultiPV(tokens: string[]): number {
  const idx = tokens.indexOf('multipv');
  return idx !== -1 ? parseInt(tokens[idx + 1], 10) : 1;
}

function parsePVMoves(tokens: string[]): string[] {
  const idx = tokens.indexOf('pv');
  return idx !== -1 ? tokens.slice(idx + 1) : [];
}

// ── Engine class ───────────────────────────────────────────────────────────────

export class StockfishEngine {
  private raw: StockfishRaw | null = null;
  readonly initPromise: Promise<void>;

  // In-flight state
  private pvAccumulator: Map<number, PV & { _depth: number }> = new Map();
  private bestMove = '';
  private currentMateIn: number | null = null;
  private searchRunning = false;
  private cancelRequested = false;
  private onInfoCb: ((depth: number, score: number) => void) | undefined;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  private resolveAnalysis: ((r: AnalysisResult) => void) | null = null;
  private rejectAnalysis: ((e: Error) => void) | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  private init(): Promise<void> {
    // Clear the cached module so this engine gets its own fresh WASM module
    // context.  Must happen synchronously before initStockfish() executes its
    // internal require(pathToEngine) call.
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete require.cache[ENGINE_BUNDLE_PATH];

    return new Promise((resolve, reject) => {
      initStockfish('lite-single')
        .then((engine) => {
          this.raw = engine;
          let phase: 'uci' | 'ready' | 'running' = 'uci';

          engine.listener = (line: string) => {
            if (phase === 'uci') {
              if (line === 'uciok') { phase = 'ready'; engine.sendCommand('isready'); }
              return;
            }
            if (phase === 'ready') {
              if (line === 'readyok') { phase = 'running'; resolve(); }
              return;
            }
            this.handleLine(line);
          };

          engine.sendCommand('uci');
        })
        .catch(reject);
    });
  }

  private handleLine(line: string) {
    if (!this.searchRunning) return;

    if (line.startsWith('info') && line.includes(' pv ')) {
      const tokens = line.split(' ');
      const depthIdx = tokens.indexOf('depth');
      const depth = depthIdx !== -1 ? parseInt(tokens[depthIdx + 1], 10) : 0;
      const pvSlot = parseMultiPV(tokens);
      const { cp, mate } = parseScore(tokens);
      const pvMoves = parsePVMoves(tokens);

      if (pvMoves.length > 0) {
        const existing = this.pvAccumulator.get(pvSlot);
        if (!existing || depth >= existing._depth) {
          this.pvAccumulator.set(pvSlot, { rank: pvSlot, score: cp, moves: pvMoves, _depth: depth });
          if (pvSlot === 1) {
            this.currentMateIn = mate;
            this.onInfoCb?.(depth, cp);
          }
        }
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      this.bestMove = parts[1] ?? '';
      // The engine has now fully finished this search (whether it ran to
      // completion or was stopped). Only here is the underlying WASM instance
      // guaranteed idle and safe to reuse — so we settle the promise (which
      // triggers the pool to release the engine) at this point, never earlier.
      this.finish(this.cancelRequested ? 'cancelled' : 'done');
    }
  }

  /**
   * Settle the in-flight search exactly once, clearing timers and per-search
   * state. `cancelled` rejects; `done` resolves with the accumulated result.
   */
  private finish(kind: 'done' | 'cancelled') {
    if (this.safetyTimer)   { clearTimeout(this.safetyTimer);   this.safetyTimer = null; }
    if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }

    const resolve = this.resolveAnalysis;
    const reject  = this.rejectAnalysis;
    this.resolveAnalysis = null;
    this.rejectAnalysis = null;
    this.onInfoCb = undefined;
    this.searchRunning = false;
    this.cancelRequested = false;

    if (kind === 'cancelled') {
      reject?.(new Error('cancelled'));
      return;
    }
    if (!resolve) return;

    const pvs: PV[] = [];
    this.pvAccumulator.forEach(pv => {
      pvs.push({ rank: pv.rank, score: pv.score, moves: pv.moves });
    });
    pvs.sort((a, b) => a.rank - b.rank);
    resolve({ bestMove: this.bestMove, mateIn: this.currentMateIn, pvs });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** True when the engine has finished its UCI handshake and is not searching. */
  get idle(): boolean {
    return this.raw !== null && !this.searchRunning;
  }

  /**
   * Start a search.  Returns { promise, cancel }.
   * The caller MUST ensure the engine is idle before calling (the pool does this).
   * After `cancel()` or after the promise settles, the engine is idle again.
   */
  analyze(fen: string, opts: AnalyzeOptions): AnalysisHandle {
    const engine = this.raw!;

    this.pvAccumulator = new Map();
    this.bestMove = '';
    this.currentMateIn = null;
    this.onInfoCb = opts.onInfo;
    this.cancelRequested = false;

    engine.sendCommand(`setoption name Skill Level value ${opts.skillLevel}`);
    engine.sendCommand(`setoption name MultiPV value ${opts.multiPV ?? 1}`);
    engine.sendCommand('ucinewgame');
    engine.sendCommand(`position fen ${fen}`);

    this.searchRunning = true;
    const goCmd = opts.movetime !== undefined
      ? `go movetime ${opts.movetime}`
      : `go depth ${opts.depth}`;
    engine.sendCommand(goCmd);

    const promise = new Promise<AnalysisResult>((resolve, reject) => {
      this.resolveAnalysis = resolve;
      this.rejectAnalysis = reject;
    });

    // Safety: if a search overruns its budget, ask the engine to stop. The
    // `bestmove` that follows settles the promise via handleLine → finish().
    const budget = opts.movetime ? opts.movetime + 1500 : 15_000;
    this.safetyTimer = setTimeout(() => {
      if (this.searchRunning) engine.sendCommand('stop');
    }, budget);

    const cancel = () => {
      if (!this.searchRunning || this.cancelRequested) return;
      this.cancelRequested = true;
      engine.sendCommand('stop');
      // Deliberately do NOT settle/release here. We wait for the engine's
      // `bestmove` (handled in handleLine → finish) so the WASM instance is
      // fully idle before the pool reuses it — sending new commands into an
      // engine that is still unwinding an ASYNCIFY search corrupts its memory.
      // Watchdog only in the (rare) case `bestmove` never arrives after stop.
      this.watchdogTimer = setTimeout(() => {
        if (this.searchRunning) this.finish('cancelled');
      }, 3000);
    };

    return { promise, cancel };
  }
}
