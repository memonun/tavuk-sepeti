# Tavuk Sepeti — Admin CRM

Admin-first delivery CRM for a Turkish dairy/eggs operation
(süt / yumurta / peynir / yoğurt). Replaces a WordPress + Excel + manual
coordinate-entry workflow with a single dashboard: customers, orders, a
state-machine-backed order lifecycle, an auto-geocoding pipeline (with
admin pin correction), a clustered map view, and a daily delivery route
optimized via Google Directions plus a mobile-first driver mode.

> **Spec is the source of truth.** Read [`SPEC.md`](./SPEC.md) before any
> non-trivial change. Repo-wide rules live in [`CLAUDE.md`](./CLAUDE.md);
> they map 1:1 to SPEC.md §11 and are not negotiable on a per-PR basis.

## Stack

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript** strict
  + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- **Supabase** (Postgres 15 + PostGIS + Auth + RLS) — cloud only; no local stack
- **Zod** at every boundary; `Result<T, E>` over try/catch in domain + application
- **pino** structured logger with PII redaction
- **shadcn/ui** primitives (base-nova) on **Tailwind 4**
- **react-hook-form** + Zod resolver for forms
- **TanStack Table v8** for paginated lists
- **@vis.gl/react-google-maps** + `@googlemaps/markerclusterer` + Google
  Maps Platform (Geocoding + Directions + Maps JavaScript API)
- **Vitest** (unit + a couple of live-DB integration tests gated by
  real-key heuristic so CI skips them)

Architecture is feature-first DDD-lite: code lives under
`features/<domain>/{domain,application,infrastructure,ui}` with
ESLint-enforced layering — `ui → application → domain`, infrastructure
implements domain ports, cross-feature only via `application/`. See
[`SPEC.md` §5](./SPEC.md) for the full rules.

## Prerequisites

| Tool | Why |
|---|---|
| Node ≥ 20.18 < 23 | Next.js + scripts |
| pnpm 10 | Package manager (use the pinned version in `package.json#packageManager`) |
| Docker Desktop _(optional)_ | Required only for `pnpm db:types` (Supabase CLI introspection) |
| Supabase CLI ≥ 2.95 | Migrations + type generation |

## Initial setup

1. Clone and install:
   ```bash
   pnpm install
   ```

2. Copy [`.env.example`](./.env.example) to `.env`, fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` (Supabase project → Settings → API)
   - `SUPABASE_DB_URL` (transaction pooler — port 6543) and
     `SUPABASE_DIRECT_URL` (session pooler on the pooler hostname,
     port 5432 — IPv4-compatible). See [`SPEC.md` §10](./SPEC.md).
   - `GOOGLE_MAPS_SERVER_KEY` (Geocoding + Directions enabled, no
     referrer restriction) and `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`
     (Maps JavaScript API only, HTTP-referrer restricted)
   - `WAREHOUSE_LAT` + `WAREHOUSE_LNG` for routing
   - `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` once you've created a cloud-based
     Map Style — see [`docs/maps/README.md`](./docs/maps/README.md).

3. Apply migrations to your Supabase project:
   ```bash
   pnpm db:push
   ```

4. (Optional but recommended) regenerate types from the live schema:
   ```bash
   pnpm db:types     # Docker must be running
   ```

5. Provision the first admin user (auth + auto-bootstrapped `app_users`
   row via migration 014's trigger):
   ```bash
   node --env-file=.env scripts/create-admin.mjs admin@example.com 'StrongPassword'
   ```

6. Start the dev server:
   ```bash
   pnpm dev
   ```

   Visit [http://localhost:3000](http://localhost:3000) → you'll be
   redirected to `/login`. Sign in with the admin you just provisioned.

## Common commands

| Script | What |
|---|---|
| `pnpm dev` | Next dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm verify` | Typecheck + ESLint + Vitest (CI-equivalent local gate) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint flat config |
| `pnpm test` | Vitest run-once |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm db:push` | Apply pending migrations to the remote DB (uses `SUPABASE_DIRECT_URL`) |
| `pnpm db:types` | Regenerate `shared/supabase/types.ts` from the live schema (requires Docker) |

## Repo layout

```
app/                    Next App Router pages (route groups: (admin), login)
features/               Domain features (each: domain/application/infrastructure/ui)
  auth/                 Sign-in / sign-out / session helpers
  customers/            CRUD + search; address pin corrector
  geocoding/            Google Geocoding wrapper + cache + quota guard
  map/                  Clustered customer pins overview
  orders/               Order CRUD + state machine + audit timeline
  products/             Fixed catalog (seeded in migration 003)
  routing/              Daily route optimization + driver mode + geolocation popup
shared/                 Cross-cutting utilities — never imports features/
  audit/                logAudit() helper backed by audit_log table
  errors/               AppError + ErrorCode + ApiResult envelope
  geo/                  Coordinate types + Haversine helper
  supabase/             SSR / admin / browser clients + generated types
  utils/                date / money / phone formatters (tr-TR + Europe/Istanbul)
supabase/migrations/    14-digit timestamp-prefixed migrations applied via supabase CLI
docs/                   Long-form notes; not code
  maps/                 Cloud-based Map Style JSON + Cloud Console walkthrough
tests/                  Integration tests (RLS smoke); unit tests live next to code
```

## Where things are documented

- [`SPEC.md`](./SPEC.md) — full project specification, source of truth
- [`CLAUDE.md`](./CLAUDE.md) — repo rules (no `console.log`, RLS on every table,
  Zod at every boundary, kuruş-only money, etc.)
- [`docs/maps/README.md`](./docs/maps/README.md) — Google Cloud Map Style setup

## License

Private. No license granted.
