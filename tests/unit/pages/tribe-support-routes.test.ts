import { GET, PUT } from "@/app/api/tribes/[slug]/support/route";
import { createRequestModules } from "@/src/modules/setup";
import {
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import {
  TRIBE_SUPPORT_CHANNEL,
  TRIBE_SUPPORT_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-support";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getTribeSupport = jest.fn();
const saveTribeSupport = jest.fn();

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

function buildRequest(body: unknown = {}, method = "PUT"): Request {
  return {
    headers: new Headers(),
    json: jest.fn(async () => body),
    method,
    url: "https://tutribu.example.com/api/tribes/matematica-pro/support",
  } as unknown as Request;
}

function buildContext() {
  return {
    params: Promise.resolve({ slug: "matematica-pro" }),
  };
}

describe("Tribe support routes", () => {
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
    getTribeSupport.mockResolvedValue(null);
    saveTribeSupport.mockResolvedValue({
      settings: {
        channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
        message: null,
        phoneNumber: "+5491112345678",
      },
      status: TRIBE_SUPPORT_SAVE_STATUS.updated,
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: { getAuthenticatedMember },
      },
      tribes: {
        useCases: {
          getTribePageAccess,
          getTribeSupport,
          saveTribeSupport,
        },
      },
    });
  });

  it("returns null settings when nothing has been configured", async () => {
    const response = await GET(buildRequest(undefined, "GET"), buildContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ settings: null });
    expect(getTribeSupport).toHaveBeenCalledWith({ tribeSlug: "matematica-pro" });
  });

  it("returns saved settings when the tribe has support configured", async () => {
    getTribeSupport.mockResolvedValue({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: "Hola",
      phoneNumber: "+54 9 11 1234 5678",
    });

    const response = await GET(buildRequest(undefined, "GET"), buildContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      settings: {
        channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
        message: "Hola",
        phoneNumber: "+54 9 11 1234 5678",
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
    expect(getTribeSupport).not.toHaveBeenCalled();
  });

  it("returns unauthorized when no member is authenticated", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await GET(buildRequest(undefined, "GET"), buildContext());

    expect(response.status).toBe(401);
  });

  it("rejects PUT with missing phone number", async () => {
    const response = await PUT(
      buildRequest({
        channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
        phoneNumber: "",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeSupport).not.toHaveBeenCalled();
  });

  it("rejects PUT with an invalid international phone format", async () => {
    const response = await PUT(
      buildRequest({
        channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
        phoneNumber: "abc",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeSupport).not.toHaveBeenCalled();
  });

  it("rejects PUT with a WhatsApp phone extension", async () => {
    const response = await PUT(
      buildRequest({
        channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
        phoneNumber: "+1 213 373 4253 ext. 123",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeSupport).not.toHaveBeenCalled();
  });

  it("rejects PUT with an unsupported channel", async () => {
    const response = await PUT(
      buildRequest({ channel: "telegram", phoneNumber: "+54 9 11 1234 5678" }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeSupport).not.toHaveBeenCalled();
  });

  it("saves valid PUT payloads and returns the new settings", async () => {
    const response = await PUT(
      buildRequest({
        channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
        message: "  Hola, vengo desde la tribu  ",
        phoneNumber: "+54 9 11 1234 5678",
      }),
      buildContext()
    );

    expect(response.status).toBe(200);
    expect(saveTribeSupport).toHaveBeenCalledWith({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: "Hola, vengo desde la tribu",
      phoneNumber: "+5491112345678",
      tribeSlug: "matematica-pro",
    });
    await expect(response.json()).resolves.toEqual({
      message: "Botón de soporte actualizado.",
      settings: {
        channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
        message: null,
        phoneNumber: "+5491112345678",
      },
    });
  });

  it("returns forbidden when the repository rejects a non-leader save", async () => {
    saveTribeSupport.mockResolvedValue({
      settings: null,
      status: TRIBE_SUPPORT_SAVE_STATUS.forbidden,
    });

    const response = await PUT(
      buildRequest({
        channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
        phoneNumber: "+54 9 11 1234 5678",
      }),
      buildContext()
    );

    expect(response.status).toBe(403);
  });
});
