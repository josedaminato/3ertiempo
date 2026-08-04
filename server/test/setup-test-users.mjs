/**
 * Asegura usuarios de prueba con PIN conocido (654321) para auditoría repetible.
 */
import bcrypt from 'bcrypt';
import { db, getPlayerByName } from '../src/db.js';

const TEST_PIN = '654321';
const TEST_USERS = ['Turco', 'Gato', 'Fer', 'Pablo', 'Charly', 'Ariel'];

export async function ensureTestUsers() {
  const hash = await bcrypt.hash(TEST_PIN, 4);
  const upsert = db.prepare(`
    INSERT INTO users (player_id, username, password_hash)
    VALUES (?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET password_hash = excluded.password_hash
  `);

  TEST_USERS.forEach(name => {
    const player = getPlayerByName(name);
    if (player) upsert.run(player.id, name, hash);
  });

  return { pin: TEST_PIN, users: TEST_USERS };
}
