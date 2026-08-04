/**
 * Cartas de jugador (estilo FIFA): cálculo de stats y su render en HTML.
 *
 * Antes vivía mezclado con equipos, UI de modales y login dentro del
 * <script> inline de index.html.
 */
const CARD_ATTRS = ['velocidad', 'tiro', 'pase', 'regate', 'defensa', 'fisico'];
const CARD_LABELS = ['RIT', 'TIR', 'PAS', 'REG', 'DEF', 'FÍS'];
const CARD_LABELS_FULL = ['Velocidad', 'Tiro', 'Pase', 'Regate', 'Defensa', 'Físico'];
const GK_MIN_RATING = 3;

function physicalBase(p) {
  return {
    velocidad: Number(p.vel_fis) || 3,
    resistencia: Number(p.resistencia) || 3,
    fuerza: Number(p.fuerza) || 3
  };
}

function computeBaseCard(p) {
  const phys = physicalBase(p);
  return {
    velocidad: phys.velocidad,
    resistencia: phys.resistencia,
    fuerza: phys.fuerza,
    tiro: Number(p.remate) || 3,
    pase: Utils.avg(Number(p.pase_corto) || 3, Number(p.pase_largo) || 3),
    regate: Number(p.regate) || 3,
    defensa: Utils.avg(Number(p.marca) || 3, Number(p.posicionamiento) || 3),
    fisico: Utils.avg(phys.velocidad, phys.resistencia, phys.fuerza)
  };
}

function arqueroRating(p) {
  const peer = RatingsService.getPeerAverage(p.nombre);
  if (peer.stats?.arquero != null) return Utils.roundStat(peer.stats.arquero);
  return Utils.roundStat(Number(p.arquero) || 1);
}

function goalkeeperRating(p) {
  return arqueroRating(p);
}

function hasGoalkeeperGloves(p) {
  const rating = arqueroRating(p);
  return rating >= GK_MIN_RATING && rating <= 5;
}

function isGoalkeeperCapable(p) {
  return hasGoalkeeperGloves(p);
}

function glovesBadgeHtml(p) {
  if (!hasGoalkeeperGloves(p)) return '';
  const rating = arqueroRating(p);
  return `<span class="fifa-gk-badge" title="Arquero ${rating}/5 · Guantes desde 3" aria-label="Arquero ${rating} de 5">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4c-1.5 1.2-2.3 3-2.3 5.1V14c0 2.2 1.8 4 4 4h.4c.4-1.3 1.5-2.3 2.9-2.3s2.5 1 2.9 2.3H15c2.2 0 4-1.8 4-4V9.1C19 7 18.2 5.2 16.7 4H15v3.5c0 .8-.7 1.5-1.5 1.5S12 8.3 12 7.5V4h-2v3.5c0 .8-.7 1.5-1.5 1.5S7 8.3 7 7.5V4z"/>
    </svg>
  </span>`;
}

function computeCard(p) {
  const base = computeBaseCard(p);
  const peer = RatingsService.getPeerAverage(p.nombre);
  const pick = (key, fallback) => (peer.count && peer.stats?.[key] != null ? peer.stats[key] : fallback);

  const velocidad = pick('velocidad', base.velocidad);
  const resistencia = pick('resistencia', base.resistencia);
  const fuerza = pick('fuerza', base.fuerza);
  const tiro = pick('tiro', base.tiro);
  const pase = pick('pase', base.pase);
  const regate = pick('regate', base.regate);
  const defensa = pick('defensa', base.defensa);
  const fisico = Utils.avg(velocidad, resistencia, fuerza);
  const cardStats = [velocidad, tiro, pase, regate, defensa, fisico];

  return {
    velocidad,
    resistencia,
    fuerza,
    tiro,
    pase,
    regate,
    defensa,
    fisico,
    arquero: arqueroRating(p),
    media: Math.round(Utils.avg(...cardStats) * 20),
    cardStats,
    physBreakdown: `Vel ${velocidad.toFixed(1)} · Res ${resistencia.toFixed(1)} · Fue ${fuerza.toFixed(1)}`,
    ratingCount: peer.count,
    usesPeerAverage: peer.count > 0
  };
}

function tierClass(media) {
  if (media >= 70) return 'tier-gold';
  if (media >= 55) return 'tier-silver';
  return 'tier-bronze';
}

function formatPosiciones(p) {
  return [p.posicion_1, p.posicion_2].filter(Boolean).join(' · ');
}

function posicionesCardHtml(p) {
  return `<div class="fifa-pos-wrap">
    <span class="fifa-pos-main">${Utils.escapeHtml(p.posicion_1 || 'MED')}</span>
    <span class="fifa-pos-sub">${Utils.escapeHtml(p.posicion_2 || 'DEL')}</span>
  </div>`;
}

function buildFifaCardHtml(p, clickable) {
  const c = computeCard(p);
  const cls = tierClass(c.media);
  const photo = getPlayerPhoto(p);
  const photoHtml = photo
    ? `<img class="fifa-card-photo" src="${Utils.escapeHtml(photo)}" alt="Foto de ${Utils.escapeHtml(p.nombre)}" loading="lazy">`
    : `<div class="fifa-photo-placeholder" aria-label="Foto pendiente">${Utils.escapeHtml(String(p.nombre || '?').charAt(0))}</div>`;
  const peerBadge = c.ratingCount
    ? `<span class="fifa-peer">${c.ratingCount} voto${c.ratingCount === 1 ? '' : 's'}</span>`
    : '<span class="fifa-peer">base</span>';
  const selfBadge = isCurrentUser(p) ? '<span class="card-self-badge">Tu carta</span>' : '';
  const selected = isPlayerSelected(p);
  const selectionButton = clickable
    ? `<button class="player-select-toggle ${selected ? 'selected' : ''}" type="button" aria-label="${selected ? 'Quitar' : 'Convocar'} a ${Utils.escapeHtml(p.nombre)}">${selected ? '✓' : '+'}</button>`
    : '';
  return `
    <div class="fifa-card ${cls} ${selected ? 'selected' : ''}" ${clickable ? '' : ''}>
      ${selectionButton}
      ${selfBadge}
      ${glovesBadgeHtml(p)}
      ${photoHtml}
      <div class="fifa-card-body">
        ${peerBadge}
        <div class="fifa-card-top">
          <div class="fifa-ovr">${c.media}</div>
          ${posicionesCardHtml(p)}
        </div>
        <div class="fifa-name">${Utils.escapeHtml(p.nombre)}</div>
        <div class="fifa-stats">
          ${CARD_LABELS.map((lbl, i) => {
            const title = lbl === 'FÍS' ? c.physBreakdown : CARD_LABELS_FULL[i];
            return `<div class="fifa-stat"><abbr title="${Utils.escapeHtml(title)}">${lbl}</abbr><span>${c.cardStats[i].toFixed(1)}</span></div>`;
          }).join('')}
        </div>
        <div class="fifa-arq" title="Atributo aparte: no entra en la media general">ARQ ${c.arquero.toFixed(1)}</div>
        <div class="fifa-meta">${p.edad}a · ${p.altura}cm · ${Utils.escapeHtml(p.pie_habil)}</div>
        <div class="fifa-card-action">${isCurrentUser(p) ? 'Editar perfil' : 'Calificar jugador'}</div>
      </div>
    </div>`;
}
