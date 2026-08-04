import bcrypt from 'bcrypt';
import {
  db,
  getUserByUsername,
  getUserById,
  getPlayerByName
} from '../db.js';

const PIN_REGEX = /^\d{6}$/;

function sessionPayload(userRow) {
  return { username: userRow.username, playerId: userRow.player_id };
}

export function registerAuthRoutes(app) {
  app.post('/v1/auth/status', (req, res) => {
    const username = String(req.body?.username || '').trim();
    if (!username) return res.status(400).json({ ok: false, error: 'Falta username' });
    const user = getUserByUsername(username);
    res.json({ ok: true, registered: Boolean(user) });
  });

  app.post('/v1/auth/register', async (req, res) => {
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '').trim();
      if (!username) return res.status(400).json({ ok: false, error: 'Elegí tu jugador' });
      if (!PIN_REGEX.test(password)) {
        return res.status(400).json({ ok: false, error: 'La contraseña debe tener 6 números' });
      }

      const player = getPlayerByName(username);
      if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

      const existing = getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ ok: false, error: 'Este jugador ya tiene contraseña. Usá Ingresar.' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = db.prepare(`
        INSERT INTO users (player_id, username, password_hash)
        VALUES (?, ?, ?)
      `).run(player.id, username, passwordHash);

      const user = getUserById(result.lastInsertRowid);
      req.session.userId = user.id;
      req.session.user = sessionPayload(user);
      res.json({ ok: true, user: { username: user.username } });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/v1/auth/login', async (req, res) => {
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '').trim();
      if (!username) return res.status(400).json({ ok: false, error: 'Elegí tu jugador' });
      if (!PIN_REGEX.test(password)) {
        return res.status(400).json({ ok: false, error: 'La contraseña debe tener 6 números' });
      }

      const user = getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ ok: false, error: 'Primera vez: creá tu contraseña de 6 números' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });

      req.session.userId = user.id;
      req.session.user = sessionPayload(user);
      res.json({ ok: true, user: { username: user.username } });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/v1/auth/logout', (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  app.get('/v1/auth/me', (req, res) => {
    if (!req.session?.userId) return res.json({ ok: true, user: null });
    const user = getUserById(req.session.userId);
    if (!user) {
      req.session = null;
      return res.json({ ok: true, user: null });
    }
    res.json({ ok: true, user: { username: user.username } });
  });
}
