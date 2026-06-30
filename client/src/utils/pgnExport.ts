import { MasterGame } from '../types';

function tag(key: string, value: string | number | null | undefined): string {
  const v = value === null || value === undefined ? '' : String(value);
  return `[${key} "${v.replace(/"/g, "'")}"]`;
}

/** Build a standard PGN string from a master game's metadata + SAN moves. */
export function gameToPgn(game: MasterGame): string {
  const headers = [
    tag('Event', game.event || '?'),
    tag('Site', '?'),
    tag('Date', game.date || '????.??.??'),
    tag('Round', '?'),
    tag('White', game.white),
    tag('Black', game.black),
    tag('Result', game.result),
  ];
  if (game.whiteElo) headers.push(tag('WhiteElo', game.whiteElo));
  if (game.blackElo) headers.push(tag('BlackElo', game.blackElo));
  if (game.eco) headers.push(tag('ECO', game.eco));
  if (game.opening) headers.push(tag('Opening', game.opening));

  // Movetext with move numbers, wrapped at ~80 cols (PGN convention).
  const tokens: string[] = [];
  for (let i = 0; i < game.moves.length; i++) {
    if (i % 2 === 0) tokens.push(`${i / 2 + 1}.`);
    tokens.push(game.moves[i]);
  }
  tokens.push(game.result);

  const lines: string[] = [];
  let line = '';
  for (const t of tokens) {
    if (line.length + t.length + 1 > 80) { lines.push(line.trimEnd()); line = ''; }
    line += t + ' ';
  }
  if (line.trim()) lines.push(line.trimEnd());

  return headers.join('\n') + '\n\n' + lines.join('\n') + '\n';
}

function sanitize(s: string): string {
  return (s || 'game').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'game';
}

/** Trigger a browser download of a raw PGN string. */
export function downloadPgn(pgn: string, filename: string): void {
  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = /\.pgn$/i.test(filename) ? filename : `${filename}.pgn`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a browser download of a master game's PGN. */
export function downloadGamePgn(game: MasterGame): void {
  const name = `${sanitize(game.white)}_vs_${sanitize(game.black)}${game.year ? `_${game.year}` : ''}.pgn`;
  downloadPgn(gameToPgn(game), name);
}
