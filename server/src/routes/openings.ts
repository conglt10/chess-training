import { Router, Request, Response } from 'express';
import { getOpenings } from '../data/openings';
import { Opening } from '../types';

const router = Router();

// GET /api/openings?search=&eco=&family=&page=&pageSize=
router.get('/', async (req: Request, res: Response) => {
  try {
    const allOpenings = await getOpenings();

    const search = (req.query.search as string || '').toLowerCase();
    const eco = (req.query.eco as string || '').toUpperCase();
    const family = (req.query.family as string || '').toLowerCase();
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string || '50', 10)));

    let filtered: Opening[] = allOpenings;

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

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    res.json({ openings: paginated, total, page, pageSize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load openings' });
  }
});

// GET /api/openings/families - distinct family names
router.get('/families', async (_req: Request, res: Response) => {
  try {
    const allOpenings = await getOpenings();
    const families = [...new Set(allOpenings.map(o => o.family))].sort();
    res.json({ families });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load families' });
  }
});

// GET /api/openings/single?eco=B90&name=...
router.get('/single', async (req: Request, res: Response) => {
  try {
    const allOpenings = await getOpenings();
    const eco = (req.query.eco as string || '').toUpperCase();
    const name = (req.query.name as string || '').toLowerCase();

    const opening = allOpenings.find(
      o => o.eco === eco && o.name.toLowerCase() === name
    );

    if (!opening) {
      res.status(404).json({ error: 'Opening not found' });
      return;
    }
    res.json(opening);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load opening' });
  }
});

export default router;
