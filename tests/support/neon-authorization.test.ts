/** @vitest-environment node */

/** Exercises private CLI-session renewal through the harness-owned manager boundary. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveNeonAuthorization } from "./neon-authorization";

describe("Neon validation authorization", () => {
  it("should retain a current token without network access when its CLI expiry is still valid", async () => {
    const token = randomUUID();
    let renewalCount = 0;
    const renew = async () => { renewalCount += 1; return { access_token: randomUUID() }; };
    expect(await resolveNeonAuthorization({ access_token: token, expires_at: Date.now() + 3_600_000 }, renew)).toBe(token);
    expect(renewalCount).toBe(0);
  });

  it("should delegate an expired CLI session to its official renewal manager", async () => {
    const renewedToken = randomUUID();
    let renewalCount = 0;
    const renew = async () => { renewalCount += 1; return { access_token: renewedToken, expires_at: Date.now() + 3_600_000 }; };
    expect(await resolveNeonAuthorization({ access_token: randomUUID(), expires_at: Date.now() - 1 }, renew)).toBe(renewedToken);
    expect(renewalCount).toBe(1);
  });

  it("should expose only a safe authentication error when renewal is rejected", async () => {
    const failure = resolveNeonAuthorization({ access_token: randomUUID(), expires_at: Date.now() - 1 }, async () => ({}));
    await expect(failure).rejects.toThrow("neon_authentication_required");
  });

  it("should reject a short-lived unchanged token returned by the official manager before resources are created", async () => {
    const credentials = { access_token: randomUUID(), expires_at: Date.now() + 30_000 };
    await expect(resolveNeonAuthorization(credentials, async () => credentials)).rejects.toThrow("neon_authorization_expiring");
  });

  it("should reject a token whose expiry is absent instead of assuming unlimited validation lifetime", async () => {
    await expect(resolveNeonAuthorization({ access_token: randomUUID() }, async () => ({ access_token: randomUUID() }))).rejects.toThrow("neon_authentication_required");
  });
});
