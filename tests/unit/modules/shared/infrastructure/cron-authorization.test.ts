// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "@/src/modules/shared/infrastructure/http/cron-authorization";

const SECRET = "cron-secret-value";

function requestWith(authorization?: string): Request {
  return new Request("https://tutribu.example.com/api/maintenance/event-reminders", {
    headers: authorization ? { authorization } : {},
  });
}

describe("isAuthorizedCronRequest", () => {
  it("accepts only the exact bearer token", () => {
    expect(isAuthorizedCronRequest(requestWith(`Bearer ${SECRET}`), SECRET)).toBe(true);
    expect(isAuthorizedCronRequest(requestWith(`Bearer ${SECRET}x`), SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(requestWith(SECRET), SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(requestWith(), SECRET)).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    expect(isAuthorizedCronRequest(requestWith("Bearer "), "")).toBe(false);
  });
});
