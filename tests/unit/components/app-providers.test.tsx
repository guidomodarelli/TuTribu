import { render, waitFor } from "@testing-library/react";

import { AppProviders } from "@/components/providers/app-providers";

const fetchMock = jest.fn();

describe("AppProviders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
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
      json: jest.fn(async () => ({
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
