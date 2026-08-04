/**
 * Evaluaciones y partidos.
 *
 * Este adaptador funciona hoy con localStorage y mantiene un contrato simple
 * para migrarlo a tablas/API cuando se implemente el backend real.
 */
const RatingsService = (() => {
  const PEER_KEY = '3ertiempo_peer_ratings_v1';
  const MATCHES_KEY = '3ertiempo_matches_v1';
  const MATCH_VOTES_KEY = '3ertiempo_match_votes_v1';
  const CARD_KEYS = ['velocidad', 'resistencia', 'fuerza', 'tiro', 'pase', 'regate', 'defensa'];
  const ARQUERO_KEY = 'arquero';
  const PEER_KEYS = [...CARD_KEYS, ARQUERO_KEY];
  const MIN_VOTES_FOR_NEWSPAPER = 6;

  function normalizePeerStats(stats) {
    const out = {};
    PEER_KEYS.forEach(key => {
      if (stats?.[key] != null) out[key] = clamp(stats[key]);
    });
    if (stats?.fisico != null && out.resistencia == null) {
      out.resistencia = clamp(stats.fisico);
      out.fuerza = clamp(stats.fisico);
    }
    if (stats?.portero != null && out.arquero == null) {
      out.arquero = clamp(stats.portero);
    }
    CARD_KEYS.forEach(key => {
      if (out[key] == null) out[key] = 3;
    });
    return out;
  }

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('es');
  }

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function clamp(value) {
    return Math.max(1, Math.min(5, Math.round(Number(value) || 3)));
  }

  function savePeerRating(rater, ratedPlayer, stats) {
    if (normalize(rater) === normalize(ratedPlayer)) {
      throw new Error('No podés calificarte a vos mismo');
    }
    const all = read(PEER_KEY, {});
    const playerKey = normalize(ratedPlayer);
    const raterKey = normalize(rater);
    if (!all[playerKey]) all[playerKey] = {};
    all[playerKey][raterKey] = {
      rater,
      createdAt: new Date().toISOString(),
      stats: Object.fromEntries(PEER_KEYS.map(key => [
        key,
        clamp(stats[key] ?? (key === ARQUERO_KEY ? 1 : 3))
      ]))
    };
    write(PEER_KEY, all);
  }

  function getMyPeerRating(rater, ratedPlayer) {
    const all = read(PEER_KEY, {});
    return all[normalize(ratedPlayer)]?.[normalize(rater)]?.stats || null;
  }

  function getPeerAverage(playerName) {
    const all = read(PEER_KEY, {});
    const ratings = Object.values(all[normalize(playerName)] || {});
    if (!ratings.length) return { count: 0, stats: null };

    const stats = {};
    CARD_KEYS.forEach(key => {
      stats[key] = ratings.reduce((sum, rating) => {
        const normalized = normalizePeerStats(rating.stats);
        return sum + normalized[key];
      }, 0) / ratings.length;
    });

    const arqueroVotes = ratings
      .map(rating => normalizePeerStats(rating.stats).arquero)
      .filter(value => value != null);
    if (arqueroVotes.length) {
      stats.arquero = arqueroVotes.reduce((sum, value) => sum + value, 0) / arqueroVotes.length;
    }

    return { count: ratings.length, stats };
  }

  function createMatch({ format, teamClaro, teamOscuro }) {
    const matches = read(MATCHES_KEY, []);
    const match = {
      id: `match_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString(),
      format,
      teamClaro: teamClaro.map(player => player.nombre),
      teamOscuro: teamOscuro.map(player => player.nombre),
      status: 'voting'
    };
    matches.unshift(match);
    write(MATCHES_KEY, matches.slice(0, 30));
    return match;
  }

  function listMatches() {
    return read(MATCHES_KEY, []);
  }

  function getMatch(id) {
    return listMatches().find(match => match.id === id) || null;
  }

  function saveMatchVote(matchId, rater, ratedPlayer, score) {
    if (normalize(rater) === normalize(ratedPlayer)) {
      throw new Error('No podés votarte a vos mismo');
    }
    const all = read(MATCH_VOTES_KEY, {});
    if (!all[matchId]) all[matchId] = {};
    if (!all[matchId][normalize(rater)]) all[matchId][normalize(rater)] = {};
    all[matchId][normalize(rater)][normalize(ratedPlayer)] = {
      playerName: ratedPlayer,
      score: clamp(score),
      votedAt: new Date().toISOString()
    };
    write(MATCH_VOTES_KEY, all);
  }

  function getMyMatchVotes(matchId, rater) {
    return read(MATCH_VOTES_KEY, {})[matchId]?.[normalize(rater)] || {};
  }

  function getMatchVoteCount(matchId) {
    const matchVotes = read(MATCH_VOTES_KEY, {})[matchId] || {};
    let count = 0;
    Object.values(matchVotes).forEach(raterVotes => {
      count += Object.keys(raterVotes).length;
    });
    return count;
  }

  function getMatchResults(matchId) {
    const matchVotes = read(MATCH_VOTES_KEY, {})[matchId] || {};
    const byPlayer = {};
    Object.values(matchVotes).forEach(raterVotes => {
      Object.values(raterVotes).forEach(vote => {
        const key = normalize(vote.playerName);
        if (!byPlayer[key]) byPlayer[key] = { playerName: vote.playerName, scores: [] };
        byPlayer[key].scores.push(clamp(vote.score));
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

  function buildNewspaper(match) {
    const voteCount = getMatchVoteCount(match.id);
    if (voteCount < MIN_VOTES_FOR_NEWSPAPER) return null;
    const results = getMatchResults(match.id);
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

  return {
    cardKeys: PEER_KEYS,
    fieldKeys: CARD_KEYS,
    arqueroKey: ARQUERO_KEY,
    minVotesForNewspaper: MIN_VOTES_FOR_NEWSPAPER,
    savePeerRating,
    getMyPeerRating,
    getPeerAverage,
    createMatch,
    listMatches,
    getMatch,
    saveMatchVote,
    getMyMatchVotes,
    getMatchVoteCount,
    getMatchResults,
    buildNewspaper
  };
})();
