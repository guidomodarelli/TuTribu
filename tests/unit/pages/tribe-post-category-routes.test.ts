import {
  GET,
  POST,
} from "@/app/api/tribes/[slug]/post-categories/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/tribes/[slug]/post-categories/[categoryId]/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const listTribePostCategories = jest.fn();
const createTribePostCategory = jest.fn();
const updateTribePostCategory = jest.fn();
const deleteTribePostCategory = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
    })),
  })
);

class MockJsonResponse {
  status: number;

  constructor(
    private readonly body: Record<string, unknown>,
    init?: ResponseInit
  ) {
    this.status = init?.status ?? 200;
  }

  static json(body: Record<string, unknown>, init?: ResponseInit) {
    return new MockJsonResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

function buildJsonRequest(body: Record<string, string | number> = {}): Request {
  return {
    headers: new Headers({
      "Content-Type": "application/json",
    }),
    json: async () => body,
    method: "POST",
    url: "https://tutribu.example.com/api/tribes/matematica-pro/post-categories",
  } as unknown as Request;
}

function buildTribeContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

function buildCategoryContext() {
  return {
    params: Promise.resolve({
      categoryId: "category-general",
      slug: "matematica-pro",
    }),
  };
}

describe("Tribe post category routes", () => {
  const category = {
    accessScope: "members" as const,
    emoji: "💬",
    id: "category-general",
    name: "General",
    slug: "general",
    sortOrder: 20,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "member@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "member",
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      posts: {
        useCases: {
          createTribePostCategory,
          deleteTribePostCategory,
          listTribePostCategories,
          updateTribePostCategory,
        },
      },
    });
  });

  it("lists categories for the tribe", async () => {
    listTribePostCategories.mockResolvedValue({
      categories: [category],
    });

    const response = await GET(buildJsonRequest(), buildTribeContext());

    await expect(response.json()).resolves.toEqual({
      categories: [category],
    });
    expect(response.status).toBe(200);
    expect(listTribePostCategories).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("returns a safe message when listing categories fails unexpectedly", async () => {
    listTribePostCategories.mockRejectedValueOnce(new Error("database_down"));

    const response = await GET(buildJsonRequest(), buildTribeContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos cargar las categorías. Intentá de nuevo.",
    });
  });

  it("creates a category from request body fields", async () => {
    createTribePostCategory.mockResolvedValue({
      category,
      status: "created",
    });

    const response = await POST(
      buildJsonRequest({
        emoji: "💬",
        name: "General",
      }),
      buildTribeContext()
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      category,
      message: "Categoría creada.",
    });
  });

  it("returns a safe duplicate message when creating an existing category slug", async () => {
    createTribePostCategory.mockResolvedValue({
      status: "duplicate_slug",
    });

    const response = await POST(
      buildJsonRequest({
        emoji: "💬",
        name: "General",
      }),
      buildTribeContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ya existe una categoría con ese nombre.",
    });
  });

  it("updates a category from request body fields", async () => {
    updateTribePostCategory.mockResolvedValue({
      category,
      status: "updated",
    });

    const response = await PATCH(
      buildJsonRequest({
        emoji: "💬",
        name: "General",
        sortOrder: 20,
      }),
      buildCategoryContext()
    );

    expect(response.status).toBe(200);
    expect(updateTribePostCategory).toHaveBeenCalledWith({
      categoryId: "category-general",
      tribeSlug: "matematica-pro",
      emoji: "💬",
      name: "General",
      sortOrder: 20,
    });
  });

  it("returns a safe duplicate message when renaming to an existing category slug", async () => {
    updateTribePostCategory.mockResolvedValue({
      status: "duplicate_slug",
    });

    const response = await PATCH(
      buildJsonRequest({
        emoji: "💬",
        name: "General",
        sortOrder: 20,
      }),
      buildCategoryContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ya existe una categoría con ese nombre.",
    });
  });

  it("rejects updates with invalid sort order values", async () => {
    const response = await PATCH(
      buildJsonRequest({
        emoji: "💬",
        name: "General",
        sortOrder: Number.NaN,
      }),
      buildCategoryContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El orden de la categoría es inválido.",
    });
    expect(updateTribePostCategory).not.toHaveBeenCalled();
  });

  it("rejects updates when sort order is not an integer", async () => {
    const response = await PATCH(
      buildJsonRequest({
        emoji: "💬",
        name: "General",
        sortOrder: 20.5,
      }),
      buildCategoryContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El orden de la categoría es inválido.",
    });
    expect(updateTribePostCategory).not.toHaveBeenCalled();
  });

  it("rejects updates when sort order is missing", async () => {
    const response = await PATCH(
      buildJsonRequest({
        emoji: "💬",
        name: "General",
      }),
      buildCategoryContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El orden de la categoría es inválido.",
    });
    expect(updateTribePostCategory).not.toHaveBeenCalled();
  });

  it("rejects updates when sort order is an empty string", async () => {
    const response = await PATCH(
      buildJsonRequest({
        emoji: "💬",
        name: "General",
        sortOrder: "",
      }),
      buildCategoryContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El orden de la categoría es inválido.",
    });
    expect(updateTribePostCategory).not.toHaveBeenCalled();
  });

  it("requires a target category when deleting a category with posts", async () => {
    deleteTribePostCategory.mockResolvedValue({
      status: "category_has_posts",
    });

    const response = await DELETE(buildJsonRequest(), buildCategoryContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Elegí otra categoría para mover las publicaciones.",
    });
  });
});
