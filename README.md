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

## Endpoints

- `GET /health` · `GET /api/v1/health`
- `/api/v1/auth/*` — config, login, signup (disabled), OTP/TOTP, refresh, me, logout, sessions, password, switch-program, branding, onboarding

## Demo users (after seed)

Password: `Password123!`

| Email | Role |
|-------|------|
| `owner@silva.example` | Silva owner |
| `principal@spx.example` | SPX principal |
| `lead@bagro.example` | Vendor field lead |

## Notes

- Prisma `schema.prisma` still contains the full historical domain models so existing databases keep working. Application code only uses identity/program/auth tables.
- Domain seed scripts and Cropfort import tooling were removed from this scaffold.
