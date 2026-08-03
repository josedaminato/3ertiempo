# 3er Tiempo

App web para armar equipos de fútbol parejos entre amigos: cartas estilo FIFA, convocatoria del jueves, balanceo automático y crónica postpartido.

## Ver la app

**Link de la interfaz (GitHub Pages):**

**https://josedaminato.github.io/3ertiempo/**

> El link del repositorio (`github.com/josedaminato/3ertiempo`) muestra el código, no la app. Para usar la interfaz abrí el link de arriba.

## Uso rápido

1. Elegí tu nombre y creá tu contraseña (primera vez) o ingresá.
2. Marcá con `+` los 14 jugadores confirmados para Fútbol 7.
3. Tocá **Armar equipos parejos**.
4. Después del partido, registrá el encuentro y votá para generar la crónica.

## Desarrollo local

```bash
python -m http.server 8765
```

Abrí http://localhost:8765/index.html

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Interfaz completa |
| `config.js` | Configuración (provider, URLs) |
| `api.js` | Capa de datos |
| `auth.js` | Autenticación (prototipo local) |
| `ratings.js` | Evaluaciones y periódico |
| `Code.gs` | Backend Google Sheets / Apps Script |
| `jugadores.csv` | Plantilla inicial |

## GitHub Pages

Si el link de arriba da 404:

1. Repo → **Settings** → **Pages**
2. **Build and deployment** → Source: **Deploy from a branch**
3. Branch: **main** → Folder: **/ (root)** → Save
4. Esperá 1–2 minutos y recargá

## Google Sheets (opcional)

Para sincronizar con una planilla, desplegá `Code.gs` como Apps Script y poné la URL en `config.js`:

```js
googleScriptUrl: 'https://script.google.com/macros/s/TU_ID/exec'
```

Sin URL configurada, la app funciona en modo local con los jugadores por defecto.
