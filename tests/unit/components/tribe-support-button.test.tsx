import { vi, describe, it, expect, beforeEach, type MockedFunction } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";

import { TribeSupportButton } from "@/components/tribes/tribe-support-button";
import { TRIBE_SUPPORT_CHANNEL } from "@/src/modules/tribes/constants/tribe-support";
import { ROUTES } from "@/src/constants/routes";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/components/tribes/tribe-support-config-dialog", () => ({
  TribeSupportConfigDialog: ({
    onOpenChange,
    open,
    tribeSlug,
  }: {
    onOpenChange: (open: boolean) => void;
    open: boolean;
    tribeSlug: string;
  }) =>
    open ? (
      <div data-testid="support-config-dialog" data-tribe-slug={tribeSlug}>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cerrar mock
        </button>
      </div>
    ) : null,
}));

const usePathnameMock = usePathname as MockedFunction<typeof usePathname>;
const fetchMock = vi.fn();

const LEADER_TRIBE: MemberTribeListItemResult = { logoUrl: null,
  tribeId: "tribe-leader",
  membershipStatus: "active",
  name: "Tribu Líder",
  role: "leader",
  slug: "tribu-lider",
};

const MUTED_LEADER_TRIBE: MemberTribeListItemResult = {
  ...LEADER_TRIBE,
  membershipStatus: "muted",
};

const MEMBER_TRIBE: MemberTribeListItemResult = { logoUrl: null,
  tribeId: "tribe-member",
  membershipStatus: "active",
  name: "Tribu Miembro",
  role: "tribemate",
  slug: "tribu-miembro",
};

function mockFetchOnce(settings: unknown) {
  fetchMock.mockResolvedValueOnce({
    json: vi.fn(async () => ({ settings })),
    ok: true,
  });
}

