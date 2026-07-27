import { PUT as saveSettings } from "@/app/api/tribes/[slug]/settings/route";
import { PUT as setOpenFreeJoin } from "@/app/api/tribes/[slug]/free-join/open/route";
import { createRequestModules } from "@/src/modules/setup";
import { TRIBE_IMAGE_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-images";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";

const getAuthenticatedMember = jest.fn();
const saveTribeIdentity = jest.fn();
const setTribeOpenFreeJoin = jest.fn();

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

function buildRequest(body: unknown = {}): Request {
  return {
    headers: new Headers(),
    json: jest.fn(async () => body),
    method: "PUT",
    url: "https://tutribu.example.com/api/tribes/matematica-pro/settings",
  } as unknown as Request;
}

function buildContext() {
  return { params: Promise.resolve({ slug: "matematica-pro" }) };
}

describe("Tribe settings routes", () => {
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
    saveTribeIdentity.mockResolvedValue({
      identity: { coverUrl: null, logoUrl: null },
      status: TRIBE_IMAGE_SAVE_STATUS.updated,
    });
    setTribeOpenFreeJoin.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      subscriptions: { useCases: { setTribeOpenFreeJoin } },
      tribes: { useCases: { saveTribeIdentity } },
    });
  });

  it("saves the tribe identity", async () => {
    const response = await saveSettings(
      buildRequest({
        coverUrl: " https://images.example.com/cover.jpg ",
        logoUrl: "https://images.example.com/logo.png",
      }),
      buildContext()
    );

    expect(response.status).toBe(200);
    expect(saveTribeIdentity).toHaveBeenCalledWith({
      coverUrl: "https://images.example.com/cover.jpg",
      logoUrl: "https://images.example.com/logo.png",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects an identity URL that is not http(s)", async () => {
    const response = await saveSettings(
      buildRequest({ logoUrl: "javascript:alert(1)" }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeIdentity).not.toHaveBeenCalled();
  });

  it("returns forbidden when the viewer is not the leader", async () => {
    saveTribeIdentity.mockResolvedValue({
      identity: null,
      status: TRIBE_IMAGE_SAVE_STATUS.forbidden,
    });

    const response = await saveSettings(buildRequest({}), buildContext());

    expect(response.status).toBe(403);
  });

  it("rejects an anonymous identity save", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await saveSettings(buildRequest({}), buildContext());

    expect(response.status).toBe(401);
    expect(saveTribeIdentity).not.toHaveBeenCalled();
  });

  it("toggles the tokenless free open join", async () => {
    const response = await setOpenFreeJoin(
      buildRequest({ enabled: true }),
      buildContext()
    );

    expect(response.status).toBe(200);
    expect(setTribeOpenFreeJoin).toHaveBeenCalledWith({
      enabled: true,
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects a free open join payload without a boolean", async () => {
    const response = await setOpenFreeJoin(
      buildRequest({ enabled: "yes" }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(setTribeOpenFreeJoin).not.toHaveBeenCalled();
  });

  it("returns forbidden when the free open join toggle is rejected", async () => {
    setTribeOpenFreeJoin.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    });

    const response = await setOpenFreeJoin(
      buildRequest({ enabled: true }),
      buildContext()
    );

    expect(response.status).toBe(403);
  });
});
