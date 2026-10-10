import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Avatar, AvatarImage } from "beez-ui";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";

const fetchMock = vi.fn();

/** Supplies the real ordinary-route context required before optional reporting can classify a location. */
function RouteContext({ children }: { children: ReactNode }) {
  return <PathnameContext.Provider value="/synthetic-tribe"><SearchParamsContext.Provider value={new URLSearchParams()}>{children}</SearchParamsContext.Provider></PathnameContext.Provider>;
}

describe("AppProviders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("should activate Next Image for shared avatars", () => {
    render(<RouteContext><AppProviders isSitepingEnabled={false}><Avatar><AvatarImage src="/profile.png" alt="Perfil" /></Avatar></AppProviders></RouteContext>);
    expect(screen.getByAltText("Perfil")).toHaveAttribute("data-nimg", "1");
    expect((screen.getByAltText("Perfil") as HTMLImageElement).src).toBe(new URL("/profile.png", window.location.href).href);
  });

  it("does not fetch Siteping identity when Siteping is disabled", () => {
    render(
      <RouteContext><AppProviders isSitepingEnabled={false}>
        <main>Contenido</main>
      </AppProviders></RouteContext>
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches Siteping identity when Siteping is enabled", async () => {
    fetchMock.mockResolvedValueOnce({
      json: vi.fn(async () => ({
        enabled: false,
        identity: null,
        projectName: "tutribu",
      })),
      ok: true,
    });

    render(
      <RouteContext><AppProviders isSitepingEnabled>
        <main>Contenido</main>
      </AppProviders></RouteContext>
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/siteping/identity", { signal: expect.any(AbortSignal) })
    );
  });
});
