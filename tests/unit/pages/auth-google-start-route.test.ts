import { GET } from "@/app/auth/google/start/route";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

jest.mock("@/src/modules/shared/infrastructure/supabase/server-client", () => ({
  createServerSupabaseClient: jest.fn(),
}));

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

describe("Auth Google start route", () => {
  const signInWithOAuth = jest.fn();
  const expectedScopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
  ].join(" ");

  beforeEach(() => {
    jest.clearAllMocks();
    signInWithOAuth.mockReset();
    global.Response = MockResponse as unknown as typeof Response;

    (createServerSupabaseClient as jest.Mock).mockResolvedValue({
      auth: {
        signInWithOAuth,
      },
    });
  });

  it("redirects to the Supabase OAuth URL", async () => {
    signInWithOAuth.mockResolvedValue({
      data: {
        url: "https://supabase.example.com/oauth/google",
      },
      error: null,
    });

    const response = await GET({
      url: "https://academia.example.com/auth/google/start?next=%2Fpanel",
    } as Request);

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        queryParams: {
          prompt: "select_account",
        },
        redirectTo: "https://academia.example.com/auth/callback?next=%2Fpanel",
        scopes: expectedScopes,
      },
    });
    expect(response.headers.get("location")).toBe(
      "https://supabase.example.com/oauth/google"
    );
  });

  it("falls back to root when next is invalid", async () => {
    signInWithOAuth.mockResolvedValue({
      data: {
        url: "https://supabase.example.com/oauth/google",
      },
      error: null,
    });

    await GET({
      url: "https://academia.example.com/auth/google/start?next=https://evil.example.com",
    } as Request);

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        queryParams: {
          prompt: "select_account",
        },
        redirectTo: "https://academia.example.com/auth/callback?next=%2F",
        scopes: expectedScopes,
      },
    });
  });

  it("redirects to auth error when Supabase OAuth fails", async () => {
    signInWithOAuth.mockResolvedValue({
      data: {
        url: null,
      },
      error: { message: "oauth failed" },
    });

    const response = await GET({
      url: "https://academia.example.com/auth/google/start?next=%2Fpanel",
    } as Request);

    expect(response.headers.get("location")).toBe(
      "https://academia.example.com/auth/error"
    );
  });
});
