/** @vitest-environment jsdom */

import { vi, describe, it, expect, beforeEach } from "vitest";
const socialSignInMock = vi.fn();
const signOutMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("better-auth/client", () => ({
  createAuthClient: () => ({
    getSession: (...args: unknown[]) => getSessionMock(...args),
    signIn: {
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

  it("signs out through the Better Auth client", async () => {
    const { signOutMember } = await import(
      "@/src/modules/auth/infrastructure/better-auth/client"
    );

    await signOutMember();

    expect(signOutMock).toHaveBeenCalledTimes(1);
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
});
