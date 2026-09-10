import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Avatar, AvatarImage } from "beez-ui";

import { AppProviders } from "@/components/providers/app-providers";

const fetchMock = vi.fn();

describe("AppProviders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("should activate Next Image for shared avatars", () => {
    render(<AppProviders isSitepingEnabled={false}><Avatar><AvatarImage src="/profile.png" alt="Perfil" /></Avatar></AppProviders>);
    expect(screen.getByAltText("Perfil")).toHaveAttribute("data-nimg", "1");
    expect((screen.getByAltText("Perfil") as HTMLImageElement).src).toBe(new URL("/profile.png", window.location.href).href);
  });

  it("does not fetch Siteping identity when Siteping is disabled", () => {
    render(
      <AppProviders isSitepingEnabled={false}>
        <main>Contenido</main>
      </AppProviders>
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
      <AppProviders isSitepingEnabled>
        <main>Contenido</main>
      </AppProviders>
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/siteping/identity")
    );
  });
});
