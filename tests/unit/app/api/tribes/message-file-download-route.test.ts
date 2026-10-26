import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/tribes/[slug]/messages/files/[assetId]/download/route";
import { createMessageFileDownloadUrl } from "@/src/modules/messages/application/use-cases/message-files-use-cases";
import { R2MessageFileRepository } from "@/src/modules/messages/infrastructure/repositories/r2-message-file-repository";
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

const ASSET_ID = "2f1b6c1e-3d4a-4b8e-9c2d-7a5e8f0b1c3d";

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
    url: `https://tutribu.example.com/api/tribes/matematica-pro/messages/files/${ASSET_ID}/download`,
  } as unknown as Request;
}

function buildRouteContext() {
  return {
    params: Promise.resolve({ assetId: ASSET_ID, slug: "matematica-pro" }),
  };
}

describe("Message file download route without R2 configured", () => {
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
    const messageFileRepository = new R2MessageFileRepository(
      async (callback) => callback({ execute } as never)
    );
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      messages: {
        useCases: {
          createMessageFileDownloadUrl: createMessageFileDownloadUrl({
            messageFileRepository,
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
  });

  it("answers 400 for a visible file while storage is unavailable", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          file_name: "guia.pdf",
          id: ASSET_ID,
          storage_key: `message-files/tribe-1/${ASSET_ID}`,
        },
      ],
    });

    const response = await GET(buildRequest(), buildRouteContext());

    expect(response.status).toBe(HTTP_STATUS.badRequest);
  });
});
