# SchoolHub Jamaica

A multi-tenant website platform that gives Jamaican high schools a professional
online presence — announcements, academic calendars, admissions information,
staff directories, events, student achievements and alumni engagement — managed
through a simple dashboard with hosting and maintenance handled for them.

Each school gets either a **subdomain** (`yourschool.schoolhubja.com`) on the
Standard plan, or its **own custom domain** (`www.yourschool.edu.jm`) on the
Premium plan. During development the platform runs on **anchorpointja.com**.

> This app lives in `schoolhub/` and is independent of the AnchorPoint Business
> Tracker desktop app at the repository root.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** + **React 18**
- **Tailwind CSS** for styling (per-school theming via CSS variables)
- **Prisma** ORM with **SQLite** for local dev (swap to Postgres for production)
- **jose** (JWT) + **bcryptjs** for cookie-session admin auth
- **zod** for input validation

Server Components + Server Actions throughout, so the data layer is clean and
ready for a future mobile app to consume via additional API routes.

## How multi-tenancy works

`middleware.ts` inspects the request `Host` header and rewrites the URL:

| Host                                   | Renders                                  |
| -------------------------------------- | ---------------------------------------- |
| `anchorpointja.com` / `www.…`          | Marketing site (`app/(marketing)`)       |
| `app.anchorpointja.com`                | Admin dashboard (`app/dashboard`)        |
| `kingston-college.anchorpointja.com`   | That school's site (`app/s/[domain]`)    |
| `www.standrewhigh.example` (custom)    | That school's site, matched by domain    |

The root domain is configured by `NEXT_PUBLIC_ROOT_DOMAIN` (default
`anchorpointja.com`; set to `schoolhubja.com` in production). Locally the
middleware also treats `localhost` as the root, so `kingston-college.localhost`
works out of the box.

## Local development

```bash
cd schoolhub
cp .env.example .env          # adjust AUTH_SECRET etc.
npm install
npm run db:reset              # create + seed the SQLite database
npm run dev                   # http://localhost:3000
```

Then open:

- Marketing site: <http://localhost:3000>
- Sample school: <http://kingston-college.localhost:3000>
- Premium sample: <http://st-andrew-high.localhost:3000>
- Admin dashboard: <http://app.localhost:3000>

> Most browsers resolve `*.localhost` to `127.0.0.1` automatically. If yours
> doesn't, add entries to `/etc/hosts`.

### Seeded accounts

| Role          | Email                       | Password       | Manages              |
| ------------- | --------------------------- | -------------- | -------------------- |
| Super-admin   | `admin@schoolhubja.com`     | `changeme123`  | The whole platform   |
| School admin  | `kc-admin@schoolhubja.com`  | `password123`  | Kingston College     |
| School admin  | `sah-admin@schoolhubja.com` | `password123`  | St. Andrew High      |

(The super-admin credentials come from `SUPERADMIN_EMAIL` /
`SUPERADMIN_PASSWORD` in `.env`.)

## Scripts

| Command              | Description                                        |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | Start the dev server                               |
| `npm run build`      | Generate the Prisma client and build for prod      |
| `npm run start`      | Start the production server                        |
| `npm run typecheck`  | TypeScript type-check                              |
| `npm run db:push`    | Sync the schema to the database                    |
| `npm run db:seed`    | Seed sample data                                   |
| `npm run db:reset`   | Drop, recreate and seed the database               |
| `npm run db:studio`  | Open Prisma Studio                                 |

## Project structure

```
schoolhub/
├── app/
│   ├── (marketing)/        Marketing site (landing, features, pricing, contact)
│   ├── s/[domain]/         Per-school public sites (themed per school)
│   ├── dashboard/          Admin CMS (login, school picker, protected CRUD)
│   ├── layout.tsx          Root layout
│   └── globals.css         Tailwind + component classes + brand CSS vars
├── components/             marketing / site / dashboard / ui components
├── lib/                    db, auth, tenant resolution, context, constants, format
├── prisma/                 schema.prisma + seed.ts
├── middleware.ts           Multi-tenant host routing
└── docs/DEPLOYMENT.md      Hosting + DNS (anchorpointja.com & custom domains)
```

## Subscriptions / billing

Plans (Standard = subdomain, Premium = custom domain) are modelled in code
(`lib/constants.ts`, the `School.plan` field) and shown on the pricing page.
**Payment integration is intentionally deferred** — schools are onboarded by a
super-admin for now. See `docs/DEPLOYMENT.md` for where Stripe would slot in.

## Going to production

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for deploying to
anchorpointja.com (dev) or schoolhubja.com (prod), configuring wildcard DNS,
connecting school custom domains, and switching from SQLite to Postgres.
