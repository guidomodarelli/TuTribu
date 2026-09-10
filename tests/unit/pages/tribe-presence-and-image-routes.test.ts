import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { POST as touchPresence } from "@/app/api/tribes/[slug]/presence/route";
import { POST as createTribeImage } from "@/app/api/tribes/[slug]/images/route";
import { DELETE as deleteTribeImage } from "@/app/api/tribes/[slug]/images/[imageId]/route";
import { createRequestModules } from "@/src/modules/setup";
import { TRIBE_IMAGE_UPLOAD_STATUS } from "@/src/modules/tribes/constants/tribe-images";

const getAuthenticatedMember = vi.fn();
const touchTribePresence = vi.fn();
const createTribeImageUpload = vi.fn();
const deleteTribeImageUpload = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
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

function buildRequest(): Request {
  return {
    headers: new Headers(),
    method: "POST",
    url: "https://tutribu.example.com/api/tribes/matematica-pro/presence",
  } as unknown as Request;
}

function buildContext<TParams extends Record<string, string>>(params: TParams) {
  return { params: Promise.resolve(params) };
}

describe("Tribe presence and image routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    touchTribePresence.mockResolvedValue(true);
    createTribeImageUpload.mockResolvedValue({
      deliveryUrl: "https://imagedelivery.net/hash/image-1/public",
      imageId: "image-1",
      status: TRIBE_IMAGE_UPLOAD_STATUS.created,
      uploadUrl: "https://upload.example.com/image-1",
    });
    deleteTribeImageUpload.mockResolvedValue(true);
    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: { getAuthenticatedMember },
      },
      tribes: {
        useCases: {
          createTribeImageUpload,
          deleteTribeImageUpload,
          touchTribePresence,
        },
      },
    });
  });

  it("touches the viewer presence", async () => {
    const response = await touchPresence(
      buildRequest(),
      buildContext({ slug: "matematica-pro" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ touched: true });
    expect(touchTribePresence).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects an anonymous presence touch", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await touchPresence(
      buildRequest(),
      buildContext({ slug: "matematica-pro" })
    );

    expect(response.status).toBe(401);
    expect(touchTribePresence).not.toHaveBeenCalled();
  });

  it("reserves a tribe image direct upload for the leader", async () => {
    const response = await createTribeImage(
      buildRequest(),
      buildContext({ slug: "matematica-pro" })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      deliveryUrl: "https://imagedelivery.net/hash/image-1/public",
      imageId: "image-1",
      uploadUrl: "https://upload.example.com/image-1",
    });
  });

  it("maps a forbidden tribe image upload to 403", async () => {
    createTribeImageUpload.mockResolvedValue({
      status: TRIBE_IMAGE_UPLOAD_STATUS.forbidden,
    });

    const response = await createTribeImage(
      buildRequest(),
      buildContext({ slug: "matematica-pro" })
    );

    expect(response.status).toBe(403);
  });

  it("deletes a reserved tribe image draft", async () => {
    const response = await deleteTribeImage(
      buildRequest(),
      buildContext({ imageId: "image-1", slug: "matematica-pro" })
    );

    expect(response.status).toBe(200);
    expect(deleteTribeImageUpload).toHaveBeenCalledWith({
      imageId: "image-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("returns 404 when the tribe image draft cannot be deleted", async () => {
    deleteTribeImageUpload.mockResolvedValue(false);

    const response = await deleteTribeImage(
      buildRequest(),
      buildContext({ imageId: "image-1", slug: "matematica-pro" })
    );

    expect(response.status).toBe(404);
  });
});
