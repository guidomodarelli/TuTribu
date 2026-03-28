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

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Use a strong random value for `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key used by the server-side auth integration.

Local example:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxx
```

## Supabase Auth Setup

This project uses Supabase Auth with Google OAuth through SSR cookies.

Before testing sign-in locally:

1. Enable Google as an auth provider in the Supabase project.
2. Add `http://localhost:3000` to the allowed site URLs/origins.
3. Add `http://localhost:3000/auth/callback` to the redirect allow list.

Security notes:

- Never commit real secrets to the repository.
- Keep service-role keys and provider secrets out of the browser.
- Configure Google provider credentials in Supabase, not in the app runtime.

## Structure

- `app/*` contains App Router entrypoints and route composition.
- `src/modules/*` contains domain, application, and infrastructure code.
- `components/*` contains presentational components.
- `lib/*` contains framework-safe helpers and UI utilities.
