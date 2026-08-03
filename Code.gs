/**
 * 3er tiempo — Backend Google Apps Script
 * Columnas (fila 1):
 * Nombre | Posicion | Edad | Altura | Pie_habil |
 * Vel_fis | Resistencia | Fuerza |
 * Regate | Pase_corto | Pase_largo | Posicionamiento | Remate |
 * Marca |
 * Atajar | Reflejos | Salidas
 */

var SHEET_NAME = 'Jugadores';

var STAT_FIELDS = [
  'vel_fis', 'resistencia', 'fuerza',
  'regate', 'pase_corto', 'pase_largo', 'posicionamiento', 'remate',
  'marca',
  'atajar', 'reflejos', 'salidas'
];

var COL = {
  nombre: 0,
  posicion: 1,
  edad: 2,
  altura: 3,
  pie_habil: 4,
  vel_fis: 5,
  resistencia: 6,
  fuerza: 7,
  regate: 8,
  pase_corto: 9,
  pase_largo: 10,
  posicionamiento: 11,
  remate: 12,
  marca: 13,
  atajar: 14,
  reflejos: 15,
  salidas: 16
};

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function readStat_(row, key) {
  var val = Number(row[COL[key]]);
  if (isNaN(val) || val < 1) return 1;
  if (val > 5) return 5;
  return Math.round(val);
}

function rowToPlayer_(row) {
  var nombre = String(row[COL.nombre] || '').trim();
  if (!nombre) return null;

  var player = {
    nombre: nombre,
    posicion: String(row[COL.posicion] || 'MED').trim(),
    edad: Number(row[COL.edad]) || 30,
    altura: Number(row[COL.altura]) || 175,
    pie_habil: String(row[COL.pie_habil] || 'Derecho').trim()
  };

  for (var i = 0; i < STAT_FIELDS.length; i++) {
    player[STAT_FIELDS[i]] = readStat_(row, STAT_FIELDS[i]);
  }

  return player;
}

function doGet(e) {
  var sheet = getSheet_();
  var data = sheet.getDataRange().getValues();
  var players = [];

  for (var i = 1; i < data.length; i++) {
    var player = rowToPlayer_(data[i]);
    if (player) players.push(player);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, players: players }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var nombre = String(body.nombre || '').trim();

    if (!nombre) {
      return jsonResponse_({ ok: false, error: 'Falta el nombre del jugador' });
    }

    for (var i = 0; i < STAT_FIELDS.length; i++) {
      var key = STAT_FIELDS[i];
      var val = Number(body[key]);
      if (isNaN(val) || val < 1 || val > 5) {
        return jsonResponse_({ ok: false, error: 'Atributo inválido: ' + key });
      }
    }

    var sheet = getSheet_();
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;

    for (var r = 1; r < data.length; r++) {
      if (String(data[r][COL.nombre] || '').trim() === nombre) {
        rowIndex = r + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      return jsonResponse_({ ok: false, error: 'Jugador no encontrado: ' + nombre });
    }

    var rowValues = [
      nombre,
      String(body.posicion || 'MED').trim(),
      Number(body.edad) || 30,
      Number(body.altura) || 175,
      String(body.pie_habil || 'Derecho').trim()
    ];

    for (var j = 0; j < STAT_FIELDS.length; j++) {
      rowValues.push(Number(body[STAT_FIELDS[j]]));
    }

    sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);

    return jsonResponse_({ ok: true, nombre: nombre });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/*
 * INSTRUCCIONES DE DESPLIEGUE
 *
 * 1. Importar jugadores.csv en Google Sheets (pestaña "Jugadores").
 * 2. Extensiones → Apps Script → pegar este código.
 * 3. Implementar → Nueva implementación → Aplicación web → Cualquiera.
 * 4. Copiar URL /exec en APPS_SCRIPT_URL de index.html.
 */
