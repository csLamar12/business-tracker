# Deployment & DNS — SchoolHub Jamaica

The app runs on **Cloudflare Workers** (via the [OpenNext Cloudflare adapter])
with **MongoDB** for data. This guide covers configuring the Cloudflare Workers
build that runs on this repo, the database, and DNS for wildcard subdomains
(anchorpointja.com for dev, schoolhubja.com for prod) plus school custom domains.

[OpenNext Cloudflare adapter]: https://opennext.js.org/cloudflare

---

## 1. Environment variables

| Variable                  | Where                      | Example                                           | Notes |
| ------------------------- | -------------------------- | ------------------------------------------------- | ----- |
| `NEXT_PUBLIC_ROOT_DOMAIN` | **Build-time**             | `anchorpointja.com` (dev) / `schoolhubja.com`     | Inlined into the client + middleware at build, so it must be set as a *build* variable, not only a runtime secret. |
| `DATABASE_URL`            | Runtime secret             | `prisma://accelerate.prisma-data.net/?api_key=…`  | On Workers this is a **Prisma Accelerate** URL (see §3). Locally/Vercel it's a direct `mongodb://…` / `mongodb+srv://…` URL. |
| `AUTH_SECRET`             | Runtime secret             | 96-hex-char random string                         | Signs admin session cookies. |
| `SUPERADMIN_EMAIL`        | Used only by the seed      | `admin@schoolhubja.com`                           | Seeded super-admin login. |
| `SUPERADMIN_PASSWORD`     | Used only by the seed      | strong password                                   | Change before any real deploy. |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 2. MongoDB (Atlas)

