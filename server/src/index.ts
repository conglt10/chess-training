import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import openingsRouter from './routes/openings';
import coachRouter from './routes/coach';
import { loadAllOpenings } from './data/openings';
import { getPool } from './utils/stockfishPool';
import { coachWsHandler } from './ws/coachWsHandler';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

app.use('/api/openings', openingsRouter);
app.use('/api/coach', coachRouter);

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
  // Pre-warm pool: all 3 engines start their UCI handshake now
  getPool().warmUp()
    .then(() => console.log('Stockfish pool ready (3 engines)'))
    .catch(err => console.error('Pool warm-up error:', err));
});

export default app;
