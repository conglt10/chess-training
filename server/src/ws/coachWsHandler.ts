/**
 * coachWsHandler.ts
 *
 * Handles a single WebSocket connection from the coach game client.
 * Each connection gets its own Map of in-flight analysis handles so:
 *   - Multiple requests can be in flight simultaneously (pool handles concurrency)
 *   - Each request can be individually cancelled
 *   - All pending requests are cancelled cleanly when the socket closes
 *
 * ── Protocol ──────────────────────────────────────────────────────────────────
 *
 * Client → Server (JSON):
 *   { type: 'analyze', id: string, fen: string, skillLevel: number,
 *     depth: number, movetime?: number, multiPV?: number }
 *   { type: 'cancel',  id: string }
 *
 * Server → Client (JSON):
 *   { type: 'info',   id: string, depth: number, score: number }  ← streaming
 *   { type: 'result', id: string, bestMove: string, mateIn: number|null, pvs: PV[] }
 *   { type: 'error',  id: string, message: string }
 */

import type { WebSocket } from 'ws';
import { getPool } from '../utils/stockfishPool';

const FEN_RE = /^[rnbqkpRNBQKP1-8/\s\-wbkqKQ0-9]+$/;

function send(ws: WebSocket, data: object) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function coachWsHandler(ws: WebSocket): void {
  // Map<requestId, cancelFn> — one entry per active analysis
  const pending = new Map<string, () => void>();

  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString()) as Record<string, unknown>;
    } catch {
      return; // ignore malformed JSON
    }

    const { type, id } = msg;
    if (typeof id !== 'string' || !id) return;

    // ── cancel ───────────────────────────────────────────────────────────────
    if (type === 'cancel') {
      const cancel = pending.get(id);
      if (cancel) {
        cancel();
        pending.delete(id);
      }
      return;
    }

    // ── analyze ──────────────────────────────────────────────────────────────
    if (type === 'analyze') {
      const fen = msg.fen;
      if (typeof fen !== 'string' || fen.length > 200 || !FEN_RE.test(fen)) {
        send(ws, { type: 'error', id, message: 'invalid fen' });
        return;
      }

      const skillLevel = Math.min(20, Math.max(0, Number(msg.skillLevel) || 20));
      const depth      = Math.min(20, Math.max(1,  Number(msg.depth)      || 12));
      const multiPV    = Math.min(5,  Math.max(1,  Number(msg.multiPV)    || 1));
      const movetime   = msg.movetime !== undefined
        ? Math.min(10_000, Math.max(100, Number(msg.movetime)))
        : undefined;

      const { promise, cancel } = getPool().analyze(fen, {
        skillLevel,
        depth,
        movetime,
        multiPV,
        onInfo: (searchDepth, score) => {
          send(ws, { type: 'info', id, depth: searchDepth, score });
        },
      });

      pending.set(id, cancel);

      promise
        .then(result => {
          pending.delete(id);
          send(ws, { type: 'result', id, ...result });
        })
        .catch(err => {
          pending.delete(id);
          const message = err instanceof Error ? err.message : 'engine error';
          if (message !== 'cancelled') {
            send(ws, { type: 'error', id, message });
          }
          // 'cancelled' is expected — no error message needed
        });
    }
  });

  // Cancel all in-flight requests when the connection drops
  ws.on('close', () => {
    for (const cancel of pending.values()) {
      cancel();
    }
    pending.clear();
  });

  ws.on('error', () => {
    for (const cancel of pending.values()) {
      cancel();
    }
    pending.clear();
  });
}
