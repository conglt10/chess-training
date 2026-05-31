import { Router, Request, Response } from 'express';
import { getAllOpenings, getOpeningsByFamilies, getFamilySummaries } from '../data/openings';
import type { FirstMoveTab } from '../data/openings';
import { Opening } from '../types';

const router = Router();

// ── GET /api/openings ─────────────────────────────────────────────────────────
// Query params:
//   search   – substring match on name or ECO code
//   eco      – ECO prefix filter (e.g. "B", "B90")
//   family   – substring match on family name
//   families – comma-separated exact family names (fast path, skips full load)
//   page     – 1-based page number  (default: 1)
//   pageSize – results per page     (default: 50, max: 100)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string || '').toLowerCase().trim();
    const eco = (req.query.eco as string || '').toUpperCase().trim();
    const family = (req.query.family as string || '').toLowerCase().trim();
    const familiesParam = (req.query.families as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    // families fast-path allows larger page to get all results in one shot
    const maxPageSize = familiesParam ? 5000 : 100;
    const pageSize = Math.min(maxPageSize, Math.max(1, parseInt(req.query.pageSize as string || '50', 10)));

    let filtered: Opening[];

    // ── Fast path: caller supplied an explicit list of family names ───────────
    // Used by the "Most Popular" view — no need to load the full dataset.
    if (familiesParam) {
      const requestedFamilies = familiesParam
        .split(',')
        .map(f => f.trim())
        .filter(f => f.length > 0);

      filtered = getOpeningsByFamilies(requestedFamilies);

      // Allow further narrowing with search / eco if also provided
      if (search) {
        filtered = filtered.filter(o =>
          o.name.toLowerCase().includes(search) ||
          o.eco.toLowerCase().includes(search)
        );
      }
      if (eco) {
        filtered = filtered.filter(o => o.eco.startsWith(eco));
      }
    } else {
      // ── Normal path: full dataset with optional filters ─────────────────────
      filtered = getAllOpenings();

      if (search) {
        filtered = filtered.filter(o =>
          o.name.toLowerCase().includes(search) ||
          o.eco.toLowerCase().includes(search)
        );
      }
      if (eco) {
        filtered = filtered.filter(o => o.eco.startsWith(eco));
      }
      if (family) {
        filtered = filtered.filter(o => o.family.toLowerCase().includes(family));
      }
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    res.json({ openings: paginated, total, page, pageSize });
  } catch (err) {
    console.error('[GET /api/openings]', err);
    res.status(500).json({ error: 'Failed to load openings' });
  }
});

// ── GET /api/openings/families ────────────────────────────────────────────────
// Paginated family summaries for the "Classify Openings" view.
//
// Query params:
//   firstMove  – 'e4' | 'd4' | 'other'  (optional, filters by opening move)
//   search     – substring match on family name
//   page       – 1-based page number  (default: 1)
//   pageSize   – families per page    (default: 20, max: 100)
//
// Response: FamilySummariesResponse
// ─────────────────────────────────────────────────────────────────────────────
router.get('/families', (_req: Request, res: Response) => {
  try {
    const req = _req;
    const firstMoveRaw = (req.query.firstMove as string || '').toLowerCase().trim();
    const firstMove: FirstMoveTab | undefined =
      firstMoveRaw === 'e4' || firstMoveRaw === 'd4' || firstMoveRaw === 'other'
        ? firstMoveRaw
        : undefined;
    const search = (req.query.search as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string || '20', 10)));

    const result = getFamilySummaries({ firstMove, search, page, pageSize });
    res.json(result);
  } catch (err) {
    console.error('[GET /api/openings/families]', err);
    res.status(500).json({ error: 'Failed to load families' });
  }
});

// ── GET /api/openings/single?eco=B90&name=... ─────────────────────────────────
// Returns a single opening by exact ECO + name match.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/single', (req: Request, res: Response) => {
  try {
    const eco = (req.query.eco as string || '').toUpperCase().trim();
    const name = (req.query.name as string || '').toLowerCase().trim();

    const allOpenings = getAllOpenings();
    const opening = allOpenings.find(
      o => o.eco === eco && o.name.toLowerCase() === name
    );

    if (!opening) {
      res.status(404).json({ error: 'Opening not found' });
      return;
    }
    res.json(opening);
  } catch (err) {
    console.error('[GET /api/openings/single]', err);
    res.status(500).json({ error: 'Failed to load opening' });
  }
});

export default router;
