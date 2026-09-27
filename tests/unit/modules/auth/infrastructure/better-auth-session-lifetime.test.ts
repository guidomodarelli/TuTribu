/** @vitest-environment node */

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";

import { BETTER_AUTH_SESSION_OPTIONS } from "@/src/modules/auth/constants/session";

const BASE_URL = "https://tutribu.example.com";
/** Secure prefix applies because the base URL uses HTTPS. */
const SESSION_COOKIE_NAME = "__Secure-better-auth.session_token";
const SECONDS_PER_DAY = 86_400;
const MILLISECONDS_PER_SECOND = 1_000;
const EXPECTED_LIFETIME_SECONDS = 180 * SECONDS_PER_DAY;
/** Tolerance for the seconds elapsed between the request and the assertion. */
const LIFETIME_TOLERANCE_SECONDS = 60;

type MemoryDatabase = {
  account: Record<string, unknown>[];
  session: { expiresAt: Date; token: string }[];
  user: Record<string, unknown>[];
  verification: Record<string, unknown>[];
};

/**
 * Builds a real Better Auth instance with the production session options. The
 * email-and-password provider only exists to open a session inside the test.
 */
function createTestAuth() {
  const database: MemoryDatabase = {
    account: [],
    session: [],
    user: [],
    verification: [],
  };
  const auth = betterAuth({
    baseURL: BASE_URL,
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    secret: "test-secret-with-enough-entropy-for-better-auth",
    session: BETTER_AUTH_SESSION_OPTIONS,
  });

  return { auth, database };
}

function readSessionCookie(response: Response) {
  const sessionCookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
  const maxAgeMatch = sessionCookie?.match(/Max-Age=(\d+)/i);

  return {
    maxAgeSeconds: maxAgeMatch ? Number(maxAgeMatch[1]) : null,
    pair: sessionCookie?.split(";")[0] ?? null,
  };
}

async function signUpMember(auth: ReturnType<typeof createTestAuth>["auth"]) {
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      body: JSON.stringify({
        email: "member@example.com",
        name: "Member Example",
        password: "a-long-test-password",
      }),
      headers: { "content-type": "application/json", origin: BASE_URL },
      method: "POST",
    })
  );

  expect(response.status).toBe(200);

  return readSessionCookie(response);
}

function secondsUntil(date: Date) {
  return (date.valueOf() - Date.now()) / MILLISECONDS_PER_SECOND;
}

describe("Better Auth session lifetime", () => {
  it("issues a session cookie that lasts 180 days", async () => {
    const { auth, database } = createTestAuth();

    const sessionCookie = await signUpMember(auth);

    expect(sessionCookie.maxAgeSeconds).toBe(EXPECTED_LIFETIME_SECONDS);
    expect(secondsUntil(database.session[0].expiresAt)).toBeGreaterThan(
      EXPECTED_LIFETIME_SECONDS - LIFETIME_TOLERANCE_SECONDS
    );
  });

  it("renews the cookie and the database row when the session endpoint is visited after a day", async () => {
    const { auth, database } = createTestAuth();
    const sessionCookie = await signUpMember(auth);
    const twoDaysAgoExpiration = new Date(
      Date.now() +
        (EXPECTED_LIFETIME_SECONDS - 2 * SECONDS_PER_DAY) * MILLISECONDS_PER_SECOND
    );
    database.session[0].expiresAt = twoDaysAgoExpiration;

    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, {
        headers: { cookie: sessionCookie.pair ?? "" },
      })
    );
    const renewedCookie = readSessionCookie(response);

    expect(response.status).toBe(200);
    expect(renewedCookie.maxAgeSeconds).toBeGreaterThan(
      EXPECTED_LIFETIME_SECONDS - LIFETIME_TOLERANCE_SECONDS
    );
    expect(secondsUntil(database.session[0].expiresAt)).toBeGreaterThan(
      EXPECTED_LIFETIME_SECONDS - LIFETIME_TOLERANCE_SECONDS
    );
  });

  it("keeps the database row untouched when a server render reads the session without refresh", async () => {
    const { auth, database } = createTestAuth();
    const sessionCookie = await signUpMember(auth);
    const twoDaysAgoExpiration = new Date(
      Date.now() +
        (EXPECTED_LIFETIME_SECONDS - 2 * SECONDS_PER_DAY) * MILLISECONDS_PER_SECOND
    );
    database.session[0].expiresAt = twoDaysAgoExpiration;

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: sessionCookie.pair ?? "" }),
      query: { disableRefresh: true },
    });

    expect(session?.user.email).toBe("member@example.com");
    expect(database.session[0].expiresAt).toEqual(twoDaysAgoExpiration);
  });
});
