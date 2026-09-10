import { vi, describe, it, expect, beforeEach, afterAll, type Mock } from "vitest";
import { DELETE, GET, PATCH, POST } from "@/app/api/siteping/route";
import { GET as GET_IDENTITY } from "@/app/api/siteping/identity/route";
import { createRequestModules } from "@/src/modules/setup";
import {
  SITEPING_FEEDBACK_STATUS,
  SITEPING_FEEDBACK_TYPE,
} from "@/src/modules/siteping/constants/siteping";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";

const getAuthenticatedMember = vi.fn();
const createFeedback = vi.fn();
const deleteFeedback = vi.fn();
const getIdentity = vi.fn();
const getMemberTribes = vi.fn();
const listFeedback = vi.fn();
const updateFeedbackStatus = vi.fn();
const originalSitepingEnabled = process.env.SITEPING_ENABLED;

class MockJsonResponse {
  headers: Headers;
  status: number;

  constructor(
    private readonly body: Record<string, unknown>,
    init?: ResponseInit
  ) {
    this.headers = new Headers(init?.headers);
    this.status = init?.status ?? 200;
  }

  static json(body: Record<string, unknown>, init?: ResponseInit) {
    return new MockJsonResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })),
  })
);

function buildRequest(body?: unknown, method = "POST"): Request {
  return {
    headers: new Headers({
      "x-request-id": "request-1",
      "x-trace-id": "trace-1",
    }),
    json: vi.fn(async () => body),
    method,
    url: "https://tutribu.example.com/api/siteping",
  } as unknown as Request;
}

function buildPayload() {
  return {
    annotations: [],
    authorEmail: "leader@example.com",
    authorName: "Leader Example",
    clientId: "client-feedback-1",
    diagnostics: {
      console: [],
      network: [],
    },
    message: "No puedo guardar el precio",
    projectName: "tutribu",
    screenshotDataUrl: "data:image/jpeg;base64,secret",
    type: SITEPING_FEEDBACK_TYPE.bug,
    url: "https://tutribu.example.com/matematica/precios",
    userAgent: "Jest Browser",
    viewport: "1280x800",
  };
}

function buildAnnotationPayload() {
  return {
    anchor: {
      anchorKey: null,
      cssSelector: ".course-image",
      elementId: null,
      elementTag: "img",
      fingerprint: "image-fingerprint",
      neighborText: "",
      textPrefix: "",
      textSnippet: "",
      textSuffix: "",
      xpath: "/html/body/main/img",
    },
    devicePixelRatio: 1,
    rect: {
      hPct: 25,
      wPct: 25,
      xPct: 10,
      yPct: 10,
    },
    scrollX: 0,
    scrollY: 0,
    viewportH: 800,
    viewportW: 1280,
  };
}

