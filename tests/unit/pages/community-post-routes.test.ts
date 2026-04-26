import { POST as POST_COMMENT } from "@/app/api/communities/[slug]/posts/[postId]/comments/route";
import { POST as POST_LIKE } from "@/app/api/communities/[slug]/posts/[postId]/like/route";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const createPostComment = jest.fn();
const togglePostLike = jest.fn();

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
    private readonly body: Record<string, boolean | string>,
    init?: ResponseInit
  ) {
    this.status = init?.status ?? 200;
  }

  static json(body: Record<string, boolean | string>, init?: ResponseInit) {
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
    url: "https://academia.example.com/api/communities/matematica-pro",
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

describe("Community post routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    createPostComment.mockReset();
    togglePostLike.mockReset();
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
          createPostComment,
          togglePostLike,
        },
      },
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
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
});
