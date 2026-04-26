# AcademiaOnline

AcademiaOnline is a Next.js App Router application built around hexagonal architecture and module-scoped features.

## Repo rules

- Read [`AGENTS.md`](./AGENTS.md) before editing code.
- Keep all technical names in English.
- Keep user-facing product text in Spanish.
- Prefer `src/modules/<feature>/{domain,application,infrastructure}` for business code.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:e2e
```

## Environment

Create `.env.local` from `.env.example` and provide:

- `DATABASE_URL`: runtime Postgres connection string. Use the pooled Neon URL for deployed runtime environments.
- `DATABASE_MIGRATION_URL`: optional direct Postgres connection string for migrations and tooling.
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ACADEMIA_BACKEND_BASE_URL`: optional absolute URL for a separated AcademiaOnline backend. Leave it empty when Next.js resolves backend routes internally. It must use HTTPS, except for local `http://localhost` or `http://127.0.0.1` development URLs.
- `CONTACT_EMAIL`: optional contact email shown when community creation is not available. Leave it empty to hide the contact action.

Use a strong random value for `BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Local example:

```dotenv
DATABASE_URL=postgresql://user:password@host-pooler.region.aws.neon.tech/database?sslmode=verify-full&channel_binding=require
DATABASE_MIGRATION_URL=postgresql://user:password@host.region.aws.neon.tech/database?sslmode=verify-full&channel_binding=require
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-a-strong-random-secret
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
ACADEMIA_BACKEND_BASE_URL=
CONTACT_EMAIL=soporte@example.com
```

Neon role and schema guidance:

- Using Neon's default database owner and the `public` schema is acceptable for local development and early project setup.
- Keep `public` unless the application needs stronger separation between apps, modules, tenants, or permission scopes within the same database.
- For production-like environments, prefer separate credentials by responsibility: `DATABASE_URL` should use a runtime role with limited permissions, while `DATABASE_MIGRATION_URL` can use the owner or migration role needed for schema changes.
- Do not run the application runtime with an owner/admin role once least-privilege credentials are available.

## Better Auth Setup

This project uses Better Auth with Google OAuth and Neon Postgres through Drizzle and `pg`.

Before testing sign-in locally:

1. Configure Google OAuth credentials in Google Cloud Console.
2. Add the credentials to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
3. Add `http://localhost:3000` to the allowed app origin for local testing.

Security notes:

- Never commit real secrets to the repository.
- Rotate any database password that was pasted into chat, logs, or issue trackers before using it.
- Keep database URLs, OAuth secrets, and Better Auth secrets out of the browser.

## Structure

- `app/*` contains App Router entrypoints and route composition.
- `src/modules/*` contains domain, application, and infrastructure code.
- `components/*` contains presentational components.
- `lib/*` contains framework-safe helpers and UI utilities.
