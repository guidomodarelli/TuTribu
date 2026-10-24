/** @vitest-environment node */
/** Exercises the actual auth HTTP composition and SDK cookie renewal without exposing server tokens. @module better-auth-public-session-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { describe, expect, it } from "vitest";
import { buildAuthEvidenceRouteHandlers } from "@/src/modules/auth/infrastructure/composition/auth-evidence-route-handlers";
import { BETTER_AUTH_SESSION_OPTIONS } from "@/src/modules/auth/constants/session";
import { SERVER_RENDER_SESSION_QUERY } from "@/src/modules/auth/constants/better-auth-session";
import { BETTER_AUTH_PRIVACY_TEST } from "@/tests/support/constants/better-auth-privacy";
import { SECONDS_PER_DAY, MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { BETTER_AUTH_SERVER_ONLY_HTTP_PATHS } from "@/src/modules/auth/constants/better-auth-config";
import { createBetterAuthLogger } from "@/src/modules/auth/infrastructure/better-auth/better-auth-logger";
import { createAdmissionGoogleTokenFixture } from "@/tests/support/admission-google-tokens";
import { createAdmissionProviderTransport, withAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";

/** @returns A real SDK/store and the actual product's native auth route composition. */
async function preparePublicSession() {
  const baseURL = BETTER_AUTH_PRIVACY_TEST.baseUrl;
  const database: { account: Record<string, unknown>[]; session: { token: string; expiresAt: Date }[]; user: Record<string, unknown>[]; verification: Record<string, unknown>[] } = { account: [], session: [], user: [], verification: [] };
  const instance = betterAuth({ baseURL, secret: randomBytes(BETTER_AUTH_PRIVACY_TEST.secretBytes).toString("hex"), database: memoryAdapter(database), emailAndPassword: { enabled: true }, session: BETTER_AUTH_SESSION_OPTIONS });
  const signup = await instance.handler(new Request(`${baseURL}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: baseURL }, body: JSON.stringify({ name: "Synthetic private member", email: `${randomUUID()}@example.test`, password: randomUUID() }) }));
  expect(signup.status).toBe(200);
  const cookieName = (await instance.$context).authCookies.sessionToken.name;
  const pair = signup.headers.getSetCookie().find((cookie) => cookie.startsWith(`${cookieName}=`))?.split(";")[0];
  if (!pair || !database.session[0]) throw new Error("Native public-session fixture did not create its private cookie");
  return { baseURL, database, instance, pair, cookieName, routes: buildAuthEvidenceRouteHandlers(instance) };
}

describe("public native auth session", () => {
  it("should keep tokens server-only while preserving the current session and private HTTP headers", async () => {
    const fixture = await preparePublicSession();
    const headers = new Headers({ cookie: fixture.pair, "x-request-id": randomUUID(), "x-trace-id": randomUUID() });
    const response = await fixture.routes.GET(new Request(`${fixture.baseURL}/api/auth/get-session`, { headers }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body).includes(fixture.database.session[0].token)).toBe(false);
    expect(body.user.id).toBe(fixture.database.user[0].id);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-request-id")).toBe(headers.get("x-request-id"));
    const serverSession = await fixture.instance.api.getSession({ headers, query: SERVER_RENDER_SESSION_QUERY });
    expect(serverSession?.session.token === fixture.database.session[0].token).toBe(true);
  });

  it("should renew the same cookie and row and minimize the native device-session list", async () => {
    const fixture = await preparePublicSession();
    const oldExpiration = new Date(Date.now() + (BETTER_AUTH_SESSION_OPTIONS.expiresIn - SECONDS_PER_DAY - SECONDS_PER_DAY) * MILLISECONDS_PER_SECOND);
    fixture.database.session[0].expiresAt = oldExpiration;
    const headers = new Headers({ cookie: fixture.pair });
    const response = await fixture.routes.GET(new Request(`${fixture.baseURL}/api/auth/get-session`, { headers }));
    expect(response.status).toBe(200);
    const renewed = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${fixture.cookieName}=`));
    const maxAge = Number(renewed?.match(/Max-Age=(\d+)/i)?.[1]);
    // The real SDK derives remaining lifetime after its write; elapsed fractions can reduce the cookie by a second.
    expect(maxAge).toBeGreaterThan(BETTER_AUTH_SESSION_OPTIONS.expiresIn - BETTER_AUTH_PRIVACY_TEST.cookieMaxAgeToleranceSeconds);
    expect(maxAge).toBeLessThanOrEqual(BETTER_AUTH_SESSION_OPTIONS.expiresIn);
    expect(fixture.database.session[0].expiresAt.getTime()).toBeGreaterThan(oldExpiration.getTime());
    const listed = await fixture.routes.GET(new Request(`${fixture.baseURL}/api/auth/list-sessions`, { headers }));
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(Array.isArray(body) && body.length === 1).toBe(true);
    expect(JSON.stringify(body).includes(fixture.database.session[0].token)).toBe(false);
  });

  it("should let the real browser SDK consume the safe session and preserve unauthenticated null", async () => {
    const fixture = await preparePublicSession();
    const client = createAuthClient({
      baseURL: fixture.baseURL,
      fetchOptions: {
        headers: { cookie: fixture.pair },
        customFetchImpl: (input, init) => fixture.routes.GET(new Request(input, init)),
      },
    });
    const result = await client.getSession();
    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe(fixture.database.user[0].id);
    expect(JSON.stringify(result.data).includes(fixture.database.session[0].token)).toBe(false);
    const anonymous = await fixture.routes.GET(new Request(`${fixture.baseURL}/api/auth/get-session`));
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toBeNull();
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
  });

  it("should authenticate real Google tokens while keeping session and provider credentials off the HTTP API", async () => {
    const signer = await createAdmissionGoogleTokenFixture();
    const clientId = randomUUID(), subject = randomUUID(), accessToken = randomUUID();
    const instant = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
    const idToken = await signer.sign({ iss: "https://accounts.google.com", aud: clientId, sub: subject, iat: instant, exp: instant + SECONDS_PER_DAY, email: `${subject}@example.test`, email_verified: true, name: "Synthetic Google member" });
    const baseURL = BETTER_AUTH_PRIVACY_TEST.baseUrl;
    const database: { user: Record<string, unknown>[]; account: Record<string, unknown>[]; session: { token: string }[]; verification: Record<string, unknown>[] } = { user: [], account: [], session: [], verification: [] };
    const instance = betterAuth({
      baseURL, secret: randomBytes(BETTER_AUTH_PRIVACY_TEST.secretBytes).toString("hex"),
      database: memoryAdapter(database), logger: createBetterAuthLogger(),
      disabledPaths: [...BETTER_AUTH_SERVER_ONLY_HTTP_PATHS],
      socialProviders: { google: { clientId, clientSecret: randomUUID() } },
    });
    const routes = buildAuthEvidenceRouteHandlers(instance);
    const transport = createAdmissionProviderTransport([{ origin: "https://www.googleapis.com", pathname: "/oauth2/v3/certs", method: "GET", respond: () => Response.json(signer.jwks) }]);
    await withAdmissionProviderTransport(transport, async () => {
      const response = await routes.POST(new Request(`${baseURL}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: baseURL }, body: JSON.stringify({ provider: "google", idToken: { token: idToken, accessToken } }) }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ redirect: false, user: { id: database.user[0].id } });
      expect([idToken, accessToken, database.session[0].token].some((secret) => JSON.stringify(body).includes(secret))).toBe(false);
      const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
      expect(cookie.length).toBeGreaterThan(0);
      const headers = new Headers({ cookie, origin: baseURL, "content-type": "application/json" });
      const privateResult = await instance.api.getAccessToken({ headers, body: { providerId: "google" } });
      expect(privateResult.accessToken === accessToken).toBe(true);
      const priorRequests = transport.receipts.length;
      for (const path of BETTER_AUTH_SERVER_ONLY_HTTP_PATHS) {
        for (const suffix of [path, `${path}/`, path.replace("-", "%2D")]) {
          const blocked = await routes.POST(new Request(`${baseURL}/api/auth${suffix}`, { method: "POST", headers, body: JSON.stringify({ providerId: "google" }) }));
          expect(blocked.status).toBe(404);
          expect(blocked.headers.get("cache-control")).toBe("no-store");
          expect([idToken, accessToken, database.session[0].token].some((secret) => blocked.headers.get("location")?.includes(secret))).toBe(false);
        }
      }
      expect(transport.receipts.length).toBe(priorRequests);
      expect(transport.deniedRequests).toBe(0);
    });
  });
});
