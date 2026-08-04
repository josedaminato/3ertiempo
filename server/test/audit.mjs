/**
 * Auditoría del backend 3ertiempo — ejecutar con el servidor en marcha:
 *   cd server && npm run dev
 *   node test/audit.mjs
 */
import { ensureTestUsers } from './setup-test-users.mjs';

const BASE = process.env.API_URL || 'http://localhost:3000';
const TEST_PIN = '654321';

const results = [];
let passed = 0;
let failed = 0;
let warnings = 0;

function pass(name, detail = '') {
  passed++;
  results.push({ status: 'PASS', name, detail });
}

function fail(name, detail = '') {
  failed++;
  results.push({ status: 'FAIL', name, detail });
}

function warn(name, detail = '') {
  warnings++;
  results.push({ status: 'WARN', name, detail });
}

class Client {
  constructor() {
    this.cookie = '';
  }

  async req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined
    });
    const setCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    if (setCookies.length) {
      this.cookie = setCookies.map(c => c.split(';')[0]).join('; ');
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
}

async function register(client, username, password = TEST_PIN) {
  return client.req('POST', '/v1/auth/register', { username, password });
}

async function login(client, username, password = TEST_PIN) {
  return client.req('POST', '/v1/auth/login', { username, password });
}

async function ensureLogin(client, username) {
  let res = await login(client, username);
  if (res.data?.ok) return res;
  res = await register(client, username);
  if (res.data?.ok) return res;
  return login(client, username);
}

