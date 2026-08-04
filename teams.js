/**
 * Balanceo de equipos: formaciones, armado, radar comparativo.
 */
const BALANCE_ATTRS = [...CARD_ATTRS];
const BALANCE_WEIGHTS = {
  velocidad: 1, tiro: 1, pase: 1, regate: 1, defensa: 1, fisico: 1
};

const POSICIONES_CAMPO = ['DEF', 'MED', 'DEL', 'LIB'];
const PIES = ['Derecho', 'Izquierdo', 'Ambidiestro'];

const ITERATIONS = 600;
const TOP_N = 5;

const OUTFIELD_FORMATIONS = {
  4: [
    { def: 1, med: 2, del: 1 },
    { def: 2, med: 1, del: 1 },
    { def: 1, med: 1, del: 2 }
  ],
  6: [
    { def: 2, med: 3, del: 1 },
    { def: 2, med: 2, del: 2 },
    { def: 3, med: 2, del: 1 },
    { def: 3, med: 1, del: 2 },
    { def: 1, med: 3, del: 2 }
  ],
  8: [
    { def: 3, med: 3, del: 2 },
    { def: 3, med: 2, del: 3 },
    { def: 4, med: 2, del: 2 },
    { def: 2, med: 4, del: 2 }
  ],
  10: [
    { def: 4, med: 3, del: 3 },
    { def: 3, med: 4, del: 3 },
    { def: 4, med: 4, del: 2 },
    { def: 3, med: 3, del: 4 }
  ]
};

function playerPlaysRole(p, role) {
  const positions = [p.posicion_1, p.posicion_2];
  if (role === 'DEF') return positions.some(pos => pos === 'DEF' || pos === 'LIB');
  if (role === 'MED') return positions.some(pos => pos === 'MED');
  if (role === 'DEL') return positions.some(pos => pos === 'DEL');
  return false;
}

function formationsForTeamSize(size) {
  return OUTFIELD_FORMATIONS[size - 1] || OUTFIELD_FORMATIONS[6];
}

function matchFormationPenalty(outfieldPlayers, formation) {
  const slots = [
    ...Array(formation.def).fill('DEF'),
    ...Array(formation.med).fill('MED'),
    ...Array(formation.del).fill('DEL')
  ];
  const used = new Set();
  let penalty = 0;

  slots.forEach(slot => {
    const idx = outfieldPlayers.findIndex((player, index) =>
      !used.has(index) && playerPlaysRole(player, slot)
    );
    if (idx >= 0) {
      used.add(idx);
      return;
    }
    const fallbackIdx = outfieldPlayers.findIndex((_, index) => !used.has(index));
    if (fallbackIdx >= 0) {
      used.add(fallbackIdx);
      penalty += 14;
    } else {
      penalty += 24;
    }
  });

  return penalty;
}

function bestTeamFormation(team) {
  const gkCandidates = team
    .filter(isGoalkeeperCapable)
    .sort((a, b) => goalkeeperRating(b) - goalkeeperRating(a));
  const formations = formationsForTeamSize(team.length);
  let best = { penalty: Infinity, gk: null, formation: null, roles: {} };

  if (!gkCandidates.length) {
    return { penalty: 90, gk: null, formation: null, roles: {} };
  }

  gkCandidates.slice(0, 3).forEach(gk => {
    const outfield = team.filter(player => player !== gk);
    formations.forEach(formation => {
      const penalty = matchFormationPenalty(outfield, formation);
      if (penalty < best.penalty) {
        best = { penalty, gk, formation, roles: assignTeamRoles(team, gk, formation) };
      }
    });
  });

  return best;
}

function assignTeamRoles(team, gk, formation) {
  const roles = {};
  roles[selectionKey(gk)] = 'ARQ';
  const outfield = team.filter(player => player !== gk);
  const slots = [
    ...Array(formation.def).fill('DEF'),
    ...Array(formation.med).fill('MED'),
    ...Array(formation.del).fill('DEL')
  ];
  const used = new Set();

  slots.forEach(slot => {
    let idx = outfield.findIndex((player, index) =>
      !used.has(index) && playerPlaysRole(player, slot)
    );
    if (idx < 0) {
      idx = outfield.findIndex((_, index) => !used.has(index));
    }
    if (idx >= 0) {
      used.add(idx);
      roles[selectionKey(outfield[idx])] = slot;
    }
  });

  return roles;
}

function teamFormationPenalty(team) {
  return bestTeamFormation(team).penalty;
}

function getBalanceValue(p, attr) {
  return computeCard(p)[attr];
}

