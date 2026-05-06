import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeCategoriesPage from "@/app/(platform)/tribu/[slug]/categorias/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getMemberTribes = jest.fn();
const listTribePostCategories = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/components/tribe-feed/post-category-management", () => ({
  PostCategoryManagement: ({
    categories,
    tribeSlug,
  }: {
    categories: unknown[];
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestión de categorías</h1>
      <p>{tribeSlug}</p>
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

const visibleTribeAccess = {
  status: "visible",
  tribe: {
    id: "tribe-1",
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

describe("TribeCategoriesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "owner",
        slug: "matematica-pro",
      },
    ]);
    listTribePostCategories.mockResolvedValue({
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
      tribes: {
        useCases: {
          getTribePageAccess,
          getCurrentTribeMembershipStatus,
          getMemberTribes,
        },
      },
      posts: {
        useCases: {
          listTribePostCategories,
        },
      },
    });
  });

  it("renders category management for tribe owners", async () => {
    render(await TribeCategoriesPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de categorías" })).toBeInTheDocument();
    expect(listTribePostCategories).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("renders category management for tribe admins", async () => {
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "admin",
        slug: "matematica-pro",
      },
    ]);

    render(await TribeCategoriesPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de categorías" })).toBeInTheDocument();
    expect(listTribePostCategories).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("returns 404 when a regular member opens the category management URL", async () => {
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "member",
        slug: "matematica-pro",
      },
    ]);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeCategoriesPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(listTribePostCategories).not.toHaveBeenCalled();
  });

  it("returns 404 when an owner is muted", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue("muted");
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "owner",
        slug: "matematica-pro",
      },
    ]);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeCategoriesPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(listTribePostCategories).not.toHaveBeenCalled();
  });
});
