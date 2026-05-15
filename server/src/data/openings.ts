import { Opening } from '../types';

const LICHESS_BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';
const FILES = ['a', 'b', 'c', 'd', 'e'];

let cachedOpenings: Opening[] | null = null;

function parsePgnToMoves(pgn: string): string[] {
  // Remove move numbers (e.g. "1." "2.") and trim
  return pgn
    .replace(/\d+\.\s*/g, '')
    .trim()
    .split(/\s+/)
    .filter(m => m.length > 0);
}

function extractFamily(name: string): string {
  // Take everything before the first ":" or the full name
  const colonIdx = name.indexOf(':');
  return colonIdx !== -1 ? name.substring(0, colonIdx).trim() : name.trim();
}

async function fetchTsv(file: string): Promise<Opening[]> {
  const url = `${LICHESS_BASE}/${file}.tsv`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Failed to fetch ${url}: ${response.status}`);
    return [];
  }
  const text = await response.text();
  const lines = text.split('\n').filter(l => l.trim().length > 0);

  const openings: Opening[] = [];
  for (const line of lines) {
    if (line.startsWith('eco\t')) continue; // skip header
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [eco, name, pgn] = parts;
    const moves = parsePgnToMoves(pgn);
    openings.push({
      eco: eco.trim(),
      name: name.trim(),
      pgn: pgn.trim(),
      moves,
      family: extractFamily(name.trim()),
    });
  }
  return openings;
}

export async function loadAllOpenings(): Promise<Opening[]> {
  if (cachedOpenings) return cachedOpenings;

  console.log('Loading openings from Lichess GitHub...');
  const results = await Promise.all(FILES.map(fetchTsv));
  cachedOpenings = results.flat();
  console.log(`Loaded ${cachedOpenings.length} openings.`);
  return cachedOpenings;
}

export async function getOpenings(): Promise<Opening[]> {
  return loadAllOpenings();
}
