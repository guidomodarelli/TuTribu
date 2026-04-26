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
  Sidebar: ({ children }: { children: React.ReactNode }) => <aside>{children}</aside>,
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
  SidebarSeparator: () => <hr />,
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

  it("renders the create action before member communities", () => {
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

    expect(screen.getByText(/^Comunidades$/i)).toBeInTheDocument();
    expect(communityButtons.findIndex((button) => button.textContent?.includes("Nueva comunidad"))).toBeLessThan(
      communityButtons.findIndex((button) => button.textContent?.includes("Alpha Club"))
    );
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
});
