import { vi, describe, it, expect } from "vitest";
import { render as renderComponent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { AppProviders } from "@/components/providers/app-providers";

import { Link } from "@/components/navigation/link";

/** Exercises the application link with its actual provider-selected Next adapter. */
function render(ui: ReactElement) {
  return renderComponent(<AppProviders isSitepingEnabled={false}>{ui}</AppProviders>);
}

/**
 * The shared `Link` only adds behavior to Next.js' `Link`: it flips the
 * prefetch default to `false`. Next.js never reflects `prefetch` to the DOM
 * (it is handled internally through the router and an IntersectionObserver),
 * so the wrapper contract cannot be observed in jsdom without intercepting the
 * prop. We mock `next/link` to surface the forwarded `prefetch` as a data
 * attribute, mirroring the existing not-found page test. The mock stays minimal
 * and only renders an anchor, so the test still exercises the real wrapper.
 */
vi.mock("next/link.js", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

describe("Link", () => {
  it("disables prefetch by default", () => {
    render(<Link href="/tribus">Ver tribus</Link>);

    expect(screen.getByRole("link", { name: /ver tribus/i })).toHaveAttribute(
      "data-prefetch",
      "false"
    );
  });

  it("lets callers opt back into prefetch", () => {
    render(
      <Link href="/tribus" prefetch>
        Ver tribus
      </Link>
    );

    expect(screen.getByRole("link", { name: /ver tribus/i })).toHaveAttribute(
      "data-prefetch",
      "true"
    );
  });

  it("forwards the remaining link props untouched", () => {
    render(
      <Link href="/tribus" className="custom-link" aria-label="Ir a tribus">
        Ver tribus
      </Link>
    );

    const link = screen.getByRole("link", { name: /ir a tribus/i });

    expect(link).toHaveAttribute("href", "/tribus");
    expect(link).toHaveClass("custom-link");
  });
});
