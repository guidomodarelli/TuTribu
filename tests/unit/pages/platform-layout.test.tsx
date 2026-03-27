import { render, screen } from "@testing-library/react";

import PlatformLayout from "@/app/(platform)/layout";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import { createGetMemberCommunitiesUseCase } from "@/src/modules/communities/infrastructure/composition/create-get-member-communities-use-case";

const getAuthenticatedMember = jest.fn();
const getMemberCommunities = jest.fn();

jest.mock("@/components/app-sidebar", () => ({
  AppSidebar: ({
    authenticatedMember,
    memberCommunities,
  }: {
    authenticatedMember: { name: string } | null;
    memberCommunities: Array<{ name: string }>;
  }) => (
    <div>
      <span>Sidebar</span>
      <span>{authenticatedMember?.name ?? "Sin sesion"}</span>
      <span>{memberCommunities.map((community) => community.name).join(",")}</span>
    </div>
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
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarTrigger: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      Abrir sidebar
    </button>
  ),
}));

jest.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case", () => ({
  createGetAuthenticatedMemberUseCase: jest.fn(),
}));

jest.mock(
  "@/src/modules/communities/infrastructure/composition/create-get-member-communities-use-case",
  () => ({
    createGetMemberCommunitiesUseCase: jest.fn(),
  })
);

describe("PlatformLayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getMemberCommunities.mockReset();

    (createGetAuthenticatedMemberUseCase as jest.Mock).mockReturnValue({
      execute: getAuthenticatedMember,
    });
    (createGetMemberCommunitiesUseCase as jest.Mock).mockReturnValue({
      execute: getMemberCommunities,
    });
  });

  it("resolves member communities server-side and passes them to the sidebar", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    getMemberCommunities.mockResolvedValue([
      {
        communityId: "community-1",
        name: "Alpha Club",
        slug: "alpha-club",
      },
    ]);

    render(
      await PlatformLayout({
        children: <div>Contenido</div>,
      })
    );

    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Alpha Club")).toBeInTheDocument();
  });

  it("skips member communities when there is no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getMemberCommunities.mockResolvedValue([]);

    render(
      await PlatformLayout({
        children: <div>Contenido</div>,
      })
    );

    expect(getMemberCommunities).not.toHaveBeenCalled();
    expect(screen.getByText("Sin sesion")).toBeInTheDocument();
  });
});
