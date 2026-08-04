/**
 * Configuración de 3er tiempo
 *
 * provider:
 *   'api'    — Backend compartido (producción / mundo común)
 *   'google' — Google Sheets + Apps Script (legacy)
 *   'local'  — Solo este dispositivo (desarrollo sin servidor)
 */
const IS_LOCAL_DEV = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const APP_CONFIG = {
  provider: 'api',

  googleScriptUrl: 'https://script.google.com/macros/s/TU_ID_AQUI/exec',

  /** Backend compartido — todos ven el mismo mundo */
  apiBaseUrl: IS_LOCAL_DEV
    ? 'http://localhost:3000'
    : 'https://api.3ertiempo.online',

  defaultPlayerNames: [
    'Marcelo', 'Maxi', 'Turco', 'Gato', 'Mariano', 'Charly', 'Gonza', 'Ariel',
    'Claudio', 'Cacho', 'Jorge', 'Jose', 'Claudio M', 'Seba', 'Marcos',
    'Juampi', 'Chifi', 'Matías',
    'Pablo', 'Fer', 'Tasla', 'Franco', 'Javi'
  ]
};

const STAT_FIELDS = [
  'vel_fis', 'resistencia', 'fuerza',
  'regate', 'pase_corto', 'pase_largo', 'posicionamiento', 'remate',
  'marca', 'arquero'
];

const STORAGE_KEYS = {
  roster: '3ertiempo_roster',
  fotos: '3ertiempo_fotos',
  selection: '3ertiempo_match_selection_v1'
};
