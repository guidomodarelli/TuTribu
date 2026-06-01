import { render, waitFor } from "@testing-library/react";

import { SitepingProvider } from "@/components/providers/siteping-provider";

const initSitepingMock = jest.fn(() => ({
  destroy: jest.fn(),
}));
const fetchMock = jest.fn();

jest.mock("@siteping/widget", () => ({
  initSiteping: (config: unknown) => initSitepingMock(config),
}), { virtual: true });

describe("SitepingProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("does not initialize Siteping when identity is disabled", async () => {
    fetchMock.mockResolvedValueOnce({
      json: jest.fn(async () => ({
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

  it("initializes Siteping with diagnostics and without screenshots for authorized members", async () => {
    fetchMock.mockResolvedValueOnce({
      json: jest.fn(async () => ({
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
          enableScreenshot: false,
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
