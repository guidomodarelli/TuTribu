/**
 * @jest-environment node
 */
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";

const REDIRECT_STATUS_PERMANENT = 308;
const PASS_THROUGH_STATUS = 200;
const TEST_ORIGIN = "https://tutribu.app";

function buildRequest(
  pathnameAndQuery: string,
  init?: RequestInit
): NextRequest {
  return new NextRequest(new URL(pathnameAndQuery, TEST_ORIGIN), init);
}

describe("proxy legacy /tribu/ redirects", () => {
  it("redirects /tribu/crear to /-/crear with 308", () => {
    const response = proxy(buildRequest("/tribu/crear"));

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(response.headers.get("location")).toBe(`${TEST_ORIGIN}/-/crear`);
  });

  it("redirects /tribu/<slug> to /<slug> with 308", () => {
    const response = proxy(buildRequest("/tribu/test4"));

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(response.headers.get("location")).toBe(`${TEST_ORIGIN}/test4`);
  });

  it("redirects nested tribe section URLs preserving the rest of the path", () => {
    const response = proxy(buildRequest("/tribu/test4/canales"));

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(response.headers.get("location")).toBe(
      `${TEST_ORIGIN}/test4/canales`
    );
  });

  it("preserves query strings during legacy redirects", () => {
    const response = proxy(
      buildRequest("/tribu/test4/canales?channel=general&page=2")
    );

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(response.headers.get("location")).toBe(
      `${TEST_ORIGIN}/test4/canales?channel=general&page=2`
    );
  });

  it("redirects invitation URLs to the new flat scheme", () => {
    const response = proxy(
      buildRequest("/tribu/test4/invitar/some-token-value")
    );

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(response.headers.get("location")).toBe(
      `${TEST_ORIGIN}/test4/invitar/some-token-value`
    );
  });

  it("uses a method-preserving redirect for legacy invitation submissions", () => {
    const response = proxy(
      buildRequest("/tribu/test4/invitar/some-token-value", {
        method: "POST",
      })
    );

    expect(response.status).toBe(REDIRECT_STATUS_PERMANENT);
    expect(response.headers.get("location")).toBe(
      `${TEST_ORIGIN}/test4/invitar/some-token-value`
    );
  });

  it("passes through non-legacy paths without redirect", () => {
    const response = proxy(buildRequest("/test4/canales"));

    expect(response.status).toBe(PASS_THROUGH_STATUS);
    expect(response.headers.get("location")).toBeNull();
  });

  it("passes through root and new platform paths", () => {
    expect(proxy(buildRequest("/")).status).toBe(PASS_THROUGH_STATUS);
    expect(proxy(buildRequest("/-/crear")).status).toBe(
      PASS_THROUGH_STATUS
    );
  });
});
