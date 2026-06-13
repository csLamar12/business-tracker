# Deployment & DNS — SchoolHub Jamaica

This guide covers hosting the platform, wiring up wildcard subdomains on
**anchorpointja.com** (development) and **schoolhubja.com** (production), and
connecting a school's own **custom domain** (Premium plan).

---

## 1. Environment variables

| Variable                  | Dev value              | Prod value          | Notes                                              |
| ------------------------- | ---------------------- | ------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `anchorpointja.com`    | `schoolhubja.com`   | The platform root; tenant subdomains hang off it.  |
| `DATABASE_URL`            | `file:./dev.db`        | Postgres URL        | See §5 to switch to Postgres.                      |
| `AUTH_SECRET`             | any long random string | strong random value | Signs admin session cookies. Generate with the cmd below. |
| `SUPERADMIN_EMAIL`        | `admin@schoolhubja.com`| your address        | Seeded super-admin login.                          |
| `SUPERADMIN_PASSWORD`     | `changeme123`          | strong password     | Change before any real deploy.                     |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 2. Hosting on Vercel (recommended)

Next.js middleware-based multi-tenancy is a first-class Vercel pattern.

1. Import the repo into Vercel and set the **Root Directory** to `schoolhub`.
2. Add the environment variables from §1 (Production + Preview).
3. Deploy. The default `*.vercel.app` URL serves the marketing site.

### Domains to add in Vercel → Project → Settings → Domains

For the **dev** root `anchorpointja.com`:

- `anchorpointja.com` (apex)
- `www.anchorpointja.com`
- `app.anchorpointja.com` (admin dashboard)
- `*.anchorpointja.com` (**wildcard** — every school subdomain)

> Adding a `*.` wildcard domain on Vercel requires verifying the domain with
> Vercel's nameservers, or adding the wildcard via the API/Domains UI. Vercel
> then terminates SSL for all subdomains automatically.

For **production** repeat with `schoolhubja.com` and flip
`NEXT_PUBLIC_ROOT_DOMAIN` to `schoolhubja.com`.

---

## 3. DNS records

### Wildcard subdomains (the platform itself)

At your DNS provider for `anchorpointja.com` (and later `schoolhubja.com`):

| Type    | Name              | Value                  | Purpose                       |
| ------- | ----------------- | ---------------------- | ----------------------------- |
| `A`/`ALIAS` | `@`           | Vercel apex target     | Marketing site (apex)         |
| `CNAME` | `www`             | `cname.vercel-dns.com` | Marketing site                |
| `CNAME` | `app`             | `cname.vercel-dns.com` | Admin dashboard               |
| `CNAME` | `*`               | `cname.vercel-dns.com` | All school subdomains         |

(Exact target values are shown by Vercel when you add each domain. On a VPS
instead of Vercel, point these records at your server's IP and run the app
behind a reverse proxy with a wildcard TLS certificate, e.g. Caddy or
nginx + a wildcard Let's Encrypt cert.)

Once DNS resolves, a school with subdomain `kingston-college` is live at
`https://kingston-college.anchorpointja.com` — no per-school DNS needed.

---

## 4. Connecting a school's custom domain (Premium plan)

Two sides have to agree: DNS (the school) and the platform record (you).

**The school** adds one record at *their* domain registrar:

| Type    | Name  | Value                  |
| ------- | ----- | ---------------------- |
| `CNAME` | `www` | `cname.vercel-dns.com` |

(For an apex like `school.edu.jm` with no `www`, use an `A`/`ALIAS` record to
the platform's apex target instead.)

**You** then:

1. Add the domain (e.g. `www.school.edu.jm`) to the Vercel project's Domains so
   Vercel issues an SSL certificate for it.
2. In the admin dashboard → **Settings → Web address & plan** (super-admin):
   set the school's **Plan = Premium** and enter the **Custom domain**
   (`www.school.edu.jm`). The value is normalised and stored on `School.customDomain`.

The middleware matches the incoming `Host` against `School.customDomain` (it
tries both the `www.` and apex variants) and renders that school's site.

---

## 5. SQLite → Postgres for production

SQLite is used locally so the app runs with zero services. For production:

1. In `prisma/schema.prisma` change the datasource:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Set `DATABASE_URL` to your Postgres connection string (Vercel Postgres,
   Neon, Supabase, RDS, etc.).
3. Create the schema and (optionally) seed:

   ```bash
   npx prisma migrate deploy      # or: npx prisma db push
   npm run db:seed                # optional sample data
   ```

The "enum-like" string fields (`plan`, `role`, calendar `category`) are
validated in the app layer (`lib/constants.ts`) and work identically on
Postgres. You may optionally promote them to native Postgres enums later.

---

## 6. Where billing would plug in

Billing is deferred. When you add it (e.g. Stripe):

- Create a `Subscription` model linked to `School`, and gate `plan = PREMIUM`
  (and therefore custom-domain support) on an active subscription.
- Add a Stripe Checkout flow from the marketing **/pricing** page and a webhook
  route under `app/api/` to keep subscription status in sync.
- The plan metadata in `lib/constants.ts` (`PLAN_INFO`) already holds prices.

---

## 7. Security checklist before going live

- [ ] Set a strong, unique `AUTH_SECRET` (rotating it logs everyone out).
- [ ] Change `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` and re-seed, or update
      the super-admin password in the database.
- [ ] **Sanitize school-authored HTML.** The About and Admissions fields render
      via `dangerouslySetInnerHTML` so school admins can use basic formatting.
      Since admins edit only their own tenant this is low-risk, but for defence
      in depth, sanitize this HTML on save (e.g. `sanitize-html` / `DOMPurify`)
      in the settings/admissions server actions before production.
- [ ] Serve everything over HTTPS (automatic on Vercel).

## 8. Note on the existing AnchorPoint Business Tracker page

anchorpointja.com previously served a static download page for the Business
Tracker desktop app. That page is preserved in this app at **`/download`**
(`app/(marketing)/download`), so existing download links keep working while
anchorpointja.com hosts SchoolHub Jamaica during development.
