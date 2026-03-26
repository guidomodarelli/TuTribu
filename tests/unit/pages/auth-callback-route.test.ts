import { GET } from "@/app/auth/callback/route";
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

describe("Auth callback route", () => {
  const exchangeCodeForSession = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    exchangeCodeForSession.mockReset();
    global.Response = MockResponse as unknown as typeof Response;

    (createServerSupabaseClient as jest.Mock).mockResolvedValue({
      auth: {
        exchangeCodeForSession,
      },
    });
  });

  it("exchanges the code and redirects to a safe next path", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      {
        url: "https://academia.example.com/auth/callback?code=oauth-code&next=%2Fpanel",
      } as Request
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(response.headers.get("location")).toBe("https://academia.example.com/panel");
  });

  it("falls back to root when next is not a relative path", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      {
        url: "https://academia.example.com/auth/callback?code=oauth-code&next=https://evil.example.com",
      } as Request
    );

    expect(response.headers.get("location")).toBe("https://academia.example.com/");
  });

  it("redirects to the auth error page when the code exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { message: "exchange failed" },
    });

    const response = await GET(
      {
        url: "https://academia.example.com/auth/callback?code=oauth-code",
      } as Request
    );

    expect(response.headers.get("location")).toBe(
      "https://academia.example.com/auth/error"
    );
  });

  it("redirects to the auth error page when the callback does not contain a code", async () => {
    const response = await GET(
      {
        url: "https://academia.example.com/auth/callback?next=%2Fpanel",
      } as Request
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://academia.example.com/auth/error"
    );
  });
});
