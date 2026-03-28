import { POST } from "@/app/api/communities/route";
import { createRequestModules } from "@/src/modules/setup";
import { REQUEST_ID_HEADER } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const createCommunity = jest.fn();
const errorMock = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

class MockResponse {
  headers: Headers;
  status: number;

  constructor(location: string, status = 302) {
    this.headers = new Headers({
      location,
    });
    this.status = status;
  }

  static redirect(url: URL | string, status?: number) {
    return new MockResponse(url.toString(), status);
  }
}

function buildMockRequest(formValues: Record<string, string>): Request {
  const formData = new FormData();

  Object.entries(formValues).forEach(([key, value]) => {
    formData.set(key, value);
  });

  return {
    formData: async () => formData,
    headers: new Headers(),
    url: "https://academia.example.com/api/communities",
  } as unknown as Request;
}

describe("Create community route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    createCommunity.mockReset();
    errorMock.mockReset();
    global.Response = MockResponse as unknown as typeof Response;

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      communities: {
        useCases: {
          createCommunity,
        },
      },
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: errorMock,
      info: jest.fn(),
    });
  });

  it("redirects unauthenticated users to sign in", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const request = buildMockRequest({
      name: "Matematica Pro",
      slug: "matematica-pro",
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe(
      "https://academia.example.com/auth/signin?callbackUrl=%2Fcomunidad%2Fcrear"
    );
    expect(response.headers.get(REQUEST_ID_HEADER)).toEqual(expect.any(String));
  });

  it("redirects to the newly created community on success", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    createCommunity.mockResolvedValue({
      status: "created",
      communityId: "community-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      ownerMemberRole: "owner",
    });

    const request = buildMockRequest({
      name: "Matematica Pro",
      slug: "matematica-pro",
    });

    const response = await POST(request);

    expect(createCommunity).toHaveBeenCalledWith({
      creatorEmail: "owner@example.com",
      creatorId: "member-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
    });
    expect(response.headers.get("location")).toBe(
      "https://academia.example.com/comunidad/matematica-pro"
    );
  });

  it("redirects back to the form with a suggested slug when there is a conflict", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    createCommunity.mockResolvedValue({
      status: "slug-conflict",
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "matematica-pro-2",
    });

    const request = buildMockRequest({
      name: "Matematica Pro",
      slug: "matematica-pro",
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe(
      "https://academia.example.com/comunidad/crear?name=Matematica+Pro&slug=matematica-pro&error=slug-conflict&suggestedSlug=matematica-pro-2"
    );
  });

  it("logs and redirects with a safe error code when creation throws unexpectedly", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    createCommunity.mockRejectedValue(new Error("database offline"));

    const request = buildMockRequest({
      name: "Matematica Pro",
      slug: "matematica-pro",
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe(
      "https://academia.example.com/comunidad/crear?name=Matematica+Pro&slug=matematica-pro&error=unexpected"
    );
    expect(errorMock).toHaveBeenCalledWith({
      message: "Community creation failed",
      error: expect.any(Error),
      metadata: expect.objectContaining({
        creatorId: "member-1",
        slug: "matematica-pro",
      }),
    });
  });
});
