import {
  db,
  getPlayerByName,
  getPlayerById,
  getUserById,
  normalizeName,
  clamp
} from '../db.js';
import { buildNewspaper, MIN_VOTES_FOR_NEWSPAPER } from '../newspaper.js';
import { requireAuth } from '../middleware.js';

function rowToMatch(row) {
  return {
    id: row.id,
    date: row.played_at || row.created_at,
    format: row.format,
    teamClaro: JSON.parse(row.team_claro_json || '[]'),
    teamOscuro: JSON.parse(row.team_oscuro_json || '[]'),
    status: row.status
  };
}

function teamsMatch(aClaro, aOscuro, bClaro, bOscuro) {
  const sortNorm = arr => [...arr].map(normalizeName).sort();
  return JSON.stringify(sortNorm(aClaro)) === JSON.stringify(sortNorm(bClaro)) &&
    JSON.stringify(sortNorm(aOscuro)) === JSON.stringify(sortNorm(bOscuro));
}

function getMatchVoteCount(matchId) {
  const row = db.prepare(`
    SELECT COUNT(DISTINCT rater_user_id) AS c FROM match_votes WHERE match_id = ?
  `).get(matchId);
  return row?.c || 0;
}

function getMatchResults(matchId) {
  const rows = db.prepare(`
    SELECT p.name AS player_name, AVG(mv.score) AS average, COUNT(*) AS votes
    FROM match_votes mv
    JOIN players p ON p.id = mv.rated_player_id
    WHERE mv.match_id = ?
    GROUP BY mv.rated_player_id
    ORDER BY average DESC
  `).all(matchId);

  return rows.map(r => ({
    playerName: r.player_name,
    average: r.average,
    votes: r.votes
  }));
}

export function registerMatchRoutes(app) {
  app.get('/v1/matches', (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM matches ORDER BY created_at DESC LIMIT 30
    `).all();
    res.json({ ok: true, matches: rows.map(rowToMatch) });
  });

  app.get('/v1/matches/upcoming', (req, res) => {
    const row = db.prepare(`
      SELECT * FROM matches WHERE status = 'open' ORDER BY created_at DESC LIMIT 1
    `).get();
    res.json({ ok: true, match: row ? rowToMatch(row) : null });
  });

  app.get('/v1/matches/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    res.json({ ok: true, match: rowToMatch(row) });
  });

  app.post('/v1/matches', requireAuth, (req, res) => {
    try {
      const user = getUserById(req.session.userId);
      const { format, teamClaro, teamOscuro, findOpen } = req.body || {};
      const claro = (teamClaro || []).map(p => (typeof p === 'string' ? p : p.nombre));
      const oscuro = (teamOscuro || []).map(p => (typeof p === 'string' ? p : p.nombre));

      if (findOpen) {
        const existing = db.prepare(`
          SELECT * FROM matches WHERE format = ? AND status = 'voting'
          ORDER BY created_at DESC
        `).all(format);

        const found = existing.find(m => {
          const mClaro = JSON.parse(m.team_claro_json);
          const mOscuro = JSON.parse(m.team_oscuro_json);
          return teamsMatch(claro, oscuro, mClaro, mOscuro);
        });

        if (found) {
          return res.json({ ok: true, match: rowToMatch(found), reused: true });
        }
      }

      const id = `match_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      db.prepare(`
        INSERT INTO matches (id, format, played_at, status, created_by, team_claro_json, team_oscuro_json)
        VALUES (?, ?, datetime('now'), 'voting', ?, ?, ?)
      `).run(id, format, user.id, JSON.stringify(claro), JSON.stringify(oscuro));

      const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
      res.json({ ok: true, match: rowToMatch(row), reused: false });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put('/v1/matches/:id/votes', requireAuth, (req, res) => {
    try {
      const user = getUserById(req.session.userId);
      const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
      if (!match) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

      const votes = req.body?.votes || [];
      const upsert = db.prepare(`
        INSERT INTO match_votes (match_id, rater_user_id, rated_player_id, score, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(match_id, rater_user_id, rated_player_id) DO UPDATE SET
          score = excluded.score,
          updated_at = datetime('now')
      `);

      const tx = db.transaction(() => {
        votes.forEach(vote => {
          const rated = getPlayerByName(vote.playerName || vote.player);
          if (!rated) return;
          if (rated.id === user.player_id) {
            throw new Error('No podés votarte a vos mismo');
          }
          upsert.run(match.id, user.id, rated.id, clamp(vote.score));
        });
      });
      tx();

      const voteCount = getMatchVoteCount(match.id);
      res.json({
        ok: true,
        voteCount,
        minVotes: MIN_VOTES_FOR_NEWSPAPER,
        newspaperReady: voteCount >= MIN_VOTES_FOR_NEWSPAPER
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  /** Solo los votos del usuario autenticado — privacidad */
  app.get('/v1/matches/:id/my-votes', requireAuth, (req, res) => {
    const user = getUserById(req.session.userId);
    const rows = db.prepare(`
      SELECT p.name AS player_name, mv.score
      FROM match_votes mv
      JOIN players p ON p.id = mv.rated_player_id
      WHERE mv.match_id = ? AND mv.rater_user_id = ?
    `).all(req.params.id, user.id);

    const votes = {};
    rows.forEach(r => {
      votes[normalizeName(r.player_name)] = {
        playerName: r.player_name,
        score: r.score
      };
    });

    res.json({ ok: true, votes });
  });

  /** Resultados agregados — sin identidad de votantes */
  app.get('/v1/matches/:id/results', (req, res) => {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
    if (!match) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

    res.json({
      ok: true,
      voteCount: getMatchVoteCount(match.id),
      minVotes: MIN_VOTES_FOR_NEWSPAPER,
      results: getMatchResults(match.id)
    });
  });

  app.get('/v1/matches/:id/newspaper', (req, res) => {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
    if (!match) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

    const voteCount = getMatchVoteCount(match.id);
    const results = getMatchResults(match.id);
    const edition = buildNewspaper(rowToMatch(match), voteCount, results);

    res.json({
      ok: true,
      voteCount,
      minVotes: MIN_VOTES_FOR_NEWSPAPER,
      newspaper: edition
    });
  });
}

export function registerConvocationRoutes(app) {
  app.get('/v1/convocation', (req, res) => {
    const rows = db.prepare(`
      SELECT p.name FROM convocation c
      JOIN players p ON p.id = c.player_id
      ORDER BY p.name COLLATE NOCASE
    `).all();
    res.json({
      ok: true,
      players: rows.map(r => r.name),
      keys: rows.map(r => normalizeName(r.name))
    });
  });

  app.put('/v1/convocation', requireAuth, (req, res) => {
    try {
      const user = getUserById(req.session.userId);
      const names = Array.isArray(req.body?.players) ? req.body.players : [];

      db.prepare('DELETE FROM convocation').run();
      const insert = db.prepare(`
        INSERT INTO convocation (player_id, selected_by, updated_at)
        VALUES (?, ?, datetime('now'))
      `);

      const tx = db.transaction(() => {
        names.forEach(name => {
          const player = getPlayerByName(name);
          if (player) insert.run(player.id, user.id);
        });
      });
      tx();

      res.json({ ok: true, count: names.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}
