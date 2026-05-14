import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { usePathname, useRouter } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";

const pushMock = jest.fn();
const prefetchMock = jest.fn();
const setOpenMobileMock = jest.fn();
const appSidebarStyles = readFileSync(
  join(process.cwd(), "components", "app-sidebar", "styles.module.scss"),
  "utf8"
);

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock("@/components/auth/avatar-session-menu-client", () => ({
  AvatarSessionMenuClient: () => <div>Cuenta</div>,
}));

jest.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({
    children,
    variant,
  }: {
    children: React.ReactNode;
    variant?: string;
  }) => <aside data-variant={variant}>{children}</aside>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  SidebarMenuButton: ({
    children,
    onClick,
    tooltip,
    isActive,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    tooltip?: string;
    isActive?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      type="button"
      onClick={onClick}
      data-tooltip={tooltip}
      data-active={isActive}
      {...props}
    >
      {children}
    </button>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  SidebarRail: () => null,
  SidebarSeparator: ({ className }: { className?: string }) => (
    <hr className={className} />
  ),
  useSidebar: jest.fn(() => ({
    isMobile: false,
    setOpenMobile: setOpenMobileMock,
  })),
}));

describe("AppSidebar", () => {
  beforeEach(() => {
    const { useSidebar } = jest.requireMock("@/components/ui/sidebar");

    jest.clearAllMocks();
    pushMock.mockReset();
    setOpenMobileMock.mockReset();
    useSidebar.mockReturnValue({
      isMobile: false,
      setOpenMobile: setOpenMobileMock,
    });

    (useRouter as jest.Mock).mockReturnValue({
      prefetch: prefetchMock,
      push: pushMock,
    });
    (usePathname as jest.Mock).mockReturnValue("/");
  });

  it("renders the discovery navigation item with a compass icon", () => {
    render(<AppSidebar authenticatedMember={null} memberTribes={[]} />);

    const discoveryButton = screen.getByRole("button", {
      name: /descubrir tribus/i,
    });

    expect(discoveryButton).toHaveAttribute(
      "data-tooltip",
      "Descubrir tribus"
    );
    expect(discoveryButton.querySelector(".lucide-compass")).toBeInTheDocument();
  });

  it("uses the default sidebar variant", () => {
    render(<AppSidebar authenticatedMember={null} memberTribes={[]} />);

    expect(screen.getByRole("complementary")).toHaveAttribute("data-variant", "sidebar");
  });

  it("keeps the header separator constrained to the sidebar width", () => {
    render(<AppSidebar authenticatedMember={null} memberTribes={[]} />);

    expect(screen.getByRole("separator")).toHaveClass("AppSidebar__separator");
  });

  it("keeps the brand mark at a stable size during sidebar transitions", () => {
    render(<AppSidebar authenticatedMember={null} memberTribes={[]} />);

    expect(screen.getByText("TT")).toHaveClass("AppSidebar__brandMark");
  });

  it("replaces the product brand with the active tribe identity inside a tribe", () => {
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro");

    render(
      <AppSidebar
        authenticatedMember={null}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.getByText("MA")).toHaveClass("AppSidebar__brandMark");
    expect(screen.getAllByText("Matematica Pro")[0]).toHaveClass(
      "AppSidebar__brandName"
    );
    expect(screen.queryByText("TT")).not.toBeInTheDocument();
    expect(screen.queryByText("TuTribu")).not.toBeInTheDocument();
  });

  it("uses the active tribe brand button as the tribe switcher trigger", () => {
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro");

    render(
      <AppSidebar
        authenticatedMember={null}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: /matematica pro/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /matematica pro/i }).querySelector(".lucide-chevron-down")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /matematica pro/i })).not.toHaveAttribute(
      "data-tooltip"
    );
    expect(screen.queryByText("Tribu privada")).not.toBeInTheDocument();
  });

  it("lets the sidebar tribe switcher occupy the available menu width", () => {
    expect(appSidebarStyles).toMatch(/&__tribeSwitcher\s*{[^}]*display:\s*flex;/s);
    expect(appSidebarStyles).toMatch(/&__tribeSwitcher\s*{[^}]*width:\s*100%;/s);
  });

  it("keeps long active tribe names truncated before the chevron", () => {
    expect(appSidebarStyles).toMatch(/&__brandName\s*{[^}]*min-width:\s*0;/s);
    expect(appSidebarStyles).toMatch(/&__brandName\s*{[^}]*overflow:\s*hidden;/s);
    expect(appSidebarStyles).toMatch(/&__brandName\s*{[^}]*text-overflow:\s*ellipsis;/s);
    expect(appSidebarStyles).toMatch(/&__brandName\s*{[^}]*white-space:\s*nowrap;/s);
  });

  it("does not render the tribe switcher sidebar action outside a tribe", () => {
    render(<AppSidebar authenticatedMember={null} memberTribes={[]} />);

    expect(
      screen.queryByRole("button", { name: /abrir tribus/i })
    ).not.toBeInTheDocument();
  });

  it("opens tribe switcher actions when the active tribe brand is clicked", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro/eventos");

    render(
      <AppSidebar
        authenticatedMember={null}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: /matematica pro/i }));

    expect(screen.getByRole("menuitem", { name: /nueva tribu/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /descubrir tribus/i })).toBeInTheDocument();
  });

  it("renders discovery below the create action and before member tribes", () => {
    render(
      <AppSidebar
        authenticatedMember={null}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Alpha Club",
            slug: "alpha-club",
          },
          {
            tribeId: "tribe-2",
            name: "Beta Club",
            slug: "beta-club",
          },
        ]}
      />
    );

    const tribeButtons = screen.getAllByRole("button");
    const createTribeIndex = tribeButtons.findIndex((button) =>
      button.textContent?.includes("Nueva tribu")
    );
    const discoverTribesIndex = tribeButtons.findIndex((button) =>
      button.textContent?.includes("Descubrir tribus")
    );
    const firstMemberTribeIndex = tribeButtons.findIndex((button) =>
      button.textContent?.includes("Alpha Club")
    );

    expect(screen.getByText(/^Tribus$/i)).toBeInTheDocument();
    expect(createTribeIndex).toBeLessThan(discoverTribesIndex);
    expect(discoverTribesIndex).toBeLessThan(firstMemberTribeIndex);
  });

  it("shows an empty state when the authenticated member has no tribes", () => {
    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[]}
      />
    );

    expect(
      screen.getByText(/todavía no formas parte de ninguna tribu/i)
    ).toBeInTheDocument();
  });

  it("does not render the account menu in the sidebar", () => {
    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[]}
      />
    );

    expect(screen.queryByText("Cuenta")).not.toBeInTheDocument();
  });

  it("navigates to a member tribe from the global tribes section", async () => {
    const user = userEvent.setup();

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Alpha Club",
            slug: "alpha-club",
          },
          {
            tribeId: "tribe-2",
            name: "Beta Club",
            slug: "beta-club",
          },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: /beta club/i })).toHaveAttribute(
      "data-active",
      "false"
    );
    expect(screen.getByRole("button", { name: /alpha club/i }).querySelector(".lucide-check")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /alpha club/i }));

    expect(pushMock).toHaveBeenCalledWith("/tribu/alpha-club");
  });

  it("closes the mobile sidebar when a global navigation item is clicked", async () => {
    const user = userEvent.setup();
    const { useSidebar } = jest.requireMock("@/components/ui/sidebar");

    useSidebar.mockReturnValue({
      isMobile: true,
      setOpenMobile: setOpenMobileMock,
    });

    render(<AppSidebar authenticatedMember={null} memberTribes={[]} />);

    await user.click(screen.getByRole("button", { name: /descubrir tribus/i }));

    expect(pushMock).toHaveBeenCalledWith("/");
    expect(setOpenMobileMock).toHaveBeenCalledWith(false);
  });

  it("keeps the desktop sidebar open when a global navigation item is clicked", async () => {
    const user = userEvent.setup();

    render(<AppSidebar authenticatedMember={null} memberTribes={[]} />);

    await user.click(screen.getByRole("button", { name: /descubrir tribus/i }));

    expect(pushMock).toHaveBeenCalledWith("/");
    expect(setOpenMobileMock).not.toHaveBeenCalled();
  });

  it("renders tribe sections when the member is inside one of their tribes", () => {
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro");

    const { container } = render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(
      Array.from(container.querySelectorAll("p")).some(
        (paragraph) => paragraph.textContent === "Tribu"
      )
    ).toBe(false);
    expect(screen.getByRole("button", { name: /fogón/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.queryByRole("button", { name: /invitaciones/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /eventos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /la tribu/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /méritos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /historia/i })).toBeInTheDocument();
  });

  it("uses round and channel icons for tribe navigation", () => {
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            role: "leader",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(
      screen.getByRole("button", { name: /fogón/i }).querySelector(".lucide-flame-kindling")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /invitaciones/i }).querySelector(".lucide-mail-plus")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /canales/i }).querySelector(".lucide-signpost-big")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /eventos/i }).querySelector(".lucide-calendar-days")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /méritos/i }).querySelector(".lucide-medal")
    ).toBeInTheDocument();
  });

  it("does not prefetch tribe section routes before navigation intent", () => {
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            role: "leader",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(prefetchMock).not.toHaveBeenCalled();
  });

  it("shows admin sections to tribe leaders and guardians below the round", () => {
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro");

    const { rerender } = render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            role: "leader",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: /canales/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /invitaciones/i })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").findIndex((button) =>
        button.textContent?.includes("Fogón")
      )
    ).toBeLessThan(
      screen.getAllByRole("button").findIndex((button) =>
        button.textContent?.includes("Invitaciones")
      )
    );
    expect(
      screen.getAllByRole("button").findIndex((button) =>
        button.textContent?.includes("Invitaciones")
      )
    ).toBeLessThan(
      screen.getAllByRole("button").findIndex((button) =>
        button.textContent?.includes("Canales")
      )
    );

    rerender(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "guardian@example.com",
          name: "Ada Lovelace",
          role: "tribemate",
          avatarFallback: "AL",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            role: "guardian",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: /canales/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /invitaciones/i })).toBeInTheDocument();

    rerender(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "member@example.com",
          name: "Katherine Johnson",
          role: "tribemate",
          avatarFallback: "KJ",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            role: "tribemate",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.queryByRole("button", { name: /canales/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /invitaciones/i })).not.toBeInTheDocument();
  });

  it("hides the global tribes section inside an active tribe", () => {
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.queryByText(/^Tribus$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /nueva tribu/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /descubrir tribus/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^matematica pro$/i })
    ).not.toBeInTheDocument();
  });

  it("marks the active tribe section and navigates to real section routes", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro/eventos");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: /eventos/i })).toHaveAttribute(
      "data-active",
      "true"
    );

    await user.click(screen.getByRole("button", { name: /la tribu/i }));

    expect(pushMock).toHaveBeenCalledWith("/tribu/matematica-pro/tribu");
  });

  it("closes the mobile sidebar when a tribe section navigation item is clicked", async () => {
    const user = userEvent.setup();
    const { useSidebar } = jest.requireMock("@/components/ui/sidebar");

    useSidebar.mockReturnValue({
      isMobile: true,
      setOpenMobile: setOpenMobileMock,
    });
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro/eventos");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: /la tribu/i }));

    expect(pushMock).toHaveBeenCalledWith("/tribu/matematica-pro/tribu");
    expect(setOpenMobileMock).toHaveBeenCalledWith(false);
  });

  it("closes the mobile sidebar when a tribe switcher dropdown item is clicked", async () => {
    const user = userEvent.setup();
    const { useSidebar } = jest.requireMock("@/components/ui/sidebar");

    useSidebar.mockReturnValue({
      isMobile: true,
      setOpenMobile: setOpenMobileMock,
    });
    (usePathname as jest.Mock).mockReturnValue("/tribu/matematica-pro");

    render(
      <AppSidebar
        authenticatedMember={null}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
          {
            tribeId: "tribe-2",
            name: "Beta Club",
            slug: "beta-club",
          },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: /matematica pro/i }));
    await user.click(screen.getByRole("menuitem", { name: /beta club/i }));

    expect(pushMock).toHaveBeenCalledWith("/tribu/beta-club");
    expect(setOpenMobileMock).toHaveBeenCalledWith(false);
  });

  it("does not render tribe sections outside an active member tribe", () => {
    (usePathname as jest.Mock).mockReturnValue("/");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "leader@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        memberTribes={[
          {
            tribeId: "tribe-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.queryByText("Tribu")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ronda/i })).not.toBeInTheDocument();
  });
});
