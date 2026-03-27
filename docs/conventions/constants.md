# Constants Organization

Use constants according to their real reuse scope so behavior stays easy to find and duplication stays low.

## Goal

Differentiate constants by ownership and reuse level instead of extracting every literal by default.

## Scope Rules

### Global constants

Use `src/constants/` only for values reused across multiple modules or across the whole application.

Examples:

- shared route maps
- shared configuration keys
- cross-module enums or statuses

```ts
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
} as const;
```

### Module constants

Use `src/modules/<module>/constants/` for values that belong to one module and should stay owned by that module.

Examples:

- module statuses
- business limits
- route segments used only by that module
- provider names or control messages scoped to one module

```ts
export const USER_ROLES = {
  ADMIN: "admin",
  USER: "user",
} as const;
```

### File-local constants

Keep a constant inside the same file when it is only used by one page, component, route, or module file.

```ts
const MAX_RETRIES = 3;
```

Do not extract file-local values into separate files without a concrete reuse need.

## Quick Decision Guide

| Use case | Location |
| --- | --- |
| Reused across the app or multiple modules | `src/constants/` |
| Reused only inside one module | `src/modules/<module>/constants/` |
| Used in exactly one file | keep it in that file |
| Repeated in multiple files of the same module | promote it to that module's `constants/` folder |

## Notes

- Keep each constant close to its functional owner.
- Do not create global constants by default.
- Group constants by domain ownership, not by generic technical category.
- Prefer `UPPER_CASE` naming for constants.
- Use configuration only for environment, integration, or deployment values.
- ESLint already enforces objective parts of this policy such as forbidden magic behavior values and restricted imports. This document covers the structural decision criteria that still require engineering judgment.
