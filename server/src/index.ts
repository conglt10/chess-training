import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import openingsRouter from './routes/openings';
import coachRouter from './routes/coach';
import masterGamesRouter from './routes/masterGames';
import importGameRouter from './routes/importGame';
import { loadAllOpenings } from './data/openings';
import { warmMasterGames, prewarmExplorerIndex } from './data/masterGames';
import { getPool } from './utils/stockfishPool';
import { coachWsHandler } from './ws/coachWsHandler';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL);
}
if (process.env.ALLOWED_ORIGINS) {
  allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()));
}

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use('/api/openings', openingsRouter);
app.use('/api/coach', coachRouter);
app.use('/api/master-games', masterGamesRouter);
app.use('/api/import-game', importGameRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── HTTP + WebSocket server ────────────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

// Upgrade only requests targeting /ws/coach
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws/coach') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  coachWsHandler(ws);
});

server.listen(PORT, async () => {
  console.log(`Chess Opening Trainer API running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws/coach`);
  // Pre-warm caches
  try {
    await loadAllOpenings();
  } catch (err) {
    console.error('Failed to pre-load openings:', err);
  }
  try {
    warmMasterGames();
    // Build the explorer index in the background (chunked, non-blocking) so it's
    // ready by the time anyone opens the explorer — without freezing startup.
    prewarmExplorerIndex().catch(err => console.error('Explorer index build failed:', err));
  } catch (err) {
    console.error('Failed to pre-load master games:', err);
  }
  // Pre-warm pool: all 3 engines start their UCI handshake now
  getPool().warmUp()
    .then(() => console.log('Stockfish pool ready (3 engines)'))
    .catch(err => console.error('Pool warm-up error:', err));
});

export default app;
