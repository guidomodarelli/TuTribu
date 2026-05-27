import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const TEST_PUBLIC_APP_BASE_URL = "https://tutribu.example.com";
const EXPECTED_DISALLOWED_ROUTES = [
  "/api/",
  "/auth/",
  "/*/invitar",
  "/*/tribu",
  "/*/bienvenida",
  "/*/canales",
  "/*/cursos",
  "/*/eventos",
  "/*/historia",
  "/*/invitaciones",
  "/*/precios",
  "/*/suscripcion",
  "/*/meritos",
] as const;

describe("metadata routes", () => {
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    process.env.BETTER_AUTH_URL = TEST_PUBLIC_APP_BASE_URL;
  });

  afterEach(() => {
    if (previousBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
      return;
    }

    process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
  });

  it("disallows crawlers from API, auth, invitation and internal tribe routes", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: EXPECTED_DISALLOWED_ROUTES,
      },
      sitemap: TEST_PUBLIC_APP_BASE_URL + "/sitemap.xml",
    });
  });

  it("exposes only the public home page in the sitemap", () => {
    expect(sitemap()).toEqual([
      {
        url: TEST_PUBLIC_APP_BASE_URL + "/",
        changeFrequency: "weekly",
        priority: 1,
      },
    ]);
  });
});
