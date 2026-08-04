# 3er Tiempo

App web para armar equipos de fútbol parejos entre amigos: cartas estilo FIFA, convocatoria del jueves, balanceo automático y crónica postpartido.

## Ver la app (interfaz en vivo)

**https://josedaminato.github.io/3ertiempo/**

> GitHub Pages muestra la app funcionando. El código fuente está en este mismo repositorio.

## Compartir / descargar el código completo

### Opción 1 — Un solo archivo (recomendado para compartir)

Descargá **`3ertiempo-CODIGO-COMPLETO.txt`**: incluye todos los archivos del proyecto en un único documento, separados por secciones.

- [Descargar código completo (.txt)](https://github.com/josedaminato/3ertiempo/raw/main/3ertiempo-CODIGO-COMPLETO.txt)
- En el repo: abrí el archivo y **Raw** → guardar como

### Opción 2 — ZIP del repositorio

1. Entrá a https://github.com/josedaminato/3ertiempo
2. Botón verde **Code** → **Download ZIP**
3. Descomprimí y tenés todos los archivos listos para editar

### Opción 3 — Clonar con Git

```bash
git clone https://github.com/josedaminato/3ertiempo.git
cd 3ertiempo
python -m http.server 8765
```

Abrí http://localhost:8765/index.html

## Uso rápido

1. Elegí tu nombre y creá tu contraseña (primera vez) o ingresá.
2. Marcá con `+` los 14 jugadores confirmados para Fútbol 7.
3. Tocá **Armar equipos parejos**.
4. Después del partido, registrá el encuentro y votá para generar la crónica.

## Desarrollo local

**Frontend:**
```bash
python -m http.server 8765
```

**Backend compartido (Fase 2 — recomendado):**
```bash
cd server
npm install
npm run dev
```

Abrí http://localhost:8765/index.html — en localhost el frontend usa la API en `http://localhost:3000`.

Ver `server/README.md` para despliegue en `api.3ertiempo.online`.

## Archivos

Fase 1 de la auditoría: se sacó todo el JS y CSS que vivía inline en
`index.html` (~1370 líneas de `<script>` + ~1050 de `<style>`) a módulos
separados, sin cambiar comportamiento ni look de la app.

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Solo estructura HTML |
| `styles.css` | Todo el CSS de la app |
| `utils.js` | Helpers compartidos: `normalize`, storage, `escapeHtml`, `defaultPlayer` |
| `config.js` | Configuración (provider, URLs) |
| `api.js` | Capa de datos |
| `auth.js` | Autenticación (prototipo local) |
| `ratings.js` | Evaluaciones, partidos y periódico |
| `cards.js` | Cálculo y render de las cartas estilo FIFA |
| `teams.js` | Balanceo de equipos, formaciones, radar |
| `ui.js` | Login, grid de jugadores, modales de edición/valoración, fotos |
| `app.js` | Estado global, carga de datos, registro de partido/votación, arranque |
| `server/` | API Node.js + SQLite (mundo compartido, auth, votos privados) |
| `Code.gs` | Backend Google Sheets / Apps Script (legacy) |
| `jugadores.csv` | Plantilla inicial |

Cada `<script src>` en `index.html` sigue este orden de carga porque
son scripts clásicos (no ES modules) que comparten el scope global.

## Cambios de Fase 1 (sin tocar comportamiento visible)

- **Bug del periódico:** contaba votos totales en vez de votantes únicos. Ahora `RatingsService.getMatchVoteCount` cuenta personas que votaron.
- **Partido duplicado:** cada clic en "Registrar partido" creaba un partido nuevo. Ahora se reutiliza el partido abierto para el mismo armado (`RatingsService.findOpenMatch`).
- `defaultPlayer()` y `normalize()` estaban duplicados en varios archivos; ahora viven en `utils.js`.

## Fase 2 — Mundo compartido

- **Backend** en `server/`: auth con bcrypt, plantilla compartida, convocatoria, valoraciones, partidos y periódico.
- **Privacidad:** cada uno solo edita su perfil; los votos individuales no se muestran al calificado (solo promedios).
- **Frontend** conectado vía `provider: 'api'` en `config.js`.

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