describe("TribeSupportButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders nothing when there is no active tribe", () => {
    usePathnameMock.mockReturnValue("/");

    const { container } = render(
      <TribeSupportButton memberTribes={[LEADER_TRIBE, MEMBER_TRIBE]} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides the button when a non-leader member has no support configured", async () => {
    usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(MEMBER_TRIBE.slug));
    mockFetchOnce(null);

    const { container } = render(
      <TribeSupportButton memberTribes={[MEMBER_TRIBE]} />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders a direct WhatsApp link for non-leader members when support is configured", async () => {
    usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(MEMBER_TRIBE.slug));
    mockFetchOnce({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: "Hola",
      phoneNumber: "+54 9 11 1234 5678",
    });

    render(<TribeSupportButton memberTribes={[MEMBER_TRIBE]} />);

    const link = await screen.findByRole("link", {
      name: /Abrir WhatsApp de soporte/i,
    });
    expect(link).toHaveAttribute(
      "href",
      `https://wa.me/5491112345678?text=${encodeURIComponent("Hola")}`
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByTestId("support-config-dialog")).not.toBeInTheDocument();
  });

  it("still loads support on WebKit versions without AbortSignal.any", async () => {
    const abortSignalAnyDescriptor = Object.getOwnPropertyDescriptor(
      AbortSignal,
      "any"
    );

    // Safari < 17.4 ships AbortSignal without the static `any` combinator.
    Object.defineProperty(AbortSignal, "any", {
      configurable: true,
      value: undefined,
      writable: true,
    });

    try {
      usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(MEMBER_TRIBE.slug));
      mockFetchOnce({
        channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
        message: null,
        phoneNumber: "+54 9 11 1234 5678",
      });

      render(<TribeSupportButton memberTribes={[MEMBER_TRIBE]} />);

      expect(
        await screen.findByRole("link", { name: /Abrir WhatsApp de soporte/i })
      ).toHaveAttribute("href", "https://wa.me/5491112345678");

      const passedSignal = fetchMock.mock.calls[0]?.[1]?.signal as
        | AbortSignal
        | undefined;

      expect(passedSignal).toBeInstanceOf(AbortSignal);
      expect(passedSignal?.aborted).toBe(false);
    } finally {
      if (abortSignalAnyDescriptor) {
        Object.defineProperty(AbortSignal, "any", abortSignalAnyDescriptor);
      }
    }
  });

  it("renders a direct WhatsApp link for muted leaders when support is configured", async () => {
    usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(MUTED_LEADER_TRIBE.slug));
    mockFetchOnce({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: "Hola",
      phoneNumber: "+54 9 11 1234 5678",
    });

    render(<TribeSupportButton memberTribes={[MUTED_LEADER_TRIBE]} />);

    const link = await screen.findByRole("link", {
      name: /Abrir WhatsApp de soporte/i,
    });
    expect(link).toHaveAttribute(
      "href",
      `https://wa.me/5491112345678?text=${encodeURIComponent("Hola")}`
    );
    expect(screen.queryByRole("button", { name: /Botón de soporte/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("support-config-dialog")).not.toBeInTheDocument();
  });

  it("shows a disabled loading button for active leaders while the support fetch is pending", () => {
    usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(LEADER_TRIBE.slug));
    fetchMock.mockImplementationOnce(function () { return new Promise(() => {}); });

    render(<TribeSupportButton memberTribes={[LEADER_TRIBE]} />);

    const loadingButton = screen.getByRole("button", {
      name: /Cargando soporte/i,
    });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByRole("button", { name: /Botón de soporte/i })
    ).not.toBeInTheDocument();
  });

  it("does not render any button for non-leader members while the support fetch is pending", () => {
    usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(MEMBER_TRIBE.slug));
    fetchMock.mockImplementationOnce(function () { return new Promise(() => {}); });

    const { container } = render(
      <TribeSupportButton memberTribes={[MEMBER_TRIBE]} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("opens the configuration dialog directly when a leader has not configured support yet", async () => {
    usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(LEADER_TRIBE.slug));
    mockFetchOnce(null);

    render(<TribeSupportButton memberTribes={[LEADER_TRIBE]} />);

    const trigger = await screen.findByRole("button", {
      name: /Botón de soporte/i,
    });

    await userEvent.click(trigger);

    const dialog = await screen.findByTestId("support-config-dialog");
    expect(dialog).toHaveAttribute("data-tribe-slug", LEADER_TRIBE.slug);
  });

  it("recovers from a stuck support request by settling the loading state after the abort fires", async () => {
    usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(LEADER_TRIBE.slug));
    fetchMock.mockImplementationOnce(function (_url: string, init?: { signal?: AbortSignal }) {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          return;
        }
        signal.addEventListener("abort", () => {
          const abortError = new Error("Aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      });
    });

    render(<TribeSupportButton memberTribes={[LEADER_TRIBE]} />);

    expect(
      await screen.findByRole("button", { name: /Cargando soporte/i })
    ).toBeInTheDocument();

    const passedSignal = fetchMock.mock.calls[0]?.[1]?.signal as
      | AbortSignal
      | undefined;

    expect(passedSignal).toBeDefined();

    // Use an event created by the same native implementation as AbortSignal.
    const abortEvent = await new Promise<Event>((resolve) => {
      AbortSignal.timeout(0).addEventListener("abort", resolve, { once: true });
    });
    await act(async () => {
      (passedSignal as AbortSignal & { dispatchEvent: (event: Event) => boolean }).dispatchEvent(
        abortEvent
      );
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Cargando soporte/i })
      ).not.toBeInTheDocument()
    );
    expect(
      await screen.findByRole("button", { name: /Botón de soporte/i })
    ).toBeInTheDocument();
  });

  it("does not re-fetch support settings when the parent re-renders with a new memberTribes array for the same tribe", async () => {
    usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(LEADER_TRIBE.slug));
    mockFetchOnce(null);

    const { rerender } = render(
      <TribeSupportButton memberTribes={[LEADER_TRIBE]} />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: /Botón de soporte/i });

    rerender(<TribeSupportButton memberTribes={[{ ...LEADER_TRIBE }]} />);
    rerender(<TribeSupportButton memberTribes={[{ ...LEADER_TRIBE }]} />);

    await screen.findByRole("button", { name: /Botón de soporte/i });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens a dropdown with open-link and configure actions when a leader already has support configured", async () => {
    usePathnameMock.mockReturnValue(ROUTES.tribes.bySlug(LEADER_TRIBE.slug));
    mockFetchOnce({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: null,
      phoneNumber: "+54 9 11 1234 5678",
    });

    render(<TribeSupportButton memberTribes={[LEADER_TRIBE]} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Botón de soporte/i })
      ).toHaveAttribute("aria-haspopup", "menu")
    );

    const trigger = screen.getByRole("button", {
      name: /Botón de soporte/i,
    });

    await userEvent.click(trigger);

    const openLink = await screen.findByRole("menuitem", {
      name: /Abrir enlace/i,
    });
    expect(openLink).toHaveAttribute("href", "https://wa.me/5491112345678");

    const configureItem = screen.getByRole("menuitem", { name: /Configurar/i });
    await userEvent.click(configureItem);

    const dialog = await screen.findByTestId("support-config-dialog");
    expect(dialog).toHaveAttribute("data-tribe-slug", LEADER_TRIBE.slug);
  });
});
