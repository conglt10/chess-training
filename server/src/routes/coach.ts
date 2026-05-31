import { Router, Request, Response } from 'express';
import { getPool } from '../utils/stockfishPool';

const router = Router();

router.post('/analyze', async (req: Request, res: Response) => {
  const { fen, skillLevel, depth, movetime, multiPV } = req.body as Record<string, unknown>;

  if (!fen || typeof fen !== 'string') {
    res.status(400).json({ error: 'fen is required' });
    return;
  }

  // Basic FEN sanity check (prevent arbitrary input)
  if (fen.length > 200 || !/^[rnbqkpRNBQKP1-8/\s\-wbkqKQ0-9]+$/.test(fen)) {
    res.status(400).json({ error: 'invalid fen' });
    return;
  }

  try {
    const { promise } = getPool().analyze(fen, {
      skillLevel: Math.min(20, Math.max(0, Number(skillLevel) || 20)),
      depth: Math.min(20, Math.max(1, Number(depth) || 12)),
      movetime: movetime !== undefined ? Math.min(10_000, Math.max(100, Number(movetime))) : undefined,
      multiPV: Math.min(5, Math.max(1, Number(multiPV) || 1)),
    });
    const result = await promise;
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'engine error';
    // 'cancelled' is expected when a newer request pre-empts this one
    if (message === 'cancelled') {
      res.status(409).json({ error: 'cancelled' });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

export default router;