function teamAverage(team, attr) {
  if (!team.length) return 0;
  return team.reduce((s, p) => s + getBalanceValue(p, attr), 0) / team.length;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function comboCost(teamA, teamB) {
  let cost = 0;
  for (const attr of BALANCE_ATTRS) {
    cost += Math.abs(teamAverage(teamA, attr) - teamAverage(teamB, attr)) * BALANCE_WEIGHTS[attr];
  }

  cost += teamFormationPenalty(teamA) + teamFormationPenalty(teamB);

  const gkA = bestTeamFormation(teamA).gk;
  const gkB = bestTeamFormation(teamB).gk;
  if (gkA && gkB) {
    cost += Math.abs(goalkeeperRating(gkA) - goalkeeperRating(gkB)) * 0.8;
  }

  return cost;
}

function effectiveTeamSize() {
  return selectedPlayers().length === teamSize * 2 ? teamSize : 0;
}

function findBestCombos() {
  const n = effectiveTeamSize();
  if (n < 1) return [];
  const results = [];
  const pool = selectedPlayers();
  for (let i = 0; i < ITERATIONS; i++) {
    const shuffled = shuffle(pool);
    const teamA = shuffled.slice(0, n);
    const teamB = shuffled.slice(n, n * 2);
    results.push({ teamA, teamB, sobrantes: [], cost: comboCost(teamA, teamB) });
  }
  const unique = new Map();
  results.forEach(result => {
    const sides = [result.teamA, result.teamB]
      .map(team => team.map(selectionKey).sort().join('|'))
      .sort();
    const signature = sides.join('::');
    if (!unique.has(signature)) unique.set(signature, result);
  });
  return [...unique.values()].sort((a, b) => a.cost - b.cost).slice(0, TOP_N);
}

function armarEquipos(rebarajar) {
  if (effectiveTeamSize() < 1) return;
  let combo;
  if (rebarajar && lastTopCombos.length) {
    combo = lastTopCombos[Math.floor(Math.random() * lastTopCombos.length)];
  } else {
    lastTopCombos = findBestCombos();
    combo = lastTopCombos[Math.floor(Math.random() * lastTopCombos.length)];
  }
  currentCombo = combo;
  // Un nuevo armado es un partido distinto: se limpia el partido abierto
  // para no seguir sumando votos a un armado de equipos que ya no está en
  // pantalla (antes quedaba "colgado" y btn-registrar-partido creaba otro
  // partido duplicado la próxima vez que se tocaba).
  currentMatch = null;
  document.getElementById('match-voting').classList.remove('visible');
  const registerButton = document.getElementById('btn-registrar-partido');
  if (registerButton) registerButton.disabled = false;
  renderResults(combo);
  document.getElementById('results').classList.add('visible');
  document.getElementById('btn-barajar').disabled = false;
}

function renderResults({ teamA, teamB, sobrantes, cost }) {
  const planA = bestTeamFormation(teamA);
  const planB = bestTeamFormation(teamB);
  fillTeamList('team-claro-list', teamA, planA.roles);
  fillTeamList('team-oscuro-list', teamB, planB.roles);
  const sobEl = document.getElementById('sobrantes-info');
  sobEl.textContent = sobrantes.length
    ? `Fuera: ${sobrantes.map(p => p.nombre).join(', ')}`
    : '';
  drawRadar(teamA, teamB);
  const diffs = CARD_ATTRS.map((a, i) => {
    const d = Math.abs(teamAverage(teamA, a) - teamAverage(teamB, a)).toFixed(2);
    return `${CARD_LABELS_FULL[i]}: ${d}`;
  });
  const formA = planA.formation ? `${planA.formation.def}-${planA.formation.med}-${planA.formation.del}` : '—';
  const formB = planB.formation ? `${planB.formation.def}-${planB.formation.med}-${planB.formation.del}` : '—';
  document.getElementById('cost-info').textContent =
    `Costo: ${cost.toFixed(3)} · Formación Claro ${formA} · Oscuro ${formB} · ${diffs.join(' · ')} · Arquero: ${Math.abs((planA.gk ? goalkeeperRating(planA.gk) : 0) - (planB.gk ? goalkeeperRating(planB.gk) : 0)).toFixed(2)}`;
}

function fillTeamList(id, team, roles = {}) {
  document.getElementById(id).innerHTML = team.map(p => {
    const c = computeCard(p);
    const role = roles[selectionKey(p)] || '';
    const roleLabel = role ? `${role} · ` : '';
    return `<li><span>${Utils.escapeHtml(p.nombre)} <small class="team-ovr">${Utils.escapeHtml(roleLabel)}${Utils.escapeHtml(formatPosiciones(p))}</small></span><span class="team-ovr">${c.media}</span></li>`;
  }).join('');
}

function drawRadar(teamA, teamB) {
  const svg = document.getElementById('radar-svg');
  const cx = 150, cy = 150, maxR = 110;
  const minVal = 1, maxVal = 5;
  const n = CARD_ATTRS.length;

  function pointFor(value, i) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const r = ((value - minVal) / (maxVal - minVal)) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  function poly(team) {
    return CARD_ATTRS.map((a, i) => {
      const pt = pointFor(teamAverage(team, a), i);
      return `${pt.x},${pt.y}`;
    }).join(' ');
  }

  let html = '';
  for (let level = 1; level <= 5; level++) {
    html += `<polygon points="${CARD_ATTRS.map((_, i) => { const p = pointFor(level, i); return `${p.x},${p.y}`; }).join(' ')}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  }
  CARD_ATTRS.forEach((_, i) => {
    const outer = pointFor(maxVal, i);
    html += `<line x1="${cx}" y1="${cy}" x2="${outer.x}" y2="${outer.y}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>`;
    const lbl = pointFor(maxVal + 0.55, i);
    html += `<text x="${lbl.x}" y="${lbl.y}" text-anchor="middle" dominant-baseline="middle" fill="#a8b5a8" font-size="10">${CARD_LABELS_FULL[i]}</text>`;
  });
  html += `<polygon points="${poly(teamB)}" fill="rgba(74,111,165,0.45)" stroke="#3d5a80" stroke-width="2"/>`;
  html += `<polygon points="${poly(teamA)}" fill="rgba(245,230,200,0.4)" stroke="#d4b896" stroke-width="2"/>`;
  svg.innerHTML = html;
}
