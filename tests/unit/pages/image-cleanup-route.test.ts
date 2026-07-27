import { GET } from "@/app/api/maintenance/image-cleanup/route";
import { createMaintenanceModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const cleanupOrphanMessageImages = jest.fn();
const cleanupOrphanTribeImages = jest.fn();
const loggerError = jest.fn();
const loggerInfo = jest.fn();

const CRON_SECRET = "cron-secret-value";

jest.mock("@/src/modules/setup", () => ({
  createMaintenanceModules: jest.fn(),
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

function buildCronRequest(authorization?: string): Request {
  return {
    headers: new Headers(
      authorization ? { authorization } : {}
    ),
    method: "GET",
    url: "https://tutribu.example.com/api/maintenance/image-cleanup",
  } as unknown as Request;
}

describe("Orphan image cleanup route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cleanupOrphanMessageImages.mockReset();
    loggerError.mockReset();
    loggerInfo.mockReset();
    process.env.CRON_SECRET = CRON_SECRET;
    global.Response = MockJsonResponse as unknown as typeof Response;

    cleanupOrphanTribeImages.mockResolvedValue({
      deletedCount: 0,
      failedRemoteDeleteCount: 0,
    });
    (createMaintenanceModules as jest.Mock).mockResolvedValue({
      messages: {
        useCases: {
          cleanupOrphanMessageImages,
        },
      },
      tribes: {
        useCases: {
          cleanupOrphanTribeImages,
        },
      },
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: loggerError,
      info: loggerInfo,
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = (await GET(
      buildCronRequest()
    )) as unknown as MockJsonResponse;

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ status: "unauthorized" });
    expect(createMaintenanceModules).not.toHaveBeenCalled();
    expect(cleanupOrphanMessageImages).not.toHaveBeenCalled();
  });

  it("rejects requests with a wrong cron bearer token", async () => {
    const response = (await GET(
      buildCronRequest("Bearer wrong-secret-value")
    )) as unknown as MockJsonResponse;

    expect(response.status).toBe(401);
    expect(cleanupOrphanMessageImages).not.toHaveBeenCalled();
  });

  it("rejects a non-ASCII token matching the expected string length without throwing", async () => {
    const expectedHeader = `Bearer ${CRON_SECRET}`;
    const sameStringLengthNonAsciiHeader = "ñ".repeat(expectedHeader.length);

    expect(sameStringLengthNonAsciiHeader.length).toBe(expectedHeader.length);
    expect(Buffer.byteLength(sameStringLengthNonAsciiHeader)).not.toBe(
      Buffer.byteLength(expectedHeader)
    );

    const response = (await GET(
      buildCronRequest(sameStringLengthNonAsciiHeader)
    )) as unknown as MockJsonResponse;

    expect(response.status).toBe(401);
    expect(cleanupOrphanMessageImages).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns its counters for an authorized cron request", async () => {
    cleanupOrphanMessageImages.mockResolvedValue({
      reclaimedDrafts: 1,
      remoteDeletedPending: 2,
      remoteDeletedQueued: 3,
      remoteFailures: 0,
    });

    const response = (await GET(
      buildCronRequest(`Bearer ${CRON_SECRET}`)
    )) as unknown as MockJsonResponse;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reclaimedDrafts: 1,
      remoteDeletedPending: 2,
      remoteDeletedQueued: 3,
      remoteFailures: 0,
      status: "ok",
      tribeImages: {
        deletedCount: 0,
        failedRemoteDeleteCount: 0,
      },
    });
    expect(createMaintenanceModules).toHaveBeenCalledTimes(1);
    expect(cleanupOrphanMessageImages).toHaveBeenCalledTimes(1);
    expect(cleanupOrphanTribeImages).toHaveBeenCalledTimes(1);
  });

  it("returns a safe error status when the sweep throws", async () => {
    cleanupOrphanMessageImages.mockRejectedValue(new Error("cloudflare down"));

    const response = (await GET(
      buildCronRequest(`Bearer ${CRON_SECRET}`)
    )) as unknown as MockJsonResponse;

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: "error" });
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Orphan image cleanup sweep failed",
      })
    );
  });
});
