import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPlayerRoutes, uploadsDir } from './routes/players.js';
import { registerMatchRoutes, registerConvocationRoutes } from './routes/matches.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-cambiar-en-produccion';
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8765,http://127.0.0.1:8765')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));

app.use(express.json({ limit: '6mb' }));

app.use(cookieSession({
  name: '3ertiempo_session',
  secret: SESSION_SECRET,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000
}));

app.use('/uploads', express.static(uploadsDir));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: '3ertiempo-api' });
});

registerAuthRoutes(app);
registerPlayerRoutes(app);
registerMatchRoutes(app);
registerConvocationRoutes(app);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`3ertiempo API en http://localhost:${PORT}`);
  console.log(`CORS: ${corsOrigins.join(', ')}`);
});
