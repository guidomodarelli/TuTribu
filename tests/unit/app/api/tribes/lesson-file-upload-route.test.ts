import { POST } from "@/app/api/tribes/[slug]/courses/lessons/files/uploads/route";
import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const createLessonFileUpload = jest.fn();

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

function buildJsonRequest(body: Record<string, unknown> = {}): Request {
  return {
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
    method: "POST",
    url: "https://tutribu.example.com/api/tribes/matematica-pro/courses/lessons/files/uploads",
  } as unknown as Request;
}

function buildRouteContext() {
  return { params: Promise.resolve({ slug: "matematica-pro" }) };
}

const VALID_DECLARATION = {
  fileName: "slides.pdf",
  fileSizeBytes: 2048,
  mimeType: "application/pdf",
};

describe("Lesson file upload reservation route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "member@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      courses: { useCases: { createLessonFileUpload } },
    });
    createLessonFileUpload.mockResolvedValue({
      assetId: "asset-1",
      status: COURSE_MUTATION_STATUS.created,
      uploadHeaders: { "Content-Type": "application/pdf" },
      uploadUrl: "https://r2.example.com/upload",
    });
  });

  it("rejects a fractional fileSizeBytes with 400 before reaching the use case", async () => {
    const response = await POST(
      buildJsonRequest({ ...VALID_DECLARATION, fileSizeBytes: 1.5 }),
      buildRouteContext()
    );

    expect(response.status).toBe(400);
    expect(createLessonFileUpload).not.toHaveBeenCalled();
  });

  it("rejects Infinity as fileSizeBytes with 400 before reaching the use case", async () => {
    const response = await POST(
      buildJsonRequest({ ...VALID_DECLARATION, fileSizeBytes: Infinity }),
      buildRouteContext()
    );

    expect(response.status).toBe(400);
    expect(createLessonFileUpload).not.toHaveBeenCalled();
  });

  it("rejects NaN as fileSizeBytes with 400 before reaching the use case", async () => {
    const response = await POST(
      buildJsonRequest({ ...VALID_DECLARATION, fileSizeBytes: NaN }),
      buildRouteContext()
    );

    expect(response.status).toBe(400);
    expect(createLessonFileUpload).not.toHaveBeenCalled();
  });

  it("forwards a safe integer fileSizeBytes to the use case", async () => {
    await POST(buildJsonRequest(VALID_DECLARATION), buildRouteContext());

    expect(createLessonFileUpload).toHaveBeenCalledWith(
      expect.objectContaining({ fileSizeBytes: 2048 })
    );
  });
});
