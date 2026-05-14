import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import routes from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// ── Security & logging ────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── CORS ──────────────────────────────────────────────────────────────
function buildAllowedOrigins(): string[] {
  const out = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ]);

  const extra = process.env.CLIENT_URLS?.split(',') ?? [];
  for (const raw of extra) {
    const t = raw.trim();
    if (t) out.add(t);
  }

  const client = process.env.CLIENT_URL?.trim();
  if (client) {
    out.add(client);
    try {
      const url = new URL(client);
      const host = url.hostname;
      if (host.startsWith('www.')) {
        out.add(`${url.protocol}//${host.slice(4)}`);
      } else {
        out.add(`${url.protocol}//www.${host}`);
      }
    } catch {
      /* CLIENT_URL буруу URL бол зөвхөн түүнийг л үлдээнэ */
    }
  }

  return [...out];
}

const allowedOrigins = buildAllowedOrigins();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static uploads ────────────────────────────────────────────────────
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// ── Health check ──────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Delguur API ажиллаж байна 🛍️',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ── API routes ────────────────────────────────────────────────────────
app.use('/api', routes);

// ── 404 & Error handlers ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │  🛍️  Delguur Backend                     │
  │  Port    : ${PORT}                           │
  │  Env     : ${process.env.NODE_ENV || 'development'}              │
  │  API     : http://localhost:${PORT}/api      │
  │  Health  : http://localhost:${PORT}/health   │
  └─────────────────────────────────────────┘
  `);
});

export default app;
