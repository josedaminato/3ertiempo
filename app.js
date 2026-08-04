/**
 * Estado global, carga/guardado de jugadores, registro de partidos y
 * votación postpartido. Es el punto de entrada de la app.
 */

let players = [];
let teamSize = 7;
let lastTopCombos = [];
let editingIdx = -1;
let isCreating = false;
let pendingPhoto = null;
let currentSession = null;
let currentCombo = null;
let currentMatch = null;
let peerRatingIdx = -1;
let selectedPlayerNames = loadPlayerSelection();

function loadPlayerSelection() {
  const saved = Utils.readJson(STORAGE_KEYS.selection, []);
  return new Set(Array.isArray(saved) ? saved : []);
}

function savePlayerSelection() {
  Utils.writeJson(STORAGE_KEYS.selection, [...selectedPlayerNames]);
}

function selectionKey(playerOrName) {
  const name = typeof playerOrName === 'string' ? playerOrName : playerOrName?.nombre;
  return Utils.normalize(name);
}

function isPlayerSelected(playerOrName) {
  return selectedPlayerNames.has(selectionKey(playerOrName));
}

function selectedPlayers() {
  return players.filter(isPlayerSelected);
}

function isCurrentUser(playerOrName) {
  const name = typeof playerOrName === 'string' ? playerOrName : playerOrName?.nombre;
  return Boolean(currentSession && Utils.normalize(name) === Utils.normalize(currentSession.username));
}

// ─── Jugadores ──────────────────────────────────────────────────────────────

async function loadPlayers() {
  const status = document.getElementById('load-status');
  status.textContent = 'Cargando jugadores…';
  status.classList.remove('error');

  try {
    const result = await PlayerApi.listPlayers();
    players = result.players.map(normalizePlayer);
    applyLocalPhotos();
    status.textContent = result.message;
    if (result.offline) status.classList.add('error');
  } catch {
    players = APP_CONFIG.defaultPlayerNames.map(Utils.defaultPlayer);
    applyLocalPhotos();
    status.textContent = 'Sin conexión. Datos locales.';
    status.classList.add('error');
  }

  const validKeys = new Set(players.map(selectionKey));
  selectedPlayerNames = new Set([...selectedPlayerNames].filter(key => validKeys.has(key)));
  savePlayerSelection();
  renderGrid();
  updateSelectionUI();
}

function normalizePlayer(p) {
  const out = Utils.defaultPlayer(p.nombre || 'Jugador');
  if (p.posicion && !p.posicion_1) {
    out.posicion_1 = p.posicion;
    out.posicion_2 = p.posicion_2 || (p.posicion === 'MED' ? 'DEL' : 'MED');
  } else {
    out.posicion_1 = p.posicion_1 || out.posicion_1;
    out.posicion_2 = p.posicion_2 || out.posicion_2;
  }
  out.edad = Number(p.edad) || out.edad;
  out.altura = Number(p.altura) || out.altura;
  out.pie_habil = p.pie_habil || out.pie_habil;
  out.foto_url = p.foto_url || '';
  STAT_FIELDS.forEach(f => {
    if (f === 'arquero') return;
    out[f] = Utils.roundStat(Number(p[f]) || 3);
  });
  if (p.arquero != null && p.arquero !== '') {
    out.arquero = Utils.roundStat(Number(p.arquero));
  } else if (p.atajar != null || p.reflejos != null || p.salidas != null) {
    out.arquero = Utils.roundStat(Utils.avg(Number(p.atajar) || 3, Number(p.reflejos) || 3, Number(p.salidas) || 3));
  } else {
    out.arquero = 1;
  }
  out.juega_arco = out.arquero >= GK_MIN_RATING;
  return out;
}

function playerExists(nombre, excludeIdx) {
  const n = nombre.trim().toLowerCase();
  return players.some((p, i) => i !== excludeIdx && p.nombre.trim().toLowerCase() === n);
}

