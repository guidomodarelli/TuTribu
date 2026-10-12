/** Keeps native browser request failures out of artifacts containing private cookies or URL tokens. @module private-browser-request */

/**
 * Executes an owned browser transport without exporting its private call log.
 * @param operation - Fixed public test operation, never a URL or caller-controlled value.
 * @param request - Actual native request that may retain credentials in its error.
 * @returns The original response when the transport settles normally.
 * @throws A safe error naming only the test operation after a transport failure.
 */
export async function runPrivateBrowserRequest<Result>(operation: string, request: () => Promise<Result>): Promise<Result> {
  try { return await request(); }
  catch {
    // Playwright errors can serialize cookies and credential-bearing URLs; this boundary deliberately discards that cause.
    throw new Error(`PrivateBrowserRequest:${operation} failed: transport_unavailable`);
  }
}
