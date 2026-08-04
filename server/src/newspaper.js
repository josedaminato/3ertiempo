const MIN_VOTES_FOR_NEWSPAPER = 6;

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

export function buildNewspaper(match, voteCount, results) {
  if (voteCount < MIN_VOTES_FOR_NEWSPAPER || !results.length) return null;

  const top = results[0];
  const bottom = results[results.length - 1];
  const globalAverage = results.reduce((sum, item) => sum + item.average, 0) / results.length;
  const totalVotes = results.reduce((sum, item) => sum + item.votes, 0);

  return {
    kicker: `Edición ${new Date(match.played_at || match.created_at).toLocaleDateString('es-AR')}`,
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

export { MIN_VOTES_FOR_NEWSPAPER };