async function savePlayer(idx) {
  const statusEl = document.getElementById('modal-save-status');
  let data = readFormData();

  if (isCreating) {
    if (!data.nombre) {
      statusEl.textContent = 'falta nombre';
      statusEl.className = 'save-status error';
      return;
    }
    if (playerExists(data.nombre, -1)) {
      statusEl.textContent = 'ya existe';
      statusEl.className = 'save-status error';
      return;
    }
  } else if (idx < 0) {
    return;
  }

  statusEl.textContent = 'guardando…';
  statusEl.className = 'save-status saving';

  try {
    if (isCreating) {
      const initialData = pendingPhoto ? { ...data, foto_url: '' } : data;
      await PlayerApi.savePlayer(initialData, { create: true });
      if (pendingPhoto) {
        const fotoUrl = await PlayerApi.uploadPhoto(data.nombre, pendingPhoto);
        if (fotoUrl) data.foto_url = fotoUrl;
        pendingPhoto = null;
        await PlayerApi.savePlayer(data, { create: false });
      }
    } else {
      if (pendingPhoto) {
        const fotoUrl = await PlayerApi.uploadPhoto(data.nombre, pendingPhoto);
        if (fotoUrl) data.foto_url = fotoUrl;
        pendingPhoto = null;
      }
      await PlayerApi.savePlayer(data, { create: false });
    }

    if (isCreating) {
      players.push(data);
      editingIdx = players.length - 1;
      isCreating = false;
      document.getElementById('modal-title').textContent = data.nombre;
      document.getElementById('btn-save').textContent = 'Guardar cambios';
    } else {
      Object.assign(players[idx], data);
    }

    if (PlayerApi.isLocal() && data.foto_url) {
      saveLocalPhoto(data.nombre, data.foto_url);
    }

    statusEl.textContent = 'guardado';
    statusEl.className = 'save-status saved';
  } catch {
    statusEl.textContent = 'error';
    statusEl.className = 'save-status error';
  }

  renderGrid();
  updateSelectionUI();
  if (editingIdx >= 0) initPhotoInForm(players[editingIdx]);
  updateModalPreview();
}

// ─── Partido y votación postpartido ────────────────────────────────────────

function registerCurrentMatch() {
  if (!currentCombo || !currentSession) return;

  // Reutilizar el partido abierto para este mismo armado de equipos en vez
  // de crear uno nuevo cada vez que se toca el botón (antes cada clic
  // generaba un partido distinto y dispersaba los votos).
  currentMatch = RatingsService.findOpenMatch({
    format: teamSize,
    teamClaro: currentCombo.teamA,
    teamOscuro: currentCombo.teamB
  }) || RatingsService.createMatch({
    format: teamSize,
    teamClaro: currentCombo.teamA,
    teamOscuro: currentCombo.teamB
  });

  renderMatchVoting(currentMatch);
  document.getElementById('match-voting').classList.add('visible');
  document.getElementById('match-voting').scrollIntoView({ behavior: 'smooth' });
}

function renderMatchVoting(match) {
  const participants = [...match.teamClaro, ...match.teamOscuro];
  const ownVotes = RatingsService.getMyMatchVotes(match.id, currentSession.username);
  const list = document.getElementById('match-vote-list');

  list.innerHTML = participants
    .filter(name => !isCurrentUser(name))
    .map(name => {
      const player = players.find(item => Utils.normalize(item.nombre) === Utils.normalize(name));
      const existing = ownVotes[Utils.normalize(name)]?.score || 3;
      return `<div class="match-player-row">
        <div class="match-player-info">
          <strong>${Utils.escapeHtml(name)}</strong>
          <small>${Utils.escapeHtml(player ? formatPosiciones(player) : '')}</small>
        </div>
        ${[1, 2, 3, 4, 5].map(value => {
          const trend = value < 3 ? 'down' : value === 3 ? 'flat' : 'up';
          const arrow = value < 3 ? '↓' : value === 3 ? '→' : '↑';
          return `<label class="performance-choice ${trend}">
            <input type="radio" name="match_${Utils.escapeHtml(name)}" data-player="${Utils.escapeHtml(name)}" value="${value}" ${existing === value ? 'checked' : ''}>
            <span>${arrow}${value}</span>
          </label>`;
        }).join('')}
      </div>`;
    }).join('');
}

