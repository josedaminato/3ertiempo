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
  // Cantidad de VOTANTES (personas), no de votos individuales. Antes se
  // contaban votos totales (jugador × votante), así que un solo usuario
  // votando a 6 jugadores ya publicaba el periódico.
  const MIN_VOTES_FOR_NEWSPAPER = 6;

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

  function savePeerRating(rater, ratedPlayer, stats) {
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
  }

  function getMyPeerRating(rater, ratedPlayer) {
    const all = Utils.readJson(PEER_KEY, {});
    return all[Utils.normalize(ratedPlayer)]?.[Utils.normalize(rater)]?.stats || null;
  }

  function getPeerAverage(playerName) {
    const all = Utils.readJson(PEER_KEY, {});
    const ratings = Object.values(all[Utils.normalize(playerName)] || {});
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
  }

  function listMatches() {
    return Utils.readJson(MATCHES_KEY, []);
  }

  function getMatch(id) {
    return listMatches().find(match => match.id === id) || null;
  }

  /** Partido "abierto" más reciente para un mismo armado de equipos, si
   * existe. Permite reutilizar el partido en vez de crear uno nuevo cada vez
   * que se toca "Registrar partido". */
  function findOpenMatch({ format, teamClaro, teamOscuro }) {
    const claroKeys = teamClaro.map(p => Utils.normalize(p.nombre)).sort();
    const oscuroKeys = teamOscuro.map(p => Utils.normalize(p.nombre)).sort();
    return listMatches().find(match => {
      if (match.format !== format) return false;
      const mClaro = [...match.teamClaro].map(Utils.normalize).sort();
      const mOscuro = [...match.teamOscuro].map(Utils.normalize).sort();
      return JSON.stringify(mClaro) === JSON.stringify(claroKeys) &&
        JSON.stringify(mOscuro) === JSON.stringify(oscuroKeys);
    }) || null;
  }

  function saveMatchVote(matchId, rater, ratedPlayer, score) {
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
  }

  function getMyMatchVotes(matchId, rater) {
    return Utils.readJson(MATCH_VOTES_KEY, {})[matchId]?.[Utils.normalize(rater)] || {};
  }

  /** Cantidad de VOTANTES únicos que ya cargaron al menos un voto en este
   * partido (antes sumaba votos individuales por jugador, ver comentario en
   * MIN_VOTES_FOR_NEWSPAPER). */
  function getMatchVoteCount(matchId) {
    const matchVotes = Utils.readJson(MATCH_VOTES_KEY, {})[matchId] || {};
    return Object.keys(matchVotes).length;
  }

  function getMatchResults(matchId) {
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
    findOpenMatch,
    listMatches,
    getMatch,
    saveMatchVote,
    getMyMatchVotes,
    getMatchVoteCount,
    getMatchResults,
    buildNewspaper
  };
})();
