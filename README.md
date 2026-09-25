# TuTribu

TuTribu is a Next.js App Router application built around hexagonal architecture and module-scoped features.

## Repo rules

- Read [`AGENTS.md`](./AGENTS.md) before editing code.
- Read [`DESIGN.md`](./DESIGN.md) before creating or changing UI.
- Review [`docs/architecture/*.htm`](./docs/architecture) before changes that affect architecture, authentication, authorization, provider integrations, data flow, or modular structure.
- Keep all technical names in English.
- Keep user-facing product text in Spanish.
- Prefer `src/modules/<feature>/{domain,application,infrastructure}` for business code.

## Stack

- Next.js 16 (App Router) and React 19 with TypeScript 7
- Better Auth with Google OAuth
- Neon Postgres accessed through Drizzle ORM and `pg`
- beez-ui shared components (customized shadcn/ui, Base UI and Radix UI)
- SCSS Modules with BEM (Tailwind reserved for beez-ui base setup only)
- Sonner for toast notifications
- Vitest + React Testing Library for unit/integration tests; Playwright for E2E

## Prerequisites

- Node.js 24.21.0 (pinned in `.nvmrc`; use `fnm use` or `nvm use`)
- pnpm 12 (pinned through `packageManager`; run `corepack enable` and the pinned version is used automatically)
- Access to a Neon Postgres database
- Google OAuth credentials for sign-in

## Setup

1. Install dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

