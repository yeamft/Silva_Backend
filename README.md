# SPX Farm OS — API (auth scaffold)

Express + Prisma backend. Current surface is **auth only** (login, MFA, sessions, programs switch).

## Run

```bash
npm install
npx prisma generate
npx prisma migrate deploy   # or migrate reset on fresh DB
npm run prisma:seed
npm run dev
```

API: http://localhost:3000  
Client (JWT): set `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1` and allow CORS for `http://localhost:8080`.

Auth uses access + refresh JWTs. Protected routes require `Authorization: Bearer <accessToken>`. Refresh tokens rotate on use; password change/reset revokes all sessions.

## API collection

Importable docs live under `docs/`:

| File | Use |
|------|-----|
| [`docs/SPX-Farm-OS-Auth.postman_collection.json`](docs/SPX-Farm-OS-Auth.postman_collection.json) | Postman / Insomnia import |
| [`docs/openapi.yaml`](docs/openapi.yaml) | OpenAPI 3 (Swagger / GitHub preview) |
| [`docs/auth.http`](docs/auth.http) | VS Code REST Client |

Postman: **Import →** select the `.postman_collection.json` file. Set `baseUrl` if needed (default `http://localhost:3000`). Run **Login** first — tokens are saved automatically.

## Demo users (after seed)

Password: `Password123!`

| Email | Role |
|-------|------|
| `owner@silva.example` | Silva owner |
| `admin@spx.example` | System admin |
| `principal@spx.example` | SPX account manager |
| `lead@bagro.example` | Vendor field lead |

Demo programs (workspaces): **Silva Kaffa Coffee Program**, **Chaka Buna Estate**.

## Database

Auth-only Prisma schema + a single migration: `20260310120000_auth_init`.

Tables: organizations, users, programs, program_memberships, refresh_sessions, password_reset_tokens.

```bash
# Fresh DB (wipes data)
npx prisma migrate reset

# Or apply to empty DB
npx prisma migrate deploy
npm run prisma:seed
```

If you already have the old full-domain database, reset or create a new database — the auth migration is not a drop-in upgrade over the historical migration chain.
# Silva_Backend
