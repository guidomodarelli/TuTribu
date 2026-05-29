import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Default prefetch behavior for every in-app navigation link.
 *
 * Next.js prefetches `<Link>` targets by default, which eagerly warms
 * server-rendered routes and adds load the user never asked for. We opt out by
 * default and let callers turn prefetch back on only where a route genuinely
 * benefits from it.
 */
const DEFAULT_PREFETCH = false;

export type LinkProps = ComponentProps<typeof NextLink>;

/**
 * App-wide navigation link primitive.
 *
 * Thin wrapper over Next.js `Link` that disables prefetch by default. Use this
 * instead of importing `next/link` directly so prefetch stays opt-in across the
 * whole product. Every other `Link` prop (including `ref` and `className`) is
 * forwarded untouched, and callers can still re-enable prefetch by passing
 * `prefetch`.
 */
export function Link({ prefetch = DEFAULT_PREFETCH, ...props }: LinkProps) {
  return <NextLink prefetch={prefetch} {...props} />;
}