2. Create `.env.local` from `.env.example` and fill in the values (see [Environment](#environment)).
3. Apply database migrations:

   ```bash
   pnpm run db:migrate
   ```

4. Start the dev server through portless (restarts the proxy on the `app` TLD, adds `dev-tutribu.app` to the hosts file the first time, trusts the local CA and runs `next dev`):

   ```bash
   pnpm run dev
   ```

   The app is then served at `https://dev-tutribu.app`. Use `pnpm run dev -- --dry-run` to see the steps without changing anything.

## Scripts

| Script | Description |
| --- | --- |
| `pnpm run dev` | Start the Next.js dev server through portless at `https://dev-tutribu.app` (proxy restart, hosts entry, CA trust, `next dev` with hot reload). Accepts `--dry-run`. |
| `pnpm run dev:next` | Bare `next dev` on a plain port. Reserved for the Playwright web server of the e2e suite; use `pnpm run dev` for manual work. |
| `pnpm run build` | Build the production bundle. |
| `pnpm run build:cloudflare` | Build the Cloudflare Workers bundle with OpenNext. |
| `pnpm run preview:cloudflare` | Build and preview the app locally in the Cloudflare Workers runtime. |
| `pnpm run deploy:cloudflare` | Build and deploy the app to Cloudflare Workers. |
| `pnpm run upload:cloudflare` | Build and upload a new Cloudflare Workers version without deploying it. |
| `pnpm run cf-typegen` | Generate Cloudflare binding types from `wrangler.jsonc`. |
| `pnpm start` | Run the production build locally. |
| `pnpm run ci` | Run the full quality gate (also run by the Husky `pre-push` hook): lint, application/test type checks, Vitest, and Next.js build. |
| `pnpm run lint` | Run ESLint across the repo. |
| `pnpm run typecheck` | Run `tsc --noEmit` over production code. |
| `pnpm test` | Run Vitest unit and integration tests. |
| `pnpm run test:watch` | Run Vitest in watch mode. |
| `pnpm run test:e2e` | Run Playwright E2E tests. |
| `pnpm run test:e2e:ui` | Run Playwright with the interactive UI runner. |
| `pnpm run db:migrate` | Apply pending SQL migrations to the configured Neon database. |
| `pnpm run db:migrate:force` | Force a Drizzle push. Use only when an intentional override is required. |

## Environment

Create `.env.local` from `.env.example` and provide:

- `DATABASE_URL`: runtime Postgres connection string. Use the direct Neon URL for warm runtime environments. Do not use the `-pooler` host here unless the deployment explicitly needs PgBouncer-style transaction pooling.
- `DATABASE_MIGRATION_URL`: optional direct Postgres connection string for migrations and tooling.
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CONTACT_EMAIL`: optional contact email shown when tribe creation is not available. Leave it empty to hide the contact action.

Generate a strong random value for `BETTER_AUTH_SECRET`.

PowerShell (Windows):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Cross-platform via Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

POSIX shells with OpenSSL available:

```bash
openssl rand -base64 32
```

Local example (illustrative only — use least-privilege credentials for `DATABASE_URL` once available, and reserve owner/migration credentials for `DATABASE_MIGRATION_URL`):

```dotenv
DATABASE_URL=postgresql://user:password@host.region.aws.neon.tech/database?sslmode=verify-full&channel_binding=require
DATABASE_MIGRATION_URL=postgresql://user:password@host.region.aws.neon.tech/database?sslmode=verify-full&channel_binding=require
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-a-strong-random-secret
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
TUTRIBU_BACKEND_BASE_URL=
CONTACT_EMAIL=soporte@example.com
```

Neon role and schema guidance:

- Using Neon's default database owner and the `public` schema is acceptable for local development and early project setup.
- Keep `public` unless the application needs stronger separation between apps, modules, tenants, or permission scopes within the same database.
- For production-like environments, prefer separate credentials by responsibility: `DATABASE_URL` should use a runtime role with limited permissions over a direct Neon connection, while `DATABASE_MIGRATION_URL` can use the owner or migration role needed for schema changes.
- Do not run the application runtime with an owner/admin role once least-privilege credentials are available.
- Scheduled maintenance (the orphan-image cleanup cron at `/api/maintenance/image-cleanup` and the event-reminder and notification-purge cron at `/api/maintenance/event-reminders`) drives owner-only `SECURITY DEFINER` functions whose `EXECUTE` the migrations hold to the schema owner or a dedicated maintenance role, never the shared request role. So that the sweep does not fail with `permission denied` when `DATABASE_URL` is the least-privilege runtime role, set `DATABASE_MAINTENANCE_URL` to a connection whose role retains `EXECUTE` on those functions (the owner or a dedicated maintenance role). When it is unset, maintenance falls back to `DATABASE_MIGRATION_URL` and then to `DATABASE_URL`, which only works where the runtime role already owns the schema (local and early setup).
- To keep Neon warm, disable Scale to Zero in the Neon compute settings when the plan supports it. Free plan computes keep the fixed Scale to Zero behavior.
- Runtime Postgres pools use explicit connection, idle, and lifetime limits so serverless instances do not keep broad direct pools alive indefinitely.

## Better Auth Setup

This project uses Better Auth with Google OAuth and Neon Postgres through Drizzle and `pg`.

Before testing sign-in locally:

1. Configure OAuth 2.0 Client ID credentials in Google Cloud Console (APIs & Services → Credentials).
2. Add the credentials to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
3. Under **Authorized JavaScript origins**, add `http://localhost:3000`.
4. Under **Authorized redirect URIs**, add `http://localhost:3000/api/auth/callback/google`.

Security notes:

- Never commit real secrets to the repository.
- Rotate any database password that was pasted into chat, logs, or issue trackers before using it.
- Keep database URLs, OAuth secrets, and Better Auth secrets out of the browser.
- Better Auth session reads retry one transient `FAILED_TO_GET_SESSION` response before surfacing the failure, which protects requests from stale or restarted database connections without hiding persistent schema or credential errors.

## Testing

TDD is mandatory for every feature, bug fix, and architectural change. The sequence is always `testing → code → refactor → green`. See [`AGENTS.md`](./AGENTS.md) for the full TDD policy and per-layer testing responsibilities.

Day-to-day commands:

```bash
pnpm test              # Unit + integration (Vitest)
pnpm run test:watch    # Vitest in watch mode
pnpm run test:e2e      # Playwright E2E
```

Before closing any task, both of the following must pass:

```bash
pnpm run typecheck
pnpm run lint
```

## Deployment targets

A Husky `pre-commit` hook runs lint-staged on every commit (ESLint and related Vitest suites for staged scripts, both type checks when TypeScript changes, and, through `scripts/pre-commit-migration-guardrails.mjs`, the SQL guardrail suites against a snapshot of the staged index whenever migrations are added, modified or deleted, plus, through `scripts/pre-commit-typescript-deletions.mjs`, both type checks against that snapshot when a commit only deletes TypeScript files). A Husky `pre-push` hook runs the full `pnpm run ci` gate before every push, only for the clean checked-out `HEAD`: pushing any other branch or commit, or `HEAD` with uncommitted or untracked changes, fails, so check out that branch with a clean working tree first and push again; there is no GitHub Actions gate. Vercel remains the default Next.js deployment target and continues to use `pnpm run build` with deployment environment variables available.

Cloudflare Workers is supported through `@opennextjs/cloudflare` and `wrangler.jsonc`. Use the Cloudflare-specific scripts instead of invoking `wrangler` directly for the Next.js app:

```bash
pnpm run build:cloudflare
pnpm run preview:cloudflare
pnpm run deploy:cloudflare
```

OpenNext warns that Windows local builds can hit runtime-specific failures. Prefer Linux, WSL with Node.js installed, or the Cloudflare build environment for final Cloudflare validation.

The orphan-image cleanup sweep runs as a scheduled job on both targets against `/api/maintenance/image-cleanup`: Vercel installs it from `vercel.json`, and Cloudflare installs the matching schedule from `wrangler.jsonc` (`triggers.crons`) through the `cloudflare/worker.ts` entrypoint. Configure `CRON_SECRET` as a Cloudflare Worker secret so the scheduled sweep is authorized; without it the sweep is skipped and the cron fails visibly. Keep both schedules in sync. See `docs/architecture/deployment-targets.htm`.

Notes:

- Never colocate test files under `app/` — App Router can treat colocated special files as route artifacts.
- When functionality changes, add or update tests in the same work item.
- Prefer mocks at the port boundary, not at low-level vendor internals, unless the test targets an adapter.

## Structure

- `app/*` — App Router entrypoints and route composition (Server Components by default).
- `src/modules/<feature>/{domain,application,infrastructure}` — business code organized by vertical slice following hexagonal architecture. Dependencies always point inward.
  - `domain/` — entities, value objects, ports. No framework or infrastructure details.
  - `application/` — use cases, commands, queries, results.
  - `infrastructure/` — adapters for auth, persistence, HTTP clients, and provider SDKs. Owns external DTOs and their mappers.
- `src/modules/shared/*` — cross-module shared code (e.g. `infrastructure/database/`).
- `beez-ui` — shared UI implementation, maintained in the sibling repository. Import named components from the package root.
- `beez-ui@^0.5.5` — shared UI package installed from npm, with its exact version and integrity pinned in `pnpm-lock.yaml`; see [the shared UI contract](docs/architecture/shared-ui-library.htm).
- `components/<scope>/<component>/{index.tsx,styles.module.scss}` — custom presentational components.
- `lib/*` — framework-safe helpers, UI utilities, and client-only adapters. Off-limits to `application` and `domain`.
- `database/migrations/*` — versioned SQL migrations (source of truth for schema and RLS policies).
- `docs/architecture/*.htm` — authoritative architectural decisions. Conflicts with `AGENTS.md` resolve in favor of `docs/architecture`.
