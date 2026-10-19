/**
 * Re-exports shared navigation; AppUIProvider selects Next with prefetch disabled by default. `ButtonLink` renders
 * this same `Link` with Arc's button look, so it keeps the provider's adapter and its prefetch default.
 */
export { ButtonLink, Link, type ButtonLinkProps, type LinkProps } from "@astra-kit/ui";
