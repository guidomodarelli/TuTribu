/**
 * @jest-environment node
 */
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { getLegacyRedirects } from "@/config/legacy-redirects";

const REDIRECT_STATUS_PERMANENT = 308;
const PASS_THROUGH_STATUS = 200;
const TEST_ORIGIN = "https://tutribu.app";

async function getRedirectResponse(pathnameAndQuery: string): Promise<Response> {
  return unstable_getResponseFromNextConfig({
    nextConfig: {
      redirects: getLegacyRedirects,
    },
    url: new URL(pathnameAndQuery, TEST_ORIGIN).toString(),
  });
}

describe("next config legacy /tribu/ redirects", () => {
  it("redirects /tribu/crear to /-/crear with 308", async () => {
    const response = await getRedirectResponse("/tribu/crear");

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(getRedirectUrl(response)).toBe(`${TEST_ORIGIN}/-/crear`);
  });

  it("redirects /tribu/<slug> to /<slug> with 308", async () => {
    const response = await getRedirectResponse("/tribu/test4");

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(getRedirectUrl(response)).toBe(`${TEST_ORIGIN}/test4`);
  });

  it("redirects nested tribe section URLs preserving the rest of the path", async () => {
    const response = await getRedirectResponse("/tribu/test4/canales");

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(getRedirectUrl(response)).toBe(`${TEST_ORIGIN}/test4/canales`);
  });

  it("preserves query strings during legacy redirects", async () => {
    const response = await getRedirectResponse(
      "/tribu/test4/canales?channel=general&page=2"
    );

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(getRedirectUrl(response)).toBe(
      `${TEST_ORIGIN}/test4/canales?channel=general&page=2`
    );
  });

  it("redirects invitation URLs to the new flat scheme", async () => {
    const response = await getRedirectResponse(
      "/tribu/test4/invitar/some-token-value"
    );

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(getRedirectUrl(response)).toBe(
      `${TEST_ORIGIN}/test4/invitar/some-token-value`
    );
  });

  it("uses a method-preserving redirect for legacy invitation submissions", async () => {
    const response = await getRedirectResponse(
      "/tribu/test4/invitar/some-token-value"
    );

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(getRedirectUrl(response)).toBe(
      `${TEST_ORIGIN}/test4/invitar/some-token-value`
    );
  });

  it("passes through non-legacy paths without redirect", async () => {
    const response = await getRedirectResponse("/test4/canales");

    expect(response.status).toBe(PASS_THROUGH_STATUS);
    expect(getRedirectUrl(response)).toBeNull();
  });

  it("passes through root and new platform paths", async () => {
    await expect(getRedirectResponse("/")).resolves.toHaveProperty(
      "status",
      PASS_THROUGH_STATUS
    );
    await expect(getRedirectResponse("/-/crear")).resolves.toHaveProperty(
      "status",
      PASS_THROUGH_STATUS
    );
  });
});
