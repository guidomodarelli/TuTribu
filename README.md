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

- Next.js 16 (App Router) and React 19 with TypeScript
- Better Auth with Google OAuth
- Neon Postgres accessed through Drizzle ORM and `pg`
- shadcn/ui components on top of Radix UI primitives
- SCSS Modules with BEM (Tailwind reserved for shadcn/ui base setup only)
- Sonner for toast notifications
- Jest + React Testing Library for unit/integration tests; Playwright for E2E

## Prerequisites

- Node.js 20.x or newer (required by Next.js 16)
- npm 10.x or newer
- Access to a Neon Postgres database
- Google OAuth credentials for sign-in

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example` and fill in the values (see [Environment](#environment)).
3. Apply database migrations:

   ```bash
   npm run db:migrate
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server with hot reload. |
| `npm run build` | Build the production bundle. |
| `npm run build:cloudflare` | Build the Cloudflare Workers bundle with OpenNext. |
| `npm run preview:cloudflare` | Build and preview the app locally in the Cloudflare Workers runtime. |
| `npm run deploy:cloudflare` | Build and deploy the app to Cloudflare Workers. |
| `npm run upload:cloudflare` | Build and upload a new Cloudflare Workers version without deploying it. |
| `npm run cf-typegen` | Generate Cloudflare binding types from `wrangler.jsonc`. |
| `npm start` | Run the production build locally. |
| `npm run ci` | Run the full GitHub Actions quality gate: lint, typecheck, Jest, and build. |
| `npm run lint` | Run ESLint across the repo. |
| `npm run typecheck` | Run `tsc --noEmit` over production code. |
| `npm test` | Run Jest unit and integration tests. |
| `npm run test:watch` | Run Jest in watch mode. |
| `npm run test:e2e` | Run Playwright E2E tests. |
| `npm run test:e2e:ui` | Run Playwright with the interactive UI runner. |
| `npm run db:migrate` | Apply pending SQL migrations to the configured Neon database. |
| `npm run db:migrate:force` | Force a Drizzle push. Use only when an intentional override is required. |

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
npm test              # Unit + integration (Jest)
npm run test:watch    # Jest in watch mode
npm run test:e2e      # Playwright E2E
```

Before closing any task, both of the following must pass:

```bash
npm run typecheck
npm run lint
```

## Deployment targets

GitHub Actions runs `npm run ci` on push and pull request as the full quality gate. Vercel remains the default Next.js deployment target and continues to use `npm run build`.

Cloudflare Workers is supported through `@opennextjs/cloudflare` and `wrangler.jsonc`. Use the Cloudflare-specific scripts instead of invoking `wrangler` directly for the Next.js app:

```bash
npm run build:cloudflare
npm run preview:cloudflare
npm run deploy:cloudflare
```

OpenNext warns that Windows local builds can hit runtime-specific failures. Prefer Linux, WSL with Node.js installed, or the Cloudflare build environment for final Cloudflare validation.

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
- `components/ui/*` — generated by shadcn/ui CLI only.
- `components/<scope>/<component>/{index.tsx,styles.module.scss}` — custom presentational components.
- `lib/*` — framework-safe helpers, UI utilities, and client-only adapters. Off-limits to `application` and `domain`.
- `database/migrations/*` — versioned SQL migrations (source of truth for schema and RLS policies).
- `docs/architecture/*.htm` — authoritative architectural decisions. Conflicts with `AGENTS.md` resolve in favor of `docs/architecture`.
