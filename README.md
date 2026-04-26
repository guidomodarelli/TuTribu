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

Use a strong random value for `BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Local example:

```dotenv
DATABASE_URL=postgresql://user:password@host-pooler.region.aws.neon.tech/database?sslmode=require&channel_binding=require
DATABASE_MIGRATION_URL=postgresql://user:password@host.region.aws.neon.tech/database?sslmode=require&channel_binding=require
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-a-strong-random-secret
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
```

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
