import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { TribeWelcomeDisplay } from "@/components/tribes/tribe-welcome-display";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
  },
}));

const fetchMock = jest.fn();

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
    rules: [],
    welcomeMessage: "Hola",
  };
}

describe("TribeWelcomeDisplay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      json: jest.fn(async () => ({})),
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
      close: jest.fn(),
      location: {
        href: "about:blank",
      },
      opener: window,
    };
    const openMock = jest.fn(() => openedWindow);

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
      close: jest.fn(),
      location: {
        href: "about:blank",
      },
      opener: window,
    };
    const openMock = jest.fn(() => openedWindow);

    Object.defineProperty(window, "open", {
      configurable: true,
      value: openMock,
    });
    fetchMock.mockResolvedValueOnce({
      json: jest.fn(async () => ({ message: "Algo falló" })),
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
