/**
 * stockfishService.ts
 *
 * WebSocket client that streams analysis requests to the backend engine pool.
 *
 * Transport: native browser WebSocket  (no extra package).
 * URL:       ws://localhost:3001/ws/coach  (override with VITE_WS_URL env var)
 *
 * ── Protocol ──────────────────────────────────────────────────────────────────
 *
 * Client → Server (JSON):
 *   { type: 'analyze', id, fen, skillLevel, depth, movetime?, multiPV? }
 *   { type: 'cancel',  id }
 *
 * Server → Client (JSON):
 *   { type: 'info',   id, depth, score }   ← streaming (one per search depth)
 *   { type: 'result', id, bestMove, mateIn, pvs }
 *   { type: 'error',  id, message }
 *
 * ── Multiplexing ──────────────────────────────────────────────────────────────
 * Every request gets a random UUID as `id`.  Multiple requests can be in flight
 * at the same time (backed by the server-side engine pool).
 *
 * ── Reconnect ─────────────────────────────────────────────────────────────────
 * If the socket closes unexpectedly, all pending promises are rejected and a
 * reconnect is attempted after 500 ms.  Callers (the hook) will re-trigger their
 * analysis once `engineReady` becomes true again.
 */

const WS_BASE = (import.meta.env.VITE_WS_URL as string | undefined) ?? 'ws://localhost:3001';
const WS_URL = `${WS_BASE}/ws/coach`;

// ── Types ──────────────────────────────────────────────────────────────────────

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
}

// ── Internal message shapes ────────────────────────────────────────────────────

interface ServerMsg {
  type: 'info' | 'result' | 'error';
  id: string;
  // result
  bestMove?: string;
  mateIn?: number | null;
  pvs?: PV[];
  // info
  depth?: number;
  score?: number;
  // error
  message?: string;
}

interface PendingRequest {
  resolve: (r: AnalysisResult) => void;
  reject: (e: Error) => void;
}

// ── Simple UUID (crypto-based, no import needed in modern browsers) ────────────

function uuid(): string {
  return crypto.randomUUID();
}

// ── WebSocket service ──────────────────────────────────────────────────────────

class StockfishService {
  private ws: WebSocket | null = null;
  private _ready = false;
  private pendingReady: Array<() => void> = [];
  private pending = new Map<string, PendingRequest>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.connect();
  }

  private connect() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      this._ready = true;
      const waiters = this.pendingReady.splice(0);
      waiters.forEach(fn => fn());
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(event.data) as ServerMsg;
      } catch {
        return;
      }

      const entry = this.pending.get(msg.id);
      if (!entry) return;

      if (msg.type === 'result') {
        this.pending.delete(msg.id);
        entry.resolve({
          bestMove: msg.bestMove ?? '',
          mateIn: msg.mateIn ?? null,
          pvs: msg.pvs ?? [],
        });
      } else if (msg.type === 'error') {
        this.pending.delete(msg.id);
        entry.reject(new Error(msg.message ?? 'engine error'));
      }
      // 'info' messages are intentionally ignored on the client for now
      // (the server sends them; a future UI can use them for live depth display)
    };

    ws.onclose = () => {
      this._ready = false;
      // Reject all in-flight requests so the hook can react
      for (const [id, entry] of this.pending) {
        entry.reject(new Error('disconnected'));
        this.pending.delete(id);
      }
      // Reconnect after a short delay
      this.reconnectTimer = setTimeout(() => this.connect(), 500);
    };

    ws.onerror = () => {
      // onclose fires right after onerror — let that handler deal with cleanup
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get isReady(): boolean {
    return this._ready;
  }

  waitReady(): Promise<void> {
    if (this._ready) return Promise.resolve();
    return new Promise(resolve => this.pendingReady.push(resolve));
  }

  /**
   * Send an analysis request over the WebSocket.
   * Returns a cancelable handle: call `cancel()` to stop the engine and
   * reject the promise early.
   */
  analyze(fen: string, opts: AnalyzeOptions): { promise: Promise<AnalysisResult>; cancel: () => void } {
    const id = uuid();
    let settled = false;

    const promise = new Promise<AnalysisResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      // Ensure the socket is open before sending
      this.waitReady().then(() => {
        if (settled) return; // was cancelled before socket opened
        this.ws!.send(JSON.stringify({ type: 'analyze', id, fen, ...opts }));
      });
    });

    const cancel = () => {
      if (settled) return;
      settled = true;
      const entry = this.pending.get(id);
      if (entry) {
        this.pending.delete(id);
        if (this._ready) {
          this.ws!.send(JSON.stringify({ type: 'cancel', id }));
        }
        entry.reject(new Error('cancelled'));
      }
    };

    // Mark settled on resolution so cancel is a no-op afterwards
    promise.then(() => { settled = true; }, () => { settled = true; });

    return { promise, cancel };
  }

  terminate() {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

let _service: StockfishService | null = null;

export function getStockfishService(): StockfishService {
  if (!_service) _service = new StockfishService();
  return _service;
}

