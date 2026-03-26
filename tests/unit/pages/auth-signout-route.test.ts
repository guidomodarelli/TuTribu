import { POST } from "@/app/auth/signout/route";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

jest.mock("@/src/modules/shared/infrastructure/supabase/server-client", () => ({
  createServerSupabaseClient: jest.fn(),
}));

class MockResponse {
  status: number;
  headers: Headers;

  constructor(_body: string, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers);
  }
}

describe("Auth signout route", () => {
  const signOut = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    signOut.mockReset();
    global.Response = MockResponse as unknown as typeof Response;

    (createServerSupabaseClient as jest.Mock).mockResolvedValue({
      auth: {
        signOut,
      },
    });
  });

  it("signs out and returns ok", async () => {
    signOut.mockResolvedValue({ error: null });

    const response = await POST();

    expect(signOut).toHaveBeenCalledWith();
    expect(response.status).toBe(200);
  });

  it("returns a controlled failure when signout fails", async () => {
    signOut.mockResolvedValue({
      error: { message: "signout failed" },
    });

    const response = await POST();

    expect(response.status).toBe(500);
  });
});
