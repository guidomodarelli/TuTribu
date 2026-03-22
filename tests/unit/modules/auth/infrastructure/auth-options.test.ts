describe("authOptions", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses custom sign-in and error pages", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.NEXTAUTH_SECRET = "next-auth-secret";

    const { authOptions } = await import(
      "@/src/modules/auth/infrastructure/next-auth/auth-options"
    );

    expect(authOptions.pages).toEqual({
      signIn: "/auth/signin",
      error: "/auth/error",
    });
    expect(authOptions.session).toEqual({ strategy: "jwt" });
  });

  it("disables Google provider when server credentials are not configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const { authOptions } = await import(
      "@/src/modules/auth/infrastructure/next-auth/auth-options"
    );

    expect(authOptions.providers).toEqual([]);
  });
});
