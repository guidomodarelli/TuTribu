import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import CommunityCategoriesPage from "@/app/(platform)/comunidad/[slug]/categorias/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getCommunityPageAccess = jest.fn();
const getCurrentCommunityMembershipStatus = jest.fn();
const getMemberCommunities = jest.fn();
const listCommunityPostCategories = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/components/community-feed/post-category-management", () => ({
  PostCategoryManagement: ({
    categories,
    communitySlug,
  }: {
    categories: unknown[];
    communitySlug: string;
  }) => (
    <section>
      <h1>Gestión de categorías</h1>
      <p>{communitySlug}</p>
      <p>{categories.length}</p>
    </section>
  ),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

const authenticatedMember = {
  avatarFallback: "GH",
  email: "owner@example.com",
  id: "member-1",
  image: null,
  name: "Grace Hopper",
  role: "member",
};

const visibleCommunityAccess = {
  status: "visible",
  community: {
    id: "community-1",
    name: "Matematica Pro",
    slug: "matematica-pro",
    visibility: "private",
  },
};

const category = {
  accessScope: "members" as const,
  emoji: "💬",
  id: "category-general",
  name: "General",
  slug: "general",
  sortOrder: 20,
};

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("CommunityCategoriesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getCommunityPageAccess.mockResolvedValue(visibleCommunityAccess);
    getCurrentCommunityMembershipStatus.mockResolvedValue("active");
    getMemberCommunities.mockResolvedValue([
      {
        communityId: "community-1",
        name: "Matematica Pro",
        role: "owner",
        slug: "matematica-pro",
      },
    ]);
    listCommunityPostCategories.mockResolvedValue({
      categories: [category],
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      error: errorMock,
      info: infoMock,
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      communities: {
        useCases: {
          getCommunityPageAccess,
          getCurrentCommunityMembershipStatus,
          getMemberCommunities,
        },
      },
      posts: {
        useCases: {
          listCommunityPostCategories,
        },
      },
    });
  });

  it("renders category management for community owners", async () => {
    render(await CommunityCategoriesPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de categorías" })).toBeInTheDocument();
    expect(listCommunityPostCategories).toHaveBeenCalledWith({
      communitySlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("renders category management for community admins", async () => {
    getMemberCommunities.mockResolvedValue([
      {
        communityId: "community-1",
        name: "Matematica Pro",
        role: "admin",
        slug: "matematica-pro",
      },
    ]);

    render(await CommunityCategoriesPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de categorías" })).toBeInTheDocument();
    expect(listCommunityPostCategories).toHaveBeenCalledWith({
      communitySlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("returns 404 when a regular member opens the category management URL", async () => {
    getMemberCommunities.mockResolvedValue([
      {
        communityId: "community-1",
        name: "Matematica Pro",
        role: "member",
        slug: "matematica-pro",
      },
    ]);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(CommunityCategoriesPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(listCommunityPostCategories).not.toHaveBeenCalled();
  });

  it("returns 404 when an owner is muted", async () => {
    getCurrentCommunityMembershipStatus.mockResolvedValue("muted");
    getMemberCommunities.mockResolvedValue([
      {
        communityId: "community-1",
        name: "Matematica Pro",
        role: "owner",
        slug: "matematica-pro",
      },
    ]);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(CommunityCategoriesPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(listCommunityPostCategories).not.toHaveBeenCalled();
  });
});
