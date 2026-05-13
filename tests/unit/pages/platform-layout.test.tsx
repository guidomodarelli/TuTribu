import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cookies } from "next/headers";

import { PlatformLayoutContent } from "@/app/(platform)/layout";
import { createRequestModules } from "@/src/modules/setup";

const platformLayoutStyles = readFileSync(
  join(process.cwd(), "app", "(platform)", "layout.module.scss"),
  "utf8"
);

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

jest.mock("@/components/ui/sidebar", () => ({
  SidebarInset: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <main className={className}>{children}</main>,
  SidebarProvider: ({
    children,
    defaultOpen,
  }: {
    children: React.ReactNode;
    defaultOpen?: boolean;
  }) => <div data-sidebar-default-open={String(defaultOpen)}>{children}</div>,
  SidebarTrigger: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      Abrir sidebar
    </button>
  ),
}));

jest.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

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
        children: <div>Contenido</div>,
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
        children: <div>Contenido</div>,
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
        children: <div>Contenido</div>,
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

    const { container } = render(
      await PlatformLayoutContent({
        children: <div>Contenido</div>,
      })
    );

    expect(container.firstElementChild).toHaveAttribute(
      "data-sidebar-default-open",
      "false"
    );
  });

  it("skips member tribes when there is no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getMemberTribes.mockResolvedValue([]);

    render(
      await PlatformLayoutContent({
        children: <div>Contenido</div>,
      })
    );

    expect(getMemberTribes).not.toHaveBeenCalled();
    expect(screen.getByText("Sin sesion")).toBeInTheDocument();
  });

  it("keeps the platform header sticky without clipping it from the layout container", () => {
    expect(platformLayoutStyles).toMatch(/&__header\s*{[^}]*position:\s*sticky;/s);
    expect(platformLayoutStyles).toMatch(/&__header\s*{[^}]*top:\s*0;/s);
    expect(platformLayoutStyles).not.toMatch(/\.PlatformLayout\s*{[^}]*overflow:\s*hidden;/s);
  });

  it("constrains platform page sections to the readable content width", () => {
    expect(platformLayoutStyles).toMatch(
      /&__content\s*{[^}]*>\s*:where\(main,\s*section\)\s*{[^}]*box-sizing:\s*border-box;/s
    );
    expect(platformLayoutStyles).toMatch(
      /&__content\s*{[^}]*>\s*:where\(main,\s*section\)\s*{[^}]*width:\s*100%;/s
    );
    expect(platformLayoutStyles).toMatch(
      /&__content\s*{[^}]*>\s*:where\(main,\s*section\)\s*{[^}]*max-width:\s*720px;/s
    );
    expect(platformLayoutStyles).toMatch(
      /&__content\s*{[^}]*>\s*:where\(main,\s*section\)\s*{[^}]*margin-inline:\s*auto;/s
    );
    expect(platformLayoutStyles).toMatch(
      /&__content\s*{[^}]*>\s*:where\(main,\s*section\)\s*{[^}]*padding:\s*clamp\(1rem,\s*3vw,\s*2rem\);/s
    );
  });
});