1. Create a free **MongoDB Atlas** cluster (Atlas clusters are replica sets,
   which Prisma's MongoDB connector requires).
2. Create a database user and get the `mongodb+srv://…/schoolhub` connection
   string.
3. Allow network access from your environment (for Accelerate, allow Prisma's
   egress or `0.0.0.0/0` while testing).
4. Create the collections + indexes and seed:

   ```bash
   DATABASE_URL="mongodb+srv://USER:PASS@cluster.mongodb.net/schoolhub" \
     npm run db:push      # creates indexes/collections from prisma/schema.prisma
   DATABASE_URL="mongodb+srv://…/schoolhub" npm run db:seed   # optional sample data
   ```

> The model uses `relationMode = prisma` (implicit for MongoDB): referential
> actions like `onDelete: Cascade` are enforced by Prisma in the app, not the DB.

---

## 3. Prisma Accelerate (required for Cloudflare Workers)

Cloudflare Workers can't use Prisma's MongoDB engine directly (there is no
MongoDB driver adapter for the Workers runtime), so Workers talk to MongoDB
through **Prisma Accelerate**, an HTTP query proxy.

1. In the [Prisma Data Platform](https://console.prisma.io), enable Accelerate
   for a project and point it at your Atlas `mongodb+srv://…` connection string.
2. Copy the generated `prisma://accelerate.prisma-data.net/?api_key=…` URL.
3. Set it as the Worker's `DATABASE_URL` secret (§4). `lib/db.ts` automatically
   applies the Accelerate extension whenever `DATABASE_URL` starts with
   `prisma://`, and uses a direct connection otherwise.

> Vercel/Node hosts can skip Accelerate and use the direct `mongodb+srv://…` URL.

---

## 4. Cloudflare Workers — deploy

### Option A: from your machine (Wrangler CLI)

```bash
npx wrangler login
# set secrets (not stored in wrangler.toml):
npx wrangler secret put DATABASE_URL      # the prisma://… Accelerate URL
npx wrangler secret put AUTH_SECRET
# build + deploy (NEXT_PUBLIC_ROOT_DOMAIN must be set in the build env):
NEXT_PUBLIC_ROOT_DOMAIN=schoolhubja.com npm run cf:deploy
```

`npm run cf:preview` builds and runs the Worker locally in workerd.

### Option B: Cloudflare Workers Builds (Git integration) — fixes the PR's CI check

The repo's existing "Workers Builds: business-tracker" check builds the **repo
root**, which has no Worker — so it fails. Point it at this app:

In the Cloudflare dashboard → Workers & Pages → *business-tracker* → Settings →
**Builds**:

| Setting              | Value                                  |
| -------------------- | -------------------------------------- |
| Root directory       | `schoolhub`                            |
| Build command        | `npm run cf:build`                     |
| Deploy command       | `npx opennextjs-cloudflare deploy`     |
| Build variable       | `NEXT_PUBLIC_ROOT_DOMAIN = schoolhubja.com` (or `anchorpointja.com` for dev) |

Then add the runtime secrets (`DATABASE_URL`, `AUTH_SECRET`) under the Worker's
Settings → Variables and Secrets. After saving, re-run the build — it will build
this app instead of failing on the repo root.

> `wrangler.toml` sets the Worker `name = "business-tracker"` to match that
> service. Rename it (and the service) if you'd prefer a dedicated `schoolhub`
> Worker.

---

## 5. DNS & domains

The platform needs the apex, `www`, the `app` admin subdomain, and a **wildcard**
for school subdomains, all routed to the Worker.

1. Add the domain to Cloudflare (proxied / orange-cloud).
2. **Custom Domains** (Worker → Settings → Domains & Routes → Add): add
   `anchorpointja.com`, `www.anchorpointja.com`, and `app.anchorpointja.com`.
   Cloudflare provisions DNS + TLS for each automatically.
3. **Wildcard subdomains:** add a proxied wildcard DNS record (e.g. `CNAME *`
   → the zone apex, proxied) and a Worker **Route** `*.anchorpointja.com/*`
   bound to the Worker. Cloudflare's Universal SSL covers `*.anchorpointja.com`
   (one subdomain level), so `kingston-college.anchorpointja.com` gets HTTPS.
4. For **production**, repeat for `schoolhubja.com` and set the build variable
   `NEXT_PUBLIC_ROOT_DOMAIN=schoolhubja.com`.

Once routed, a school with subdomain `kingston-college` is live at
`https://kingston-college.<root-domain>` with no per-school DNS.

### School custom domains (Premium plan)

1. The school points their domain at the Worker — simplest is to add their
   hostname (e.g. `www.school.edu.jm`) as a **Custom Domain** on the Worker
   (Cloudflare issues the cert), or a Route if the zone is on Cloudflare.
2. In the admin dashboard → Settings → *Web address & plan* (super-admin):
   set **Plan = Premium** and enter the **Custom domain**. The middleware matches
   the incoming `Host` against `School.customDomain` (both `www.` and apex
   variants) and serves that school's site.

---

## 6. Local development

```bash
cd schoolhub
cp .env.example .env            # set AUTH_SECRET etc.

# Option 1: an ephemeral local MongoDB replica set (downloads mongod once):
npm run db:local                # leave running; prints the DATABASE_URL to use
# Option 2: point DATABASE_URL at a MongoDB Atlas cluster.

npm run db:reset                # push schema + seed sample data
npm run dev                     # http://localhost:3000
```

Visit the marketing site at `localhost:3000`, a school at
`kingston-college.localhost:3000`, and the dashboard at `app.localhost:3000`.

---

## 7. Where billing would plug in

Billing is deferred. When adding it (e.g. Stripe): create a `Subscription`
collection linked to `School`, gate `plan = PREMIUM` (and custom-domain support)
on an active subscription, add Stripe Checkout from `/pricing`, and a webhook
under `app/api/`. Plan prices already live in `lib/constants.ts` (`PLAN_INFO`).

---

## 8. Security checklist before going live

- [ ] Set a strong, unique `AUTH_SECRET` (rotating it logs everyone out).
- [ ] Change `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` and re-seed, or update
      the super-admin password in the database.
- [ ] Store `DATABASE_URL` / `AUTH_SECRET` as Worker **secrets**, never in
      `wrangler.toml`.
- [ ] **Sanitize school-authored HTML.** The About and Admissions fields render
      via `dangerouslySetInnerHTML` so school admins can use basic formatting.
      Since admins edit only their own tenant this is low-risk, but for defence
      in depth, sanitize this HTML on save (e.g. `sanitize-html` / `DOMPurify`)
      in the settings/admissions server actions before production.
- [ ] Lock Atlas network access down from `0.0.0.0/0` once Accelerate egress is
      confirmed.

---

## 9. Note on the existing AnchorPoint Business Tracker page

anchorpointja.com previously served a static download page for the Business
Tracker desktop app. That page is preserved in this app at **`/download`**
(`app/(marketing)/download`), so existing download links keep working while
anchorpointja.com hosts SchoolHub Jamaica during development.
