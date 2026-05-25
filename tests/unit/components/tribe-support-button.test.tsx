import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";

import { TribeSupportButton } from "@/components/tribes/tribe-support-button";
import { TRIBE_SUPPORT_CHANNEL } from "@/src/modules/tribes/constants/tribe-support";
import { ROUTES } from "@/src/constants/routes";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

jest.mock("@/components/tribes/tribe-support-config-dialog", () => ({
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

const usePathnameMock = usePathname as jest.MockedFunction<typeof usePathname>;
const fetchMock = jest.fn();

const LEADER_TRIBE: MemberTribeListItemResult = {
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

const MEMBER_TRIBE: MemberTribeListItemResult = {
  tribeId: "tribe-member",
  membershipStatus: "active",
  name: "Tribu Miembro",
  role: "tribemate",
  slug: "tribu-miembro",
};

function mockFetchOnce(settings: unknown) {
  fetchMock.mockResolvedValueOnce({
    json: jest.fn(async () => ({ settings })),
    ok: true,
  });
}

describe("TribeSupportButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));

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
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));

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
