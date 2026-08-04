import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  db,
  rowToPlayer,
  playerPayloadToBaseStats,
  getPlayerByName,
  getPlayerById,
  getUserById,
  computePeerAverages,
  clamp
} from '../db.js';
import { requireAuth } from '../middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function canEditPlayer(user, playerRow) {
  return user && user.player_id === playerRow.id;
}

function listAllPlayers() {
  const rows = db.prepare('SELECT * FROM players ORDER BY name COLLATE NOCASE').all();
  return rows.map(row => rowToPlayer(row, computePeerAverages(row.id)));
}

export function registerPlayerRoutes(app) {
  app.get('/v1/players', (req, res) => {
    const players = listAllPlayers();
    res.json({
      ok: true,
      players,
      message: `${players.length} jugadores sincronizados`
    });
  });

  app.post('/v1/players', requireAuth, (req, res) => {
    try {
      const body = req.body || {};
      const name = String(body.nombre || '').trim();
      if (!name) return res.status(400).json({ ok: false, error: 'Falta nombre' });
      if (getPlayerByName(name)) return res.status(409).json({ ok: false, error: 'Ya existe un jugador con ese nombre' });

      const baseStats = playerPayloadToBaseStats(body);
      db.prepare(`
        INSERT INTO players (name, position_1, position_2, plays_goalkeeper, age, height, preferred_foot, photo_url, base_stats_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name,
        body.posicion_1 || 'MED',
        body.posicion_2 || 'DEL',
        body.juega_arco ? 1 : 0,
        Number(body.edad) || 30,
        Number(body.altura) || 175,
        body.pie_habil || 'Derecho',
        body.foto_url || '',
        JSON.stringify(baseStats)
      );

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put('/v1/players/:id', requireAuth, (req, res) => {
    try {
      const user = getUserById(req.session.userId);
      const player = getPlayerByName(decodeURIComponent(req.params.id));
      if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
      if (!canEditPlayer(user, player)) {
        return res.status(403).json({ ok: false, error: 'Solo podés editar tu propio perfil' });
      }

      const body = req.body || {};
      const baseStats = playerPayloadToBaseStats({ ...JSON.parse(player.base_stats_json), ...body });
      db.prepare(`
        UPDATE players SET
          position_1 = ?, position_2 = ?, plays_goalkeeper = ?,
          age = ?, height = ?, preferred_foot = ?, photo_url = ?,
          base_stats_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        body.posicion_1 || player.position_1,
        body.posicion_2 || player.position_2,
        body.juega_arco ? 1 : 0,
        Number(body.edad) || player.age,
        Number(body.altura) || player.height,
        body.pie_habil || player.preferred_foot,
        body.foto_url != null ? body.foto_url : player.photo_url,
        JSON.stringify(baseStats),
        player.id
      );

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/v1/players/:id/photo', requireAuth, (req, res) => {
    try {
      const user = getUserById(req.session.userId);
      const player = getPlayerByName(decodeURIComponent(req.params.id));
      if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
      if (!canEditPlayer(user, player)) {
        return res.status(403).json({ ok: false, error: 'Solo podés subir tu propia foto' });
      }

      const { imageBase64, mimeType } = req.body || {};
      if (!imageBase64) return res.status(400).json({ ok: false, error: 'Falta imagen' });

      const ext = mimeType === 'image/png' ? 'png' : 'jpg';
      const filename = `${player.id}.${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(imageBase64, 'base64'));
      const fotoUrl = `/uploads/${filename}`;

      db.prepare('UPDATE players SET photo_url = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(fotoUrl, player.id);

      res.json({ ok: true, foto_url: fotoUrl });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put('/v1/players/:id/rating', requireAuth, (req, res) => {
    try {
      const user = getUserById(req.session.userId);
      const rated = getPlayerByName(decodeURIComponent(req.params.id));
      if (!rated) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
      if (user.player_id === rated.id) {
        return res.status(403).json({ ok: false, error: 'No podés calificarte a vos mismo' });
      }

      const stats = req.body?.stats || req.body || {};
      const normalized = {};
      ['velocidad', 'resistencia', 'fuerza', 'tiro', 'pase', 'regate', 'defensa', 'arquero'].forEach(key => {
        if (stats[key] != null) {
          normalized[key] = clamp(stats[key], key === 'arquero' ? 1 : 1, 5);
        }
      });

      db.prepare(`
        INSERT INTO peer_ratings (rater_user_id, rated_player_id, stats_json, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(rater_user_id, rated_player_id) DO UPDATE SET
          stats_json = excluded.stats_json,
          updated_at = datetime('now')
      `).run(user.id, rated.id, JSON.stringify(normalized));

      res.json({ ok: true, peer_averages: computePeerAverages(rated.id) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/v1/players/:id/my-rating', requireAuth, (req, res) => {
    const user = getUserById(req.session.userId);
    const rated = getPlayerByName(decodeURIComponent(req.params.id));
    if (!rated) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    const row = db.prepare(`
      SELECT stats_json FROM peer_ratings
      WHERE rater_user_id = ? AND rated_player_id = ?
    `).get(user.id, rated.id);

    res.json({
      ok: true,
      stats: row ? JSON.parse(row.stats_json) : null
    });
  });
}

export { uploadsDir };
