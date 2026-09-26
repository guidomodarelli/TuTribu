<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
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

### Changelog governance

- Every change that alters product behavior, user-facing UI or copy, data handling, permissions, or deployed configuration must update `CHANGELOG.md` in the same work item.
- Add entries only inside the `## [Unreleased]` block, never under an already released version. Never write the version or the date by hand: `pnpm create-version` renames `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` when releasing and leaves an empty `[Unreleased]` block on top.
- Follow [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/): group entries only under these sections, in this order, omitting empty ones: `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`.
- Write one `- ` line per change, in Spanish, describing what changes for TuTribu users (members and tribe creators), without internal implementation details.
- Changes with no effect for users (tests, internal refactors, local tooling, agent instructions) do not need an entry.
- If `[Unreleased]` is empty when releasing, `pnpm create-version` asks Codex to fill it from the unreleased commits; if Codex is unavailable or writes nothing valid, the release stops.
- `pnpm create-version` runs the shared `beez-rp create-version` command. Change TuTribu-specific release behavior (changelog audience, version type descriptions, migrations adapter, final summary) in `beez-rp.config.js`, and the shared engine in the beez-rp repository.

### Architecture documentation governance

- Always review the relevant `.htm` documents in `docs/architecture/` before proposing or implementing changes that affect architecture, authentication, authorization, provider integrations, data flow, modular structure, or backend boundaries.
- Treat `docs/architecture` as the source of truth for architectural decisions in this repository.
- If `AGENTS.md` and `docs/architecture` conflict, `docs/architecture` takes precedence and `AGENTS.md` must be updated to match it.
- If a work item changes an architectural decision, update the relevant file under `docs/architecture` in the same work item.
- Do not close a task that changes architecture or architectural constraints while leaving `docs/architecture` outdated.

### Mandatory architecture

- Prioritize hexagonal architecture from the first commit and in every change.
- Use `~/hexagonal-architecture` as the implementation reference when there is any doubt about structure, boundaries, ports, adapters, DTO placement, or testing strategy.
- Organize the codebase by vertical slice, not by technical layer at the repository root.
- Do not create or reintroduce a generic `src/server` layer. Server-only code must belong to a feature module or to a dedicated shared module under `src/modules`.
- Keep all technical identifiers in English: folders, files, modules, symbols, DTOs, ports, adapters, tests, and comments.

### Migration mandate (Immediate cutover)

- `src/features` is deprecated and forbidden for new code.
- New and modified business code must live under `src/modules/<feature>/{domain,application,infrastructure}`.
- Any change that touches a route entrypoint importing from `src/features` must migrate that entrypoint to `src/modules` in the same work item.
- `src/features` cannot be used as an integration layer for new adapters; dependency composition must happen in `src/modules/<feature>/setup.ts`.
- Route entrypoints must consume use cases from `application` and must not import repository implementations directly.
- Add and keep a lint/static check (run by the Husky hooks and `pnpm run ci`) that fails on imports matching `@/src/features/`.

### Dependency rule

