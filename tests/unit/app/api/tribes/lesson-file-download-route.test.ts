import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/tribes/[slug]/courses/lessons/files/[fileId]/download/route";
import { createLessonFileDownloadUrl } from "@/src/modules/courses/application/use-cases/lesson-files-use-cases";
import { R2LessonFileRepository } from "@/src/modules/courses/infrastructure/repositories/r2-lesson-file-repository";
import { createRequestModules } from "@/src/modules/setup";

const CLOUDFLARE_R2_ENVIRONMENT_NAMES = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_BUCKET_NAME",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
] as const;

const HTTP_STATUS = {
  badRequest: 400,
  notFound: 404,
} as const;

// The use case answers notFound for anything that is not a UUID, so the id
// must be valid for the request to reach the repository.
const FILE_ID = "6a0d2c4e-8b1f-4e7a-9d3c-5f2b1a0e9c7d";

const getAuthenticatedMember = vi.fn();
const execute = vi.fn();

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
    method: "GET",
    url: `https://tutribu.example.com/api/tribes/matematica-pro/courses/lessons/files/${FILE_ID}/download`,
  } as unknown as Request;
}

function buildRouteContext() {
  return {
    params: Promise.resolve({ fileId: FILE_ID, slug: "matematica-pro" }),
  };
}

describe("Lesson file download route without R2 configured", () => {
  const originalEnvironment = new Map<string, string | undefined>();
  const originalResponse = global.Response;

  beforeEach(() => {
    vi.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;

    for (const name of CLOUDFLARE_R2_ENVIRONMENT_NAMES) {
      originalEnvironment.set(name, process.env[name]);
      delete process.env[name];
    }

    getAuthenticatedMember.mockResolvedValue({ id: "member-1" });
    // The real use case and repository run end to end; only the database
    // executor is replaced, so the status mapping covers the shipped order.
    const lessonFileRepository = new R2LessonFileRepository(
      async (callback) => callback({ execute } as never)
    );
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      courses: {
        useCases: {
          createLessonFileDownloadUrl: createLessonFileDownloadUrl({
            lessonFileRepository,
          }),
        },
      },
    });
  });

  afterEach(() => {
    global.Response = originalResponse;

    for (const [name, value] of originalEnvironment) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("answers 404 for a file the viewer cannot see", async () => {
    execute.mockResolvedValueOnce({ rows: [] });

    const response = await GET(buildRequest(), buildRouteContext());

    expect(response.status).toBe(HTTP_STATUS.notFound);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("answers 400 for a visible file while storage is unavailable", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          file_name: "guia.pdf",
          id: FILE_ID,
          storage_key: `course-lesson-files/tribe-1/${FILE_ID}`,
        },
      ],
    });

    const response = await GET(buildRequest(), buildRouteContext());

    expect(response.status).toBe(HTTP_STATUS.badRequest);
  });
});