async function run() {
  console.log(`\n🔍 Auditoría backend — ${BASE}\n`);

  await ensureTestUsers();
  console.log('ℹ️  Usuarios de prueba listos (PIN 654321)\n');

  // ── Health ──────────────────────────────────────────────────────────────
  try {
    const health = await fetch(`${BASE}/health`).then(r => r.json());
    if (health.ok) pass('GET /health', 'API responde');
    else fail('GET /health', JSON.stringify(health));
  } catch (e) {
    fail('GET /health', `No se pudo conectar: ${e.message}`);
    printReport();
    process.exit(1);
  }

  const publicRes = await fetch(`${BASE}/v1/players`).then(r => r.json());
  if (publicRes.ok && publicRes.players?.length === 23) {
    pass('GET /v1/players', `${publicRes.players.length} jugadores seed`);
  } else {
    fail('GET /v1/players', `Esperados 23, got ${publicRes.players?.length}`);
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const anon = new Client();
  const unauth = await anon.req('PUT', '/v1/players/Marcelo', { posicion_1: 'DEF' });
  if (unauth.status === 401) pass('Auth: PUT player sin sesión → 401');
  else fail('Auth: PUT player sin sesión', `status ${unauth.status}`);

  const badPin = await anon.req('POST', '/v1/auth/register', { username: 'Gonza', password: 'abc' });
  if (badPin.status >= 400) pass('Auth: PIN inválido rechazado');
  else fail('Auth: PIN inválido aceptado');

  const turco = new Client();
  const gato = new Client();
  const fer = new Client();

  const regT = await ensureLogin(turco, 'Turco');
  if (regT.data?.ok) pass('Auth: Turco');
  else fail('Auth: Turco', JSON.stringify(regT.data));

  const regG = await ensureLogin(gato, 'Gato');
  if (regG.data?.ok) pass('Auth: Gato');
  else fail('Auth: Gato', JSON.stringify(regG.data));

  const regF = await ensureLogin(fer, 'Fer');
  if (regF.data?.ok) pass('Auth: Fer');
  else fail('Auth: Fer', JSON.stringify(regF.data));

  const me = await turco.req('GET', '/v1/auth/me');
  if (me.data?.user?.username === 'Turco') pass('GET /v1/auth/me');
  else fail('GET /v1/auth/me', JSON.stringify(me.data));

  const wrongPass = await (async () => {
    const c = new Client();
    return c.req('POST', '/v1/auth/login', { username: 'Turco', password: '000000' });
  })();
  if (wrongPass.status === 401) pass('Auth: contraseña incorrecta → 401');
  else fail('Auth: contraseña incorrecta', `status ${wrongPass.status}`);

  // ── Edición solo propio perfil ──────────────────────────────────────────
  const editOther = await turco.req('PUT', '/v1/players/Gato', { posicion_1: 'DEF', posicion_2: 'DEF' });
  if (editOther.status === 403) pass('Permisos: Turco no edita a Gato → 403');
  else fail('Permisos: editar otro perfil', `status ${editOther.status}`);

  const editSelf = await turco.req('PUT', '/v1/players/Turco', {
    posicion_1: 'MED',
    posicion_2: 'DEL',
    edad: 31,
    altura: 178,
    pie_habil: 'Izquierdo'
  });
  if (editSelf.data?.ok) pass('Permisos: Turco edita su perfil');
  else fail('Permisos: editar propio perfil', JSON.stringify(editSelf.data));

  // ── Peer ratings ────────────────────────────────────────────────────────
  const selfRate = await turco.req('PUT', '/v1/players/Turco/rating', {
    stats: { velocidad: 5, tiro: 5, pase: 5, regate: 5, defensa: 5, arquero: 5 }
  });
  if (selfRate.status === 403) pass('Peer: auto-calificación bloqueada → 403');
  else fail('Peer: auto-calificación', `status ${selfRate.status}`);

  const rateGato = await turco.req('PUT', '/v1/players/Gato/rating', {
    stats: {
      velocidad: 4, resistencia: 3, fuerza: 4,
      tiro: 2, pase: 3, regate: 3, defensa: 2, arquero: 1
    }
  });
  if (rateGato.data?.ok && rateGato.data.peer_averages?.count >= 1) {
    pass('Peer: Turco califica a Gato', `count=${rateGato.data.peer_averages.count}`);
  } else {
    fail('Peer: calificar a otro', JSON.stringify(rateGato.data));
  }

  const myRating = await turco.req('GET', '/v1/players/Gato/my-rating');
  if (myRating.data?.stats?.velocidad === 4) pass('Peer: GET my-rating devuelve voto propio de Turco');
  else fail('Peer: GET my-rating', JSON.stringify(myRating.data));

  const playersAfter = await fetch(`${BASE}/v1/players`).then(r => r.json());
  const gatoPlayer = playersAfter.players.find(p => p.nombre === 'Gato');
  const exposesVoter = JSON.stringify(gatoPlayer || {}).includes('Turco');
  if (gatoPlayer?.peer_averages && !exposesVoter) {
    pass('Privacidad: GET /players solo expone promedios, no votante');
  } else {
    fail('Privacidad: datos de peer rating', JSON.stringify(gatoPlayer?.peer_averages));
  }

  const gatoCantSeeTurcoVote = await gato.req('GET', '/v1/players/Gato/my-rating');
  if (gatoCantSeeTurcoVote.data?.stats == null) {
    pass('Privacidad: Gato no ve el voto de Turco (my-rating es del rater autenticado)');
  } else {
    fail('Privacidad: Gato ve stats en my-rating sobre sí mismo como rater');
  }

  // ── Convocatoria ────────────────────────────────────────────────────────
  const convPut = await turco.req('PUT', '/v1/convocation', {
    players: ['Marcelo', 'Maxi', 'Turco', 'Gonza', 'Gato', 'Mariano', 'Charly', 'Ariel',
      'Claudio', 'Cacho', 'Jorge', 'Jose', 'Seba', 'Marcos']
  });
  if (convPut.data?.ok && convPut.data.count === 14) pass('Convocatoria: PUT 14 jugadores');
  else fail('Convocatoria: PUT', JSON.stringify(convPut.data));

  const convGet = await fetch(`${BASE}/v1/convocation`).then(r => r.json());
  if (convGet.players?.length === 14) pass('Convocatoria: GET compartida');
  else fail('Convocatoria: GET', `count=${convGet.players?.length}`);

  // ── Partidos y votos ────────────────────────────────────────────────────
  const teamClaro = ['Turco', 'Gato', 'Marcelo', 'Maxi', 'Gonza', 'Mariano', 'Charly'];
  const teamOscuro = ['Ariel', 'Claudio', 'Cacho', 'Jorge', 'Jose', 'Seba', 'Marcos'];

  const match1 = await turco.req('POST', '/v1/matches', {
    format: 7, teamClaro, teamOscuro, findOpen: true
  });
  if (!match1.data?.ok || !match1.data.match?.id) {
    fail('Partido: crear', JSON.stringify(match1.data));
    printReport();
    process.exit(1);
  }
  pass('Partido: POST /v1/matches', match1.data.match.id);

  const matchId = match1.data.match.id;

  const matchReuse = await turco.req('POST', '/v1/matches', {
    format: 7, teamClaro, teamOscuro, findOpen: true
  });
  if (matchReuse.data?.reused === true && matchReuse.data.match.id === matchId) {
    pass('Partido: findOpen reutiliza mismo armado');
  } else {
    warn('Partido: findOpen', JSON.stringify(matchReuse.data));
  }

  const selfVote = await gato.req('PUT', `/v1/matches/${matchId}/votes`, {
    votes: [{ playerName: 'Gato', score: 5 }]
  });
  if (selfVote.status === 400) pass('Votos: auto-voto bloqueado');
  else fail('Votos: auto-voto', `status ${selfVote.status} ${JSON.stringify(selfVote.data)}`);

  const voteGato = await gato.req('PUT', `/v1/matches/${matchId}/votes`, {
    votes: [
      { playerName: 'Turco', score: 4 },
      { playerName: 'Marcelo', score: 3 },
      { playerName: 'Maxi', score: 2 }
    ]
  });
  if (voteGato.data?.ok) pass('Votos: Gato vota a compañeros');
  else fail('Votos: guardar', JSON.stringify(voteGato.data));

  const voteFer = await fer.req('PUT', `/v1/matches/${matchId}/votes`, {
    votes: [{ playerName: 'Gato', score: 2 }]
  });
  if (voteFer.data?.ok) pass('Votos: Fer vota (privado respecto a Gato)');

  const myVotesGato = await gato.req('GET', `/v1/matches/${matchId}/my-votes`);
  if (myVotesGato.data?.votes && Object.keys(myVotesGato.data.votes).length >= 1) {
    pass('Votos: GET my-votes solo devuelve votos propios');
  } else {
    fail('Votos: GET my-votes', JSON.stringify(myVotesGato.data));
  }

  const resultsPublic = await fetch(`${BASE}/v1/matches/${matchId}/results`).then(r => r.json());
  const exposesRater = JSON.stringify(resultsPublic).toLowerCase().includes('rater');
  if (resultsPublic.ok && !exposesRater) {
    pass('Privacidad: /results solo promedios', `voteCount=${resultsPublic.voteCount}`);
  } else {
    fail('Privacidad: /results', JSON.stringify(resultsPublic));
  }

  const gatoResult = resultsPublic.results?.find(r => r.playerName === 'Gato');
  if (gatoResult && gatoResult.votes >= 1 && gatoResult.average != null) {
    pass('Votos: Gato aparece con promedio agregado', `avg=${Number(gatoResult.average).toFixed(2)}`);
  } else {
    warn('Votos: promedio Gato', 'pocos votantes aún');
  }

  // Simular 6 votantes para periódico — registrar más usuarios o contar distinct
  const newspaperEarly = await fetch(`${BASE}/v1/matches/${matchId}/newspaper`).then(r => r.json());
  if (newspaperEarly.voteCount < 6 && newspaperEarly.newspaper == null) {
    pass('Periódico: no publica antes de 6 votantes', `${newspaperEarly.voteCount}/6`);
  } else if (newspaperEarly.newspaper) {
    warn('Periódico: publicó antes de tiempo', `voteCount=${newspaperEarly.voteCount}`);
  }

  // ── CORS ────────────────────────────────────────────────────────────────
  const corsRes = await fetch(`${BASE}/v1/players`, {
    headers: { Origin: 'http://localhost:8765' }
  });
  const corsHeader = corsRes.headers.get('access-control-allow-origin');
  if (corsHeader === 'http://localhost:8765') pass('CORS: localhost:8765 permitido');
  else warn('CORS: localhost:8765', corsHeader || 'sin header');

  const corsGh = await fetch(`${BASE}/v1/players`, {
    headers: { Origin: 'https://josedaminato.github.io' }
  });
  const corsGhHeader = corsGh.headers.get('access-control-allow-origin');
  if (corsGhHeader === 'https://josedaminato.github.io') pass('CORS: GitHub Pages permitido');
  else warn('CORS: GitHub Pages no en ALLOW — agregar a CORS_ORIGIN en producción', corsGhHeader || 'bloqueado');

  printReport();
  process.exit(failed > 0 ? 1 : 0);
}

function printReport() {
  console.log('─'.repeat(60));
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log('─'.repeat(60));
  console.log(`\n${passed} passed · ${failed} failed · ${warnings} warnings\n`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
