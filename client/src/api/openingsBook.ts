/**
 * Client-side opening book. `public/data/openings.json` (built by
 * `scripts/build-openings-json.mjs` from the server's TSV files) is served by
 * the static site, so the repertoire views never wait on a cold API. Indexes
 * are built once per session; queries mirror server/src/data/openings.ts.
 */
import { Opening, FirstMoveTab } from '../types';
import { cached } from './cache';

interface BookRow {
  eco: string;
  name: string;
  family: string;
  moves: string[];
}

export interface FamilyEntry {
  name: string;
  lower: string;
  variations: Opening[];
}

export interface OpeningsBook {
  all: Opening[];
  /** Keyed by lowercased family name. */
  familyIndex: Map<string, Opening[]>;
  /** Per-tab family lists (sorted by name) + variation counts per tab. */
  familyEntries: Record<FirstMoveTab | 'all', FamilyEntry[]>;
  tabCounts: Record<FirstMoveTab, number>;
}

/** Rebuild the "1. e4 e5 2. Nf3" PGN string the TSV source carries. */
function movesToPgn(moves: string[]): string {
  const parts: string[] = [];
  moves.forEach((m, i) => parts.push(i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m));
  return parts.join(' ');
}

function classifyFirstMove(o: Opening): FirstMoveTab {
  const first = o.moves[0]?.toLowerCase();
  if (first === 'e4') return 'e4';
  if (first === 'd4') return 'd4';
  return 'other';
}

function buildBook(rows: BookRow[]): OpeningsBook {
  const all: Opening[] = rows.map(r => ({ ...r, pgn: movesToPgn(r.moves) }));

  const familyIndex = new Map<string, Opening[]>();
  const perTab: Record<FirstMoveTab, Map<string, Opening[]>> = { e4: new Map(), d4: new Map(), other: new Map() };
  const tabCounts: Record<FirstMoveTab, number> = { e4: 0, d4: 0, other: 0 };

  for (const o of all) {
    const key = o.family.toLowerCase();
    let fam = familyIndex.get(key);
    if (!fam) { fam = []; familyIndex.set(key, fam); }
    fam.push(o);

    const tab = classifyFirstMove(o);
    tabCounts[tab]++;
    let rowsInTab = perTab[tab].get(o.family);
    if (!rowsInTab) { rowsInTab = []; perTab[tab].set(o.family, rowsInTab); }
    rowsInTab.push(o);
  }

  const toEntries = (m: Map<string, Opening[]>): FamilyEntry[] =>
    [...m.entries()]
      .map(([name, variations]) => ({ name, lower: name.toLowerCase(), variations }))
      .sort((a, b) => a.name.localeCompare(b.name));

  const merged = new Map<string, Opening[]>();
  for (const tab of ['e4', 'd4', 'other'] as FirstMoveTab[]) {
    for (const [name, list] of perTab[tab]) {
      let arr = merged.get(name);
      if (!arr) { arr = []; merged.set(name, arr); }
      arr.push(...list);
    }
  }

  return {
    all,
    familyIndex,
    familyEntries: {
      e4: toEntries(perTab.e4),
      d4: toEntries(perTab.d4),
      other: toEntries(perTab.other),
      all: toEntries(merged),
    },
    tabCounts,
  };
}

export function loadOpeningsBook(): Promise<OpeningsBook> {
  return cached('openings/book', async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}data/openings.json`);
    if (!res.ok) throw new Error(`Static data error: ${res.status}`);
    return buildBook((await res.json()) as BookRow[]);
  });
}
