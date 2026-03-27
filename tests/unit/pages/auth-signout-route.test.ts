import { POST } from "@/app/auth/signout/route";
import { REQUEST_ID_HEADER } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

jest.mock("@/src/modules/shared/infrastructure/supabase/server-client", () => ({
  createServerSupabaseClient: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

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
  const errorMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    signOut.mockReset();
    errorMock.mockReset();
    global.Response = MockResponse as unknown as typeof Response;

    (createServerSupabaseClient as jest.Mock).mockResolvedValue({
      auth: {
        signOut,
      },
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: errorMock,
      info: jest.fn(),
    });
  });

  it("signs out and returns ok", async () => {
    signOut.mockResolvedValue({ error: null });

    const response = await POST({ headers: new Headers() } as Request);

    expect(signOut).toHaveBeenCalledWith();
    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toEqual(expect.any(String));
  });

  it("returns a controlled failure when signout fails", async () => {
    signOut.mockResolvedValue({
      error: { message: "signout failed" },
    });

    const response = await POST({ headers: new Headers() } as Request);

    expect(response.status).toBe(500);
    expect(errorMock).toHaveBeenCalledWith({
      message: "Sign out failed",
      error: { message: "signout failed" },
      metadata: {},
    });
  });
});
