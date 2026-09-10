# SPX Farm OS — API (auth scaffold)

Express + Prisma backend. Current surface is **auth only** (login, MFA, sessions, programs switch).

## Run

```bash
npm install
npx prisma generate
npm run prisma:seed   # optional demo users
npm run dev
```

API: http://localhost:3000

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
| `principal@spx.example` | SPX principal |
| `lead@bagro.example` | Vendor field lead |

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
