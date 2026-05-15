import express from 'express';
import cors from 'cors';
import openingsRouter from './routes/openings';
import { loadAllOpenings } from './data/openings';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

app.use('/api/openings', openingsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, async () => {
  console.log(`Chess Opening Trainer API running on http://localhost:${PORT}`);
  // Pre-warm the cache
  try {
    await loadAllOpenings();
  } catch (err) {
    console.error('Failed to pre-load openings:', err);
  }
});

export default app;