describe("Siteping routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SITEPING_ENABLED = "true";
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "LE",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Leader Example",
      role: "tribemate",
    });
    createFeedback.mockResolvedValue({
      annotations: [],
      authorEmail: "leader@example.com",
      authorName: "Leader Example",
      clientId: "client-feedback-1",
      createdAt: "2026-05-31T12:00:00.000Z",
      diagnostics: null,
      id: "feedback-1",
      message: "No puedo guardar el precio",
      projectName: "tutribu",
      resolvedAt: null,
      screenshotUrl: null,
      status: "open" as const,
      type: SITEPING_FEEDBACK_TYPE.bug,
      updatedAt: "2026-05-31T12:00:00.000Z",
      url: "https://tutribu.example.com/matematica/precios",
      urlPattern: null,
      userAgent: "Jest Browser",
      viewport: "1280x800",
    });
    deleteFeedback.mockResolvedValue(undefined);
    getIdentity.mockReturnValue({
      enabled: true,
      identity: {
        email: "leader@example.com",
        name: "Leader Example",
      },
      projectName: "tutribu",
    });
    getMemberTribes.mockResolvedValue([
      { logoUrl: null,
        membershipStatus: TRIBE_MEMBERSHIP_STATUS.active,
        name: "Matematica",
        role: TRIBE_MEMBER_ROLE.leader,
        slug: "matematica",
        tribeId: "tribe-1",
      },
    ]);
    listFeedback.mockResolvedValue({ feedbacks: [], total: 0 });
    updateFeedbackStatus.mockResolvedValue({
      annotations: [],
      authorEmail: "leader@example.com",
      authorName: "Leader Example",
      clientId: "client-feedback-1",
      createdAt: "2026-05-31T12:00:00.000Z",
      diagnostics: null,
      id: "feedback-1",
      message: "No puedo guardar el precio",
      projectName: "tutribu",
      resolvedAt: "2026-05-31T12:30:00.000Z",
      screenshotUrl: null,
      status: SITEPING_FEEDBACK_STATUS.resolved,
      type: SITEPING_FEEDBACK_TYPE.bug,
      updatedAt: "2026-05-31T12:30:00.000Z",
      url: "https://tutribu.example.com/matematica/precios",
      urlPattern: null,
      userAgent: "Jest Browser",
      viewport: "1280x800",
    });
    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: { getAuthenticatedMember },
      },
      siteping: {
        useCases: {
          createFeedback,
          deleteFeedback,
          getIdentity,
          listFeedback,
          updateFeedbackStatus,
        },
      },
      tribes: {
        useCases: { getMemberTribes },
      },
    });
  });

  afterAll(() => {
    process.env.SITEPING_ENABLED = originalSitepingEnabled;
  });

  it("creates feedback for an authorized member and preserves correlation headers", async () => {
    const response = await POST(buildRequest(buildPayload()));

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("request-1");
    expect(response.headers.get("x-trace-id")).toBe("trace-1");
    expect(getIdentity).toHaveBeenCalledWith({
      authenticatedMember: expect.objectContaining({ id: "member-1" }),
      memberTribes: [
        expect.objectContaining({
          membershipStatus: TRIBE_MEMBERSHIP_STATUS.active,
          role: TRIBE_MEMBER_ROLE.leader,
        }),
      ],
    });
    expect(createFeedback).toHaveBeenCalledWith({
      authenticatedMember: expect.objectContaining({ id: "member-1" }),
      command: expect.objectContaining({
        diagnostics: { console: [], network: [] },
        projectName: "tutribu",
        screenshotDataUrl: "data:image/jpeg;base64,secret",
      }),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });
  });

  it("drops a screenshot that is not an image data URL", async () => {
    const response = await POST(
      buildRequest({
        ...buildPayload(),
        screenshotDataUrl: "https://evil.example.com/not-an-image",
      })
    );

    expect(response.status).toBe(201);
    expect(createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({ screenshotDataUrl: null }),
      })
    );
  });

  it("drops a screenshot that exceeds the size cap", async () => {
    const SCREENSHOT_SIZE_CAP = 2_000_000;
    const oversizedScreenshot =
      "data:image/jpeg;base64," + "A".repeat(SCREENSHOT_SIZE_CAP + 1);

    const response = await POST(
      buildRequest({
        ...buildPayload(),
        screenshotDataUrl: oversizedScreenshot,
      })
    );

    expect(response.status).toBe(201);
    expect(createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({ screenshotDataUrl: null }),
      })
    );
  });

  it("uses the authorized Siteping project instead of the submitted project", async () => {
    const response = await POST(buildRequest({
      ...buildPayload(),
      projectName: "client-controlled-project",
    }));

    expect(response.status).toBe(201);
    expect(createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          projectName: "tutribu",
        }),
      })
    );
  });

  it("rejects feedback when no member is authenticated", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await POST(buildRequest(buildPayload()));

    expect(response.status).toBe(401);
    expect(createFeedback).not.toHaveBeenCalled();
  });

  it("rejects malformed feedback annotations before the use case runs", async () => {
    const response = await POST(buildRequest({
      ...buildPayload(),
      annotations: [{}],
    }));

    expect(response.status).toBe(400);
    expect(createFeedback).not.toHaveBeenCalled();
  });

  it("rejects malformed diagnostics before the use case runs", async () => {
    const response = await POST(buildRequest({
      ...buildPayload(),
      diagnostics: {
        console: "malformed-console",
        network: [],
      },
    }));

    expect(response.status).toBe(400);
    expect(createFeedback).not.toHaveBeenCalled();
  });

  it("accepts widget annotations without visible text", async () => {
    const expectedAnnotationPayload = buildAnnotationPayload();

    Reflect.deleteProperty(expectedAnnotationPayload.anchor, "elementId");

    const response = await POST(buildRequest({
      ...buildPayload(),
      annotations: [buildAnnotationPayload()],
    }));

    expect(response.status).toBe(201);
    expect(createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          annotations: [expectedAnnotationPayload],
        }),
      })
    );
  });

  it("returns disabled identity when the member is not authorized", async () => {
    getIdentity.mockReturnValue({
      enabled: false,
      identity: null,
      projectName: "tutribu",
    });

    const response = await GET_IDENTITY(buildRequest(undefined, "GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      enabled: false,
      identity: null,
      projectName: "tutribu",
    });
  });

  it("returns disabled identity without building request modules when Siteping is disabled", async () => {
    process.env.SITEPING_ENABLED = "false";

    const response = await GET_IDENTITY(buildRequest(undefined, "GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      enabled: false,
      identity: null,
      projectName: "tutribu",
    });
    expect(createRequestModules).not.toHaveBeenCalled();
    expect(getAuthenticatedMember).not.toHaveBeenCalled();
    expect(getMemberTribes).not.toHaveBeenCalled();
  });

  it("lists feedback for the authorized Siteping project", async () => {
    const response = await GET({
      headers: new Headers(),
      method: "GET",
      url: "https://tutribu.example.com/api/siteping?projectName=client-controlled-project",
    } as unknown as Request);

    expect(response.status).toBe(200);
    expect(createRequestModules).toHaveBeenCalledWith();
    expect(createRequestModules).not.toHaveBeenCalledWith(
      expect.objectContaining({ sitepingProjectAdmin: true })
    );
    expect(listFeedback).toHaveBeenCalledWith({
      limit: undefined,
      page: undefined,
      projectName: "tutribu",
      search: undefined,
      status: undefined,
      type: undefined,
      url: undefined,
      urlPattern: undefined,
    });
  });

  it("rejects the removed delete-all action without an individual feedback id", async () => {
    const response = await DELETE(buildRequest({
      deleteAll: true,
      projectName: "client-controlled-project",
    }, "DELETE"));

    expect(response.status).toBe(400);
    expect(deleteFeedback).not.toHaveBeenCalled();
  });

  it("updates feedback status with Siteping project context", async () => {
    const response = await PATCH(buildRequest({
      id: "feedback-1",
      projectName: "client-controlled-project",
      status: SITEPING_FEEDBACK_STATUS.resolved,
    }, "PATCH"));

    expect(response.status).toBe(200);
    expect(createRequestModules).toHaveBeenCalledWith();
    expect(createRequestModules).not.toHaveBeenCalledWith(
      expect.objectContaining({ sitepingProjectAdmin: true })
    );
    expect(updateFeedbackStatus).toHaveBeenCalledWith({
      feedbackId: "feedback-1",
      projectName: "tutribu",
      status: SITEPING_FEEDBACK_STATUS.resolved,
    });
  });

  it("returns not found when status update targets stale project feedback", async () => {
    updateFeedbackStatus.mockResolvedValue(null);

    const response = await PATCH(buildRequest({
      id: "feedback-1",
      projectName: "client-controlled-project",
      status: SITEPING_FEEDBACK_STATUS.resolved,
    }, "PATCH"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "El feedback ya no está disponible.",
    });
    expect(createRequestModules).not.toHaveBeenCalledWith(
      expect.objectContaining({ sitepingProjectAdmin: true })
    );
    expect(updateFeedbackStatus).toHaveBeenCalledWith({
      feedbackId: "feedback-1",
      projectName: "tutribu",
      status: SITEPING_FEEDBACK_STATUS.resolved,
    });
  });

  it("deletes an individual feedback with Siteping project context", async () => {
    const response = await DELETE(buildRequest({
      id: "feedback-1",
      projectName: "client-controlled-project",
    }, "DELETE"));

    expect(response.status).toBe(200);
    expect(createRequestModules).toHaveBeenCalledWith();
    expect(createRequestModules).not.toHaveBeenCalledWith(
      expect.objectContaining({ sitepingProjectAdmin: true })
    );
    expect(deleteFeedback).toHaveBeenCalledWith({
      feedbackId: "feedback-1",
      projectName: "tutribu",
    });
  });

  it("rejects fractional Siteping pagination values", async () => {
    const response = await GET({
      headers: new Headers(),
      method: "GET",
      url: "https://tutribu.example.com/api/siteping?projectName=tutribu&limit=1.5",
    } as unknown as Request);

    expect(response.status).toBe(400);
    expect(listFeedback).not.toHaveBeenCalled();
  });

  it("rejects unsupported Siteping status filters before listing feedback", async () => {
    const response = await GET({
      headers: new Headers(),
      method: "GET",
      url: "https://tutribu.example.com/api/siteping?status=resolvedd",
    } as unknown as Request);

    expect(response.status).toBe(400);
    expect(listFeedback).not.toHaveBeenCalled();
  });

  it("rejects unsupported Siteping type filters before listing feedback", async () => {
    const response = await GET({
      headers: new Headers(),
      method: "GET",
      url: "https://tutribu.example.com/api/siteping?type=bugg",
    } as unknown as Request);

    expect(response.status).toBe(400);
    expect(listFeedback).not.toHaveBeenCalled();
  });
});
