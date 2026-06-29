import { Chess } from 'chess.js';

/**
 * Convert a line of SAN moves (e.g. an opening's `moves`) into UCI moves
 * (e.g. ['e2e4', 'c7c5']) for the master-games explorer `play` param.
 *
 * Replays through chess.js so the output is identical to how the server
 * derives UCI — an opening line and a board-navigated line produce the same
 * `play` key. Stops at the first unparseable move.
 */
export function sanLineToUci(sanMoves: string[]): string[] {
  const chess = new Chess();
  const uci: string[] = [];
  for (const san of sanMoves) {
    try {
      const move = chess.move(san);
      if (!move) break;
      uci.push(move.from + move.to + (move.promotion ?? ''));
    } catch {
      break;
    }
  }
  return uci;
}
