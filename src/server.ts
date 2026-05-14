import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import routes from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

/** Браузерын `Origin` header-тай ижил формат (ж: төгсгөлийн `/` байхгүй). */
function canonicalOrigin(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return new URL(t).origin;
  } catch {
    return null;
  }
}

function addOrigin(set: Set<string>, raw: string): void {
  const c = canonicalOrigin(raw);
  if (c) set.add(c);
}

// ── CORS (helmet-ээс өмнө — OPTIONS / preflight-д саад багасгана) ─────────
function buildAllowedOrigins(): Set<string> {
  const out = new Set<string>();

  for (const d of [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ]) {
    addOrigin(out, d);
  }

  for (const raw of process.env.CLIENT_URLS?.split(',') ?? []) {
    addOrigin(out, raw);
  }

  const client = process.env.CLIENT_URL?.trim();
  if (client) {
    addOrigin(out, client);
    try {
      const url = new URL(client);
      const host = url.hostname;
      const port = url.port ? `:${url.port}` : '';
      if (host.startsWith('www.')) {
        addOrigin(out, `${url.protocol}//${host.slice(4)}${port}`);
      } else {
        addOrigin(out, `${url.protocol}//www.${host}${port}`);
      }
    } catch {
      /* буруу URL */
    }
  }

  if (process.env.NODE_ENV === 'production' && out.size <= 4 && !client) {
    console.warn(
      '[CORS] CLIENT_URL тохируулаагүй байна — .env болон PM2 cwd шалгана уу (frontend origin хориглогдоно).'
    );
  }

  return out;
}

const allowedOrigins = buildAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    const o = origin ? canonicalOrigin(origin) : null;
    if (!o || allowedOrigins.has(o)) {
      callback(null, true);
    } else {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[CORS] blocked origin: ${origin} (allowed: ${[...allowedOrigins].join(', ')})`);
      }
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-session-id'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Security & logging ────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body parsing ──────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

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