- Dependencies must always point inward.
- Allowed directions:
  - `app` entrypoints (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`) -> `application`
  - `app` entrypoints -> `infrastructure` only for framework wiring, adapter selection, dependency composition, and server-only adapter execution
  - `application` -> `domain`
  - `infrastructure` -> `application`
  - `infrastructure` -> `domain`
- Forbidden directions:
  - `domain` -> `application` or `infrastructure`
  - `application` -> `infrastructure` or generic `lib`
  - UI or route components importing external DTOs directly
  - Any layer importing from a generic `src/server` folder

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

- `app/**/*`
  - Route entrypoints and framework composition roots only.
  - `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and `route.ts` may import `application` and module-scoped `infrastructure` only to wire framework adapters to use cases.
  - Prefer Server Components by default. Add `"use client"` only when browser APIs, client state, or direct event handlers are required.
  - Keep client-side session lookup, async workflows, and complex form orchestration in route-level client containers or dedicated client components, not inside presentational components.
  - Never host domain rules.
- `components/*`
  - Presentational components by default.
  - Receive state, derived messages, results, and callbacks through props when an interaction depends on auth session state, HTTP requests, or multi-step UI workflows.
  - Do not call module infrastructure adapters directly from presentational components.
  - Do not import client adapters from `lib` either. Files named like `*api*`, `*client*`, or `*adapter*` under `lib` must be treated as adapter code and kept out of presentational components.
- `domain`
  - Pure business rules, entities, value objects, and ports.
  - No framework, HTTP, provider SDK, or persistence details.
- `application`
  - Use cases and internal contracts (`commands`, `queries`, `results`).
  - Orchestrates domain behavior through ports.
  - Validate and normalize inputs through domain value objects or application contracts, not through generic helpers in `lib`.
- `infrastructure`
  - Adapters for authentication, Better Auth integration, database access, HTTP clients, storage, and third-party SDKs.
  - Owns external DTOs and their mappers.
  - Shared server-only helpers must still live under a module infrastructure folder, never under `src/server`.
- `lib`
  - Reserved for framework-safe helpers, UI utilities, and client-only adapters that are not business rules.
  - `application` and `domain` must never import from `lib`.
  - If a file under `lib` wraps endpoint calls or transport concerns, name it clearly (`*api*`, `*client*`, `*adapter*`) so lint can classify it as adapter code.
  - If a helper starts encoding use-case rules, provider details, or DTO mapping, move it into the owning module.

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

- Use `beez-ui` as the only shared component library consumed by product code.
- Group named imports from `beez-ui`; do not use component-specific subpaths.
- `components/providers/app-providers/app-ui-provider.tsx` is the composition root allowed to import `BeezUIProvider` from `beez-ui/next`. Use `useTheme` from `beez-ui` for theme consumers and preserve the `tutribu-theme` storage key. Do not reintroduce document theme scripts or independent preference state.
- The sibling `beez-ui` repository owns the extracted shadcn/ui components and their customizations.
- Add new shadcn/ui components through its official CLI in that library, never in this application.
- Do not reintroduce `components/ui` source copies or a local `components.json`.
- Prefer composition of existing shared primitives before custom product components.
- Import browser-ready `beez-ui/styles.css` once from the global stylesheet; do not add Tailwind compilation or `@source` in the consumer. It provides the default LaTribu theme and fonts; product SCSS Modules and explicit overrides stay here.
- Use pnpm 12.6.0 and consume published beez-ui releases from npm with a caret range. Update package.json and pnpm-lock.yaml together; do not vendor local tarballs.
- Follow `docs/architecture/shared-ui-library.htm` for package boundaries and distribution.
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
- `components/navigation/link/index.tsx` reexports `Link` and `LinkProps` from `beez-ui`. Product code must not import `next/link` directly; shared pagination uses the same provider automatically.
- For details and examples, see the navigation links convention guide at `docs/conventions/navigation-links.htm`.

### Product language policy

- All user-facing product text must be in Spanish.
- This requirement applies to: headings, paragraphs, labels, placeholders, button text, navigation labels, toast messages, empty states, and error messages shown in UI.
- Any external/provider message must be mapped to a safe Spanish message before rendering in UI.
- Internal identifiers, symbols, module names, DTO names, and code-level technical terms must remain in English.
- Tests covering UI text must be updated in the same work item to keep Spanish copy as the default behavior.

### Toast notifications baseline

- Use `toast` and `Toaster` from `beez-ui` (backed by Sonner) as the standard notification system for user-facing events.
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
- Tailwind compilation belongs exclusively to `beez-ui`; the application consumes precompiled CSS. Shared component sources and the shadcn CLI configuration live in that library.

### Motion baseline

- Use `motion` (`motion/react`) and the shared primitives in `components/motion/*` for client-side state changes, and the mixins in `src/styles/_motion.scss` for CSS-only entrances of server-rendered content.
- Animate only `transform` and `opacity` (height only through `AnimatedCollapse`), keep durations between 120 and 320 ms, take timing from `lib/motion/tokens.ts`, and never hide server-rendered HTML behind a Motion `initial` state.
- Do not re-animate `beez-ui` primitives, which already animate. Every animation must respect `prefers-reduced-motion`.
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

### Cross-engine compatibility (Chromium and WebKit) — mandatory

- Always keep in mind that every style (`SCSS`, `*.module.scss`, inline runtime values) and every piece of client-side JavaScript in product code must render and behave correctly on both Chromium (Chrome, Edge, Android Chrome) and WebKit (Safari, iOS Safari, iOS Chrome, and iOS WebViews). A change is not done until it works on both engines.
- Treat mobile as a first-class target: validate small viewports on both engines, because several engine divergences only surface on mobile Chrome and iOS Safari/Chrome.
- Be especially careful with layout features whose intrinsic-sizing or rendering behavior diverges between engines, such as: CSS Grid `fr`/`minmax()` tracks inside `fit-content`/`auto`-sized containers, `-webkit-line-clamp` with `-webkit-box`, flexbox/grid `min-height`/`min-width` defaults, sticky positioning, fixed positioning combined with `inset`/`margin: auto`, and dynamic viewport units (`svh`, `dvh`, `vh`). When a scroll container relies on an `fr` track, give it a definite size instead of depending on engine-specific intrinsic sizing.
- For viewport-relative heights, follow the viewport units convention at `docs/conventions/viewport-units.htm`: use `svh` for page/section `min-height` and viewport-bound scroll containers, and `dvh` only for fullscreen mobile overlays. Do not use bare `100vh` in product code, and never do a blanket `svh` → `dvh` swap.
- Keep the required `-webkit-` prefixes and provide standard fallbacks; never ship a property or value that only one engine understands without an equivalent path for the other.
- For client-side JavaScript, do not depend on Chromium-only APIs or behaviors. Guard non-universal Web APIs with feature detection and provide a safe WebKit fallback so iOS users are never left with a broken flow.
- When fixing or reviewing a UI bug, confirm the root cause is not an engine-specific behavior and verify the fix holds on both Chromium and WebKit before closing the task. If one engine cannot be exercised in the current environment, state the concrete blocker and the closest validation performed.

## 4. Server-First Data Flow

### Default data strategy

- Prioritize server-side data retrieval through App Router entrypoints.
- In App Router, `page.tsx`, `layout.tsx`, and route-level async server components are the preferred inbound adapters for initial data loading.
- A route segment should have a single primary data entrypoint whenever possible.
- Instant navigation (Next.js 16.3+) validates every route on page loads and on client navigations: `params`, `searchParams`, `cookies()` and `headers()` are runtime data and must resolve inside a `<Suspense>` boundary that belongs to the segment being rendered. Consequences for this repository:
  - Every page segment ships its own `loading.tsx`. A boundary in a parent segment (for example `app/(platform)/[slug]/loading.tsx`) only covers page loads; on a navigation between sibling routes only the target segment re-renders, so the parent boundary sits above the re-render scope and the page's top-level `await params` blocks the navigation. Leaf segments re-export the nearest skeleton (`export { default } from "../loading";`).
  - A `layout.tsx` must not read `params` on the server, not even behind its own `<Suspense>`. When a layout-mounted client component needs the slug, resolve it on the client with `useParams` inside a `<Suspense>` (see `components/tribes/tribe-presence-heartbeat` and `app/(platform)/[slug]/layout.tsx`).
  - Do not paper over the insight with `instant = false`.
- Do not scatter external fetches across presentational components when the route can resolve them on the server.

### Middleend rule

- Centralize mapping and adaptation of external data in a middleend layer inside the hexagonal flow.
- External contracts belong to infrastructure:
  - `src/modules/<feature>/infrastructure/api/dto/*`
  - `src/modules/<feature>/infrastructure/api/mapper.ts`
- Internal contracts for the UI belong to application:
  - `commands/`
  - `queries/`
  - `results/`
- Use this conversion flow:

```text
External API/SDK -> infrastructure DTO -> infrastructure mapper -> domain entity/value object -> use case -> application result -> route view model/component props
```

- Never pass provider DTOs directly to route components.
- Validate route `params`, query, and body (and page `params`/`searchParams`) once at the boundary with Zod, and validate every public DTO (JSON responses, server → client props, browser adapters) against its schema; never schema-validate Postgres rows or provider responses. Follow `docs/conventions/payload-validation-boundaries.htm`.
- Never import Better Auth, database context helpers, or provider error mappers from a generic `src/server` path.
- Any route entrypoint, server component, or action that calls external infrastructure must translate failures into a safe UX in Spanish and must not expose raw provider messages, stack traces, or internal diagnostics to the UI.
- When those flows fail unexpectedly, log them with structured context at the boundary that owns the user-facing response, including correlation identifiers and safe business metadata when available.

### Client-side fetching

- Client-side fetching is allowed only when server-side loading is not a fit, such as user-triggered refreshes, incremental interactions, or post-render mutations.
- If client-side fetching is necessary, keep it behind use cases and adapters instead of calling third-party SDKs from components.
- When a route needs client-side fetching plus auth/session state, prefer a container/presenter split:
  - route-level client container owns session, fetch, mutation state, and validation flow
  - presentational component renders props and emits callbacks only
- Interactive mutations must prefer incremental responses over full route refreshes when the mutated UI can be updated from a safe application result.
- Route handlers or Server Actions that serve user-triggered mutations should return the minimum view model needed to update the affected UI state, instead of forcing the client to reload the whole route.
- A full refresh after a mutation is allowed only when it is explicitly justified by broad cache invalidation, data that cannot be reconstructed safely from the mutation result, security or authorization state changes, or critical cross-view synchronization.
- Tests for user-triggered mutations must assert that the interaction does not trigger a full route refresh unless the refresh exception is documented in the test or adjacent implementation.

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
- When an implemented change affects database structure (`schema`, tables, columns, constraints, indexes, relationships, or RLS-relevant storage layout), include a versioned SQL migration in the same work item.
- Use the dashboard SQL editor only for quick experiments or debugging. It does not replace a versioned migration committed with the change.
- Keep provider tokens, session secrets, and sensitive auth data server-side only.
- Use custom sign-in and error pages when product UX requires it, but keep sensitive failure details out of the UI.

Example SQL migration for a structural change:

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
- Enforcement lives in tooling, not only in review:
  - Magic strings: `eslint-plugin-no-magic` (rule `no-magic/no-magic-strings`). It reports a string only when it is a hidden contract: an equality/inequality comparison operand, a `switch` `case`, an argument to a known behavioral sink (analytics/tracking, storage, feature flags, cache, routing/navigation), the `type` of a dispatched action, or a value duplicated across the file at or above the configured threshold.
  - Magic numbers: `@typescript-eslint/no-magic-numbers`, wired with `recommendedMagicNumberOptions` from `eslint-plugin-no-magic`.
- Prefer named constants, typed unions, enums, or shared maps for: domain statuses, roles, action types, tracking event names, feature flags, storage/cache keys, route names, API paths, HTTP statuses, timeouts, limits, breakpoints, and retry counts. Place them per the constant-scope rules above.
- Do NOT extract by default (the linter intentionally ignores these): JSX string props (`<Button size="small" />`), property-existence checks (`"status" in obj`), `import`/`export` paths, runtime directives (`"use client"`), `typeof` comparison vocabulary, object keys and property-name access, TypeScript literal-union declarations, `enum` member initializers, visible JSX copy, inline SVG markup, `next/font` loader options, and human-readable messages that are not duplicated.
- Before creating a new constant, search for an existing domain constant and follow nearby patterns instead of duplicating it.
- The linter enforces the mechanical, low-noise subset; this section is the criterion for the cases tooling cannot judge. See the constants convention guide at `docs/conventions/constants.htm`.

### TDD is mandatory

- Work in strict TDD for every feature, bug fix, and architectural change.
- The development sequence is always:
  1. `testing`
  2. `code`
  3. `refactor`
  4. `green`

### How to apply the cycle

#### 1. Testing

- Start by writing the smallest failing test at the correct architectural layer.
- Define the expected behavior before implementing production code.
- Prefer one clear behavior per test.

#### 2. Code

- Implement the minimum code needed to make the failing test pass.
- Respect hexagonal boundaries even in the first implementation.
- Do not skip ports, mappers, or value objects just to move faster.

#### 3. Refactor

- Refactor only after the behavior is covered.
- Improve naming, remove duplication, extract helpers, simplify adapters, and tighten boundaries.
- Preserve behavior while clarifying the design.

#### 4. Green

- The cycle is only complete once the new behavior is fully covered by passing tests.

### Testing responsibilities by layer

- `domain`
  - Unit tests for entities, value objects, and pure business rules.
- `application`
  - Unit tests for use cases using doubles for domain ports.
- `infrastructure`
  - Integration tests for adapters, DTO mappers, Better Auth wiring, and RLS or provider boundaries.
- `app` and UI
  - React Testing Library tests for server/client component boundaries, rendering, and critical user flows.
- End-to-end
  - Add smoke coverage for critical authentication and authorization workflows.

### Testing rules

- Never place test files inside `app`, because App Router can treat colocated special files as route artifacts and it keeps entrypoints harder to scan.
- When functionality changes, add or update the corresponding tests in the same work item.
- Prefer mocks at the port boundary, not at low-level vendor internals, unless the test is explicitly for an adapter.
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

- The script (`scripts/dev-portless.mjs`) runs, in order: `portless proxy stop`, `portless proxy start --https --tld app`, adds `127.0.0.1 dev-tutribu.app` to the system hosts file when it is missing (this is the only step that asks for elevated privileges), runs `portless trust` when the local CA is not trusted yet, and finally `portless run --name dev-tutribu next dev`. Pass `--dry-run` (`pnpm run dev -- --dry-run`) to print the steps and the machine state without changing anything.
- With the proxy on the `app` TLD, the `dev-tutribu` route resolves to `https://dev-tutribu.app`. That URL matches the local `BETTER_AUTH_URL` and the `allowedDevOrigins` entry in `next.config.ts`, so Google sign-in callbacks and Better Auth sessions land there. Use `https://dev-tutribu.app` as the base URL for every local check; do not use `https://dev-tutribu.localhost`.
- `.app` is a real TLD, so unlike `.localhost` it does not resolve to loopback by itself: without the hosts entry the browser reports that the domain does not exist even though the proxy is listening on port 443. The script covers this; if it cannot write the hosts file, add the line it prints by hand from an elevated terminal.
- Before starting a new server, run `portless list`; if the `dev-tutribu` route is already active on `https://dev-tutribu.app`, reuse it instead of starting another instance.
- Automation that hits the local server (Playwright scripts, `curl`) must use the `https://dev-tutribu.app` base URL.
- This is a local verification rule only; it does not replace the tests, lint, typecheck, or the full `pnpm run ci` gate.

### Quality gate workflow

- There is no GitHub Actions gate and no `pre-commit` hook: commits run no checks. The only Git hook is Husky `pre-push`, installed by the `prepare` script on `pnpm install`.
- Do not bypass the hook with `--no-verify` to get past a real failure; fix the cause and push again.
- Every push of a branch other than `main` runs a Husky `pre-push` hook with the full contract, `pnpm run ci`, which runs `lint`, `typecheck`, `typecheck:tests`, `test` (including the SQL migration guardrail suites), and `build`. A push that fails the hook is not sent. Pushes to `main` (such as `pnpm release`) and to tags are skipped: `main` receives code through pull requests whose branches were already gated. The hook (`.husky/pre-push` → `scripts/pre-push-gate.mjs`) validates only the clean checked-out `HEAD` and never checks out or executes code from another commit. When a gated branch is pushed it checks the running Node.js, because `.nvmrc` and `engines.node` do not switch the `node` already running the hook: a runtime outside `engines.node` rejects the push, and a runtime inside it that differs from the exact `.nvmrc` pin only warns (a minor or patch drift inside Node 24 must not block every push); a prerelease runtime such as `24.21.0-rc.1` never satisfies `engines.node` nor matches `.nvmrc`. It reads the `<local ref> <local oid> <remote ref> <remote oid>` lines from stdin, allows ref deletions and skips every remote ref that is not a branch other than `main`. Every gated oid must be `HEAD` with an empty `git status --porcelain` and no tracked file flagged `skip-worktree` or `assume-unchanged` (`git ls-files -v`), because `git status` hides whether those differ from `HEAD`; otherwise the push fails with a Spanish message asking to check out that branch or commit with a clean working tree and push again (to push another branch, check it out first). This keeps code from fetched or untrusted refs from running under the developer account and makes the `.nvmrc`/`engines.node` pins it reads always belong to the pushed commit. For the clean `HEAD` it first runs `pnpm install --frozen-lockfile --prefer-offline` with `HUSKY=0` in place, so a `package.json` that drifted from `pnpm-lock.yaml` fails the push even when `node_modules` is already installed. After the install and again after `pnpm run ci` it rechecks that `HEAD` is still the pushed commit and the working tree is still clean (including no `skip-worktree`/`assume-unchanged` flags), because Git uploads the oid captured on stdin: a commit, edit or checkout made in another terminal during the run fails the push with a Spanish message asking to push again without touching the checkout. Push branches over HTTPS (or set an SSH `ServerAliveInterval` for `github.com`): over a plain SSH remote GitHub closes the idle connection during the ~10 minute hook and the push fails with exit code 141 even when the gate passes. The pre-push hook replaces the former GitHub Actions gate: do not wait for or require GitHub Actions checks before merging.
- `typecheck` and the `build` type check share the same scope (`tsconfig.typecheck.json`, wired through `typescript.tsconfigPath` in `next.config.ts`): product code under `app`, `components`, `hooks`, `lib`, `src` and the framework entrypoints. Vitest 5 suites run through Vite and are type-checked separately with `pnpm run typecheck:tests` and `tsconfig.test.json`. Product configurations must not include Vitest globals.
- Agents must not duplicate the full gate in local Stop hooks; during a task, run only validations relevant to the change (lint, type checks and the related Vitest suites) and rely on the `pre-push` hook for the full gate.
- The package manager is pnpm 12, pinned through `packageManager` (plus `engines.pnpm`). pnpm 12 enforces `minimumReleaseAge` (24 hours) by default and validates every lockfile entry, so a freshly published version is rejected until it is a day old: prefer versions older than 24 hours and always confirm with `pnpm install --frozen-lockfile`. Never regenerate the lockfile with `pnpm clean --lockfile` to get past that check; it re-resolves every caret range and drifts unrelated dependencies.
- Vercel validates the deployment build and does not replace the full `pnpm run ci` gate.

## 7. Concurrency, Observability, and Performance

### Concurrency baseline

- Design all client and server flows assuming concurrent execution, retries, and out-of-order completion.
- Never rely on the client to guarantee consistency for shared or persisted state.
- Clean up async effects and guard against stale or outdated responses before updating UI state.

### Observability baseline

- Use structured, contextual logs for relevant server-side flows and include correlation identifiers such as `requestId` or `traceId` when available.
- Keep logs and error reporting safe: never expose secrets, tokens, raw provider payloads, or internal diagnostics in user-facing messages.
- Do not add `catch` blocks that only swallow errors or redirect control flow without classification, logging, or user feedback. Every `catch` must do at least one intentional responsibility: map an expected failure to a stable result, log an unexpected failure with context, trigger safe user feedback, or rethrow to the appropriate error boundary.
- For retryable operations and external provider integration calls, log each attempt and final outcome with a stable trace context. Include `operation_key`, `requestId`, relevant business identifiers such as `priceId` or `tribeSlug`, redacted provider identifiers such as `providerPlanId` or `preapprovalId`, and `result` when available.

### Reliability and performance baseline

- Make critical mutations safe under retries and duplicate submissions through idempotency, transactional protection, optimistic locking, or equivalent server-side controls.
- Avoid blocking the event loop, overfetching, and repeated expensive work in latency-sensitive paths.
- For examples and decision guidance, see the concurrency, observability, and performance convention guide at `docs/conventions/concurrency-observability-performance.htm`.

### Pooled connection and render-abort resilience (mandatory investigation)

A server render or an `after()` callback can be aborted mid-flight (Next.js dev render restarts on cache miss, or a client disconnect in production). An aborted async flow suspends the `finally` that returns a checked-out resource, so a pooled database client leaks until the pool is exhausted and every later acquisition fails with `timeout exceeded when trying to connect`. A direct connection that resolves quickly means the database is healthy and the timeout is client-side pool starvation, not a slow database.

- Any code path that acquires a pooled client with `pool.connect()` must release it even when the awaiting flow is abandoned. Register a client `error` listener that releases (destroys) the client, guard against double-release, and never issue `ROLLBACK` on a socket that already errored. Reuse the safe checkout in `withRequestContext` instead of writing a new bare `connect()`/`finally` pair.
- Any request-scoped transaction must set a local `idle_in_transaction_session_timeout` right after `BEGIN` so an abandoned transaction is terminated server-side and its pool slot reclaimed. The window must stay far larger than any legitimate request transaction. `createPostgresPool` also applies the same guard at the connection level through the pool `onConnect` hook, and must reject acquisition when the session `set_config` fails, so transactions opened by library adapters that own their own checkout — such as the Better Auth Drizzle adapter — are covered even though they cannot be wrapped by the request-scoped helper. The Neon pooler rejects the `options` startup parameter, so the `onConnect` `set_config` is the supported way to apply a connection-level GUC through the pooler.
- Size each pool `max` for concurrent renders; the Neon pooler tolerates hundreds of connections, so a small ceiling only starves legitimate concurrency.
- Do not retry a failure whose cause is a connection-acquisition timeout: retrying while the pool is saturated only doubles the pressure. Reserve retries for genuinely transient terminations such as a backend-closed idle client.
- Do not run a provider HTTP call plus a write on every server-rendered read path. Throttle provider reconciliation behind a freshness window so concurrent renders of the same page collapse into a single provider call, and keep authorization staleness bounded.
- Standing investigation rule: before closing any task that touches database access, a request-scoped transaction, a pool, a retry, or a provider call on a server-render path, sweep the whole app for the same class of failure (search at least `pool.connect()`, `createPostgresPool`, request-scoped transactions, retry helpers, and provider calls inside `page.tsx`/`layout.tsx`) and confirm every sibling occurrence follows the rules above or record why it is exempt.

### Test tooling

- Use pnpm 12.6.0 and the committed pnpm-lock.yaml. Install with `pnpm install --frozen-lockfile`.
- Use Vitest 5 for unit and integration tests; `pnpm test` runs once and `pnpm test:watch` watches.
- Run `pnpm typecheck:tests` against `tsconfig.test.json`; keep Vitest and Testing Library globals out of the application tsconfig.

## Runtime and compiler

- Use Node.js 24.21.0 from `.nvmrc` locally and in the Husky `pre-push` gate; `engines.node` permits only Node 24. When it gates a branch, the `pre-push` hook rejects a runtime outside `engines.node` and warns when it differs from `.nvmrc`.
- TypeScript 7 is the project compiler for application tests and Next builds. Keep the separate `tsconfig.test.json` and run `pnpm typecheck:tests`.
- `.pnpmfile.cjs` supplies the official TypeScript 6 compatibility API privately to ESLint packages. Keep the root `typescript` dependency on version 7 and do not disable Next build type checking. Review the hook when ESLint supports the new compiler API.
- There is no GitHub Actions workflow; the local runtime must match `.nvmrc` and `packageManager` (pnpm 12.6.0) before the hooks run. Update runtime pins, Node types and lockfiles together.
