/**
 * 3er tiempo — Backend Google Apps Script
 * Columnas (fila 1):
 * Nombre | Posicion_1 | Posicion_2 | Juega_arco |
 * Edad | Altura | Pie_habil |
 * Vel_fis | Resistencia | Fuerza |
 * Regate | Pase_corto | Pase_largo | Posicionamiento | Remate |
 * Marca | Atajar | Reflejos | Salidas | Foto_url
 *
 * Juega_arco: 1 = sí, 0 = no (todos rotan, por defecto 1)
 */

var SHEET_NAME = 'Jugadores';
var FOTOS_FOLDER_NAME = '3ertiempo-fotos';

var STAT_FIELDS = [
  'vel_fis', 'resistencia', 'fuerza',
  'regate', 'pase_corto', 'pase_largo', 'posicionamiento', 'remate',
  'marca',
  'atajar', 'reflejos', 'salidas'
];

var COL_NEW = {
  nombre: 0,
  posicion_1: 1,
  posicion_2: 2,
  juega_arco: 3,
  edad: 4,
  altura: 5,
  pie_habil: 6,
  vel_fis: 7,
  resistencia: 8,
  fuerza: 9,
  regate: 10,
  pase_corto: 11,
  pase_largo: 12,
  posicionamiento: 13,
  remate: 14,
  marca: 15,
  atajar: 16,
  reflejos: 17,
  salidas: 18,
  foto_url: 19
};

var COL_LEGACY = {
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
  salidas: 16,
  foto_url: 17
};

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function isLegacyFormat_(headers) {
  var h = headers.map(function(x) { return String(x).toLowerCase().trim(); });
  return h.indexOf('posicion_1') < 0;
}

function readStat_(row, col, key) {
  var val = Number(row[col[key]]);
  if (isNaN(val) || val < 1) return 1;
  if (val > 5) return 5;
  return Math.round(val);
}

function readBoolArco_(val) {
  if (val === true || val === 1 || val === '1') return true;
  var s = String(val || '').toLowerCase().trim();
  return s === 'si' || s === 'sí' || s === 'true' || s === 'x';
}

function rowToPlayer_(row, legacy) {
  var COL = legacy ? COL_LEGACY : COL_NEW;
  var nombre = String(row[COL.nombre] || '').trim();
  if (!nombre) return null;

  var pos1 = legacy
    ? String(row[COL.posicion] || 'MED').trim()
    : String(row[COL.posicion_1] || 'MED').trim();
  var pos2 = legacy
    ? pos1
    : String(row[COL.posicion_2] || 'DEL').trim();

  var player = {
    nombre: nombre,
    posicion_1: pos1,
    posicion_2: pos2,
    juega_arco: legacy ? true : readBoolArco_(row[COL.juega_arco] !== false ? row[COL.juega_arco] : 1),
    edad: Number(row[COL.edad]) || 30,
    altura: Number(row[COL.altura]) || 175,
    pie_habil: String(row[COL.pie_habil] || 'Derecho').trim(),
    foto_url: String(row[COL.foto_url] || '').trim()
  };

  for (var i = 0; i < STAT_FIELDS.length; i++) {
    player[STAT_FIELDS[i]] = readStat_(row, COL, STAT_FIELDS[i]);
  }

  return player;
}

function doGet(e) {
  var sheet = getSheet_();
  var data = sheet.getDataRange().getValues();
  var legacy = isLegacyFormat_(data[0] || []);
  var players = [];

  for (var i = 1; i < data.length; i++) {
    var player = rowToPlayer_(data[i], legacy);
    if (player) players.push(player);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, players: players }))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildRowValues_(body) {
  var rowValues = [
    String(body.nombre || '').trim(),
    String(body.posicion_1 || 'MED').trim(),
    String(body.posicion_2 || 'DEL').trim(),
    body.juega_arco ? 1 : 0,
    Number(body.edad) || 30,
    Number(body.altura) || 175,
    String(body.pie_habil || 'Derecho').trim()
  ];

  for (var j = 0; j < STAT_FIELDS.length; j++) {
    rowValues.push(Number(body[STAT_FIELDS[j]]));
  }

  rowValues.push(String(body.foto_url || '').trim());
  return rowValues;
}

