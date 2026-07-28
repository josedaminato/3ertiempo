/**
 * 3er tiempo — Backend Google Apps Script
 * Hoja esperada: fila 1 = encabezados → Nombre | Marca | Fisico | Habilidad | Remate | Disparo | Arco
 */

var SHEET_NAME = 'Jugadores'; // Cambiar si tu hoja tiene otro nombre

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  return sheet;
}

function doGet(e) {
  var sheet = getSheet_();
  var data = sheet.getDataRange().getValues();
  var players = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var nombre = String(row[0] || '').trim();
    if (!nombre) continue;

    players.push({
      nombre: nombre,
      marca: Number(row[1]) || 1,
      fisico: Number(row[2]) || 1,
      habilidad: Number(row[3]) || 1,
      remate: Number(row[4]) || 1,
      disparo: Number(row[5]) || 1,
      arco: Number(row[6]) || 1
    });
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
      return jsonResponse_({ ok: false, error: 'Falta el nombre del jugador' }, 400);
    }

    var attrs = ['marca', 'fisico', 'habilidad', 'remate', 'disparo', 'arco'];
    for (var a = 0; a < attrs.length; a++) {
      var val = Number(body[attrs[a]]);
      if (isNaN(val) || val < 1 || val > 5) {
        return jsonResponse_({ ok: false, error: 'Atributo inválido: ' + attrs[a] }, 400);
      }
    }

    var sheet = getSheet_();
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === nombre) {
        rowIndex = i + 1; // filas en Sheets son 1-based
        break;
      }
    }

    if (rowIndex === -1) {
      return jsonResponse_({ ok: false, error: 'Jugador no encontrado: ' + nombre }, 404);
    }

    sheet.getRange(rowIndex, 2, 1, 6).setValues([[
      Number(body.marca),
      Number(body.fisico),
      Number(body.habilidad),
      Number(body.remate),
      Number(body.disparo),
      Number(body.arco)
    ]]);

    return jsonResponse_({ ok: true, nombre: nombre });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) }, 500);
  }
}

function jsonResponse_(obj, status) {
  var output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

  // Apps Script no expone códigos HTTP directamente en Web Apps,
  // pero el cuerpo JSON indica éxito o error.
  return output;
}

/*
 * ═══════════════════════════════════════════════════════════════════
 * INSTRUCCIONES DE DESPLIEGUE
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. Crear una Google Sheet con estas columnas en la fila 1:
 *    Nombre | Marca | Fisico | Habilidad | Remate | Disparo | Arco
 *
 * 2. Cargar los 18 jugadores (filas 2 en adelante):
 *    Marcelo, Maxi, Turco, Gato, Mariano, Charly, Gonza, Ariel,
 *    Claudio, Cacho, Jorge, Jose, Claudio M, Seba, Marcos,
 *    Juampi, Chifi, Matías
 *    Valores iniciales sugeridos: 3 en cada atributo.
 *
 * 3. Extensiones → Apps Script → pegar este archivo Code.gs completo.
 *
 * 4. (Opcional) Si la hoja no se llama "Jugadores", cambiar SHEET_NAME arriba.
 *
 * 5. Implementar → Nueva implementación:
 *    - Tipo: Aplicación web
 *    - Descripción: 3er tiempo API
 *    - Ejecutar como: Yo (tu cuenta)
 *    - Quién tiene acceso: Cualquiera
 *
 * 6. Autorizar permisos cuando lo pida (acceso a la hoja de cálculo).
 *
 * 7. Copiar la URL de la aplicación web (termina en /exec).
 *
 * 8. Pegar esa URL en la constante APPS_SCRIPT_URL de index.html.
 *
 * 9. Subir index.html a un repo de GitHub y activar GitHub Pages
 *    (Settings → Pages → Source: rama main, carpeta /root).
 *
 * NOTA: Cada vez que modifiques Code.gs, creá una "Nueva implementación"
 *       para que los cambios se reflejen en la URL /exec.
 */
