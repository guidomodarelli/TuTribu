<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Reference Alignment

- Keep every technical name - variables, functions, methods, classes, files, paths, constants, layers, modules, and folders - in English, even if the surrounding explanation is in Spanish.
- This applies to technical names inside backticks as well.
- Keep user-facing product text in Spanish.
- Before creating or changing UI, read `DESIGN.md` and follow it as the product design system for this repository.

## 1. Security & Environment

### Security baseline

- Never hardcode secrets, OAuth credentials, refresh tokens, API keys, or user tokens in source code, tests, fixtures, screenshots, or documentation.
- Keep sensitive credentials only in environment variables and server-side secret storage.
- Treat Better Auth session cookies and any provider access or refresh tokens as server-only sensitive data. They must never be exposed to the browser, serialized in page props, or logged.
- Validate and sanitize all external input before it crosses into `application` or `domain`.
- Avoid leaking internal errors, stack traces, provider payloads, file identifiers, or token data in UI messages.

**rule file**: `.agentic-rules/nodejs/nodejs-security-patterns-rules_v1.md`

## 2. Core Architecture

### Documentation governance

- Keep documentation under `docs/` current for every implemented behavior, architectural decision, convention, and user-facing workflow.
- Product documentation under `docs/architecture/`, `docs/conventions/`, and `docs/user-manual/` must use `.htm` files and follow the guidelines defined in `docs/DESIGN.md`.
- Do not add, keep, or update Markdown product documents under `docs/`; migrate any stale `.md` document to `.htm` in the same work item before changing it.
- Repository control files that must remain Markdown for tooling compatibility, such as `AGENTS.md`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `DESIGN.md`, and `TODO.md`, are exempt from the `docs/` format rule.
- Place each documentation update in the section that owns the content: architecture decisions in `docs/architecture/`, project conventions in `docs/conventions/`, and user-facing instructions in `docs/user-manual/`.
- Whenever a change is undocumented, or documentation needs to be improved, modified, edited, transformed, added, deleted, relocated, redefined, restructured, or adjusted in any similar way, update the corresponding document in the same work item before closing the task.
- Do not close a task while the relevant `docs/` page is stale, missing, outside the required section, or in the wrong format.

### Internal flow manuals governance

- Mantener los manuales internos de `user-guides/` actualizados en el mismo trabajo que crea, modifica o elimina un flujo de la aplicación, sus permisos, condiciones de visibilidad, validaciones, límites, pagos, estados o recuperación ante errores.
- Antes de trabajar en un flujo, consultar el manual temático correspondiente y leer [user-guides/AGENTS.md](user-guides/AGENTS.md), que define la organización, el formato y las validaciones de estos manuales.
- Documentar cada tema en un archivo `.html` independiente. No volver a reunir todos los flujos en un único manual extenso; enlazar los recorridos relacionados entre temas.
- Usar [user-guides/index.html](user-guides/index.html) como menú principal. Actualizarlo junto con el manual afectado; conservar `user-guides/application-flows.html` para el índice detallado y la compatibilidad de enlaces anteriores.
- Si un flujo nuevo no tiene manual, crear el archivo temático y enlazarlo desde el menú. Si se mueve o elimina un flujo, actualizar sus referencias y evitar enlaces rotos o instrucciones obsoletas.
- Aplicar la skill `user-manual`, conservar la trazabilidad del código documentado y validar los archivos y su navegación según `user-guides/AGENTS.md` antes de cerrar el trabajo. Distinguir capturas reales de esquemas y funciones implementadas de capacidades sin recorrido disponible.
- Los manuales internos complementan la documentación bajo `docs/`; no reemplazan `docs/architecture/` como fuente de decisiones arquitectónicas ni cambian el formato `.htm` exigido allí. `AGENTS.md` sigue siendo un archivo de control Markdown.
- Un cambio sin efecto en los flujos documentados no exige reescribir manuales ajenos al cambio. No modificar su política de seguimiento, publicar, commitear ni subir los manuales sin instrucciones del usuario.

### Changelog governance