function findPlayerRow_(data, nombre) {
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || '').trim() === nombre) {
      return r + 1;
    }
  }
  return -1;
}

function nameExists_(data, nombre, ignoreRowIndex) {
  var target = nombre.trim().toLowerCase();
  for (var r = 1; r < data.length; r++) {
    if (ignoreRowIndex && r + 1 === ignoreRowIndex) continue;
    if (String(data[r][0] || '').trim().toLowerCase() === target) {
      return true;
    }
  }
  return false;
}

function validateStats_(body) {
  for (var i = 0; i < STAT_FIELDS.length; i++) {
    var key = STAT_FIELDS[i];
    var val = Number(body[key]);
    if (isNaN(val) || val < 1 || val > 5) {
      return 'Atributo inválido: ' + key;
    }
  }
  return null;
}

function getFotosFolder_() {
  var folders = DriveApp.getFoldersByName(FOTOS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(FOTOS_FOLDER_NAME);
}

function uploadFotoToDrive_(nombre, base64, mimeType) {
  var folder = getFotosFolder_();
  var safeName = String(nombre || 'jugador')
    .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑüÜ ]/g, '')
    .trim()
    .replace(/\s+/g, '_') || 'jugador';
  var ext = mimeType === 'image/png' ? 'png' : 'jpg';
  var fileName = safeName + '.' + ext;

  var existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400';
}

function setPlayerFotoUrl_(nombre, fotoUrl, legacy) {
  var sheet = getSheet_();
  var data = sheet.getDataRange().getValues();
  var rowIndex = findPlayerRow_(data, nombre);
  var col = (legacy !== undefined ? legacy : isLegacyFormat_(data[0] || []))
    ? COL_LEGACY.foto_url + 1
    : COL_NEW.foto_url + 1;

  if (rowIndex === -1) {
    throw new Error('Jugador no encontrado: ' + nombre);
  }

  sheet.getRange(rowIndex, col).setValue(fotoUrl);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var nombre = String(body.nombre || '').trim();
    var action = String(body.action || 'update').trim();

    if (!nombre) {
      return jsonResponse_({ ok: false, error: 'Falta el nombre del jugador' });
    }

    var sheet = getSheet_();
    var data = sheet.getDataRange().getValues();
    var legacy = isLegacyFormat_(data[0] || []);

    if (action === 'uploadFoto') {
      if (!body.imageBase64) {
        return jsonResponse_({ ok: false, error: 'Falta la imagen' });
      }
      var fotoUrl = uploadFotoToDrive_(
        nombre,
        body.imageBase64,
        body.mimeType || 'image/jpeg'
      );
      setPlayerFotoUrl_(nombre, fotoUrl, legacy);
      return jsonResponse_({ ok: true, nombre: nombre, foto_url: fotoUrl });
    }

    var statError = validateStats_(body);
    if (statError) {
      return jsonResponse_({ ok: false, error: statError });
    }

    if (action === 'create') {
      if (nameExists_(data, nombre, null)) {
        return jsonResponse_({ ok: false, error: 'Ya existe un jugador con ese nombre' });
      }
      sheet.appendRow(buildRowValues_(body));
      return jsonResponse_({ ok: true, nombre: nombre, created: true });
    }

    var rowIndex = findPlayerRow_(data, nombre);

    if (rowIndex === -1) {
      return jsonResponse_({ ok: false, error: 'Jugador no encontrado: ' + nombre });
    }

    sheet.getRange(rowIndex, 1, 1, buildRowValues_(body).length).setValues([buildRowValues_(body)]);

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
