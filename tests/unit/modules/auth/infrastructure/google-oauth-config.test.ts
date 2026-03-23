describe("getGoogleOAuthServerConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns null when required Google OAuth variables are missing", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const { getGoogleOAuthServerConfig } = await import(
      "@/src/modules/auth/infrastructure/oauth/google-oauth-config"
    );

    expect(getGoogleOAuthServerConfig()).toBeNull();
  });

  it("builds a server config with offline scope when environment is complete", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.NEXTAUTH_SECRET = "next-auth-secret";

    const { getGoogleOAuthServerConfig } = await import(
      "@/src/modules/auth/infrastructure/oauth/google-oauth-config"
    );

    const result = getGoogleOAuthServerConfig();

    expect(result).toEqual(
      expect.objectContaining({
        clientId: "google-client-id",
        clientSecret: "google-client-secret",
        nextAuthSecret: "next-auth-secret",
      })
    );
    expect(result?.scopeString).toContain("openid");
    expect(result?.scopeString).toContain("email");
    expect(result?.scopeString).toContain("profile");
    expect(result?.scopeString).toContain(
      "https://www.googleapis.com/auth/drive.file"
    );
  });

  it("ignores NEXT_AUTH_SECRET when NEXTAUTH_SECRET is missing", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    delete process.env.NEXTAUTH_SECRET;
    process.env.NEXT_AUTH_SECRET = "legacy-next-auth-secret";

    const { getGoogleOAuthServerConfig } = await import(
      "@/src/modules/auth/infrastructure/oauth/google-oauth-config"
    );

    const result = getGoogleOAuthServerConfig();

    expect(result?.nextAuthSecret).toBeUndefined();
  });
});
