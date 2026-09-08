import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "beez-ui";

import { TribeWelcomeSelectionModal } from "@/components/tribes/tribe-welcome-selection-modal";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

// Preserve the existing Sonner double to isolate its timers and global notification store.
jest.mock("beez-ui", () => ({
  ...jest.requireActual("beez-ui"),
  toast: {
    error: jest.fn(),
  },
}));

const fetchMock = jest.fn();

function buildLinks() {
  return [
    {
      badgeLabel: "Soporte",
      id: "11111111-1111-4111-8111-111111111111",
      isActive: true,
      label: "Soporte",
      message: null,
      phoneNumber: null,
      sortOrder: 1,
      type: TRIBE_WELCOME_LINK_TYPE.customButton,
      url: "https://soporte.example.com",
    },
  ];
}

describe("TribeWelcomeSelectionModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      json: jest.fn(async () => ({})),
      ok: true,
    });
  });

  it("opens a destination window during the click before recording the selection", async () => {
    const user = userEvent.setup();
    let resolveSelectionRequest!: (response: unknown) => void;
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
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSelectionRequest = resolve;
      })
    );

    render(
      <TribeWelcomeSelectionModal
        links={buildLinks()}
        open
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Soporte" }));

    expect(openMock).toHaveBeenCalledWith("about:blank", "_blank");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/welcome/selections",
      expect.objectContaining({
        method: "POST",
      })
    );

    resolveSelectionRequest({
      json: jest.fn(async () => ({})),
      ok: true,
    });

    await waitFor(() => {
      expect(openedWindow.location.href).toBe("https://soporte.example.com");
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("disables options while a selection request is pending", async () => {
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
    fetchMock.mockReturnValue(new Promise(() => undefined));

    render(
      <TribeWelcomeSelectionModal
        links={buildLinks()}
        open
        tribeSlug="matematica-pro"
      />
    );

    const optionButton = screen.getByRole("button", { name: "Soporte" });

    await user.click(optionButton);

    expect(optionButton).toBeDisabled();

    await user.click(optionButton);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it("keeps tab navigation trapped inside the open modal", async () => {
    const user = userEvent.setup();

    render(
      <>
        <TribeWelcomeSelectionModal
          links={buildLinks()}
          open
          tribeSlug="matematica-pro"
        />
        <button type="button">Acción de fondo</button>
      </>
    );

    const closeButton = screen.getByRole("button", { name: "Cerrar" });
    const optionButton = screen.getByRole("button", { name: "Soporte" });
    const backgroundButton = screen.getByRole("button", {
      name: "Acción de fondo",
    });

    expect(closeButton).toHaveFocus();

    await user.tab();

    expect(optionButton).toHaveFocus();

    await user.tab();

    expect(closeButton).toHaveFocus();
    expect(backgroundButton).not.toHaveFocus();

    await user.tab({ shift: true });

    expect(optionButton).toHaveFocus();
    expect(backgroundButton).not.toHaveFocus();
  });
});
