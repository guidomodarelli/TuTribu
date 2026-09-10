import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "beez-ui";

import { TribeWelcomeDisplay } from "@/components/tribes/tribe-welcome-display";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
  },
}));

const fetchMock = vi.fn();

function buildWelcome() {
  return {
    links: [
      {
        badgeLabel: "Soporte",
        description: null,
        id: "11111111-1111-4111-8111-111111111111",
        isActive: true,
        label: "Soporte",
        message: null,
        phoneNumber: null,
        sortOrder: 1,
        type: TRIBE_WELCOME_LINK_TYPE.customButton,
        url: "https://soporte.example.com",
      },
    ],
    linksHeading: "Recursos para empezar",
    rules: [],
    selectionModalBenefit: null,
    selectionModalDescription:
      "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
    selectionModalTitle: "Elegí cómo querés empezar",
    welcomeMessage: "Hola",
  };
}

describe("TribeWelcomeDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      json: vi.fn(async () => ({})),
      ok: true,
    });
  });

  it("renders plain anchors and does not record selections when tribeSlug is omitted", async () => {
    const user = userEvent.setup();

    render(<TribeWelcomeDisplay welcome={buildWelcome()} />);

    const anchor = screen.getByRole("link", { name: /Soporte/ });

    expect(anchor).toHaveAttribute("href", "https://soporte.example.com");

    await user.click(anchor);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a selection per click and navigates the pre-opened window to the link destination", async () => {
    const user = userEvent.setup();
    const openedWindow = {
      close: vi.fn(),
      location: {
        href: "about:blank",
      },
      opener: window,
    };
    const openMock = vi.fn(() => openedWindow);

    Object.defineProperty(window, "open", {
      configurable: true,
      value: openMock,
    });

    render(
      <TribeWelcomeDisplay
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    const trigger = screen.getByRole("button", { name: /Soporte/ });

    await user.click(trigger);

    expect(openMock).toHaveBeenCalledWith("about:blank", "_blank");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/welcome/selections",
      expect.objectContaining({
        body: JSON.stringify({
          welcomeLinkId: "11111111-1111-4111-8111-111111111111",
        }),
        method: "POST",
      })
    );
    await waitFor(() => {
      expect(openedWindow.location.href).toBe("https://soporte.example.com");
    });

    await user.click(trigger);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows an error toast and closes the destination window when the selection POST fails", async () => {
    const user = userEvent.setup();
    const openedWindow = {
      close: vi.fn(),
      location: {
        href: "about:blank",
      },
      opener: window,
    };
    const openMock = vi.fn(() => openedWindow);

    Object.defineProperty(window, "open", {
      configurable: true,
      value: openMock,
    });
    fetchMock.mockResolvedValueOnce({
      json: vi.fn(async () => ({ message: "Algo falló" })),
      ok: false,
    });

    render(
      <TribeWelcomeDisplay
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Soporte/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Algo falló");
    });
    expect(openedWindow.close).toHaveBeenCalled();
    expect(openedWindow.location.href).toBe("about:blank");
  });
});
