/**
 * Evaluaciones y partidos — localStorage (prototipo) o API compartida.
 * En modo API los votos individuales nunca se exponen: solo promedios públicos
 * y los votos propios del usuario autenticado.
 */
const RatingsService = (() => {
  const PEER_KEY = '3ertiempo_peer_ratings_v1';
  const MATCHES_KEY = '3ertiempo_matches_v1';
  const MATCH_VOTES_KEY = '3ertiempo_match_votes_v1';
  const CARD_KEYS = ['velocidad', 'resistencia', 'fuerza', 'tiro', 'pase', 'regate', 'defensa'];
  const ARQUERO_KEY = 'arquero';
  const PEER_KEYS = [...CARD_KEYS, ARQUERO_KEY];
  const MIN_VOTES_FOR_NEWSPAPER = 6;

  const cache = {
    peerAverages: {},
    matches: [],
    voteCounts: {},
    myVotes: {},
    newspapers: {}
  };

  function isApi() {
    return APP_CONFIG.provider === 'api';
  }

  function apiBase() {
    return APP_CONFIG.apiBaseUrl.replace(/\/$/, '');
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${apiBase()}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'Error de conexión con el servidor');
    }
    return data;
  }

  function normalizePeerStats(stats) {
    const out = {};
    PEER_KEYS.forEach(key => {
      if (stats?.[key] != null) out[key] = Utils.clamp(stats[key]);
    });
    if (stats?.fisico != null && out.resistencia == null) {
      out.resistencia = Utils.clamp(stats.fisico);
      out.fuerza = Utils.clamp(stats.fisico);
    }
    if (stats?.portero != null && out.arquero == null) {
      out.arquero = Utils.clamp(stats.portero);
    }
    CARD_KEYS.forEach(key => {
      if (out[key] == null) out[key] = 3;
    });
    return out;
  }

  // ─── Local ───────────────────────────────────────────────────────────────

  const local = {
    savePeerRating(rater, ratedPlayer, stats) {
      if (Utils.normalize(rater) === Utils.normalize(ratedPlayer)) {
        throw new Error('No podés calificarte a vos mismo');
      }
      const all = Utils.readJson(PEER_KEY, {});
      const playerKey = Utils.normalize(ratedPlayer);
      const raterKey = Utils.normalize(rater);
      if (!all[playerKey]) all[playerKey] = {};
      all[playerKey][raterKey] = {
        rater,
        createdAt: new Date().toISOString(),
        stats: Object.fromEntries(PEER_KEYS.map(key => [
          key,
          Utils.clamp(stats[key] ?? (key === ARQUERO_KEY ? 1 : 3))
        ]))
      };
      Utils.writeJson(PEER_KEY, all);
    },

    getMyPeerRating(rater, ratedPlayer) {
      const all = Utils.readJson(PEER_KEY, {});
      return all[Utils.normalize(ratedPlayer)]?.[Utils.normalize(rater)]?.stats || null;
    },

    getPeerAverage(playerName) {
      const all = Utils.readJson(PEER_KEY, {});
      const ratings = Object.values(all[Utils.normalize(playerName)] || {});
      if (!ratings.length) return { count: 0, stats: null };

      const stats = {};
      CARD_KEYS.forEach(key => {
        stats[key] = ratings.reduce((sum, rating) => {
          return sum + normalizePeerStats(rating.stats)[key];
        }, 0) / ratings.length;
      });

      const arqueroVotes = ratings
        .map(rating => normalizePeerStats(rating.stats).arquero)
        .filter(value => value != null);
      if (arqueroVotes.length) {
        stats.arquero = arqueroVotes.reduce((sum, value) => sum + value, 0) / arqueroVotes.length;
      }

      return { count: ratings.length, stats };
    },

    createMatch({ format, teamClaro, teamOscuro }) {
      const matches = Utils.readJson(MATCHES_KEY, []);
      const match = {
        id: `match_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: new Date().toISOString(),
        format,
        teamClaro: teamClaro.map(player => player.nombre),
        teamOscuro: teamOscuro.map(player => player.nombre),
        status: 'voting'
      };
      matches.unshift(match);
      Utils.writeJson(MATCHES_KEY, matches.slice(0, 30));
      return match;
    },

    listMatches() {
      return Utils.readJson(MATCHES_KEY, []);
    },

    getMatch(id) {
      return local.listMatches().find(match => match.id === id) || null;
    },

    findOpenMatch({ format, teamClaro, teamOscuro }) {
      const claroKeys = teamClaro.map(p => Utils.normalize(p.nombre)).sort();
      const oscuroKeys = teamOscuro.map(p => Utils.normalize(p.nombre)).sort();
      return local.listMatches().find(match => {
        if (match.format !== format) return false;
        const mClaro = [...match.teamClaro].map(Utils.normalize).sort();
        const mOscuro = [...match.teamOscuro].map(Utils.normalize).sort();
        return JSON.stringify(mClaro) === JSON.stringify(claroKeys) &&
          JSON.stringify(mOscuro) === JSON.stringify(oscuroKeys);
      }) || null;
    },

    saveMatchVote(matchId, rater, ratedPlayer, score) {
      if (Utils.normalize(rater) === Utils.normalize(ratedPlayer)) {
        throw new Error('No podés votarte a vos mismo');
      }
      const all = Utils.readJson(MATCH_VOTES_KEY, {});
      if (!all[matchId]) all[matchId] = {};
      if (!all[matchId][Utils.normalize(rater)]) all[matchId][Utils.normalize(rater)] = {};
      all[matchId][Utils.normalize(rater)][Utils.normalize(ratedPlayer)] = {
        playerName: ratedPlayer,
        score: Utils.clamp(score),
        votedAt: new Date().toISOString()
      };
      Utils.writeJson(MATCH_VOTES_KEY, all);
    },

    getMyMatchVotes(matchId, rater) {
      return Utils.readJson(MATCH_VOTES_KEY, {})[matchId]?.[Utils.normalize(rater)] || {};
    },

    getMatchVoteCount(matchId) {
      const matchVotes = Utils.readJson(MATCH_VOTES_KEY, {})[matchId] || {};
      return Object.keys(matchVotes).length;
    },

    getMatchResults(matchId) {
      const matchVotes = Utils.readJson(MATCH_VOTES_KEY, {})[matchId] || {};
      const byPlayer = {};
      Object.values(matchVotes).forEach(raterVotes => {
        Object.values(raterVotes).forEach(vote => {
          const key = Utils.normalize(vote.playerName);
          if (!byPlayer[key]) byPlayer[key] = { playerName: vote.playerName, scores: [] };
          byPlayer[key].scores.push(Utils.clamp(vote.score));
        });
      });

      return Object.values(byPlayer)
        .map(item => ({
          playerName: item.playerName,
          average: item.scores.reduce((a, b) => a + b, 0) / item.scores.length,
          votes: item.scores.length
        }))
        .sort((a, b) => b.average - a.average);
    }
  };

  // ─── API ─────────────────────────────────────────────────────────────────

  const api = {
    seedPeerAveragesFromPlayers(players) {
      players.forEach(p => {
        cache.peerAverages[Utils.normalize(p.nombre)] = {
          count: p.rating_count || 0,
          stats: p.peer_averages || null
        };
      });
    },

    async syncMatches() {
      const data = await apiFetch('/v1/matches');
      cache.matches = data.matches || [];
      await Promise.all(cache.matches.slice(0, 5).map(m => api.refreshMatchMeta(m.id)));
    },

    async refreshMatchMeta(matchId) {
      const data = await apiFetch(`/v1/matches/${encodeURIComponent(matchId)}/results`);
      cache.voteCounts[matchId] = data.voteCount;
      cache.newspapers[matchId] = null;
      return data;
    },

    async savePeerRating(rater, ratedPlayer, stats) {
      const data = await apiFetch(`/v1/players/${encodeURIComponent(ratedPlayer)}/rating`, {
        method: 'PUT',
        body: JSON.stringify({ stats })
      });
      cache.peerAverages[Utils.normalize(ratedPlayer)] = data.peer_averages;
      return data;
    },

    async getMyPeerRating(rater, ratedPlayer) {
      const data = await apiFetch(`/v1/players/${encodeURIComponent(ratedPlayer)}/my-rating`);
      return data.stats;
    },

    getPeerAverage(playerName) {
      return cache.peerAverages[Utils.normalize(playerName)] || { count: 0, stats: null };
    },

    async registerMatch({ format, teamClaro, teamOscuro }) {
      const data = await apiFetch('/v1/matches', {
        method: 'POST',
        body: JSON.stringify({
          format,
          teamClaro,
          teamOscuro,
          findOpen: true
        })
      });
      if (!cache.matches.find(m => m.id === data.match.id)) {
        cache.matches.unshift(data.match);
      }
      await api.refreshMatchMeta(data.match.id);
      return data.match;
    },

    listMatches() {
      return cache.matches;
    },

    getMatch(id) {
      return cache.matches.find(match => match.id === id) || null;
    },

    findOpenMatch(payload) {
      const claroKeys = payload.teamClaro.map(p => Utils.normalize(p.nombre)).sort();
      const oscuroKeys = payload.teamOscuro.map(p => Utils.normalize(p.nombre)).sort();
      return cache.matches.find(match => {
        if (match.format !== payload.format) return false;
        const mClaro = [...match.teamClaro].map(Utils.normalize).sort();
        const mOscuro = [...match.teamOscuro].map(Utils.normalize).sort();
        return JSON.stringify(mClaro) === JSON.stringify(claroKeys) &&
          JSON.stringify(mOscuro) === JSON.stringify(oscuroKeys);
      }) || null;
    },

    async saveMatchVotes(matchId, votes) {
      const data = await apiFetch(`/v1/matches/${encodeURIComponent(matchId)}/votes`, {
        method: 'PUT',
        body: JSON.stringify({ votes })
      });
      cache.voteCounts[matchId] = data.voteCount;
      cache.newspapers[matchId] = null;
      await api.refreshMatchMeta(matchId);
      return data;
    },

    async loadMyMatchVotes(matchId) {
      const data = await apiFetch(`/v1/matches/${encodeURIComponent(matchId)}/my-votes`);
      cache.myVotes[matchId] = data.votes || {};
      return cache.myVotes[matchId];
    },

    getMyMatchVotes(matchId) {
      return cache.myVotes[matchId] || {};
    },

    getMatchVoteCount(matchId) {
      return cache.voteCounts[matchId] || 0;
    },

    async getMatchResults(matchId) {
      const data = await apiFetch(`/v1/matches/${encodeURIComponent(matchId)}/results`);
      cache.voteCounts[matchId] = data.voteCount;
      return data.results || [];
    },

    async fetchNewspaper(matchId) {
      const data = await apiFetch(`/v1/matches/${encodeURIComponent(matchId)}/newspaper`);
      cache.voteCounts[matchId] = data.voteCount;
      cache.newspapers[matchId] = data.newspaper;
      return data.newspaper;
    }
  };

  // ─── Periódico (compartido local/API) ────────────────────────────────────

  function hash(text) {
    return Array.from(String(text)).reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
  }

  function choose(items, seed) {
    return items[Math.abs(hash(seed)) % items.length];
  }

  function verdictFor(result, matchId) {
    const name = result.playerName;
    const score = result.average;
    const seed = `${matchId}:${name}:${score.toFixed(2)}`;

    if (score < 1.75) {
      return choose([
        `Paupérrimo partido de ${name}. Su rendimiento fue atroz y la tribuna no le perdonó una noche para el olvido.`,
        `${name} quedó en deuda de principio a fin. Impreciso, desconectado y abucheado por una hinchada que esperaba mucho más.`,
        `Noche negra para ${name}: nunca encontró el partido y terminó señalado por un desempeño realmente flojo.`
      ], seed);
    }
    if (score < 2.75) {
      return choose([
        `${name} tuvo una actuación muy floja. Le costó entrar en juego y acumuló errores que condicionaron a su equipo.`,
        `Partido para olvidar de ${name}. Mostró voluntad, pero su rendimiento estuvo muy por debajo de lo esperado.`,
        `${name} no hizo pie y terminó reprobado. Necesitará revancha para borrar una presentación decepcionante.`
      ], seed);
    }
    if (score < 3.75) {
      return choose([
        `${name} cumplió. Sin lujos ni grandes errores, sostuvo un rendimiento correcto durante el encuentro.`,
        `Labor sobria de ${name}: hizo lo necesario, mantuvo el orden y aprobó sin sobresalir.`,
        `${name} tuvo una noche pareja. Aportó equilibrio y respondió cuando el partido se lo pidió.`
      ], seed);
    }
    if (score < 4.5) {
      return choose([
        `Muy buen partido de ${name}. Fue confiable, participativo y una pieza importante para su equipo.`,
        `${name} se destacó con una actuación convincente. Mostró jerarquía y apareció en momentos decisivos.`,
        `Gran noche de ${name}: intensidad, criterio y un rendimiento que levantó a sus compañeros.`
      ], seed);
    }
    return choose([
      `${name} fue la gran figura. Una actuación extraordinaria, ovacionada por todos los presentes.`,
      `Exhibición de ${name}: dominó el partido y firmó una noche memorable, digna de todos los elogios.`,
      `${name} brilló con luz propia. Imparable y decisivo, se llevó una ovación unánime.`
    ], seed);
  }

  function buildNewspaperLocal(match) {
    const voteCount = local.getMatchVoteCount(match.id);
    if (voteCount < MIN_VOTES_FOR_NEWSPAPER) return null;
    const results = local.getMatchResults(match.id);
    if (!results.length) return null;
    const top = results[0];
    const bottom = results[results.length - 1];
    const globalAverage = results.reduce((sum, item) => sum + item.average, 0) / results.length;
    const totalVotes = results.reduce((sum, item) => sum + item.votes, 0);

    return {
      kicker: `Edición ${new Date(match.date).toLocaleDateString('es-AR')}`,
      headline: top.average >= 4.5
        ? `${top.playerName}, dueño absoluto del 3er tiempo`
        : `${top.playerName} se quedó con la noche`,
      deck: `${totalVotes} votos marcaron el pulso de un partido con promedio general de ${globalAverage.toFixed(1)}.`,
      figure: top,
      lowest: bottom,
      results,
      articles: results.map(result => ({
        ...result,
        arrow: result.average < 2.5 ? 'down' : result.average < 3.5 ? 'flat' : 'up',
        text: verdictFor(result, match.id)
      }))
    };
  }

  // ─── Público ─────────────────────────────────────────────────────────────

  async function initFromPlayers(players) {
    if (!isApi()) return;
    api.seedPeerAveragesFromPlayers(players);
    await api.syncMatches();
  }

  async function loadConvocation() {
    if (!isApi()) {
      const saved = Utils.readJson(STORAGE_KEYS.selection, []);
      return new Set(Array.isArray(saved) ? saved : []);
    }
    const data = await apiFetch('/v1/convocation');
    return new Set(data.keys || (data.players || []).map(Utils.normalize));
  }

  async function saveConvocation(selectedKeys, playersList) {
    if (!isApi()) {
      Utils.writeJson(STORAGE_KEYS.selection, [...selectedKeys]);
      return;
    }
    const names = playersList
      .filter(p => selectedKeys.has(Utils.normalize(p.nombre)))
      .map(p => p.nombre);
    await apiFetch('/v1/convocation', {
      method: 'PUT',
      body: JSON.stringify({ players: names })
    });
  }

  return {
    cardKeys: PEER_KEYS,
    fieldKeys: CARD_KEYS,
    arqueroKey: ARQUERO_KEY,
    minVotesForNewspaper: MIN_VOTES_FOR_NEWSPAPER,
    isApi,
    initFromPlayers,
    loadConvocation,
    saveConvocation,

    savePeerRating(rater, ratedPlayer, stats) {
      if (isApi()) return api.savePeerRating(rater, ratedPlayer, stats);
      local.savePeerRating(rater, ratedPlayer, stats);
      return Promise.resolve();
    },

    getMyPeerRating(rater, ratedPlayer) {
      if (isApi()) return api.getMyPeerRating(rater, ratedPlayer);
      return local.getMyPeerRating(rater, ratedPlayer);
    },

    getPeerAverage(playerName) {
      if (isApi()) return api.getPeerAverage(playerName);
      return local.getPeerAverage(playerName);
    },

    createMatch(payload) {
      if (isApi()) return api.registerMatch(payload);
      return Promise.resolve(local.createMatch(payload));
    },

    findOpenMatch(payload) {
      if (isApi()) return api.findOpenMatch(payload);
      return local.findOpenMatch(payload);
    },

    listMatches() {
      if (isApi()) return api.listMatches();
      return local.listMatches();
    },

    getMatch(id) {
      if (isApi()) return api.getMatch(id);
      return local.getMatch(id);
    },

    saveMatchVote(matchId, rater, ratedPlayer, score) {
      return local.saveMatchVote(matchId, rater, ratedPlayer, score);
    },

    async saveAllMatchVotes(matchId, votes) {
      if (!isApi()) {
        votes.forEach(vote => {
          local.saveMatchVote(matchId, '', vote.playerName, vote.score);
        });
        return { voteCount: local.getMatchVoteCount(matchId) };
      }
      const data = await api.saveMatchVotes(matchId, votes);
      await api.fetchNewspaper(matchId);
      return data;
    },

    getMyMatchVotes(matchId, rater) {
      if (isApi()) return api.getMyMatchVotes(matchId);
      return local.getMyMatchVotes(matchId, rater);
    },

    loadMyMatchVotes(matchId) {
      if (isApi()) return api.loadMyMatchVotes(matchId);
      return Promise.resolve(local.getMyMatchVotes(matchId, ''));
    },

    getMatchVoteCount(matchId) {
      if (isApi()) return api.getMatchVoteCount(matchId);
      return local.getMatchVoteCount(matchId);
    },

    getMatchResults(matchId) {
      if (isApi()) return api.getMatchResults(matchId);
      return Promise.resolve(local.getMatchResults(matchId));
    },

    buildNewspaper(match) {
      if (isApi()) {
        return cache.newspapers[match.id] || null;
      }
      return buildNewspaperLocal(match);
    },

    async refreshNewspaper(match) {
      if (!isApi()) return buildNewspaperLocal(match);
      return api.fetchNewspaper(match.id);
    }
  };
})();
