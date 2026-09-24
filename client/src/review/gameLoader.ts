/**
 * gameLoader.ts
 *
 * Frontend-only game import for the Game Review (WhyBlunder spec:
 * `PGN Input / Lichess URL` + `Lichess URL / ID Resolving`).
 *
 * - PGN paste / file upload needs no loader (handled by GameImport).
 * - Lichess URLs (or bare game IDs) are fetched directly from
 *   `lichess.org/game/export/{id}`, which serves CORS-friendly PGN.
 * - Chess.com blocks direct browser access to its game endpoints (no CORS
 *   headers), so chess.com links fail fast with guidance to paste the PGN
 *   (Share → Get PGN / Download) instead of hanging on a doomed fetch.
 */

import { lichessGameId } from './cache/analysisCache';

export type GameSource = 'lichess' | 'chesscom' | 'pgn';

export interface LoadedGame {
  pgn: string;
  source: GameSource;
}

export function detectSource(url: string): 'lichess' | 'chesscom' | null {
  if (/lichess\.org/i.test(url)) return 'lichess';
  if (/chess\.com/i.test(url)) return 'chesscom';
  return null;
}

/** Extract { id, kind } from a chess.com game URL (for error context only). */
function chesscomGameRef(url: string): { id: string } | null {
  const m = url.match(/(?:game\/)?(live|daily)\/(?:game\/)?(\d+)/i) ?? url.match(/\/(\d{6,})/);
  if (!m) return null;
  return { id: m[m.length - 1] };
}

async function fetchLichessPgn(gameId: string): Promise<string> {
  const res = await fetch(
    `https://lichess.org/game/export/${gameId}?evals=false&clocks=false&literate=false`,
    { headers: { Accept: 'application/x-chess-pgn' } },
  );
  if (!res.ok) throw new Error(`lichess returned ${res.status}`);
  const pgn = (await res.text()).trim();
  if (!pgn || !/\d\./.test(pgn)) throw new Error('no moves found in lichess game');
  return pgn;
}

/**
 * Load a game from a lichess.org or chess.com URL — no backend involved.
 * Throws with a user-facing message when the game cannot be fetched.
 */
export async function loadGameFromUrl(url: string): Promise<LoadedGame> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('Paste a game link first.');

  const source = detectSource(trimmed);
  if (!source) {
    throw new Error('Only lichess.org and chess.com links are supported (or paste PGN below).');
  }

  if (source === 'lichess') {
    const id = lichessGameId(trimmed);
    if (!id) throw new Error('Could not parse lichess game id from that link.');
    return { pgn: await fetchLichessPgn(id), source };
  }

  // Chess.com: the game JSON endpoints (callback/live|daily/game/{id}) do not
  // send CORS headers, so browsers cannot read them. Attempting the fetch
  // would only produce an opaque TypeError after a long hang — fail fast with
  // actionable guidance instead.
  const ref = chesscomGameRef(trimmed);
  if (!ref) {
    throw new Error(
      'Could not parse chess.com game id. Open the game on chess.com, use Share → Get PGN, and paste it below.',
    );
  }
  throw new Error(
    'Chess.com blocks direct browser imports. Open the game on chess.com, use Share → Get PGN (or Download), and paste the PGN below.',
  );
}
