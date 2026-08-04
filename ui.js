/**
 * UI: login, grid de jugadores, modal de edición de perfil, modal de
 * valoración entre pares, y manejo de fotos.
 */

// ─── Fotos ────────────────────────────────────────────────────────────────

function loadLocalPhotos() {
  return Utils.readJson(STORAGE_KEYS.fotos, {});
}

function saveLocalPhoto(nombre, dataUrl) {
  const all = loadLocalPhotos();
  if (dataUrl) all[nombre] = dataUrl;
  else delete all[nombre];
  Utils.writeJson(STORAGE_KEYS.fotos, all);
}

function getPlayerPhoto(p) {
  const url = p.foto_url || loadLocalPhotos()[p.nombre] || '';
  return Utils.safePhotoUrl(url);
}

function applyLocalPhotos() {
  const local = loadLocalPhotos();
  players.forEach(p => {
    if (!p.foto_url && local[p.nombre]) p.foto_url = local[p.nombre];
  });
}

function resizeImageFile(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        } else if (h > maxSize) {
          w = Math.round(w * maxSize / h);
          h = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve({
          dataUrl,
          base64: dataUrl.split(',')[1],
          mimeType: 'image/jpeg'
        });
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updatePhotoPreview(url) {
  const wrap = document.getElementById('photo-preview-wrap');
  const img = document.getElementById('photo-preview');
  if (!wrap || !img) return;
  if (url) {
    img.src = url;
    wrap.classList.add('has-photo');
  } else {
    img.removeAttribute('src');
    wrap.classList.remove('has-photo');
  }
}

async function handlePhotoSelect(file) {
  const photo = await resizeImageFile(file, 480);
  pendingPhoto = photo;
  updatePhotoPreview(photo.dataUrl);
  updateModalPreview();
}

// ─── Login ────────────────────────────────────────────────────────────────

function populateLoginPlayers() {
  const select = document.getElementById('login-player');
  select.innerHTML = '<option value="">Elegí tu nombre</option>' +
    players.map(player => {
      const registered = AuthService.isRegisteredSync(player.nombre);
      const suffix = registered ? ' ✓' : '';
      return `<option value="${Utils.escapeHtml(player.nombre)}">${Utils.escapeHtml(player.nombre)}${suffix}</option>`;
    }).join('');
}

function bindLoginPasswordInput() {
  const input = document.getElementById('login-password');
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, AuthService.passwordLength);
  });
}

function initAuth() {
  populateLoginPlayers();
  bindLoginPasswordInput();
  currentSession = AuthService.getSession();
  if (currentSession && players.some(player => isCurrentUser(player))) {
    showAppSession();
  } else {
    if (currentSession) AuthService.logout();
    currentSession = null;
    document.getElementById('login-overlay').classList.remove('hidden');
  }

  const form = document.getElementById('login-form');
  const playerSelect = document.getElementById('login-player');
  playerSelect.addEventListener('change', updateLoginMode);
  form.addEventListener('submit', handleLoginSubmit);
  updateLoginMode();
}

async function updateLoginMode() {
  const username = document.getElementById('login-player').value;
  const button = document.getElementById('login-submit');
  const message = document.getElementById('login-message');
  const hint = document.getElementById('login-hint');
  const passwordInput = document.getElementById('login-password');
  message.textContent = '';
  message.className = 'login-message';
  passwordInput.value = '';

  if (!username) {
    button.textContent = 'Ingresar';
    hint.textContent = 'Elegí tu jugador para continuar.';
    hint.className = 'login-hint';
    return;
  }

  const registered = await AuthService.isRegistered(username);
  if (registered) {
    button.textContent = 'Ingresar';
    hint.textContent = 'Ya tenés cuenta. Ingresá tus 6 números.';
    hint.className = 'login-hint';
  } else {
    button.textContent = 'Crear mi contraseña';
    hint.textContent = 'Primera vez: elegí 6 números y recordalos. Van a quedar guardados para ingresar cuando quieras.';
    hint.className = 'login-hint register';
  }
  passwordInput.focus();
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const username = document.getElementById('login-player').value;
  const password = document.getElementById('login-password').value;
  const message = document.getElementById('login-message');
  const button = document.getElementById('login-submit');

  if (!AuthService.isValidPasswordFormat(password)) {
    message.textContent = `La contraseña debe tener ${AuthService.passwordLength} números`;
    message.className = 'login-message error';
    return;
  }

  message.textContent = 'Verificando…';
  message.className = 'login-message';
  button.disabled = true;
  try {
    const registered = await AuthService.isRegistered(username);
    currentSession = registered
      ? await AuthService.login(username, password)
      : await AuthService.register(username, password);
    document.getElementById('login-password').value = '';
    if (!registered) {
      message.textContent = 'Cuenta creada. Recordá tu contraseña de 6 dígitos.';
      message.className = 'login-message success';
      await new Promise(resolve => setTimeout(resolve, 1600));
    }
    populateLoginPlayers();
    showAppSession();
  } catch (error) {
    message.textContent = error.message;
    message.className = 'login-message error';
  } finally {
    button.disabled = false;
    updateLoginMode();
  }
}

