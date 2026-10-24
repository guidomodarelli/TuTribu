/** Hydrates the admission section row over its server markup and checks where it leaves the row scrolled. @module admission-section-navigation-tests */
import { act, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it, vi } from "vitest";
import { AdmissionSectionNavigation } from "@/components/academy-admissions/admission-section-navigation";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionSection } from "@/src/modules/academy-admissions/constants/admission-sections";

const router = { back: vi.fn(), bfcacheId: "synthetic-admission-section-row", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
const NAVIGATION_LABEL = "Secciones de admisión";
/** A 390 px phone: the row shows 382 px of a 900 px strip, and each section link is 100 px wide. */
const ROW_GEOMETRY = { clientWidth: 382, scrollWidth: 900, linkWidth: 100 };
/** Where the row sits after the member swiped it to reach «Avisos», before any script ran. */
const SWIPED_SCROLL_LEFT = 389;

/** @param section - The open section. @returns The row inside the application's own providers. */
function tree(section: AdmissionSection): ReactNode {
  return <AppRouterContext.Provider value={router}><AppUIProvider><AdmissionSectionNavigation label={NAVIGATION_LABEL} slug="tribu" section={section} audience="leader" /></AppUIProvider></AppRouterContext.Provider>;
}

/**
 * jsdom has no layout, so the row and its links get the geometry a narrow screen gives them; `scrollTo` records each
 * request and moves the row as a browser would.
 * @param container - Server markup about to hydrate. @param scrollLeft - Row position before hydration.
 * @returns The scroll requests the row receives.
 */
function layOutRow(container: HTMLElement, scrollLeft: number) {
  const row = container.querySelector("ul")!, requests: ScrollToOptions[] = [];
  let position = scrollLeft;
  Object.defineProperties(row, {
    clientWidth: { configurable: true, value: ROW_GEOMETRY.clientWidth },
    scrollWidth: { configurable: true, value: ROW_GEOMETRY.scrollWidth },
    scrollLeft: { configurable: true, get: () => position },
    scrollTo: { configurable: true, value: (options: ScrollToOptions) => { requests.push(options); position = options.left ?? position; } },
  });
  within(container).getAllByRole("link").forEach((link, index) => Object.defineProperties(link, {
    offsetLeft: { configurable: true, value: index * ROW_GEOMETRY.linkWidth },
    offsetWidth: { configurable: true, value: ROW_GEOMETRY.linkWidth },
  }));
  return { requests, position: () => position };
}

/** @param section - The open section. @param scrollLeft - Row position before hydration. @param run - Checks on the hydrated row. */
async function hydrateRow(section: AdmissionSection, scrollLeft: number, run: (row: ReturnType<typeof layOutRow>, root: ReturnType<typeof hydrateRoot>) => Promise<void>) {
  const container = document.createElement("div"), recoverable: unknown[] = [];
  container.innerHTML = renderToString(tree(section)); document.body.append(container);
  const row = layOutRow(container, scrollLeft);
  let root: ReturnType<typeof hydrateRoot> | null = null;
  try {
    await act(async () => { root = hydrateRoot(container, tree(section), { onRecoverableError: (error) => recoverable.push(error) }); });
    expect(recoverable).toEqual([]);
    await run(row, root!);
  } finally { await act(async () => { root?.unmount(); }); container.remove(); }
}

describe("admission section row scrolling", () => {
  it("should keep the row where the member swiped it when a tap hydrates it, so the tapped section stays under the finger", async () => {
    await hydrateRow("review", SWIPED_SCROLL_LEFT, async (row) => {
      expect(row.requests).toEqual([]);
      expect(row.position()).toBe(SWIPED_SCROLL_LEFT);
    });
  });

  it("should bring the open section into view on arrival when the member has not scrolled the row", async () => {
    // «Avisos» is the seventh section for a leader: 600 px from the start of the strip, out of a 382 px view.
    await hydrateRow("notifications", 0, async (row) => {
      expect(row.requests).toHaveLength(1);
      expect(row.position()).toBe(600 - (ROW_GEOMETRY.clientWidth - ROW_GEOMETRY.linkWidth) / 2);
    });
  });

  it("should still follow the open section on later navigations after the member swiped the row", async () => {
    await hydrateRow("review", SWIPED_SCROLL_LEFT, async (row, root) => {
      await act(async () => { root.render(tree("policy")); });
      // «Reglas» starts at 100 px, left of the swiped view, so the row scrolls back to show it.
      expect(row.requests).toHaveLength(1);
      expect(row.position()).toBe(0);
    });
  });
});
