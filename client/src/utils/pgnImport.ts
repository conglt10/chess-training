/**
 * pgnImport.ts
 *
 * Parse a PGN string into the data the Game Review needs: headers, the SAN move
 * list, the UCI move list, and the FEN of every position (start … final).
 * All parsing is done with chess.js so it stays consistent with the rest of the
 * app.
 */

import { Chess } from 'chess.js';

export interface ParsedGame {
  headers: Record<string, string>;
  sanMoves: string[];
  uciMoves: string[];
  /** FENs for every position: fens[0] = start, fens[i] = after move i (length = moves + 1) */
  fens: string[];
  white: string;
  black: string;
  whiteElo: string | null;
  blackElo: string | null;
  result: string;
  event: string;
  date: string;
}

function parseHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) {
    headers[m[1]] = m[2];
  }
  return headers;
}

export function parsePgn(pgn: string): ParsedGame {
  const trimmed = pgn.trim();
  if (!trimmed) throw new Error('Please paste a PGN first.');

  const chess = new Chess();
  try {
    chess.loadPgn(trimmed);
  } catch {
    throw new Error('Could not parse this PGN. Please check the format.');
  }

  const verbose = chess.history({ verbose: true });
  if (verbose.length === 0) {
    throw new Error('No moves found in this PGN.');
  }

  const sanMoves: string[] = [];
  const uciMoves: string[] = [];
  const fens: string[] = [verbose[0].before];

  for (const mv of verbose) {
    sanMoves.push(mv.san);
    uciMoves.push(`${mv.from}${mv.to}${mv.promotion ?? ''}`);
    fens.push(mv.after);
  }

  const headers = parseHeaders(trimmed);
  const nonEmpty = (v: string | undefined): string | null =>
    v && v.trim().length > 0 && v !== '?' ? v.trim() : null;

  return {
    headers,
    sanMoves,
    uciMoves,
    fens,
    white: nonEmpty(headers.White) ?? 'White',
    black: nonEmpty(headers.Black) ?? 'Black',
    whiteElo: nonEmpty(headers.WhiteElo),
    blackElo: nonEmpty(headers.BlackElo),
    result: nonEmpty(headers.Result) ?? '*',
    event: nonEmpty(headers.Event) ?? '',
    date: nonEmpty(headers.Date) ?? '',
  };
}