- Every change that alters product behavior, user-facing UI or copy, data handling, permissions, or deployed configuration must update `CHANGELOG.md` in the same work item.
- Add entries only inside the `## [Unreleased]` block, never under an already released version. Never write the version or the date by hand: `pnpm create-version` renames `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` in the version commit and leaves an empty `[Unreleased]` block on top. The date uses Argentina time (`releaseTimeZone: "America/Argentina/Buenos_Aires"` in `astra-rp.config.mjs`). This is the behavior of `@astra-kit/rp` 1.0.0: the release stops when `[Unreleased]` is missing or has no entries, unless `changelogDraft` drafts them first.
- Follow [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/): group entries only under these sections, in this order, omitting empty ones: `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`.
- Write one `- ` line per change, in Spanish, describing what changes for TuTribu users (members and tribe creators), without internal implementation details.
- Changes with no effect for users (tests, internal refactors, local tooling, agent instructions) do not need an entry.
- If `[Unreleased]` is missing or has no entries, `pnpm create-version` drafts them with Claude Code, or with Codex when Claude Code fails (`changelogDraft: true` in `astra-rp.config.mjs`), and writes them without confirmation: review them in the command output. When no agent can draft them, the release stops before the version commit; write the entries by hand in `[Unreleased]` and run the command again.
- `pnpm create-version` runs the shared `astra-rp create-version` command. Change TuTribu-specific release behavior (version type descriptions, CHANGELOG date time zone, migrations adapter, final summary) in `astra-rp.config.mjs`, and the shared engine in the astra-rp repository.

### Architecture documentation governance

- Always review the relevant `.htm` documents in `docs/architecture/` before proposing or implementing changes that affect architecture, authentication, authorization, provider integrations, data flow, modular structure, or backend boundaries.
- Treat `docs/architecture` as the source of truth for architectural decisions in this repository.
- If `AGENTS.md` and `docs/architecture` conflict, `docs/architecture` takes precedence and `AGENTS.md` must be updated to match it.
- If a work item changes an architectural decision, update the relevant file under `docs/architecture` in the same work item.
- Do not close a task that changes architecture or architectural constraints while leaving `docs/architecture` outdated.

### Mandatory architecture

- Use `~/hexagonal-architecture` as the implementation reference when there is any doubt about structure, boundaries, ports, adapters, DTO placement, or testing strategy.

### Migration mandate (Immediate cutover)

- `src/features` is deprecated and forbidden for new code.
- New and modified business code must live under `src/modules/<feature>/{domain,application,infrastructure}`.
- Any change that touches a route entrypoint importing from `src/features` must migrate that entrypoint to `src/modules` in the same work item.
- `src/features` cannot be used as an integration layer for new adapters; dependency composition must happen in `src/modules/<feature>/setup.ts`.
- Route entrypoints must consume use cases from `application` and must not import repository implementations directly.
- Add and keep a lint/static check (run by `pnpm run ci` locally and in GitHub Actions) that fails on imports matching `@/src/features/`.

### Target structure

```text
app/
  (marketing)/
  (platform)/
  api/
src/
  modules/
    <feature>/
      domain/
        entities/
        value-objects/
        repositories/
      application/
        commands/
        queries/
        results/
        use-cases/
      infrastructure/
        api/
          dto/
          mapper.ts
        auth/
        repositories/
        composition/
    shared/
      domain/
      application/
      infrastructure/
        database/
          server-database-client.ts
          schema.ts
components/
lib/
styles/
```

### Layer responsibilities

- `app/**/*`: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and `route.ts` are the composition roots. Prefer Server Components by default; add `"use client"` only when browser APIs, client state, or direct event handlers are required.
- `components/*`: presentational components by default.
- `infrastructure` also hosts the Better Auth integration.

## 3. Bootstrap Standards

### Framework baseline

- The project must be built with Next.js using App Router.
- Use the official CLI to initialize the repository.
- Preferred bootstrap command:

```bash
npx create-next-app@latest . --ts --eslint --tailwind --app --import-alias "@/*" --disable-git
```

- If the current directory is not compatible with direct initialization, scaffold into a temporary directory with the official CLI and then move the generated files into this repository without touching the existing `.git`.

### UI baseline