function showAppSession() {
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('session-username').textContent = currentSession.username;
  document.getElementById('session-bar').classList.add('visible');
  const note = document.querySelector('.prototype-note');
  if (note) {
    note.textContent = RatingsService.isApi()
      ? 'Datos sincronizados en el servidor. Cerrá sesión para cambiar de jugador.'
      : 'Las cuentas se guardan en este dispositivo. Cerrá sesión para cambiar de jugador.';
  }
  renderGrid();
  void refreshSessionData();
}

async function refreshSessionData() {
  const latestMatch = RatingsService.listMatches()[0];
  if (latestMatch) {
    currentMatch = latestMatch;
    if (RatingsService.isApi()) {
      await RatingsService.loadMyMatchVotes(latestMatch.id);
    }
    renderMatchVoting(currentMatch);
    document.getElementById('match-voting').classList.add('visible');
  }
  await renderLatestNewspaper();
}

async function logout() {
  await AuthService.logout();
  currentSession = null;
  currentMatch = null;
  document.getElementById('session-bar').classList.remove('visible');
  document.getElementById('match-voting').classList.remove('visible');
  document.getElementById('login-overlay').classList.remove('hidden');
  renderGrid();
}

// ─── Convocatoria (selección de jugadores) ─────────────────────────────────

function initFormatButtons() {
  document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      teamSize = Number(btn.dataset.size);
      lastTopCombos = [];
      currentCombo = null;
      updateFormatWarning();
      updateSelectionUI();
    });
  });
  updateFormatWarning();
}

function updateFormatWarning() {
  const needed = teamSize * 2;
  const count = selectedPlayers().length;
  const diff = count - needed;
  const box = document.getElementById('format-warning');
  if (diff === 0) { box.classList.remove('visible'); return; }
  box.classList.add('visible');
  if (count === 0) {
    box.textContent = `Marcá los ${needed} jugadores confirmados para Fútbol ${teamSize}.`;
  } else {
    box.textContent = diff > 0
      ? `Hay ${count} convocados. Quitá ${diff} para armar equipos de ${teamSize}.`
      : `Hay ${count} convocados. Faltan ${Math.abs(diff)} para completar los ${needed}.`;
  }
}

function updateSelectionUI() {
  const needed = teamSize * 2;
  const count = selectedPlayers().length;
  const counter = document.getElementById('selection-count');
  const buildButton = document.getElementById('btn-armar');

  counter.textContent = `${count} de ${needed} convocados`;
  counter.classList.toggle('complete', count === needed);
  buildButton.disabled = count !== needed;
  buildButton.textContent = count === needed
    ? 'Armar equipos parejos'
    : count < needed
      ? `Seleccioná ${needed - count} más`
      : `Quitá ${count - needed}`;
  updateFormatWarning();
}

