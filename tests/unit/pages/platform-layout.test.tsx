import { render, screen } from "@testing-library/react";
import { useSidebar } from "beez-ui";
import { cookies } from "next/headers";

import { PlatformLayoutContent } from "@/app/(platform)/layout";
import { createRequestModules } from "@/src/modules/setup";


const getAuthenticatedMember = jest.fn();
const getMemberTribes = jest.fn();

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

jest.mock("@/components/app-sidebar", () => ({
  AppSidebar: ({
    authenticatedMember,
    memberTribes,
  }: {
    authenticatedMember: { name: string } | null;
    memberTribes: Array<{ name: string }>;
  }) => (
    <div>
      <span>Sidebar</span>
      <span>{authenticatedMember?.name ?? "Sin sesion"}</span>
      <span>{memberTribes.map((tribe) => tribe.name).join(",")}</span>
    </div>
  ),
}));

jest.mock("@/components/auth/avatar-session-menu-client", () => ({
  AvatarSessionMenuClient: ({ authenticatedMember }: { authenticatedMember: { name: string } | null }) => (
    <span>Menu de cuenta: {authenticatedMember?.name ?? "Sin sesion"}</span>
  ),
}));

jest.mock("@/components/theme/theme-mode-dropdown", () => ({
  ThemeModeDropdown: () => <span>Selector de tema</span>,
}));

jest.mock("@/components/platform/tribe-switcher", () => ({
  TribeSwitcher: ({
    showDropdownTrigger,
    showPrivateBadge,
  }: {
    showDropdownTrigger?: boolean;
    showPrivateBadge?: boolean;
  }) => (
    <span>
      Selector de tribus: trigger {String(showDropdownTrigger)}, Tribu privada{" "}
      {String(showPrivateBadge)}
    </span>
  ),
}));



jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

/** Exposes the real public sidebar state to the route integration test. */
function SidebarState() {
  return <output aria-label="Estado de navegación">{useSidebar().state}</output>;
}

describe("PlatformLayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getMemberTribes.mockReset();
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn(() => undefined),
    });

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          getMemberTribes,
        },
      },
    });
  });

  it("resolves member tribes server-side and passes them to the sidebar", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        slug: "alpha-club",
      },
    ]);

    render(
      await PlatformLayoutContent({
        children: <div>Contenido<SidebarState /></div>,
      })
    );

    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Menu de cuenta: Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Alpha Club")).toBeInTheDocument();
  });

  it("renders only the private tribe badge in the platform header", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        slug: "alpha-club",
      },
    ]);

    render(
      await PlatformLayoutContent({
        children: <div>Contenido<SidebarState /></div>,
      })
    );

    expect(
      screen.getByText("Selector de tribus: trigger false, Tribu privada true")
    ).toBeInTheDocument();
  });

  it("renders the theme selector next to the account menu", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getMemberTribes.mockResolvedValue([]);

    render(
      await PlatformLayoutContent({
        children: <div>Contenido<SidebarState /></div>,
      })
    );

    expect(screen.getByText("Selector de tema")).toBeInTheDocument();
    expect(screen.getByText("Menu de cuenta: Grace Hopper")).toBeInTheDocument();
  });

  it("restores the collapsed sidebar state from the sidebar cookie", async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn(() => ({ value: "false" })),
    });
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getMemberTribes.mockResolvedValue([]);

    render(
      await PlatformLayoutContent({
        children: <div>Contenido<SidebarState /></div>,
      })
    );

    expect(screen.getByLabelText("Estado de navegación")).toHaveTextContent("collapsed");
  });

  it("skips member tribes when there is no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getMemberTribes.mockResolvedValue([]);

    render(
      await PlatformLayoutContent({
        children: <div>Contenido<SidebarState /></div>,
      })
    );

    expect(getMemberTribes).not.toHaveBeenCalled();
    expect(screen.getByText("Sin sesion")).toBeInTheDocument();
  });


});
