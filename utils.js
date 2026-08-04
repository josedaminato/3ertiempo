/**
 * Utilidades compartidas de 3er tiempo.
 *
 * Antes vivían duplicadas en varios archivos (normalize() en auth.js y
 * ratings.js, defaultPlayer() en index.html y api.js, lectura/escritura de
 * localStorage repetida en 4 lugares distintos). Ahora hay una sola
 * implementación de cada una acá.
 */
const Utils = (() => {
  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('es');
  }

  function clamp(value, min = 1, max = 5) {
    return Math.max(min, Math.min(max, Math.round(Number(value) || min)));
  }

  function avg(...vals) {
    const v = vals.filter(n => !isNaN(n));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 1;
  }

  function roundStat(n) {
    return clamp(n);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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

  function safePhotoUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:image/')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return '';
  }

  /** Jugador con valores por defecto. Única fuente de verdad (antes duplicada
   * en index.html y api.js). */
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
    p.arquero = 1;
    p.juega_arco = false;
    return p;
  }

  return {
    normalize,
    clamp,
    avg,
    roundStat,
    escapeHtml,
    readJson,
    writeJson,
    safePhotoUrl,
    defaultPlayer
  };
})();
