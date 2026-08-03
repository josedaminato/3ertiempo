/**
 * Configuración de 3er tiempo
 *
 * provider:
 *   'google' — Google Sheets + Apps Script (temporal, hasta tener backend)
 *   'api'    — Backend propio en api.3ertiempo.online (futuro)
 *   'local'  — Solo este dispositivo (desarrollo / pruebas)
 */
const APP_CONFIG = {
  provider: 'google',

  googleScriptUrl: 'https://script.google.com/macros/s/TU_ID_AQUI/exec',

  /** Base URL del backend futuro (sin barra final) */
  apiBaseUrl: 'https://api.3ertiempo.online',

  /** Nombres iniciales si no hay datos remotos ni guardados localmente */
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
