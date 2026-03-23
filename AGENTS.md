<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 1. Security & Environment

### Security baseline

- Never hardcode secrets, OAuth credentials, refresh tokens, API keys, or user tokens in source code, tests, fixtures, screenshots, or documentation.
- Keep sensitive credentials only in environment variables and server-side secret storage.
- Treat Google access tokens and refresh tokens as server-only data. They must never be exposed to the browser, serialized in page props, or logged.
- Validate and sanitize all external input before it crosses into `application` or `domain`.
- Avoid leaking internal errors, stack traces, provider payloads, file identifiers, or token data in UI messages.

**rule file**: `.agentic-rules/nodejs/nodejs-security-patterns-rules_v1.md`

## 2. Core Architecture

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
- `src/features` cannot be used as an integration layer for new adapters; adapter composition must happen in module-scoped `infrastructure/composition/*`.
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
        google-drive/
        auth/
        oauth/
        repositories/
    shared/
      domain/
      application/
      infrastructure/
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
  - No framework, HTTP, Google SDK, or persistence details.
- `application`
  - Use cases and internal contracts (`commands`, `queries`, `results`).
  - Orchestrates domain behavior through ports.
  - Validate and normalize inputs through domain value objects or application contracts, not through generic helpers in `lib`.
- `infrastructure`
  - Adapters for Google APIs, authentication, HTTP clients, storage, and third-party SDKs.
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
- Tailwind remains available only because it is part of the official `shadcn/ui` setup. Product styling should default to `SCSS`.

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

- Never pass Google API DTOs directly to route components.
- Never import bootstrap builders, OAuth config, Drive clients, or API error mappers from a generic `src/server` path.

### Client-side fetching

- Client-side fetching is allowed only when server-side loading is not a fit, such as user-triggered refreshes, incremental interactions, or post-render mutations.
- If client-side fetching is necessary, keep it behind use cases and adapters instead of calling third-party SDKs from components.
- When a route needs client-side fetching plus auth/session state, prefer a container/presenter split:
  - route-level client container owns session, fetch, mutation state, and validation flow
  - presentational component renders props and emits callbacks only

## 5. Google OAuth and Drive Integration

### Authentication setup

- Prepare Google OAuth for user account connection through App Router.
- If `next-auth` or `auth.js` is used, keep the auth route handler under `app/api/auth/[...nextauth]/route.ts` and keep the auth configuration in module infrastructure code.
- Keep `authOptions`, OAuth config, token refresh logic, and Google client factories inside `src/modules/auth/infrastructure/*`.
- Wrap session-aware client providers from `app/layout.tsx` through a dedicated providers component when the UI needs client session context.

### OAuth behavior

- The authorization flow must support offline access when long-lived Drive access is needed.
- Prefer server-managed OAuth code exchange and secure token persistence.
- Use custom sign-in and error pages when product UX requires it, but keep sensitive failure details out of the UI.

### Google Drive rules

- Store internal application data in the database (Turso), not in Drive app data storage.
- Use `drive.file` for user-visible files in My Drive.
- Keep Google SDK calls isolated in infrastructure adapters.
- Keep Google Drive error mapping and Drive client factories inside module infrastructure folders such as `src/modules/storage/infrastructure/*` and `src/modules/auth/infrastructure/*`.

## 6. Development Workflow

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

- Run the relevant test suite until it is green.
- A task is not complete until the relevant tests and lint checks pass.

### Testing responsibilities by layer

- `domain`
  - Unit tests for entities, value objects, and pure business rules.
- `application`
  - Unit tests for use cases using doubles for domain ports.
- `infrastructure`
  - Integration tests for adapters, DTO mappers, auth wiring, and Google API boundaries.
- `app` and UI
  - React Testing Library tests for server/client component boundaries, rendering, and critical user flows.
- End-to-end
  - Add smoke coverage for critical authentication and Drive workflows.

### Testing rules

- Never place test files inside `app`, because App Router can treat colocated special files as route artifacts and it keeps entrypoints harder to scan.
- When functionality changes, add or update the corresponding tests in the same work item.
- Prefer mocks at the port boundary, not at low-level vendor internals, unless the test is explicitly for an adapter.
- During migration, each moved feature must include at least:
  - application use-case tests using domain ports doubles
  - infrastructure adapter or mapper tests for DTO to entity mapping
  - route-level tests to verify entrypoint wiring still renders expected UI output

## 7. Implementation Checklist

- Does the change preserve hexagonal boundaries?
- Is there any new or restored code under `src/server/`? If yes, move it into a module.
- Is App Router still the routing mechanism?
- Is server-side loading the default data-loading strategy for this use case?
- Are external DTOs isolated in infrastructure?
- Are UI-facing models isolated from vendor payloads?
- Are domain input shapes modeled as value objects and application outputs modeled as `results/` contracts?
- Do all route entrypoints avoid imports from `src/features` and direct repository implementations?
- Is dependency composition centralized in module `infrastructure/composition` and consumed from route entrypoints only?
- Was `shadcn/ui` added through the CLI only?
- Are product styles implemented with `SCSS`?
- Are Google tokens and secrets kept server-side only?
- Were tests written first and left green at the end?
