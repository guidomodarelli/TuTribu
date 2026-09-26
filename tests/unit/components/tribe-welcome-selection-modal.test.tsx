import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "beez-ui";

import { TribeWelcomeSelectionModal } from "@/components/tribes/tribe-welcome-selection-modal";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
  },
}));

const fetchMock = vi.fn();

function buildLinks() {
  return [
    { description: null,
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
    vi.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      json: vi.fn(async () => ({})),
      ok: true,
    });
  });

  it("opens a destination window during the click before recording the selection", async () => {
    const user = userEvent.setup();
    let resolveSelectionRequest!: (response: unknown) => void;
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
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSelectionRequest = resolve;
      })
    );

    render(
      <TribeWelcomeSelectionModal title="Bienvenida" description=""
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
      json: vi.fn(async () => ({})),
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
    fetchMock.mockReturnValue(new Promise(() => undefined));

    render(
      <TribeWelcomeSelectionModal title="Bienvenida" description=""
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
        <TribeWelcomeSelectionModal title="Bienvenida" description=""
          links={buildLinks()}
          open
          tribeSlug="matematica-pro"
        />
        <button type="button">Acción de fondo</button>
      </>
    );

    const closeButton = screen.getByRole("button", { name: "Cerrar" });
    const optionButton = screen.getByRole("button", { name: "Soporte" });
    // The shared dialog hides the rest of the page from assistive technology.
    const backgroundButton = screen.getByRole("button", {
      hidden: true,
      name: "Acción de fondo",
    });

    expect(
      screen.queryByRole("button", { name: "Acción de fondo" })
    ).not.toBeInTheDocument();
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

  it("closes with Escape and notifies the host", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <TribeWelcomeSelectionModal
        description="Elegí una opción"
        links={buildLinks()}
        onClose={onClose}
        open
        title="Bienvenida"
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("dialog", { name: "Bienvenida" })
    ).toHaveAccessibleDescription("Elegí una opción");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Bienvenida" })
      ).not.toBeInTheDocument();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("follows the open prop when the host keeps it mounted", async () => {
    const { rerender } = render(
      <TribeWelcomeSelectionModal
        description=""
        links={buildLinks()}
        open={false}
        title="Bienvenida"
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <TribeWelcomeSelectionModal
        description=""
        links={buildLinks()}
        open
        title="Bienvenida"
        tribeSlug="matematica-pro"
      />
    );

    expect(
      await screen.findByRole("dialog", { name: "Bienvenida" })
    ).toBeInTheDocument();
  });

  it("stays closed when there is no active option to choose", () => {
    render(
      <TribeWelcomeSelectionModal
        description=""
        links={buildLinks().map((link) => ({ ...link, isActive: false }))}
        open
        title="Bienvenida"
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