async function togglePlayerSelection(player) {
  const key = selectionKey(player);
  const needed = teamSize * 2;

  if (selectedPlayerNames.has(key)) {
    selectedPlayerNames.delete(key);
  } else {
    if (selectedPlayers().length >= needed) {
      const box = document.getElementById('format-warning');
      box.textContent = `La convocatoria ya tiene ${needed} jugadores. Quitá uno antes de agregar otro.`;
      box.classList.add('visible');
      return;
    }
    selectedPlayerNames.add(key);
  }

  await savePlayerSelection();
  lastTopCombos = [];
  currentCombo = null;
  renderGrid();
  updateSelectionUI();
}

async function clearPlayerSelection() {
  selectedPlayerNames.clear();
  await savePlayerSelection();
  lastTopCombos = [];
  currentCombo = null;
  renderGrid();
  updateSelectionUI();
}

// ─── Grid de jugadores ──────────────────────────────────────────────────────

function renderGrid() {
  const grid = document.getElementById('players-grid');
  grid.innerHTML = '';
  players.forEach((p, idx) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = buildFifaCardHtml(p, true);
    const card = wrap.firstElementChild;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', isCurrentUser(p)
      ? `Editar tu carta: ${p.nombre}`
      : `Calificar a ${p.nombre}`);
    const selectionButton = card.querySelector('.player-select-toggle');
    selectionButton?.addEventListener('click', event => {
      event.stopPropagation();
      togglePlayerSelection(p);
    });
    card.addEventListener('click', () => {
      if (!currentSession) return;
      if (isCurrentUser(p)) openEditor(idx);
      else openPeerRating(idx);
    });
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        card.click();
      }
    });
    grid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'fifa-card fifa-card-add';
  addCard.innerHTML = '<span class="fifa-card-add-icon">+</span><span class="fifa-card-add-label">Nuevo jugador</span>';
  addCard.addEventListener('click', openCreateEditor);
  grid.appendChild(addCard);
}

// ─── Modal de edición de perfil ────────────────────────────────────────────

