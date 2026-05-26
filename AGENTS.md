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
- New or migrated product documentation under `docs/architecture/`, `docs/conventions/`, and `docs/user-manual/` must use `.htm` files and follow the guidelines defined in `docs/DESIGN.md`; existing tracked `.md` documents remain authoritative until they are intentionally migrated.
- Place each documentation update in the section that owns the content: architecture decisions in `docs/architecture/`, project conventions in `docs/conventions/`, and user-facing instructions in `docs/user-manual/`.
- Whenever a change is undocumented, or documentation needs to be improved, modified, edited, transformed, added, deleted, relocated, redefined, restructured, or adjusted in any similar way, update the corresponding document in the same work item before closing the task.
- Do not close a task while the relevant `docs/` page is stale, missing, outside the required section, or in the wrong format.

### Architecture documentation governance

- Always review the relevant documents in `docs/architecture/` before proposing or implementing changes that affect architecture, authentication, authorization, provider integrations, data flow, modular structure, or backend boundaries.
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
- Add and keep a CI/static check that fails on imports matching `@/src/features/`.

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

- Use `shadcn/ui` following the official installation flow.
- Prefer `shadcn/ui` components whenever a user request can be satisfied with an existing component or variant from the library.
- When touching existing UI, replace custom components with the closest `shadcn/ui` component or composition if the current behavior can be preserved.
- When adding new UI or features that need interface building blocks, use `shadcn/ui` components by default.
- Follow this mandatory UI fallback order:
  1. `shadcn/ui`: Always verify first whether the requested UI can be implemented with an existing `shadcn/ui` component or variant.
  2. `Radix UI`: If `shadcn/ui` has no viable option, ask the user whether they want a `Radix UI` primitive as the fallback.
  3. Standalone custom component: Only if neither option is viable, create a separate custom component as the last resort.
- Initialize it with the official CLI:

```bash
npx shadcn@latest init -t next
```

- Every `shadcn/ui` component must be added through the CLI only:

```bash
npx shadcn@latest add button
```

- Never hand-copy `shadcn/ui` components from documentation or other repositories.
- Keep generated `shadcn/ui` components close to their defaults and customize behavior through composition first.
- `components/ui` is reserved exclusively for components generated by `shadcn/ui`.
- Do not place custom components in `components/ui`.
- Structure rule for custom components outside `components/ui`:
  - Applies to manually created components under `components/*` (except `components/ui/*`).
  - Each custom component must use this structure:

```text
components/<scope>/<component>/
  index.tsx
  styles.module.scss
```

  - Keep imports pointing to the component folder path so resolution uses `index.tsx`.

### Product language policy

- All user-facing product text must be in Spanish.
- This requirement applies to: headings, paragraphs, labels, placeholders, button text, navigation labels, toast messages, empty states, and error messages shown in UI.
- Any external/provider message must be mapped to a safe Spanish message before rendering in UI.
- Internal identifiers, symbols, module names, DTO names, and code-level technical terms must remain in English.
- Tests covering UI text must be updated in the same work item to keep Spanish copy as the default behavior.

### Toast notifications baseline

- Use `Sonner` integrated with `shadcn/ui` as the standard notification system for user-facing events.
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
- Tailwind is allowed only for the base setup required by official `shadcn/ui` generated components and the related official configuration in `components.json`.

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

### Default data strategy

- Prioritize server-side data retrieval through App Router entrypoints.
- In App Router, `page.tsx`, `layout.tsx`, and route-level async server components are the preferred inbound adapters for initial data loading.
- A route segment should have a single primary data entrypoint whenever possible.
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
- When in doubt about the RLS boundary, follow the RLS simple guide under `docs/architecture/`.

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
- For examples and a quick decision guide, see the constants convention guide under `docs/conventions/`.
- Keep each constant close to its functional owner. Do not create global constants by default, and do not move unrelated values into a generic catch-all constants file.
- If a constant is repeated in multiple components within the same module, promote it to that module's `constants/` folder. If it is not reused outside its file, do not abstract it into a separate file.
- Group constants by domain ownership, not by generic technical category, and use consistent naming such as `UPPER_CASE` for constants.
- Use configuration only for environment, integration, or deployment values. Use module-scoped constants for statuses, rules, route paths, timeouts, limits, defaults, provider names, control messages, and similar behavior values.
- Allowed exceptions:
  - trivial numeric literals `-1`, `0`, and `1`
  - visible UI copy rendered from JSX
  - import/export sources and obvious structural property names or keys

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

- Use `npm run db:migrate` to push versioned migrations to Neon.
- Use `npm run db:migrate:force` only when a forced Drizzle push is intentionally required.

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
- For examples and decision guidance, see the concurrency, observability, and performance convention guide under `docs/conventions/`.
