/** @vitest-environment jsdom */

import { vi, describe, it, expect, beforeEach } from "vitest";
const socialSignInMock = vi.fn();
const emailSignInMock = vi.fn();
const signOutMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("better-auth/client", () => ({
  createAuthClient: () => ({
    getSession: (...args: unknown[]) => getSessionMock(...args),
    signIn: {
      email: (...args: unknown[]) => emailSignInMock(...args),
      social: (...args: unknown[]) => socialSignInMock(...args),
    },
    signOut: (...args: unknown[]) => signOutMock(...args),
  }),
}));

describe("Better Auth client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialSignInMock.mockResolvedValue({
      data: {
        redirect: true,
      },
      error: null,
    });
    signOutMock.mockResolvedValue({
      data: {
        success: true,
      },
      error: null,
    });
  });

  it("sends Google OAuth failures to the app auth error page", async () => {
    const { startGoogleSignIn } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    await startGoogleSignIn("/-/crear");

    expect(socialSignInMock).toHaveBeenCalledWith({
      callbackURL: "/-/crear",
      errorCallbackURL: "/auth/error",
      provider: "google",
    });
  });

  it("asks Better Auth for the authorization URL without its own redirect when the account chooser is requested", async () => {
    socialSignInMock.mockResolvedValue({ data: { redirect: false }, error: null });
    const { startGoogleSignIn } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    // Without an authorization URL there is nothing to open, so the start fails instead of staying on the page.
    await expect(startGoogleSignIn("/admissions/matematica-pro", { selectAccount: true })).rejects.toThrow("Better Auth returned no Google authorization URL.");
    expect(socialSignInMock).toHaveBeenCalledWith({
      callbackURL: "/admissions/matematica-pro",
      disableRedirect: true,
      errorCallbackURL: "/auth/error",
      provider: "google",
    });
  });

  it("throws when Better Auth rejects the OAuth start without a network failure", async () => {
    socialSignInMock.mockResolvedValue({
      data: null,
      error: {
        message: "origin_mismatch",
      },
    });

    const { startGoogleSignIn } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    await expect(startGoogleSignIn("/-/crear")).rejects.toThrow(
      "origin_mismatch"
    );
  });

  it("throws when Better Auth rejects sign-out without a network failure", async () => {
    signOutMock.mockResolvedValue({
      data: null,
      error: {
        message: "sign_out_rejected",
      },
    });

    const { signOutMember } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    await expect(signOutMember()).rejects.toThrow("sign_out_rejected");
  });

  it("reports an active session after the keep-alive request renews it", async () => {
    const abortController = new AbortController();
    getSessionMock.mockResolvedValue({
      data: { session: { id: "session-1" }, user: { id: "member-1" } },
      error: null,
    });

    const { refreshMemberSession } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    await expect(
      refreshMemberSession(abortController.signal, "member-1")
    ).resolves.toBe("active");
    expect(getSessionMock).toHaveBeenCalledWith({
      fetchOptions: { signal: abortController.signal },
    });
  });

  it("reports an expired session when Better Auth no longer recognizes the cookie", async () => {
    getSessionMock.mockResolvedValue({ data: null, error: null });

    const { refreshMemberSession } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    await expect(
      refreshMemberSession(new AbortController().signal, "member-1")
    ).resolves.toBe("expired");
  });

  it("reports an expired session when the cookie now belongs to another member", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { id: "session-2" }, user: { id: "member-2" } },
      error: null,
    });

    const { refreshMemberSession } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    await expect(
      refreshMemberSession(new AbortController().signal, "member-1")
    ).resolves.toBe("expired");
  });

  it("reports an expired session when Better Auth rejects the renewal because the session was deleted", async () => {
    getSessionMock.mockResolvedValue({
      data: null,
      error: { status: 401, statusText: "UNAUTHORIZED" },
    });

    const { refreshMemberSession } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    await expect(
      refreshMemberSession(new AbortController().signal, "member-1")
    ).resolves.toBe("expired");
  });

  it("reports a failed refresh when the session endpoint errors or the network drops", async () => {
    getSessionMock
      .mockResolvedValueOnce({ data: null, error: { status: 500 } })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { refreshMemberSession } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    await expect(
      refreshMemberSession(new AbortController().signal, "member-1")
    ).resolves.toBe("failed");
    await expect(
      refreshMemberSession(new AbortController().signal, "member-1")
    ).resolves.toBe("failed");
  });
  describe("startDevSignIn", () => {
    it.each([
      ["signed-in", { data: { token: "session-token" }, error: null }],
      ["invalid-credentials", { data: null, error: { status: 401 } }],
      ["invalid-credentials", { data: null, error: { status: 403 } }],
      ["failed", { data: null, error: { status: 400 } }],
    ])("returns %s for the Better Auth answer", async (expectedResult, answer) => {
      emailSignInMock.mockResolvedValue(answer);
      const { startDevSignIn } = await import(
        "@/src/modules/auth/infrastructure/better-auth/client"
      );

      await expect(
        startDevSignIn("dev@tutribu.example", "dev-password-123")
      ).resolves.toBe(expectedResult);
      expect(emailSignInMock).toHaveBeenCalledWith({
        email: "dev@tutribu.example",
        password: "dev-password-123",
      });
    });

    it("maps network failures to a stable failed result", async () => {
      emailSignInMock.mockRejectedValue(new TypeError("Failed to fetch"));
      const { startDevSignIn } = await import(
        "@/src/modules/auth/infrastructure/better-auth/client"
      );

      await expect(
        startDevSignIn("dev@tutribu.example", "dev-password-123")
      ).resolves.toBe("failed");
    });
  });
});
