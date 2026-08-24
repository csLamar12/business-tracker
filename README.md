# Business Tracker (web)

Multi-business income / expense / plan tracker for **AnchorPoint Systems**, live at
**[tracker.anchorpointja.com](https://tracker.anchorpointja.com)**. Next.js (App Router,
TypeScript) + MongoDB, with authentication via the standalone
[`anchor-auth`](https://github.com/csLamar12/anchor-auth) service. Deployed on Railway,
fronted by Cloudflare.

> This replaces the former Python/CustomTkinter desktop app. The desktop source and its
> release binaries remain in the git history at tag **`v1.1.2`** and the GitHub Releases.

## Features

- Businesses + one level of subsidiaries; overview with rollups incl. subsidiaries
- Income / Expenses / Plans with inline-editable tables, per-transaction **locked FX rate**,
  per-user display currency (USD / JMD)
- Operating phase + notes per business
- **@-mentions** in any notes field → email (Gmail SMTP) + in-app + browser notification
- Online/offline **presence**, **invite + accept** business sharing (owner-gated)
- **Monthly trend chart**, **CSV export/import**, search, mobile-responsive
- Admin activity/audit view (`/admin`), 4 themes (Aegean / Amalfi / Manhattan / Midnight)
- Email + password auth, httpOnly-cookie sessions, 7-day rotating refresh

## Local development

```bash
npm install
cp .env.example .env.local     # fill in the values (see below)
npm run dev                    # http://localhost:3000
```

You also need, locally:

- **MongoDB** — `mongod --dbpath /tmp/mongo --port 27017`
- **anchor-auth** — clone `csLamar12/anchor-auth`, then:
  ```bash
  cd anchor-auth/server && pip install -e . uvicorn
  cd ../service && ANCHOR_AUTH_ALGORITHM=RS256 ANCHOR_AUTH_MULTI_APP=true \
    ANCHOR_AUTH_APP_IDS='["tracker"]' MONGODB_URI=mongodb://127.0.0.1:27017 \
    MONGODB_DB=anchor_auth uvicorn main:app --port 8000
  ```
  (In dev with RS256 and no keys it mints an ephemeral keypair; grab its public key from
  `GET /auth/public-key` for `AUTH_JWT_PUBLIC_KEY`, or generate a stable one — see deploy.)

## Environment

| var | meaning |
|---|---|
| `APP_ORIGIN` | public origin, e.g. `https://tracker.anchorpointja.com` (cookie + CSRF) |
| `MONGODB_URI` / `MONGODB_DB` | the tracker's own database (`tracker`) |
| `AUTH_SERVICE_URL` | anchor-auth base URL (Railway private: `http://anchor-auth.railway.internal:8000`) |
| `AUTH_APP_ID` / `AUTH_AUDIENCE` | `tracker` |
| `AUTH_JWT_PUBLIC_KEY` | anchor-auth's RS256 public PEM (verifies access tokens locally) |
| `ADMIN_EMAILS` | comma-separated emails granted admin on first login |
| `SMTP_HOST/PORT/USER/APP_PASSWORD` | Gmail app password for mention/invite email |

## Deploy (Railway + Cloudflare)

Three Railway services in one project + a Cloudflare DNS record.

**1. MongoDB** — add the Railway MongoDB plugin (or Atlas). Two logical DBs: `tracker`
(this app) and `anchor_auth` (the auth service). Optional: add **Redis** for real
logout revocation.

**2. `anchor-auth` service** — deploy `csLamar12/anchor-auth` (`service/`). Generate an
RS256 keypair once:
```bash
python -c "from anchor_auth import generate_dev_keypair; a,b=generate_dev_keypair(); \
  open('priv.pem','w').write(a); open('pub.pem','w').write(b)"
```
Set: `ANCHOR_AUTH_APP_ENV=production`, `ANCHOR_AUTH_ALGORITHM=RS256`,
`ANCHOR_AUTH_JWT_PRIVATE_KEY` (priv.pem), `ANCHOR_AUTH_JWT_PUBLIC_KEY` (pub.pem),
`ANCHOR_AUTH_MULTI_APP=true`, `ANCHOR_AUTH_APP_IDS=["tracker"]`,
`ANCHOR_AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=15`, `ANCHOR_AUTH_REFRESH_TOKEN_EXPIRE_DAYS=7`,
`ANCHOR_AUTH_ROTATE_REFRESH_TOKENS=true`, `MONGODB_URI`, `MONGODB_DB=anchor_auth`,
`ANCHOR_AUTH_EMAIL_PROVIDER=smtp` (+ `ANCHOR_AUTH_SMTP_*`), `ANCHOR_AUTH_OPS_EMAILS`.
Keep it **private** (no public domain). **Override the start command** to bind IPv6 —
Railway private networking is IPv6-only:
```
uvicorn main:app --host :: --port $PORT
```

**3. `tracker-web` (this repo)** — public service, custom domain
`tracker.anchorpointja.com`. Env: `MONGODB_URI` (→ `tracker`), `MONGODB_DB=tracker`,
`AUTH_SERVICE_URL=http://anchor-auth.railway.internal:8000`, `AUTH_APP_ID=tracker`,
`AUTH_AUDIENCE=tracker`, `AUTH_JWT_PUBLIC_KEY` (the **public** PEM), `APP_ORIGIN`,
`ADMIN_EMAILS`, `SMTP_*`, `NODE_ENV=production`.

**4. Cloudflare** — in Railway, add `tracker.anchorpointja.com` as a custom domain; it
gives a CNAME target. In Cloudflare create `CNAME tracker → <target>` **DNS-only (grey
cloud)** first so Railway can issue the TLS cert, then switch to **proxied (orange)** and
set SSL/TLS mode to **Full (strict)**. This replaces the old downloads page.

The first user to sign up with an email in `ADMIN_EMAILS` becomes admin.
