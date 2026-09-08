/** Owns the Next.js routing adapter while the shared library remains framework-agnostic. */
import NextLink from "next/link";
import type { ComponentProps } from "react";

/** Keeps speculative navigation opt-in for every product link. */
const DEFAULT_PREFETCH = false;
export type LinkProps = ComponentProps<typeof NextLink>;

/** Preserves client navigation and forwards all caller props to Next.js. */
export function Link({ prefetch = DEFAULT_PREFETCH, ...props }: LinkProps) {
  return <NextLink prefetch={prefetch} {...props} />;
}
