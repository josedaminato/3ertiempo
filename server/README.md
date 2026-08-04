# API 3er Tiempo

Backend compartido: un solo mundo para todos los jugadores.

## Desarrollo local

```bash
cd server
npm install
npm run dev
```

La API queda en **http://localhost:3000**

En otra terminal, serví el frontend:

```bash
python -m http.server 8765
```

Abrí http://localhost:8765/index.html — `config.js` usa `apiBaseUrl: http://localhost:3000` en localhost.

## Variables de entorno

Copiá `.env.example` a `.env`:

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto (default 3000) |
| `SESSION_SECRET` | Secreto largo para cookies de sesión |
| `CORS_ORIGIN` | Orígenes permitidos separados por coma |
| `NODE_ENV` | `production` activa cookie Secure |

## Despliegue en Hostinger (api.3ertiempo.online)

1. Subí la carpeta `server/` al hosting (Node.js o VPS).
2. `npm install --production`
3. Configurá `.env` con `SESSION_SECRET` y `CORS_ORIGIN=https://3ertiempo.online`
4. Apuntá el subdominio `api.3ertiempo.online` al proceso Node.
5. Activá HTTPS (obligatorio para cookies en producción).

La base SQLite vive en `server/data/3ertiempo.db`. Hacé backup periódico.

## Privacidad de votos

- Los votos individuales (`match_votes`, `peer_ratings`) **nunca** se devuelven al jugador calificado.
- Cada usuario solo ve **sus propios votos** vía `/v1/matches/:id/my-votes` y `/v1/players/:id/my-rating`.
- Lo público son **promedios agregados** y el periódico.

## Endpoints principales

- `POST /v1/auth/register|login|logout`
- `GET /v1/players`
- `PUT /v1/players/:id/rating`
- `GET /v1/convocation` · `PUT /v1/convocation`
- `POST /v1/matches` · `PUT /v1/matches/:id/votes`
- `GET /v1/matches/:id/newspaper`

Ver `BACKEND_CONTRACT.md` en la raíz del repo.
