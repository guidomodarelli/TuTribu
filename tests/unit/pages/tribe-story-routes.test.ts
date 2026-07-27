import { GET, PUT } from "@/app/api/tribes/[slug]/story/route";
import { createRequestModules } from "@/src/modules/setup";
import {
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import {
  TRIBE_STORY_CONTENT_MAX_LENGTH,
  TRIBE_STORY_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-story";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getTribeStory = jest.fn();
const saveTribeStory = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
  revalidateTag: jest.fn(),
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

function buildRequest(body: unknown = {}, method = "PUT"): Request {
  return {
    headers: new Headers(),
    json: jest.fn(async () => body),
    method,
    url: "https://tutribu.example.com/api/tribes/matematica-pro/story",
  } as unknown as Request;
}

function buildContext() {
  return {
    params: Promise.resolve({ slug: "matematica-pro" }),
  };
}

describe("Tribe story routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: TRIBE_PAGE_ACCESS_STATUS.visible,
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getTribeStory.mockResolvedValue(null);
    saveTribeStory.mockResolvedValue({
      status: TRIBE_STORY_SAVE_STATUS.updated,
      story: {
        content: "Nacimos en 2020.",
        media: [],
        websiteUrl: null,
      },
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: { getAuthenticatedMember },
      },
      tribes: {
        useCases: {
          getTribePageAccess,
          getTribeStory,
          saveTribeStory,
        },
      },
    });
  });

  it("returns a null story when nothing has been written yet", async () => {
    const response = await GET(buildRequest(undefined, "GET"), buildContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ story: null });
    expect(getTribeStory).toHaveBeenCalledWith({ tribeSlug: "matematica-pro" });
  });

  it("returns the saved story when the tribe has one", async () => {
    getTribeStory.mockResolvedValue({
      content: "Nacimos en 2020.",
      media: [
        {
          externalVideoId: "dQw4w9WgXcQ",
          id: "media-1",
          mediaType: "video",
          sortOrder: 0,
          url: null,
          videoProvider: "youtube",
        },
      ],
      websiteUrl: "https://tribu.example.com",
    });

    const response = await GET(buildRequest(undefined, "GET"), buildContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      story: {
        content: "Nacimos en 2020.",
        media: [
          {
            externalVideoId: "dQw4w9WgXcQ",
            id: "media-1",
            mediaType: "video",
            sortOrder: 0,
            url: null,
            videoProvider: "youtube",
          },
        ],
        websiteUrl: "https://tribu.example.com",
      },
    });
  });

  it("returns not found when the tribe is not visible to the viewer", async () => {
    getTribePageAccess.mockResolvedValue({
      reason: TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible,
      status: TRIBE_PAGE_ACCESS_STATUS.hidden,
    });

    const response = await GET(buildRequest(undefined, "GET"), buildContext());

    expect(response.status).toBe(404);
    expect(getTribeStory).not.toHaveBeenCalled();
  });

  it("returns unauthorized when no member is authenticated", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await GET(buildRequest(undefined, "GET"), buildContext());

    expect(response.status).toBe(401);
  });

  it("rejects PUT with empty content", async () => {
    const response = await PUT(buildRequest({ content: "   " }), buildContext());

    expect(response.status).toBe(400);
    expect(saveTribeStory).not.toHaveBeenCalled();
  });

  it("rejects PUT with content above the maximum length", async () => {
    const response = await PUT(
      buildRequest({
        content: "a".repeat(TRIBE_STORY_CONTENT_MAX_LENGTH + 1),
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeStory).not.toHaveBeenCalled();
  });

  it("saves valid PUT payloads and returns the new story", async () => {
    const response = await PUT(
      buildRequest({
        content: "  Nacimos en 2020.  ",
        media: [
          {
            mediaType: "video",
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
          {
            mediaType: "image",
            url: "https://images.example.com/tribu.jpg",
          },
        ],
        websiteUrl: " https://tribu.example.com ",
      }),
      buildContext()
    );

    expect(response.status).toBe(200);
    expect(saveTribeStory).toHaveBeenCalledWith({
      content: "Nacimos en 2020.",
      media: [
        {
          externalVideoId: "dQw4w9WgXcQ",
          mediaType: "video",
          sortOrder: 0,
          url: null,
          videoProvider: "youtube",
        },
        {
          externalVideoId: null,
          mediaType: "image",
          sortOrder: 1,
          url: "https://images.example.com/tribu.jpg",
          videoProvider: null,
        },
      ],
      tribeSlug: "matematica-pro",
      websiteUrl: "https://tribu.example.com",
    });
    await expect(response.json()).resolves.toEqual({
      message: "Historia actualizada.",
      story: {
        content: "Nacimos en 2020.",
        media: [],
        websiteUrl: null,
      },
    });
  });

  it("rejects PUT with an unparseable video URL", async () => {
    const response = await PUT(
      buildRequest({
        content: "Nacimos en 2020.",
        media: [{ mediaType: "video", url: "https://example.com/video" }],
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeStory).not.toHaveBeenCalled();
  });

  it("rejects PUT with an invalid image URL", async () => {
    const response = await PUT(
      buildRequest({
        content: "Nacimos en 2020.",
        media: [{ mediaType: "image", url: "not-a-url" }],
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeStory).not.toHaveBeenCalled();
  });

  it("rejects PUT with more media items than allowed", async () => {
    const response = await PUT(
      buildRequest({
        content: "Nacimos en 2020.",
        media: Array.from({ length: 6 }, () => ({
          mediaType: "image",
          url: "https://images.example.com/tribu.jpg",
        })),
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeStory).not.toHaveBeenCalled();
  });

  it("rejects PUT with an invalid website URL", async () => {
    const response = await PUT(
      buildRequest({
        content: "Nacimos en 2020.",
        websiteUrl: "javascript:alert(1)",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeStory).not.toHaveBeenCalled();
  });

  it("returns forbidden when the repository rejects a non-leader save", async () => {
    saveTribeStory.mockResolvedValue({
      status: TRIBE_STORY_SAVE_STATUS.forbidden,
      story: null,
    });

    const response = await PUT(
      buildRequest({ content: "Nacimos en 2020." }),
      buildContext()
    );

    expect(response.status).toBe(403);
  });

  it("returns not found when the tribe does not exist on save", async () => {
    saveTribeStory.mockResolvedValue({
      status: TRIBE_STORY_SAVE_STATUS.notFound,
      story: null,
    });

    const response = await PUT(
      buildRequest({ content: "Nacimos en 2020." }),
      buildContext()
    );

    expect(response.status).toBe(404);
  });
});
