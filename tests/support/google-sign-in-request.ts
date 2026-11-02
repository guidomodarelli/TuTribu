/** Observes the Google sign-in start the real Better Auth browser client sends, at the network edge only. @module google-sign-in-request */

/** Path suffix of the Better Auth endpoint that starts a social sign-in. */
const SOCIAL_SIGN_IN_PATH = "/sign-in/social";
/** Base that resolves a relative request address; only its path is compared. */
const REQUEST_RESOLUTION_ORIGIN = "http://localhost";
/** Authorization address the stubbed server answers with; `redirect: false` keeps the test page from navigating to it. */
const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/** Body Better Auth posts to start Google sign-in. */
export type GoogleSignInRequestBody = { provider?: string; callbackURL?: string; errorCallbackURL?: string };

/** Sign-in starts observed since the last reset. */
export type GoogleSignInTransport = { requests: GoogleSignInRequestBody[]; reset: () => void };

/**
 * Better Auth's browser client keeps the `fetch` it finds when its module loads, so this runs before the test file's imports:
 * `const googleSignIn = await vi.hoisted(async () => (await import("@/tests/support/google-sign-in-request")).installGoogleSignInTransport());`.
 * Social sign-in starts are answered without leaving the page; every other request goes to the `fetch` that was installed, so a
 * later `vi.stubGlobal("fetch", …)` still works for the rest of the file.
 * @returns The bodies of every social sign-in start, in order, and a reset for the next test.
 */
export function installGoogleSignInTransport(): GoogleSignInTransport {
  const requests: GoogleSignInRequestBody[] = [], forward = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    // The client passes the URL and a JSON string body; a `Request` is not rebuilt, since jsdom's AbortSignal is not the runtime's.
    const url = input instanceof Request ? input.url : String(input);
    if (!new URL(url, REQUEST_RESOLUTION_ORIGIN).pathname.endsWith(SOCIAL_SIGN_IN_PATH)) return forward(input, init);
    if (typeof init?.body === "string") requests.push(JSON.parse(init.body) as GoogleSignInRequestBody);
    return Response.json({ url: GOOGLE_AUTHORIZATION_URL, redirect: false });
  };
  return { requests, reset: () => { requests.length = 0; } };
}
