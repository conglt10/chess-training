const BASE = '/api';

export interface ImportedGame {
  pgn: string;
  source: 'lichess' | 'chesscom';
}

/** Fetch and normalize a game from a lichess.org or chess.com URL (via the server). */
export async function importGameFromUrl(url: string): Promise<ImportedGame> {
  const res = await fetch(`${BASE}/import-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Import failed (${res.status})`);
  }
  return res.json();
}

export interface IdentifiedOpening {
  eco: string | null;
  name: string | null;
  family: string | null;
  ply: number;
}

/** Identify the opening (name + ECO) from a SAN move list. */
export async function identifyOpening(sanMoves: string[]): Promise<IdentifiedOpening> {
  const q = new URLSearchParams({ moves: sanMoves.join(',') });
  const res = await fetch(`${BASE}/openings/identify?${q.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
