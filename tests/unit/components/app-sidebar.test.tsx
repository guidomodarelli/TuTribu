import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useRouter } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";

const pushMock = jest.fn();

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
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    tooltip?: string;
    isActive?: boolean;
  }) => (
    <button type="button" onClick={onClick} data-tooltip={tooltip} data-active={isActive}>
      {children}
    </button>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  SidebarRail: () => null,
  SidebarSeparator: ({ className }: { className?: string }) => (
    <hr className={className} />
  ),
}));

describe("AppSidebar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pushMock.mockReset();

    (useRouter as jest.Mock).mockReturnValue({
      push: pushMock,
    });
    (usePathname as jest.Mock).mockReturnValue("/");
  });

  it("renders the discovery navigation item with a compass icon", () => {
    render(<AppSidebar authenticatedMember={null} memberCommunities={[]} />);

    const discoveryButton = screen.getByRole("button", {
      name: /descubrir comunidades/i,
    });

    expect(discoveryButton).toHaveAttribute(
      "data-tooltip",
      "Descubrir comunidades"
    );
    expect(discoveryButton.querySelector(".lucide-compass")).toBeInTheDocument();
  });

  it("uses the default sidebar variant", () => {
    render(<AppSidebar authenticatedMember={null} memberCommunities={[]} />);

    expect(screen.getByRole("complementary")).toHaveAttribute("data-variant", "sidebar");
  });

  it("keeps the header separator constrained to the sidebar width", () => {
    render(<AppSidebar authenticatedMember={null} memberCommunities={[]} />);

    expect(screen.getByRole("separator")).toHaveClass("AppSidebar__separator");
  });

  it("keeps the brand mark at a stable size during sidebar transitions", () => {
    render(<AppSidebar authenticatedMember={null} memberCommunities={[]} />);

    expect(screen.getByText("AO")).toHaveClass("AppSidebar__brandMark");
  });

  it("renders discovery below the create action and before member communities", () => {
    render(
      <AppSidebar
        authenticatedMember={null}
        memberCommunities={[
          {
            communityId: "community-1",
            name: "Alpha Club",
            slug: "alpha-club",
          },
          {
            communityId: "community-2",
            name: "Beta Club",
            slug: "beta-club",
          },
        ]}
      />
    );

    const communityButtons = screen.getAllByRole("button");
    const createCommunityIndex = communityButtons.findIndex((button) =>
      button.textContent?.includes("Nueva comunidad")
    );
    const discoverCommunitiesIndex = communityButtons.findIndex((button) =>
      button.textContent?.includes("Descubrir comunidades")
    );
    const firstMemberCommunityIndex = communityButtons.findIndex((button) =>
      button.textContent?.includes("Alpha Club")
    );

    expect(screen.getByText(/^Comunidades$/i)).toBeInTheDocument();
    expect(createCommunityIndex).toBeLessThan(discoverCommunitiesIndex);
    expect(discoverCommunitiesIndex).toBeLessThan(firstMemberCommunityIndex);
  });

  it("shows an empty state when the authenticated member has no communities", () => {
    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "owner@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        }}
        memberCommunities={[]}
      />
    );

    expect(
      screen.getByText(/todavia no formas parte de ninguna comunidad/i)
    ).toBeInTheDocument();
  });

  it("does not render the account menu in the sidebar", () => {
    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "owner@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        }}
        memberCommunities={[]}
      />
    );

    expect(screen.queryByText("Cuenta")).not.toBeInTheDocument();
  });

  it("marks the current community as active and navigates when another community is clicked", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/comunidad/beta-club");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "owner@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        }}
        memberCommunities={[
          {
            communityId: "community-1",
            name: "Alpha Club",
            slug: "alpha-club",
          },
          {
            communityId: "community-2",
            name: "Beta Club",
            slug: "beta-club",
          },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: /beta club/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("button", { name: /beta club/i }).querySelector(".lucide-check")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /alpha club/i }).querySelector(".lucide-check")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /alpha club/i }));

    expect(pushMock).toHaveBeenCalledWith("/comunidad/alpha-club");
  });

  it("renders community sections when the member is inside one of their communities", () => {
    (usePathname as jest.Mock).mockReturnValue("/comunidad/matematica-pro");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "owner@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        }}
        memberCommunities={[
          {
            communityId: "community-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.getByText("Comunidad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /inicio/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("button", { name: /eventos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /miembros/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ranking/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /acerca de/i })).toBeInTheDocument();
  });

  it("marks the active community section and navigates to real section routes", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/comunidad/matematica-pro/eventos");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "owner@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        }}
        memberCommunities={[
          {
            communityId: "community-1",
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

    await user.click(screen.getByRole("button", { name: /miembros/i }));

    expect(pushMock).toHaveBeenCalledWith("/comunidad/matematica-pro/miembros");
  });

  it("does not render community sections outside an active member community", () => {
    (usePathname as jest.Mock).mockReturnValue("/");

    render(
      <AppSidebar
        authenticatedMember={{
          id: "member-1",
          email: "owner@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        }}
        memberCommunities={[
          {
            communityId: "community-1",
            name: "Matematica Pro",
            slug: "matematica-pro",
          },
        ]}
      />
    );

    expect(screen.queryByText("Comunidad")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /inicio/i })).not.toBeInTheDocument();
  });
});
