import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, '3ertiempo.db');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    position_1 TEXT NOT NULL DEFAULT 'MED',
    position_2 TEXT NOT NULL DEFAULT 'DEL',
    plays_goalkeeper INTEGER NOT NULL DEFAULT 0,
    age INTEGER NOT NULL DEFAULT 30,
    height INTEGER NOT NULL DEFAULT 175,
    preferred_foot TEXT NOT NULL DEFAULT 'Derecho',
    photo_url TEXT NOT NULL DEFAULT '',
    base_stats_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS peer_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rater_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rated_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    stats_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(rater_user_id, rated_player_id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    format INTEGER NOT NULL,
    scheduled_for TEXT,
    played_at TEXT,
    status TEXT NOT NULL DEFAULT 'voting',
    created_by INTEGER REFERENCES users(id),
    team_claro_json TEXT NOT NULL DEFAULT '[]',
    team_oscuro_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS match_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    rater_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rated_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(match_id, rater_user_id, rated_player_id)
  );

  CREATE TABLE IF NOT EXISTS convocation (
    player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    selected_by INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const STAT_FIELDS = [
  'vel_fis', 'resistencia', 'fuerza',
  'regate', 'pase_corto', 'pase_largo', 'posicionamiento', 'remate',
  'marca', 'arquero'
];

const PEER_CARD_KEYS = ['velocidad', 'resistencia', 'fuerza', 'tiro', 'pase', 'regate', 'defensa', 'arquero'];

function defaultBaseStats() {
  const stats = {};
  STAT_FIELDS.forEach(f => { stats[f] = f === 'arquero' ? 1 : 3; });
  return stats;
}

function normalizeName(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function clamp(n, min = 1, max = 5) {
  return Math.max(min, Math.min(max, Math.round(Number(n) || min)));
}

function rowToPlayer(row, peerMeta = null) {
  const base = JSON.parse(row.base_stats_json || '{}');
  const player = {
    nombre: row.name,
    posicion_1: row.position_1,
    posicion_2: row.position_2,
    juega_arco: Boolean(row.plays_goalkeeper),
    edad: row.age,
    altura: row.height,
    pie_habil: row.preferred_foot,
    foto_url: row.photo_url || '',
    ...base
  };
  if (peerMeta) {
    player.rating_count = peerMeta.count;
    if (peerMeta.stats) player.peer_averages = peerMeta.stats;
  }
  return player;
}

function playerPayloadToBaseStats(body) {
  const stats = defaultBaseStats();
  STAT_FIELDS.forEach(f => {
    if (body[f] != null && body[f] !== '') stats[f] = clamp(body[f], f === 'arquero' ? 1 : 1, 5);
  });
  return stats;
}

function getPlayerByName(name) {
  return db.prepare('SELECT * FROM players WHERE name = ? COLLATE NOCASE').get(String(name || '').trim());
}

function getPlayerById(id) {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
}

function getUserByUsername(username) {
  return db.prepare(`
    SELECT u.*, p.name AS player_name
    FROM users u
    JOIN players p ON p.id = u.player_id
    WHERE u.username = ? COLLATE NOCASE
  `).get(String(username || '').trim());
}

function getUserById(id) {
  return db.prepare(`
    SELECT u.*, p.name AS player_name
    FROM users u
    JOIN players p ON p.id = u.player_id
    WHERE u.id = ?
  `).get(id);
}

function computePeerAverages(playerId) {
  const rows = db.prepare(`
    SELECT stats_json FROM peer_ratings WHERE rated_player_id = ?
  `).all(playerId);

  if (!rows.length) return { count: 0, stats: null };

  const sums = {};
  PEER_CARD_KEYS.forEach(k => { sums[k] = 0; });
  let arqueroCount = 0;

  rows.forEach(row => {
    const stats = JSON.parse(row.stats_json);
    PEER_CARD_KEYS.forEach(key => {
      if (stats[key] != null) {
        sums[key] += clamp(stats[key]);
        if (key === 'arquero') arqueroCount += 1;
      }
    });
  });

  const stats = {};
  PEER_CARD_KEYS.forEach(key => {
    if (key === 'arquero') {
      if (arqueroCount) stats.arquero = sums.arquero / arqueroCount;
    } else {
      stats[key] = sums[key] / rows.length;
    }
  });

  return { count: rows.length, stats };
}

function seedPlayersIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM players').get().c;
  if (count > 0) return;

  const names = [
    'Marcelo', 'Maxi', 'Turco', 'Gato', 'Mariano', 'Charly', 'Gonza', 'Ariel',
    'Claudio', 'Cacho', 'Jorge', 'Jose', 'Claudio M', 'Seba', 'Marcos',
    'Juampi', 'Chifi', 'Matías', 'Pablo', 'Fer', 'Tasla', 'Franco', 'Javi'
  ];

  const insert = db.prepare(`
    INSERT INTO players (name, position_1, position_2, plays_goalkeeper, base_stats_json)
    VALUES (?, 'MED', 'DEL', 0, ?)
  `);

  const tx = db.transaction(() => {
    names.forEach(name => insert.run(name, JSON.stringify(defaultBaseStats())));
  });
  tx();
}

seedPlayersIfEmpty();

export {
  db,
  STAT_FIELDS,
  PEER_CARD_KEYS,
  defaultBaseStats,
  normalizeName,
  clamp,
  rowToPlayer,
  playerPayloadToBaseStats,
  getPlayerByName,
  getPlayerById,
  getUserByUsername,
  getUserById,
  computePeerAverages
};
