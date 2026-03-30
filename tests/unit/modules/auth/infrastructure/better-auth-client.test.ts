/** @jest-environment jsdom */

const socialSignInMock = jest.fn();
const signOutMock = jest.fn();

jest.mock("better-auth/client", () => ({
  createAuthClient: () => ({
    signIn: {
      social: (...args: unknown[]) => socialSignInMock(...args),
    },
    signOut: (...args: unknown[]) => signOutMock(...args),
  }),
}));

describe("Better Auth client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    await startGoogleSignIn("/comunidad/crear");

    expect(socialSignInMock).toHaveBeenCalledWith({
      callbackURL: "/comunidad/crear",
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

    await expect(startGoogleSignIn("/comunidad/crear")).rejects.toThrow(
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
});
