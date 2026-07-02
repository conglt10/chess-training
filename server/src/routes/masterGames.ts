import { Router, Request, Response } from 'express';
import { getExplorer, getMasterGameById, getCollections, getGamesByCollection } from '../data/masterGames';

const router = Router();

// The master-games corpus is static between deploys, so allow browsers/CDN to
// cache GET responses (collections, game lists, explorer, single games).
router.use((req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  }
  next();
});

// ── GET /api/master-games/collections ──────────────────────────────────────
// Returns the list of player/source collections with game counts.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/collections', (_req: Request, res: Response) => {
  try {
    res.json({ collections: getCollections() });
  } catch (err) {
    console.error('[GET /api/master-games/collections]', err);
    res.status(500).json({ error: 'Failed to load collections' });
  }
});

// ── GET /api/master-games/by-collection?key=...&page=&pageSize= ─────────────
// Paginated list of games (metadata only) in a collection.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/by-collection', (req: Request, res: Response) => {
  try {
    const key = (req.query.key as string || '').trim();
    if (!key) { res.status(400).json({ error: 'Missing key' }); return; }
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string || '20', 10)));
    const search = (req.query.search as string || '').trim();
    const sortByRaw = (req.query.sortBy as string || 'date');
    const sortBy = sortByRaw === 'moves' ? 'moves' : 'date';
    const sortDir = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc';
    res.json(getGamesByCollection(key, { search, sortBy, sortDir, page, pageSize }));
  } catch (err) {
    console.error('[GET /api/master-games/by-collection]', err);
    res.status(500).json({ error: 'Failed to load collection games' });
  }
});

// ── GET /api/master-games/explorer ──────────────────────────────────────────
// Query params:
//   play     – comma/space-separated UCI moves of the line so far (e.g. "e2e4,c7c5")
//              empty/absent = start position
//   page     – 1-based page for the games list (default: 1)
//   pageSize – games per page (default: 20, max: 100)
//
// Response: ExplorerResult
// ─────────────────────────────────────────────────────────────────────────────
router.get('/explorer', async (req: Request, res: Response) => {
  try {
    const playRaw = (req.query.play as string || '').trim();
    const uciLine = playRaw
      ? playRaw.split(/[,\s]+/).map(m => m.trim()).filter(Boolean)
      : [];
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string || '20', 10)));

    const result = await getExplorer(uciLine, page, pageSize);
    res.json(result);
  } catch (err) {
    console.error('[GET /api/master-games/explorer]', err);
    res.status(500).json({ error: 'Failed to load explorer data' });
  }
});

// ── GET /api/master-games/:id ─────────────────────────────────────────────────
// Returns the full master game (metadata + moves + uciMoves). 404 if not found.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
  try {
    const game = getMasterGameById(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json(game);
  } catch (err) {
    console.error('[GET /api/master-games/:id]', err);
    res.status(500).json({ error: 'Failed to load game' });
  }
});

export default router;