- Use `@astra-kit/ui` as the only shared component library consumed by product code. Exception: the platform shell is the Arc Pro "Sidebar rail" block adapted in `components/app-rail/app-rail-shell` (see "Arc Pro license"); it uses `radix-ui` primitives directly, on the same version `@astra-kit/ui` already installs. Do not use `radix-ui` elsewhere in product code.
- Group named imports from `@astra-kit/ui` (the `@astra-kit/ui` package published to npm); do not use component-specific subpaths. General-purpose hooks (`useIsMobile`, `useIsHydrated`, `useViewerTimeZone`, `useHorizontalSwipe`) come from the `@astra-kit/ui/hooks` entrypoint.
- `components/providers/app-providers/app-ui-provider.tsx` is the composition root allowed to import `AstraUIProvider` from `@astra-kit/ui/next`. Use `useTheme` from `@astra-kit/ui` for theme consumers and preserve the `tutribu-theme` storage key. Do not reintroduce document theme scripts or independent preference state.
- The sibling `astra-ui` repository (package `@astra-kit/ui`) owns the extracted shadcn/ui components and their customizations.
- Add new shadcn/ui components through its official CLI in that library, never in this application.
- Do not reintroduce `components/ui` source copies or a local `components.json`.
- Prefer composition of existing shared primitives before custom product components.
- Import browser-ready `@astra-kit/ui/styles.css` once from the global stylesheet; do not add Tailwind compilation or `@source` in the consumer. It provides the Arc foundation (semantic color roles, concentric radii, control heights, shadows, keyboard-only focus outline, blue accent) in light and dark; product SCSS Modules use those tokens and explicit overrides stay here. Fonts come from `app/fonts` through `next/font/local`: Inter for text and controls, Geist for display headings; use only weights 400 and 500.
- Use `Button` with Arc's API (`variant` `primary`, `secondary`, `ghost` or `danger`; `size` `sm`, `md` or `lg`; `loading`). It has no `asChild`: navigation that looks like a button stays a `Link`, `<a>` or `<label>` styled with the `action-link` mixin from `src/styles/_action-link.scss`. Icon-only buttons use `size="sm"` with an accessible name.
- Use pnpm 12.14.0 and consume published `@astra-kit/ui` releases from the public npm registry with a caret range; no registry mapping or token is needed. Update package.json and pnpm-lock.yaml together; do not vendor local tarballs.
- Follow `docs/architecture/shared-ui-library.htm` for package boundaries and distribution.

### Arc Pro license

