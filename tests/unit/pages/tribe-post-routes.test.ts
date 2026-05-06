import { POST as POST_CREATE } from "@/app/api/tribes/[slug]/posts/route";
import { POST as POST_COMMENT } from "@/app/api/tribes/[slug]/posts/[postId]/comments/route";
import { POST as POST_LIKE } from "@/app/api/tribes/[slug]/posts/[postId]/like/route";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const createTribePost = jest.fn();
const createPostComment = jest.fn();
const togglePostLike = jest.fn();
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
    createServerLogger: jest.fn(),
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

function buildJsonRequest(body: Record<string, string> = {}): Request {
  return {
    headers: new Headers({
      "Content-Type": "application/json",
    }),
    json: async () => body,
    method: "POST",
    url: "https://tutribu.example.com/api/tribes/matematica-pro",
  } as unknown as Request;
}

function buildRouteContext(postId: string) {
  return {
    params: Promise.resolve({
      postId,
      slug: "matematica-pro",
    }),
  };
}

function buildCreateRouteContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("Tribe post routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    createTribePost.mockReset();
    createPostComment.mockReset();
    togglePostLike.mockReset();
    listTribePostCategories.mockReset();
    createTribePostCategory.mockReset();
    updateTribePostCategory.mockReset();
    deleteTribePostCategory.mockReset();
    global.Response = MockJsonResponse as unknown as typeof Response;

    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "member@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      posts: {
        useCases: {
          createTribePost,
          createTribePostCategory,
          createPostComment,
          deleteTribePostCategory,
          listTribePostCategories,
          togglePostLike,
          updateTribePostCategory,
        },
      },
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
    });
  });

  it("passes title and content to the tribe post use case", async () => {
    createTribePost.mockResolvedValue({
      post: {
        id: "post-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        },
        category: {
          accessScope: "members",
          emoji: "💬",
          id: "category-general",
          name: "General",
          slug: "general",
          sortOrder: 20,
        },
        comments: [],
        content: "Primera publicación",
        createdAt: "2026-04-26T12:00:00.000Z",
        likedByViewer: false,
        likeCount: 0,
        title: "Anuncio inicial",
      },
      status: "created",
    });

    const response = await POST_CREATE(
      buildJsonRequest({
        content: "Primera publicación",
        categoryId: "category-general",
        title: "Anuncio inicial",
      }),
      buildCreateRouteContext()
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      message: "Publicacion creada.",
      post: {
        id: "post-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        },
        category: {
          accessScope: "members",
          emoji: "💬",
          id: "category-general",
          name: "General",
          slug: "general",
          sortOrder: 20,
        },
        comments: [],
        content: "Primera publicación",
        createdAt: "2026-04-26T12:00:00.000Z",
        likedByViewer: false,
        likeCount: 0,
        title: "Anuncio inicial",
      },
    });
    expect(createTribePost).toHaveBeenCalledWith({
      authorId: "member-1",
      categoryId: "category-general",
      tribeSlug: "matematica-pro",
      content: "Primera publicación",
      title: "Anuncio inicial",
    });
  });

  it("returns a safe validation message when category is missing", async () => {
    createTribePost.mockResolvedValue({
      status: "invalid_category",
    });

    const response = await POST_CREATE(
      buildJsonRequest({
        content: "Primera publicación",
        title: "Anuncio inicial",
      }),
      buildCreateRouteContext()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      message: "Seleccioná una categoría antes de publicar.",
    });
  });

  it("returns a safe validation message when the tribe post is invalid", async () => {
    createTribePost.mockResolvedValue({
      status: "invalid_content",
    });

    const response = await POST_CREATE(
      buildJsonRequest({
        content: "Primera publicación",
        title: "",
      }),
      buildCreateRouteContext()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      message: "Completá el título y el contenido antes de publicar.",
    });
  });

  it("returns not found when comment postId is not a UUID", async () => {
    const response = await POST_COMMENT(
      buildJsonRequest({ content: "Gracias" }),
      buildRouteContext("not-a-uuid")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      message: "No pudimos encontrar la publicacion.",
    });
    expect(createPostComment).not.toHaveBeenCalled();
  });

  it("returns the created comment payload", async () => {
    createPostComment.mockResolvedValue({
      comment: {
        id: "comment-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        },
        content: "Gracias",
        createdAt: "2026-04-26T12:05:00.000Z",
      },
      status: "created",
    });

    const response = await POST_COMMENT(
      buildJsonRequest({ content: "Gracias" }),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      comment: {
        id: "comment-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        },
        content: "Gracias",
        createdAt: "2026-04-26T12:05:00.000Z",
      },
      message: "Comentario creado.",
    });
  });

  it("returns not found when like postId is not a UUID", async () => {
    const response = await POST_LIKE(
      buildJsonRequest(),
      buildRouteContext("not-a-uuid")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      message: "No pudimos encontrar la publicacion.",
    });
    expect(togglePostLike).not.toHaveBeenCalled();
  });

  it("returns the like status and count payload", async () => {
    togglePostLike.mockResolvedValue({
      likedByViewer: true,
      likeCount: 3,
      status: "liked",
    });

    const response = await POST_LIKE(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      likedByViewer: true,
      likeCount: 3,
      message: "Reaccion actualizada.",
    });
  });
});
