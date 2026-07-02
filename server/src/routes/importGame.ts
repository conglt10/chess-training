/**
 * importGame.ts
 *
 * POST /api/import-game  { url: string }
 *
 * Fetches a single game from a Lichess or Chess.com URL and returns it as a
 * normalized PGN string. This runs server-side because browsers cannot call
 * those services directly (CORS), and Chess.com only exposes the moves in its
 * internal TCN encoding (decoded here).
 *
 * Response: { pgn: string, source: 'lichess' | 'chesscom' }
 */

import { Router, Request, Response } from 'express';
import { Chess } from 'chess.js';
import { decodeTcn } from '../utils/tcn';

const router = Router();

// The Stockfish WASM engine (Emscripten) overwrites the global `fetch` with a
// non-callable object when it initializes. We capture the real fetch at module
// load time — which runs before the engine pool warms up — so our HTTP calls
// keep working regardless of engine state.
const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis);

const SITE_URL = process.env.SITE_URL || 'https://localhost';
const UA =
  `Mozilla/5.0 (compatible; ChessTrainer/1.0; +${SITE_URL}) game-review-import`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectSource(url: string): 'lichess' | 'chesscom' | null {
  if (/lichess\.org/i.test(url)) return 'lichess';
  if (/chess\.com/i.test(url)) return 'chesscom';
  return null;
}

/** Extract the lichess game id (first path segment, first 8 chars). */
function lichessGameId(url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0];
    if (!seg) return null;
    // game ids are 8 chars; full ids (with player perspective) are 12 — take 8.
    return seg.slice(0, 8);
  } catch {
    return null;
  }
}

/** Extract { id, kind } from a chess.com game URL. */
function chesscomGameRef(url: string): { id: string; kind: 'live' | 'daily' } | null {
  // Matches .../game/live/123, .../live/game/123, .../game/daily/123, .../daily/game/123
  const m = url.match(/(?:game\/)?(live|daily)\/(?:game\/)?(\d+)/i) ?? url.match(/\/(\d{6,})/);
  if (!m) return null;
  if (m.length === 3) {
    return { id: m[2], kind: m[1].toLowerCase() as 'live' | 'daily' };
  }
  return { id: m[1], kind: 'live' };
}

async function fetchLichessPgn(gameId: string): Promise<string> {
  const res = await nativeFetch(
    `https://lichess.org/game/export/${gameId}?evals=false&clocks=false&literate=false`,
    { headers: { Accept: 'application/x-chess-pgn', 'User-Agent': UA } },
  );
  if (!res.ok) throw new Error(`lichess returned ${res.status}`);
  const pgn = (await res.text()).trim();
  if (!pgn || !/\d\./.test(pgn)) throw new Error('no moves found in lichess game');
  return pgn;
}

interface ChesscomCallback {
  game?: {
    moveList?: string;
    pgnHeaders?: Record<string, string | number>;
  };
}

/** Build a PGN from a decoded chess.com game (TCN moves + headers). */
function buildPgnFromChesscom(data: ChesscomCallback): string {
  const game = data.game;
  if (!game?.moveList) throw new Error('no moves found in chess.com game');

  const tcnMoves = decodeTcn(game.moveList);
  if (tcnMoves.length === 0) throw new Error('could not decode chess.com moves');

  const chess = new Chess();

  // Copy known headers across (chess.js sanitizes the rest).
  const headers = game.pgnHeaders ?? {};
  const HEADER_KEYS = [
    'Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result',
    'ECO', 'WhiteElo', 'BlackElo', 'TimeControl', 'Termination', 'UTCDate', 'UTCTime',
  ];
  for (const key of HEADER_KEYS) {
    const v = headers[key];
    if (v !== undefined && v !== null && String(v).length > 0) {
      chess.header(key, String(v));
    }
  }

  for (const mv of tcnMoves) {
    try {
      const ok = chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      if (!ok) break;
    } catch {
      break; // stop at first illegal move (e.g. truncated stream)
    }
  }

  return chess.pgn();
}

async function fetchChesscomPgn(ref: { id: string; kind: 'live' | 'daily' }): Promise<string> {
  // Try the requested kind first, then the other as a fallback.
  const kinds: Array<'live' | 'daily'> = ref.kind === 'daily' ? ['daily', 'live'] : ['live', 'daily'];
  let lastErr: unknown = null;

  for (const kind of kinds) {
    try {
      const res = await nativeFetch(`https://www.chess.com/callback/${kind}/game/${ref.id}`, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
      });
      if (!res.ok) {
        lastErr = new Error(`chess.com returned ${res.status}`);
        continue;
      }
      const data = (await res.json()) as ChesscomCallback;
      return buildPgnFromChesscom(data);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('could not load chess.com game');
}

// ── Route ────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const url = (req.body as { url?: unknown })?.url;
  if (typeof url !== 'string' || url.trim().length === 0) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const source = detectSource(url);
  if (!source) {
    res.status(400).json({ error: 'Only lichess.org and chess.com URLs are supported' });
    return;
  }

  try {
    if (source === 'lichess') {
      const id = lichessGameId(url);
      if (!id) throw new Error('could not parse lichess game id');
      const pgn = await fetchLichessPgn(id);
      res.json({ pgn, source });
      return;
    }

    const ref = chesscomGameRef(url);
    if (!ref) throw new Error('could not parse chess.com game id');
    const pgn = await fetchChesscomPgn(ref);
    res.json({ pgn, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to import game';
    console.error('[POST /api/import-game]', message);
    res.status(502).json({ error: `Could not import game: ${message}` });
  }
});

export default router;