function buildFormHtml(p, editableName) {
  const nameField = editableName
    ? `<div class="form-section">
        <h4>Nombre</h4>
        <div class="field field-full">
          <input type="text" name="nombre" required maxlength="40" placeholder="Nombre del jugador" value="${p.nombre === 'Nuevo jugador' ? '' : Utils.escapeHtml(p.nombre)}">
        </div>
      </div>`
    : '';

  return `${nameField}
    <div class="form-section photo-section">
      <h4>Foto</h4>
      <div class="photo-preview-wrap" id="photo-preview-wrap">
        <img id="photo-preview" alt="">
        <span class="photo-placeholder">Sin foto</span>
      </div>
      <label class="btn-photo">
        Elegir foto
        <input type="file" id="photo-input" accept="image/*" capture="user">
      </label>
      <p class="photo-hint">Desde la galería o cámara del celular</p>
      <div class="field field-full" style="margin-top:0.65rem">
        <label>Link de imagen (opcional)</label>
        <input type="url" name="foto_url" placeholder="https://..." value="${Utils.escapeHtml(p.foto_url || '')}">
      </div>
    </div>
    <div class="form-section">
      <h4>Datos personales</h4>
      <div class="form-grid cols-3">
        <div class="field"><label>Edad</label><input type="number" name="edad" min="15" max="60" value="${p.edad}"></div>
        <div class="field"><label>Altura (cm)</label><input type="number" name="altura" min="150" max="210" value="${p.altura}"></div>
        <div class="field"><label>Pie hábil</label>
          <select name="pie_habil">${PIES.map(x => `<option ${p.pie_habil === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        </div>
      </div>
    </div>
    <div class="form-section">
      <h4>Posiciones</h4>
      <p class="peer-note">Elegí los dos puestos donde jugás en cancha. Solo vos podés cambiarlos.</p>
      <div class="form-grid">
        <div class="field">
          <label>Puesto 1</label>
          <select name="posicion_1">${POSICIONES_CAMPO.map(x =>
            `<option ${p.posicion_1 === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Puesto 2</label>
          <select name="posicion_2">${POSICIONES_CAMPO.map(x =>
            `<option ${p.posicion_2 === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        </div>
      </div>
    </div>
    <div class="peer-note">
      Los atributos de la carta los califican los demás jugadores. Vos solo editás posiciones, foto y datos personales.
    </div>`;
}

function bindFormEvents() {
  const form = document.getElementById('player-form');
  form.querySelectorAll('input[type=number][data-stat]').forEach(input => {
    input.addEventListener('input', updateModalPreview);
    input.addEventListener('change', updateModalPreview);
  });
  form.querySelectorAll('select, input:not([data-stat]):not([type=file])').forEach(el => {
    el.addEventListener('input', updateModalPreview);
    el.addEventListener('change', updateModalPreview);
  });
  const photoInput = form.querySelector('#photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (file) handlePhotoSelect(file);
      e.target.value = '';
    });
  }
}

function initPhotoInForm(p) {
  pendingPhoto = null;
  updatePhotoPreview(getPlayerPhoto(p));
}

function openCreateEditor() {
  isCreating = true;
  editingIdx = -1;
  const p = Utils.defaultPlayer('Nuevo jugador');
  document.getElementById('modal-title').textContent = 'Nuevo jugador';
  document.getElementById('btn-save').textContent = 'Crear jugador';
  document.getElementById('modal-preview').innerHTML = buildFifaCardHtml(p, false);
  document.getElementById('modal-save-status').textContent = '';
  document.getElementById('modal-save-status').className = 'save-status';
  document.getElementById('player-form').innerHTML = buildFormHtml(p, true);
  bindFormEvents();
  initPhotoInForm(p);
  document.getElementById('modal-overlay').classList.add('open');
  document.querySelector('[name=nombre]')?.focus();
}

function openEditor(idx) {
  isCreating = false;
  editingIdx = idx;
  const p = players[idx];
  document.getElementById('modal-title').textContent = p.nombre;
  document.getElementById('btn-save').textContent = 'Guardar cambios';
  document.getElementById('modal-preview').innerHTML = buildFifaCardHtml(p, false);
  document.getElementById('modal-save-status').textContent = '';
  document.getElementById('modal-save-status').className = 'save-status';
  document.getElementById('player-form').innerHTML = buildFormHtml(p, false);
  bindFormEvents();
  initPhotoInForm(p);
  document.getElementById('modal-overlay').classList.add('open');
}

function statField(key, label, p) {
  return `<div class="field"><label>${label}</label>
    <input type="number" name="${key}" data-stat min="1" max="5" step="1" value="${p[key]}"></div>`;
}

function readFormData() {
  const form = document.getElementById('player-form');
  const base = isCreating
    ? Utils.defaultPlayer('')
    : { ...players[editingIdx] };

  const nameInput = form.querySelector('[name=nombre]');
  base.nombre = nameInput
    ? String(nameInput.value || '').trim()
    : players[editingIdx].nombre;

  base.edad = Number(form.querySelector('[name=edad]').value) || 30;
  base.altura = Number(form.querySelector('[name=altura]').value) || 175;
  base.pie_habil = form.querySelector('[name=pie_habil]').value;
  base.posicion_1 = form.querySelector('[name=posicion_1]').value;
  base.posicion_2 = form.querySelector('[name=posicion_2]').value;
  base.foto_url = String(form.querySelector('[name=foto_url]')?.value || '').trim();
  if (pendingPhoto) base.foto_url = pendingPhoto.dataUrl;
  STAT_FIELDS.forEach(f => {
    const input = form.querySelector(`[name=${f}]`);
    if (input) {
      const value = Utils.roundStat(Number(input.value));
      base[f] = value;
      input.value = value;
    } else if (base[f] == null) {
      base[f] = 3;
    }
  });
  return base;
}

function updateModalPreview() {
  if (editingIdx < 0 && !isCreating) return;
  const merged = isCreating
    ? readFormData()
    : { ...players[editingIdx], ...readFormData() };
  if (!merged.nombre) merged.nombre = 'Nuevo jugador';
  document.getElementById('modal-preview').innerHTML = buildFifaCardHtml(merged, false);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingIdx = -1;
  isCreating = false;
  pendingPhoto = null;
  document.getElementById('btn-save').textContent = 'Guardar cambios';
}

// ─── Modal de valoración entre pares ───────────────────────────────────────

const PEER_LABELS = {
  velocidad: 'Velocidad',
  resistencia: 'Resistencia',
  fuerza: 'Fuerza',
  tiro: 'Remate',
  pase: 'Pase',
  regate: 'Regate',
  defensa: 'Defensa',
  arquero: 'Arquero'
};

const PEER_GROUPS = [
  { title: 'Físico', keys: ['velocidad', 'resistencia', 'fuerza'] },
  { title: 'Técnico', keys: ['regate', 'pase', 'tiro'] },
  { title: 'Defensivo', keys: ['defensa'] },
  { title: 'Arquero', keys: ['arquero'], note: 'Atributo aparte: no suma en la media general. Con 3, 4 o 5 aparecen guantes en la carta.' }
];

function peerRatingDefault(key, player, existing, base) {
  if (existing?.[key] != null) return Math.round(existing[key]);
  if (key === 'arquero') return Math.round(Number(player.arquero) || 1);
  if (base[key] != null) return Math.round(base[key]);
  return 3;
}

function buildPeerRatingRow(key, player, existing, base) {
  const selected = peerRatingDefault(key, player, existing, base);
  return `<div class="rating-row">
    <span class="rating-label">${PEER_LABELS[key]}</span>
    ${[1, 2, 3, 4, 5].map(value => `
      <label class="rating-choice">
        <input type="radio" name="peer_${key}" value="${value}" ${selected === value ? 'checked' : ''}>
        <span>${value}</span>
      </label>`).join('')}
  </div>`;
}

function openPeerRating(idx) {
  if (!currentSession || isCurrentUser(players[idx])) return;
  void openPeerRatingAsync(idx);
}

async function openPeerRatingAsync(idx) {
  peerRatingIdx = idx;
  const player = players[idx];
  const existing = await RatingsService.getMyPeerRating(currentSession.username, player.nombre);
  const base = computeBaseCard(player);

  document.getElementById('peer-modal-title').textContent = `Calificar a ${player.nombre}`;
  document.getElementById('peer-modal-preview').innerHTML = buildFifaCardHtml(player, false);
  document.getElementById('peer-save-status').textContent = '';
  document.getElementById('peer-save-status').className = 'save-status';
  document.getElementById('peer-rating-form').innerHTML = PEER_GROUPS.map(group => `
    <div class="peer-group-title">${group.title}</div>
    ${group.note ? `<p class="peer-note">${group.note}</p>` : ''}
    ${group.keys.map(key => buildPeerRatingRow(key, player, existing, base)).join('')}
  `).join('');
  document.getElementById('peer-modal-overlay').classList.add('open');
}

function closePeerModal() {
  document.getElementById('peer-modal-overlay').classList.remove('open');
  peerRatingIdx = -1;
}

async function savePeerRating() {
  if (peerRatingIdx < 0 || !currentSession) return;
  const player = players[peerRatingIdx];
  const form = document.getElementById('peer-rating-form');
  const stats = {};
  RatingsService.cardKeys.forEach(key => {
    stats[key] = Number(form.querySelector(`[name=peer_${key}]:checked`)?.value ||
      (key === 'arquero' ? 1 : 3));
  });

  const status = document.getElementById('peer-save-status');
  status.textContent = 'guardando…';
  status.className = 'save-status saving';
  try {
    await RatingsService.savePeerRating(currentSession.username, player.nombre, stats);
    if (RatingsService.isApi()) {
      const idx = players.findIndex(p => Utils.normalize(p.nombre) === Utils.normalize(player.nombre));
      if (idx >= 0) {
        const peer = RatingsService.getPeerAverage(player.nombre);
        players[idx].rating_count = peer.count;
        players[idx].peer_averages = peer.stats;
      }
    }
    status.textContent = 'guardado';
    status.className = 'save-status saved';
    renderGrid();
    if (currentCombo) renderResults(currentCombo);
    document.getElementById('peer-modal-preview').innerHTML = buildFifaCardHtml(player, false);
  } catch (error) {
    status.textContent = error.message;
    status.className = 'save-status error';
  }
}