- Arc components and blocks marked Pro (uiarc.dev, the `@uiarc-pro` registry, or the Arc MCP server) are licensed under the Arc Pro license (https://uiarc.dev/license), not MIT. Read it before using any Pro source; Free Arc items are MIT and only need their copyright notice.
- TuTribu is an end product, so Pro source may live here, adapted to the product, even though the repository is public. Every file that contains Pro source, copied or adapted (components, styles, SVG paths, timings), must start with this notice: `Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the Arc Pro license (https://uiarc.dev/license). Not covered by this project's license; do not redistribute it on its own.` Never remove that notice.
- Never move Pro source into `@astra-kit/ui` or any other package, registry, template, snippet collection or shared prompt: `@astra-kit/ui` is a component library published to npm, and redistributing Pro source as a library is forbidden. Build the shared primitive in `@astra-kit/ui` from its own design instead, or keep the Pro-derived code in this application.
- Do not commit raw Pro source as a standalone reference (for example the unmodified block under `docs/` or a scratch folder); take only what the product needs and integrate it.
- Use Pro source only with your own Arc Pro seat; do not share Pro tokens, and do not add them to the repository or to CI.
- Structure rule for custom components :
  - Applies to manually created components under `components/*`.
  - Each custom component must use this structure:

```text
components/<scope>/<component>/
  index.tsx
  styles.module.scss
```

  - Keep imports pointing to the component folder path so resolution uses `index.tsx`.

### Navigation links

- Always use the shared `Link` component from `@/components/navigation/link` for in-app navigation. Never import `Link` from `next/link` directly in product code (`app`, `components`, and `src`).
- The shared `Link` uses the provider's Next.js adapter with `prefetch` set to `false` by default. It accepts string hrefs and native anchor attributes. Prefetch is opt-in: pass `prefetch` explicitly only on routes that benefit from it.
- `components/navigation/link/index.tsx` reexports `Link` and `LinkProps` from `@astra-kit/ui`. Product code must not import `next/link` directly; shared pagination uses the same provider automatically.
- For details and examples, see the navigation links convention guide at `docs/conventions/navigation-links.htm`.

### Product language policy

- All user-facing product text must be in Spanish.
- This requirement applies to: headings, paragraphs, labels, placeholders, button text, navigation labels, toast messages, empty states, and error messages shown in UI.
- Any external/provider message must be mapped to a safe Spanish message before rendering in UI.
- Internal identifiers, symbols, module names, DTO names, and code-level technical terms must remain in English.
- Tests covering UI text must be updated in the same work item to keep Spanish copy as the default behavior.

### Toast notifications baseline

- Use `toast` and `ThemedToaster` from `@astra-kit/ui` (backed by Sonner) as the standard notification system for user-facing events. Do not mount the raw `Toaster`, and do not restyle toasts in the product.
- Mount a global toaster once in `app/layout.tsx` or in a dedicated top-level providers component imported from that layout, and trigger notifications from client components or client-side handlers.
- Select toast type by event intent:
  - `default`: neutral messages that acknowledge a relevant user action.
  - `success`: completed operations with expected result.
  - `info`: contextual updates that are not success/error states.
  - `warning`: validation issues or conditions requiring user attention.
  - `error`: failed operations and recoverable faults.
  - `promise`: async flows (`async/await`) to show loading, success, and failure lifecycle.
- Prefer `toast.promise` for write operations to keep async feedback consistent.
- Keep toast copy concise, clear, and safe: never expose secrets, raw provider payloads, tokens, or stack traces.
- Toasts complement existing UI feedback and must not break accessibility semantics (`aria-live`, alert roles, and form errors).

### Styling baseline

- `SCSS` is the styling solution for product code.
- Install Sass officially for Next.js support.
- Use:
  - `*.module.scss` for component-scoped styles
  - `src/styles/*` for global styles, tokens, mixins, and layout primitives
- Avoid inline styles except for rare runtime-only values.
- Tailwind utility classes are forbidden in product code (`app`, `components`, and `src` feature modules) and must be replaced with `SCSS` classes.
- Tailwind compilation belongs exclusively to `@astra-kit/ui`; the application consumes precompiled CSS. Shared component sources and the shadcn CLI configuration live in that library.

### Motion baseline

- Use `motion` (`motion/react`) and the motion primitives exported by `@astra-kit/ui` (`PresenceSwap`, `AnimatedCount`, `AnimatedCollapse`, `AnimatedListItem`) for client-side state changes, and the mixins in `src/styles/_motion.scss` for CSS-only entrances of server-rendered content.
- Animate only `transform` and `opacity` (height only through `AnimatedCollapse`), keep durations between 120 and 320 ms, take timing from the motion tokens exported by `@astra-kit/ui` (`MOTION_TIMING`, `MOTION_EASE`, springs and distances), and never hide server-rendered HTML behind a Motion `initial` state.
- Do not re-animate `@astra-kit/ui` primitives, which already animate. Every animation must respect `prefers-reduced-motion`.
- Scoped exception: `components/loaders/morph-loader` springs the geometry of its four SVG strokes and runs a continuous idle loop while loading; its durations still come from `MOTION_TIMING` within 120 to 320 ms. See the exception in `docs/conventions/motion.htm`.
- Follow the motion convention guide at `docs/conventions/motion.htm`.

### CSS architecture baseline (BEM mandatory)

- BEM is mandatory for all product classes defined in `*.module.scss` files.
- Use this naming structure:
  - `Block`: standalone component root (example: `.CourseCard`)
  - `Block__Element`: internal part of the block (example: `.CourseCard__title`)
  - `Block--Modifier` or `Block__Element--Modifier`: visual/state variant (example: `.CourseCard--featured`, `.CourseCard__title--muted`)
- Each component must expose one clear root block class and keep all child styles scoped to that block.
- Use SCSS nesting only when anchored to the current selector with `&` so BEM names stay explicit and predictable.
- Do not create styles from HTML tags (`div`, `button`, `h1`) as primary selectors inside module files; use BEM classes instead.
- Do not encode business logic in class names; class names must describe structure and visual state only.
- Suggested SCSS pattern:

```scss
.CourseCard {
  &__title {
    font-weight: 600;
  }

  &__meta {
    color: var(--muted-foreground);
  }

  &--featured {
    border: 2px solid var(--primary);
  }
}
```

- Suggested JSX usage:

```tsx
<article className={styles.CourseCard}>
  <h2 className={styles.CourseCard__title}>Introduccion a Algebra</h2>
  <p className={styles.CourseCard__meta}>Actualizado hoy</p>
</article>
```

## 4. Server-First Data Flow

For viewport-relative heights, also follow `docs/conventions/viewport-units.htm`.

### Default data strategy

- Instant navigation (Next.js 16.3+) validates every route on page loads and on client navigations: `params`, `searchParams`, `cookies()` and `headers()` are runtime data and must resolve inside a `<Suspense>` boundary that belongs to the segment being rendered. Consequences for this repository:
  - Every page segment ships its own `loading.tsx`. A boundary in a parent segment (for example `app/(platform)/[slug]/loading.tsx`) only covers page loads; on a navigation between sibling routes only the target segment re-renders, so the parent boundary sits above the re-render scope and the page's top-level `await params` blocks the navigation. Leaf segments re-export the nearest skeleton (`export { default } from "../loading";`).
  - A `layout.tsx` must not read `params` on the server, not even behind its own `<Suspense>`. When a layout-mounted client component needs the slug, resolve it on the client with `useParams` inside a `<Suspense>` (see `components/tribes/tribe-presence-heartbeat` and `app/(platform)/[slug]/layout.tsx`).
  - Do not paper over the insight with `instant = false`.

### Middleend rule

- Validate route `params`, query, and body (and page `params`/`searchParams`) once at the boundary with Zod, and validate every public DTO (JSON responses, server → client props, browser adapters) against its schema; never schema-validate Postgres rows or provider responses. Follow `docs/conventions/payload-validation-boundaries.htm`.
- Never import Better Auth, database context helpers, or provider error mappers from a generic `src/server` path.

## 5. Better Auth and Authorization

### Authentication setup

- Use `Better Auth` as the authentication baseline.
- Use Google OAuth through Better Auth when Google sign-in is required.
- Keep auth adapters, session access, OAuth wiring, and auth-related mapping inside module infrastructure.
- Wrap session-aware client providers from `app/layout.tsx` through a dedicated providers component when the UI needs client session context.

### Data and session behavior

- Use `Neon Postgres` as the primary application database.
- Use App Router with server-side session access via Better Auth route handlers and request-scoped database context as the default integration model.
- When the user provides an error related to the database, reproduce and inspect the failure directly against the database using the `pg` library before proposing a fix. Use the application's configured database connection, run the smallest safe query or transaction needed to trigger or diagnose the issue, and report the exact database cause found from PostgreSQL metadata, constraints, RLS policies, schema state, or query results.
- Database debugging with `pg` must never print or persist secrets, tokens, raw connection strings, or sensitive row data. Redact sensitive values in any shared output and prefer metadata-focused queries when possible.
- If direct `pg` validation cannot be executed because credentials, network access, or the database are unavailable, state the concrete blocker and the closest validation performed instead.
- Keep provider tokens, session secrets, and sensitive auth data server-side only.
- Use custom sign-in and error pages when product UX requires it, but keep sensitive failure details out of the UI.

Example SQL migration for a structural change (every structural change ships one):

```sql
-- database/migrations/20260325090000_create_posts.sql
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  user_id text NOT NULL REFERENCES public."user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
```

### Authorization rules

- Use **RLS simple** as the authorization baseline for data access.
- Keep RLS focused on ownership, membership, simple roles, and clear tenant or tribe scope.
- Create and maintain RLS policies through versioned SQL migrations. `Drizzle` may model tables and persistence, but it is not the source of truth for policies.
- Do not move complex business rules, dynamic workflows, or highly contextual product decisions into SQL policies.
- Keep complex authorization and product behavior in application use cases and domain services.
- When in doubt about the RLS boundary, follow the RLS simple guide at `docs/architecture/rls-simple.htm`.

Example SQL migration for RLS:

```sql
-- database/migrations/20260325091000_posts_rls.sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own posts"
ON posts
FOR SELECT
USING (nullif(current_setting('app.current_user_id', true), '') = user_id);

CREATE POLICY "Users can insert own posts"
ON posts
FOR INSERT
WITH CHECK (nullif(current_setting('app.current_user_id', true), '') = user_id);
```

## 6. Development Workflow

### Maintainability baseline

- Do not use magic strings or magic numbers in domain, application, infrastructure, route handlers, or behavior-bearing components.
- Replace hardcoded behavior values with named constants or configuration variables to improve maintainability and readability.
- Organize constants by scope:
  - global constants reused across multiple modules or across the application belong in `src/constants/`
  - module-scoped constants belong in `src/modules/<module>/constants/`
  - file-local constants that are not reused outside a single component, page, route, or module file must stay in that file
- For examples and a quick decision guide, see the constants convention guide at `docs/conventions/constants.htm`.
- Keep each constant close to its functional owner. Do not create global constants by default, and do not move unrelated values into a generic catch-all constants file.
- If a constant is repeated in multiple components within the same module, promote it to that module's `constants/` folder. If it is not reused outside its file, do not abstract it into a separate file.
- Group constants by domain ownership, not by generic technical category, and use consistent naming such as `UPPER_CASE` for constants.
- Use configuration only for environment, integration, or deployment values. Use module-scoped constants for statuses, rules, route paths, timeouts, limits, defaults, provider names, control messages, and similar behavior values.
- Allowed exceptions:
  - trivial numeric literals `-1`, `0`, and `1`
  - visible UI copy rendered from JSX
  - import/export sources and obvious structural property names or keys

### Magic strings and magic numbers

- A literal is "magic" when its value carries domain, protocol, or business meaning but that meaning is not named in the code. Name it; a literal is not magic just for being a literal.
- Magic numbers are enforced by oxlint's native `no-magic-numbers`, configured in `.oxlintrc.json`. Magic strings have no lint rule: they are enforced in review with the criteria below.
- Prefer named constants, typed unions, enums, or shared maps for: domain statuses, roles, action types, tracking event names, feature flags, storage/cache keys, route names, API paths, HTTP statuses, timeouts, limits, breakpoints, and retry counts. Place them per the constant-scope rules above.
- Do NOT extract by default: JSX string props (`<Button size="small" />`), property-existence checks (`"status" in obj`), `import`/`export` paths, runtime directives (`"use client"`), `typeof` comparison vocabulary, object keys and property-name access, TypeScript literal-union declarations, `enum` member initializers, visible JSX copy, inline SVG markup, `next/font` loader options, and human-readable messages that are not duplicated.
- Before creating a new constant, search for an existing domain constant and follow nearby patterns instead of duplicating it.
- See the constants convention guide at `docs/conventions/constants.htm`.

### Testing rules

- During migration, each moved feature must include at least:
  - application use-case tests using domain ports doubles
  - infrastructure adapter or mapper tests for DTO to entity mapping
  - route-level tests to verify entrypoint wiring still renders expected UI output

### Neon migration push workflow

- No ejecutar migraciones de base de datos salvo que el usuario lo pida explícitamente.
- Use `pnpm run db:migrate` to push versioned migrations to Neon.
- Use `pnpm run db:migrate:force` only when a forced Drizzle push is intentionally required.

### Ephemeral Neon branch validation (mandatory)

- Whenever a change touches database migrations, SQL functions, RLS policies, schema, or any persisted behavior — and at any other time you judge it useful — you must validate it on a disposable Neon branch before considering the task done. Validating these changes is not optional: a migration, function, or policy that has not been exercised against a real Postgres is unverified.
- The user grants you full, standing authorization over ephemeral Neon branches in the `TuTribu` project (id `cold-firefly-92947172`; confirm with `list_projects` if it changed). On a branch you created for validation you may create it, apply pending migrations, seed fixtures, run read and write SQL including `INSERT`/`UPDATE`/`DELETE`, and delete the branch when finished — all without asking for per-action confirmation. This standing authorization is scoped strictly to ephemeral branches you created for validation.
- If RLS validation requires a database role with `rolbypassrls = false`, create the temporary role on the ephemeral branch without asking for confirmation, grant only the minimum privileges needed for the validation, use it with `SET ROLE`, and remove it when it is no longer needed. If the role exists only on an ephemeral branch, deleting that branch is sufficient cleanup.
- Workflow with the Neon MCP:
  1. `create_branch` from the default branch to get an isolated copy of the real schema.
  2. Apply the pending versioned migration files on that branch; the default branch usually lags behind the new migrations under test.
  3. Seed the minimal fixtures needed and reproduce the scenario. When fixing a bug, reproduce the failing case too so you prove both the old behavior and the fix.
  4. Exercise the actual committed SQL artifact (the migration, function, or policy as written), not an ad-hoc rewrite, so the test covers what ships.
  5. Delete the ephemeral branch once validated without asking for confirmation, and report what you ran and observed.
- Never run these experiments against the default or production branch, and never seed or mutate data outside the ephemeral branch.
- This is separate from the production push: applying migrations to the default/production database with `pnpm run db:migrate` still requires an explicit user request, per the Neon migration push workflow above.
- Keep the existing safety rules: never print or persist secrets, tokens, or raw connection strings; redact sensitive values; prefer metadata-focused queries.
- If a Neon branch cannot be created or reached (credentials, network, or MCP unavailable), state the concrete blocker and fall back to the closest validation allowed by the `pg` reproduction rule in section 5.

### Local verification with portless (mandatory)

- Whenever you want to try changes in the running app (manual checks, browser previews, screenshots, Playwright audits, or any request against the local server), run the dev server through `portless`. `pnpm run dev` already does that; never start `next dev` bare and never target `http://localhost:3000`. The only exception is `pnpm run dev:next`, which exists so the Playwright `webServer` (and any environment where portless is not installed) can boot a bare `next dev` on port 3000 for the e2e suite; do not use it for manual checks.
- Start the dev server with the project script, which performs the whole sequence idempotently:

```bash
pnpm run dev
```

- The script (`scripts/dev-portless.mjs`) runs, in order: checks that portless is 0.15.5 or newer (the first release that accepts the dotted `tutribu.app` TLD; update with `npm install -g portless@latest`) before touching the running proxy, checks that `dev.tutribu.app` resolves to loopback through DNS, `portless proxy stop`, `portless proxy start --https --port 443 --tld tutribu.app`, `portless trust` when the local CA is not trusted yet, and finally `portless run --name dev next dev`. Every portless call runs with `PORTLESS_SYNC_HOSTS=0`, so the hosts file is never written. On Windows `portless trust` uses the current user's certificate store; the only elevated step is conditional: when `dev.tutribu.app` does not resolve through the network's DNS but does resolve to loopback through Cloudflare's public DNS (ISP DNS rebinding protection or a cached negative answer), the script asks through UAC to set Cloudflare's DNS (`1.1.1.1`, `1.0.0.1` and their IPv6 pair) on every connected physical adapter and runs `Clear-DnsClientCache`; once the record resolves locally it never asks again, and declining UAC only prints how to fix it by hand; on macOS and Linux the HTTPS proxy listens on the default port 443, so `portless proxy start` asks for `sudo` once to bind it. Pass `--dry-run` (`pnpm run dev -- --dry-run`) to print the steps and the machine state without changing anything.
- With the proxy on the `tutribu.app` TLD, the `dev` route resolves to `https://dev.tutribu.app`. That URL matches the local `BETTER_AUTH_URL`, the `allowedDevOrigins` entry in `next.config.ts` and the Google OAuth redirect URI `https://dev.tutribu.app/api/auth/callback/google`, so Google sign-in callbacks and Better Auth sessions land there. Use `https://dev.tutribu.app` as the base URL for every local check; do not use a `.localhost` URL, which Google rejects as a redirect URI.
- `dev.tutribu.app` resolves to `127.0.0.1` through a public DNS record: an `A` record `dev` → `127.0.0.1` in the `tutribu.app` zone in Cloudflare, in DNS only mode (no Cloudflare proxy). It replaces the hosts file entry, so no machine needs elevated privileges to edit the hosts file. If the record is missing or points elsewhere, the script stops and says how to fix it; never add the name to the hosts file instead.
- Mercado Pago OAuth and the R2 attachment CORS rules also derive from `BETTER_AUTH_URL`, and neither is updated by `pnpm run dev`. After moving the local URL to `https://dev.tutribu.app` (for example, from the former `https://dev-tutribu.app`), register `https://dev.tutribu.app/api/mercado-pago/oauth/callback` as a Redirect URL in the development Mercado Pago application, and rerun `node scripts/configure-r2-cors.mjs` with `BETTER_AUTH_URL=https://dev.tutribu.app` (or add that origin to the development bucket's CORS `AllowedOrigins` by hand). Both match exactly: with the old values, seller OAuth connections and presigned attachment uploads fail from the new origin.
- Before starting a new server, run `portless list`; if the `dev` route is already active on `https://dev.tutribu.app`, reuse it instead of starting another instance.
- Automation that hits the local server (Playwright scripts, `curl`) must use the `https://dev.tutribu.app` base URL.
- This is a local verification rule only; it does not replace the tests, lint, typecheck, or the full `pnpm run ci` gate.

### Quality gate workflow

- GitHub Actions owns the automatic quality gate in `.github/workflows/quality-gate.yml`. There are no product `pre-commit` or `pre-push` hooks: commits and pushes do not run local checks. The `prepare` script may install Husky wrappers, but they have no quality gate to invoke.
- Do not disable the GitHub Actions quality gate to merge failing code. Fix accepted failures and wait for a successful run of the updated commit.
- Every push to `main`, pull request update and manual workflow dispatch runs the full contract of `pnpm run ci` (split across jobs: `lint`, `typecheck` and `typecheck:tests` in a `parallel` group followed by `build`, and `test` in three Vitest shards; a final `Quality gate` job requires all of them; keep the workflow in sync when the `ci` script changes), after `pnpm install --frozen-lockfile` in clean GitHub-hosted runners. The contract runs `lint`, `typecheck`, `typecheck:tests`, `test`, and `build`. Pushes to `main` validate the pushed commit; pull requests validate the GitHub merge commit. Pushes to other branches do not trigger it, so a branch is validated through its pull request instead of twice. Tags do not trigger this workflow. Node.js comes from `.nvmrc`, pnpm from `packageManager`, and `HUSKY=0` disables hook installation in CI. The workflow uses read-only repository permissions and no application secrets. Require the `Quality gate` check in branch protection when merges must be blocked on failures; creating a workflow alone does not change branch protection.
- `typecheck` and the `build` type check share the same scope (`tsconfig.typecheck.json`, wired through `typescript.tsconfigPath` in `next.config.ts`): product code under `app`, `components`, `hooks`, `lib`, `src` and the framework entrypoints. Vitest 5 suites run through Vite and are type-checked separately with `pnpm run typecheck:tests` and `tsconfig.test.json`. Product configurations must not include Vitest globals.
- Agents must not duplicate the full gate in local Stop hooks; during a task, run validations relevant to the change (lint, type checks and the related Vitest suites) and rely on GitHub Actions for the automatic full gate.
- The package manager is pnpm 12, pinned through `packageManager` (plus `engines.pnpm`). pnpm 12 enforces `minimumReleaseAge` (24 hours) by default and validates every lockfile entry, so a freshly published version is rejected until it is a day old: prefer versions older than 24 hours and always confirm with `pnpm install --frozen-lockfile`. Never regenerate the lockfile with `pnpm clean --lockfile` to get past that check; it re-resolves every caret range and drifts unrelated dependencies.
- Vercel validates the deployment build and does not replace the full `pnpm run ci` gate.

## 7. Concurrency, Observability, and Performance

### Concurrency baseline

- Design all client and server flows assuming concurrent execution, retries, and out-of-order completion.
- Never rely on the client to guarantee consistency for shared or persisted state.
- Clean up async effects and guard against stale or outdated responses before updating UI state.

### Reliability and performance baseline

- Make critical mutations safe under retries and duplicate submissions through idempotency, transactional protection, optimistic locking, or equivalent server-side controls.
- Avoid blocking the event loop, overfetching, and repeated expensive work in latency-sensitive paths.
- For examples and decision guidance, see the concurrency, observability, and performance convention guide at `docs/conventions/concurrency-observability-performance.htm`.

### Pooled connection and render-abort resilience

- Reuse the safe checkout in `withRequestContext` instead of writing a new bare `connect()`/`finally` pair.
- `createPostgresPool` applies `idle_in_transaction_session_timeout` per connection through the pool `onConnect` hook and must reject acquisition when the session `set_config` fails, so transactions opened by library adapters that own their checkout, such as the Better Auth Drizzle adapter, are covered too. The Neon pooler rejects the `options` startup parameter, so the `onConnect` `set_config` is the supported way to apply a connection-level GUC.

### Test tooling

- Use pnpm 12.14.0 and the committed pnpm-lock.yaml. Install with `pnpm install --frozen-lockfile`.
- Use Vitest 5 for unit and integration tests; `pnpm test` runs once and `pnpm test:watch` watches.
- Run `pnpm typecheck:tests` against `tsconfig.test.json`; keep Vitest and Testing Library globals out of the application tsconfig.

## Runtime and compiler

- Use Node.js 24.21.0 from `.nvmrc` locally and in GitHub Actions; `engines.node` permits only Node 24. The workflow installs the exact `.nvmrc` version through `actions/setup-node`.
- TypeScript 7 is the project compiler for application tests and Next builds. Keep the separate `tsconfig.test.json` and run `pnpm typecheck:tests`.
- Keep the root `typescript` dependency on version 7 and do not disable Next build type checking.
- Lint runs with oxlint (`.oxlintrc.json`). Inline `eslint-disable` and `oxlint-disable` directives are rejected by `scripts/oxlint/no-lint-disable-plugin.mjs`.
- The local runtime and GitHub Actions must match `.nvmrc` and `packageManager` (pnpm 12.14.0). Update runtime pins, Node types and lockfiles together.
