# Backend objetivo — 3er Tiempo

La interfaz funciona hoy como prototipo local. Este contrato define la API
necesaria para publicar `3ertiempo.online` sin reescribir el frontend.

## Seguridad

- Contraseñas con Argon2id o bcrypt; nunca texto plano ni SHA-256 simple.
- Sesión en cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
- Cada usuario está vinculado exactamente a un jugador.
- Un usuario solo puede editar los datos personales y la foto de su jugador.
- La API debe rechazar cualquier autoevaluación.
- Fotos privadas en storage, expuestas mediante URL pública controlada o CDN.

## Tablas mínimas

### `players`

`id`, `name`, `position_1`, `position_2`, `plays_goalkeeper`, `age`, `height`,
`preferred_foot`, `photo_url`, `base_stats_json`, `created_at`, `updated_at`.

### `users`

`id`, `player_id UNIQUE`, `username UNIQUE`, `password_hash`, `created_at`.

### `peer_ratings`

`id`, `rater_user_id`, `rated_player_id`, `stats_json`, `updated_at`.

Restricciones:

- `UNIQUE(rater_user_id, rated_player_id)`.
- `CHECK(rater_user_id <> user_id_del_jugador_evaluado)`.
- Valores de cada atributo entre 1 y 5.

### `matches`

`id`, `format`, `scheduled_for`, `played_at`, `status`, `created_by`,
`team_claro_json`, `team_oscuro_json`.

### `match_players`

`match_id`, `player_id`, `selected_by`, `updated_at`.

Restricciones:

- `UNIQUE(match_id, player_id)`.
- Cualquier usuario autenticado puede agregar o quitar jugadores mientras el
  partido esté en estado `open`.

### `match_votes`

`id`, `match_id`, `rater_user_id`, `rated_player_id`, `score`, `updated_at`.

Restricciones:

- `UNIQUE(match_id, rater_user_id, rated_player_id)`.
- `CHECK(score BETWEEN 1 AND 5)`.
- Sin voto propio.

## Endpoints

### Autenticación

- `POST /v1/auth/status`
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`

### Jugadores

- `GET /v1/players`
- `POST /v1/players`
- `PUT /v1/players/:id`
- `POST /v1/players/:id/photo`

`GET /v1/players` debe incluir `peer_averages` y `rating_count`. Si no hay
votos, el frontend usa el valor base 3.

### Valoraciones

- `PUT /v1/players/:id/rating`
- `GET /v1/players/:id/my-rating`

### Partidos y periódico

- `GET /v1/matches/upcoming`
- `PUT /v1/matches/:id/players/:player_id`
- `DELETE /v1/matches/:id/players/:player_id`
- `POST /v1/matches`
- `GET /v1/matches`
- `GET /v1/matches/:id`
- `PUT /v1/matches/:id/votes`
- `GET /v1/matches/:id/results`
- `GET /v1/matches/:id/newspaper`

El texto del periódico puede generarse inicialmente con las plantillas que ya
usa `ratings.js`; no requiere inteligencia artificial.