function saveMatchVotes() {
  if (!currentMatch || !currentSession) return;
  const rows = document.querySelectorAll('#match-vote-list .match-player-row');
  rows.forEach(row => {
    const selected = row.querySelector('input[type=radio]:checked');
    if (selected) {
      RatingsService.saveMatchVote(
        currentMatch.id,
        currentSession.username,
        selected.dataset.player,
        Number(selected.value)
      );
    }
  });
  const status = document.getElementById('match-vote-status');
  const voteCount = RatingsService.getMatchVoteCount(currentMatch.id);
  const minVotes = RatingsService.minVotesForNewspaper;
  status.className = 'load-status';

  if (voteCount >= minVotes) {
    status.textContent = `Votos guardados · Periódico publicado (${voteCount} votos)`;
    renderNewspaper(currentMatch);
    document.getElementById('newspaper-section').scrollIntoView({ behavior: 'smooth' });
  } else {
    status.textContent = `Votos guardados · Faltan ${minVotes - voteCount} votos para publicar el periódico (${voteCount}/${minVotes})`;
    renderNewspaper(currentMatch);
  }
}

function arrowFor(trend) {
  if (trend === 'down') return '▼';
  if (trend === 'up') return '▲';
  return '●';
}

function renderNewspaper(match) {
  const edition = RatingsService.buildNewspaper(match);
  const section = document.getElementById('newspaper-section');
  const newspaper = document.getElementById('newspaper');
  const minVotes = RatingsService.minVotesForNewspaper;
  const voteCount = RatingsService.getMatchVoteCount(match.id);

  if (!edition) {
    if (voteCount > 0) {
      newspaper.innerHTML = `
        <div class="paper-masthead">
          <div class="paper-brand">El Tercer Tiempo</div>
          <div class="paper-date">Edición en preparación</div>
        </div>
        <p class="paper-deck">Periódico pendiente: ${voteCount}/${minVotes} votos registrados.</p>`;
      section.classList.add('visible');
    } else {
      section.classList.remove('visible');
    }
    return;
  }

  const articles = edition.articles.map(article => `
    <p class="paper-article"><strong>${Utils.escapeHtml(article.playerName)} (${article.average.toFixed(1)}).</strong> ${Utils.escapeHtml(article.text)}</p>
  `).join('');
  const ratings = edition.articles.map(article => `
    <div class="paper-rating-row">
      <span class="trend-${article.arrow}">${arrowFor(article.arrow)}</span>
      <span>${Utils.escapeHtml(article.playerName)}</span>
      <strong>${article.average.toFixed(1)}</strong>
    </div>
  `).join('');

  document.getElementById('newspaper').innerHTML = `
    <div class="paper-masthead">
      <div class="paper-brand">El Tercer Tiempo</div>
      <div class="paper-date">${Utils.escapeHtml(edition.kicker)}</div>
    </div>
    <div class="paper-kicker">Crónica de la fecha</div>
    <h2 class="paper-headline">${Utils.escapeHtml(edition.headline)}</h2>
    <p class="paper-deck">${Utils.escapeHtml(edition.deck)}</p>
    <div class="paper-grid">
      <div class="paper-lead">${articles}</div>
      <aside class="paper-ratings">
        <h4>El boletín</h4>
        ${ratings}
      </aside>
    </div>`;
  section.classList.add('visible');
}

function renderLatestNewspaper() {
  const section = document.getElementById('newspaper-section');
  const latest = RatingsService.listMatches().find(match =>
    RatingsService.getMatchVoteCount(match.id) > 0
  );
  if (!latest) {
    section.classList.remove('visible');
    return;
  }
  renderNewspaper(latest);
}

// ─── Arranque ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initFormatButtons();
  await loadPlayers();
  initAuth();
  document.getElementById('btn-armar').addEventListener('click', () => armarEquipos(false));
  document.getElementById('btn-barajar').addEventListener('click', () => armarEquipos(true));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('btn-save').addEventListener('click', () => savePlayer(editingIdx));
  document.getElementById('btn-add-player').addEventListener('click', openCreateEditor);
  document.getElementById('btn-clear-selection').addEventListener('click', clearPlayerSelection);
  document.getElementById('peer-modal-close').addEventListener('click', closePeerModal);
  document.getElementById('peer-modal-overlay').addEventListener('click', event => {
    if (event.target.id === 'peer-modal-overlay') closePeerModal();
  });
  document.getElementById('btn-save-peer-rating').addEventListener('click', savePeerRating);
  document.getElementById('btn-registrar-partido').addEventListener('click', registerCurrentMatch);
  document.getElementById('btn-save-match-votes').addEventListener('click', saveMatchVotes);
  document.getElementById('btn-logout').addEventListener('click', logout);
});
