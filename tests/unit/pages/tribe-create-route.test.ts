import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { POST } from "@/app/api/tribes/route";
import { createRequestModules } from "@/src/modules/setup";
import { REQUEST_ID_HEADER } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { createTribePublicResponseSchema } from "@/src/modules/tribes/application/results/create-tribe-public-dto-schemas";

const getAuthenticatedMember = vi.fn();
const createTribe = vi.fn();
const errorMock = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(),
  })
);

const JSON_REQUEST_HEADERS = { accept: "application/json" };

const AUTHENTICATED_MEMBER = {
  id: "member-1",
  email: "leader@example.com",
  name: "Grace Hopper",
  role: "tribemate",
  avatarFallback: "GH",
  image: null,
};

function buildMockRequest(
  formValues: Record<string, string>,
  requestHeaders: Record<string, string> = {}
): Request {
  const formData = new FormData();

  Object.entries(formValues).forEach(([key, value]) => {
    formData.set(key, value);
  });

  return {
    formData: async () => formData,
    headers: new Headers(requestHeaders),
    url: "https://tutribu.example.com/api/tribes",
  } as unknown as Request;
}

function buildTribeFormRequest(requestHeaders: Record<string, string> = {}): Request {
  return buildMockRequest(
    {
      name: "Matematica Pro",
      slug: "matematica-pro",
    },
    requestHeaders
  );
}

describe("Create tribe route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockReset();
    createTribe.mockReset();
    errorMock.mockReset();

    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          createTribe,
        },
      },
    });
    (createServerLogger as Mock).mockReturnValue({
      error: errorMock,
      info: vi.fn(),
      warn: vi.fn(),
    });
  });

  describe("native form posts", () => {
    it("redirects unauthenticated users to sign in", async () => {
      getAuthenticatedMember.mockResolvedValue(null);

      const response = await POST(buildTribeFormRequest());

      expect(response.headers.get("location")).toBe(
        "https://tutribu.example.com/auth/signin?callbackUrl=%2F-%2Fcrear"
      );
      expect(response.headers.get(REQUEST_ID_HEADER)).toEqual(expect.any(String));
    });

    it("redirects to the newly created tribe on success", async () => {
      getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
      createTribe.mockResolvedValue({
        status: "created" as const,
        tribeId: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        leaderMemberRole: "leader",
      });

      const response = await POST(buildTribeFormRequest());

      expect(createTribe).toHaveBeenCalledWith({
        creatorEmail: "leader@example.com",
        creatorId: "member-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
      });
      expect(response.headers.get("location")).toBe(
        "https://tutribu.example.com/matematica-pro"
      );
    });

    it("redirects back to the form with a suggested slug when there is a conflict", async () => {
      getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
      createTribe.mockResolvedValue({
        status: "slug-conflict" as const,
        message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
        suggestedSlug: "matematica-pro-2",
      });

      const response = await POST(buildTribeFormRequest());

      expect(response.headers.get("location")).toBe(
        "https://tutribu.example.com/-/crear?name=Matematica+Pro&slug=matematica-pro&error=slug-conflict&suggestedSlug=matematica-pro-2"
      );
    });

    it("logs and redirects with a safe error code when creation throws unexpectedly", async () => {
      getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
      createTribe.mockRejectedValue(new Error("database offline"));

      const response = await POST(buildTribeFormRequest());

      expect(response.headers.get("location")).toBe(
        "https://tutribu.example.com/-/crear?name=Matematica+Pro&slug=matematica-pro&error=unexpected"
      );
      expect(errorMock).toHaveBeenCalledWith({
        message: "Tribe creation failed",
        error: expect.any(Error),
        metadata: expect.objectContaining({
          creatorId: "member-1",
          slug: "matematica-pro",
        }),
      });
    });
  });

  describe("enhanced submissions that accept JSON", () => {
    it("answers with the sign-in path instead of redirecting unauthenticated users", async () => {
      getAuthenticatedMember.mockResolvedValue(null);

      const response = await POST(buildTribeFormRequest(JSON_REQUEST_HEADERS));

      expect(response.status).toBe(401);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.json()).toEqual({
        redirectUrl: "/auth/signin?callbackUrl=%2F-%2Fcrear",
        status: "unauthenticated",
      });
      expect(createTribe).not.toHaveBeenCalled();
    });

    it("answers with the created tribe URL the redirect would have used", async () => {
      getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
      createTribe.mockResolvedValue({
        status: "created" as const,
        tribeId: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        leaderMemberRole: "leader",
      });

      const response = await POST(buildTribeFormRequest(JSON_REQUEST_HEADERS));
      const body: unknown = await response.json();

      expect(response.status).toBe(201);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get(REQUEST_ID_HEADER)).toEqual(expect.any(String));
      expect(body).toEqual({ redirectUrl: "/matematica-pro", status: "created" });
      expect(createTribePublicResponseSchema.safeParse(body).success).toBe(true);
      expect(createTribe).toHaveBeenCalledTimes(1);
    });

    it("answers a validation error with its safe Spanish message", async () => {
      getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
      createTribe.mockResolvedValue({
        status: "invalid-name" as const,
        message: "internal validation detail",
      });

      const response = await POST(buildTribeFormRequest(JSON_REQUEST_HEADERS));

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        message: "Define un nombre para tu tribu.",
        status: "invalid-name",
      });
    });

    it("answers a slug conflict with the suggested slug", async () => {
      getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
      createTribe.mockResolvedValue({
        status: "slug-conflict" as const,
        message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
        suggestedSlug: "matematica-pro-2",
      });

      const response = await POST(buildTribeFormRequest(JSON_REQUEST_HEADERS));

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
        status: "slug-conflict",
        suggestedSlug: "matematica-pro-2",
      });
    });

    it("answers a disallowed creator with a forbidden status", async () => {
      getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
      createTribe.mockResolvedValue({ status: "not-allowed" as const });

      const response = await POST(buildTribeFormRequest(JSON_REQUEST_HEADERS));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        message: "Tu cuenta no esta habilitada para crear tribus.",
        status: "not-allowed",
      });
    });

    it("logs and answers a safe message without diagnostics when creation throws", async () => {
      getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
      createTribe.mockRejectedValue(new Error("database offline"));

      const response = await POST(buildTribeFormRequest(JSON_REQUEST_HEADERS));
      const responseText = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(responseText)).toEqual({
        message: "No pudimos crear tu tribu. Intentalo otra vez.",
        status: "unexpected",
      });
      expect(responseText).not.toContain("database offline");
      expect(errorMock).toHaveBeenCalledWith({
        message: "Tribe creation failed",
        error: expect.any(Error),
        metadata: expect.objectContaining({
          creatorId: "member-1",
          slug: "matematica-pro",
        }),
      });
    });

    it("rejects a created result whose slug cannot build a safe tribe URL", async () => {
      getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
      createTribe.mockResolvedValue({
        status: "created" as const,
        tribeId: "tribe-1",
        name: "Matematica Pro",
        slug: "/evil.example.com",
        leaderMemberRole: "leader",
      });

      const response = await POST(buildTribeFormRequest(JSON_REQUEST_HEADERS));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        message: "No pudimos crear tu tribu. Intentalo otra vez.",
        status: "unexpected",
      });
      expect(errorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ reason: "public_dto_rejected" }),
        })
      );
    });
  });
});
