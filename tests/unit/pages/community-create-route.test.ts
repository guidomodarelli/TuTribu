import { POST } from "@/app/api/communities/route";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import { createCreateCommunityUseCase } from "@/src/modules/communities/infrastructure/composition/create-create-community-use-case";

const getAuthenticatedMember = jest.fn();
const createCommunity = jest.fn();

jest.mock(
  "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case",
  () => ({
    createGetAuthenticatedMemberUseCase: jest.fn(),
  })
);

jest.mock(
  "@/src/modules/communities/infrastructure/composition/create-create-community-use-case",
  () => ({
    createCreateCommunityUseCase: jest.fn(),
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
    url: "https://academia.example.com/api/communities",
  } as unknown as Request;
}

describe("Create community route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    createCommunity.mockReset();
    global.Response = MockResponse as unknown as typeof Response;

    (createGetAuthenticatedMemberUseCase as jest.Mock).mockReturnValue({
      execute: getAuthenticatedMember,
    });
    (createCreateCommunityUseCase as jest.Mock).mockReturnValue({
      execute: createCommunity,
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
});
