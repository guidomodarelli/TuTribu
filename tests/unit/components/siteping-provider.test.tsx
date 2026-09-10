import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { SitepingProvider } from "@/components/providers/siteping-provider";

const initSitepingMock = vi.fn((config: unknown) => ({
  config,
  destroy: vi.fn(),
}));
const fetchMock = vi.fn();

vi.mock("@siteping/widget", () => ({
  initSiteping: (config: unknown) => initSitepingMock(config),
}));

describe("SitepingProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("does not initialize Siteping when identity is disabled", async () => {
    fetchMock.mockResolvedValueOnce({
      json: vi.fn(async () => ({
        enabled: false,
        identity: null,
        projectName: "tutribu",
      })),
      ok: true,
    });

    render(<SitepingProvider />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/siteping/identity"));
    expect(initSitepingMock).not.toHaveBeenCalled();
  });

  it("initializes Siteping with diagnostics and screenshots for authorized members", async () => {
    fetchMock.mockResolvedValueOnce({
      json: vi.fn(async () => ({
        enabled: true,
        identity: {
          email: "leader@example.com",
          name: "Leader Example",
        },
        projectName: "tutribu",
      })),
      ok: true,
    });

    render(<SitepingProvider />);

    await waitFor(() =>
      expect(initSitepingMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          captureDiagnostics: true,
          deepLink: true,
          enableScreenshot: true,
          endpoint: "/api/siteping",
          forceShow: true,
          identity: {
            email: "leader@example.com",
            name: "Leader Example",
          },
          locale: "es",
          projectName: "tutribu",
        })
      )
    );
  });
});
