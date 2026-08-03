/**
 * Capa de datos de 3er tiempo
 *
 * Contrato futuro del backend (provider: 'api'):
 *   GET    /v1/players              → { ok, players: Player[] }
 *   POST   /v1/players              → crear jugador
 *   PUT    /v1/players/:id          → actualizar (id = slug del nombre)
 *   POST   /v1/players/:id/foto     → { imageBase64, mimeType } → { ok, foto_url }
 *
 * Autenticación (ver auth.js):
 *   POST /v1/auth/status
 *   POST /v1/auth/register
 *   POST /v1/auth/login
 *   POST /v1/auth/logout
 *
 * El backend deberá validar que solo el dueño modifique datos personales y
 * rechazar valoraciones donde rater_user_id === rated_player.user_id.
 */
const PlayerApi = (() => {
  const PLACEHOLDER = 'TU_ID_AQUI';

  function activeProvider() {
    const p = APP_CONFIG.provider;
    if (p === 'local') return 'local';
    if (p === 'api') return 'api';
    if (p === 'google') {
      return APP_CONFIG.googleScriptUrl.includes(PLACEHOLDER) ? 'local' : 'google';
    }
    return 'local';
  }

  function defaultPlayer(nombre) {
    const p = {
      nombre,
      posicion_1: 'MED',
      posicion_2: 'DEL',
      juega_arco: true,
      edad: 30,
      altura: 175,
      pie_habil: 'Derecho',
      foto_url: ''
    };
    STAT_FIELDS.forEach(f => { p[f] = 3; });
    return p;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function seedRoster() {
    return APP_CONFIG.defaultPlayerNames.map(n => defaultPlayer(n));
  }

  async function postJson(url, body, options) {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      ...options
    });
    return res.json();
  }

  // ─── Local ───────────────────────────────────────────────────────────────

  const local = {
    async listPlayers() {
      const roster = readJson(STORAGE_KEYS.roster, null);
      const players = roster || seedRoster();
      if (!roster) writeJson(STORAGE_KEYS.roster, players);
      return {
        players,
        message: `${players.length} jugadores · modo local (este dispositivo)`,
        offline: true
      };
    },

    async savePlayer(player, { create }) {
      const roster = readJson(STORAGE_KEYS.roster, seedRoster());
      const idx = roster.findIndex(p =>
        p.nombre.trim().toLowerCase() === player.nombre.trim().toLowerCase()
      );
      if (create) {
        if (idx >= 0) throw new Error('Ya existe un jugador con ese nombre');
        roster.push(player);
      } else if (idx >= 0) {
        roster[idx] = player;
      } else {
        throw new Error('Jugador no encontrado');
      }
      writeJson(STORAGE_KEYS.roster, roster);
      return { ok: true };
    },

    async uploadPhoto(nombre, photo) {
      const fotos = readJson(STORAGE_KEYS.fotos, {});
      fotos[nombre] = photo.dataUrl;
      writeJson(STORAGE_KEYS.fotos, fotos);
      return photo.dataUrl;
    }
  };

  // ─── Google Apps Script ──────────────────────────────────────────────────

  const google = {
    url: () => APP_CONFIG.googleScriptUrl,

    async listPlayers() {
      const res = await fetch(this.url());
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.players)) throw new Error('Respuesta inválida');
      return {
        players: data.players,
        message: `${data.players.length} jugadores cargados desde la planilla`,
        offline: false
      };
    },

    async savePlayer(player, { create }) {
      const payload = create ? { ...player, action: 'create' } : player;
      const result = await postJson(this.url(), payload);
      if (!result.ok) throw new Error(result.error || 'Error al guardar');
      return result;
    },

    async uploadPhoto(nombre, photo) {
      const result = await postJson(this.url(), {
        action: 'uploadFoto',
        nombre,
        imageBase64: photo.base64,
        mimeType: photo.mimeType
      });
      if (!result.ok) throw new Error(result.error || 'Error al subir foto');
      return result.foto_url;
    }
  };

  // ─── REST API (futuro) ───────────────────────────────────────────────────

  const api = {
    base: () => APP_CONFIG.apiBaseUrl.replace(/\/$/, ''),

    slug(nombre) {
      return encodeURIComponent(nombre.trim());
    },

    async listPlayers() {
      const res = await fetch(`${this.base()}/v1/players`, { credentials: 'include' });
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.players)) throw new Error('Respuesta inválida');
      return {
        players: data.players,
        message: `${data.players.length} jugadores sincronizados`,
        offline: false
      };
    },

    async savePlayer(player, { create }) {
      const url = create
        ? `${this.base()}/v1/players`
        : `${this.base()}/v1/players/${this.slug(player.nombre)}`;
      const res = await fetch(url, {
        method: create ? 'POST' : 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(player)
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al guardar');
      return data;
    },

    async uploadPhoto(nombre, photo) {
      const res = await fetch(`${this.base()}/v1/players/${this.slug(nombre)}/foto`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photo.base64,
          mimeType: photo.mimeType
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al subir foto');
      return data.foto_url;
    }
  };

  function adapter() {
    const p = activeProvider();
    if (p === 'google') return google;
    if (p === 'api') return api;
    return local;
  }

  return {
    activeProvider,
    isLocal: () => activeProvider() === 'local',

    async listPlayers() {
      try {
        return await adapter().listPlayers();
      } catch {
        if (activeProvider() !== 'local') {
          return local.listPlayers();
        }
        throw new Error('Sin conexión');
      }
    },

    async savePlayer(player, options) {
      return adapter().savePlayer(player, options);
    },

    async uploadPhoto(nombre, photo) {
      return adapter().uploadPhoto(nombre, photo);
    }
  };
})();
