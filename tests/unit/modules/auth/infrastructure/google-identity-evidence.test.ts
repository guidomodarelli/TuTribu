/** @vitest-environment node */

/** Exercises real Google signature verification before deriving email authority. */
import { randomUUID } from "node:crypto";
import { google } from "better-auth/social-providers";
import { describe, expect, it } from "vitest";

import { verifyGoogleIdTokenEvidence } from "@/src/modules/auth/infrastructure/better-auth/google-id-token-evidence-verifier";
import { createAdmissionGoogleTokenFixture } from "@/tests/support/admission-google-tokens";
import { createAdmissionProviderTransport, withAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";

describe("Google identity evidence", () => {
  it.each([
    { domain: "gmail.com", verified: true, hostedDomain: undefined, authority: "gmail" },
    { domain: "workspace.example.invalid", verified: true, hostedDomain: "workspace.example.invalid", authority: "workspace" },
    { domain: "external.example.invalid", verified: true, hostedDomain: undefined, authority: "insufficient" },
    { domain: "workspace.example.invalid", verified: false, hostedDomain: "workspace.example.invalid", authority: "insufficient" },
    { domain: "gmail.com", verified: undefined, hostedDomain: undefined, authority: "insufficient" },
  ])("should derive $authority only from the verified $domain claims", async (row) => {
    // Arrange: private key, token and credentials are ephemeral.
    const signer = await createAdmissionGoogleTokenFixture();
    const clientId = randomUUID();
    const subject = randomUUID();
    const email = `synthetic-${randomUUID()}@${row.domain}`;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await signer.sign({ iss: "https://accounts.google.com", aud: clientId, sub: subject, iat: nowSeconds, exp: nowSeconds + 3600, email, email_verified: row.verified, hd: row.hostedDomain });
    const provider = google({ clientId, clientSecret: randomUUID() });
    const transport = createAdmissionProviderTransport([{ origin: "https://www.googleapis.com", pathname: "/oauth2/v3/certs", method: "GET", respond: () => Response.json(signer.jwks) }]);

    // Act.
    const result = await withAdmissionProviderTransport(transport, () => verifyGoogleIdTokenEvidence(token, provider));

    // Assert: insufficient authority does not fabricate trust from emailVerified.
    expect(result).toMatchObject({ status: "verified", evidence: { subject, normalizedEmail: email, classification: row.authority } });
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it.each(["audience", "issuer", "expiry", "signature", "algorithm"] as const)(
    "should keep authority insufficient when %s verification fails", async (failure) => {
      const signer = await createAdmissionGoogleTokenFixture();
      const clientId = randomUUID();
      const nowSeconds = Math.floor(Date.now() / 1000);
      const claims = { iss: failure === "issuer" ? "https://untrusted.example.invalid" : "https://accounts.google.com", aud: failure === "audience" ? randomUUID() : clientId, sub: randomUUID(), iat: nowSeconds, exp: failure === "expiry" ? nowSeconds - 1 : nowSeconds + 3600, email: `synthetic-${randomUUID()}@gmail.com`, email_verified: true };
      let token = await signer.sign(claims, failure === "algorithm" ? "HS256" : "RS256");
      if (failure === "signature") {
        const parts = token.split(".");
        parts[1] = Buffer.from(JSON.stringify({ ...claims, sub: randomUUID() })).toString("base64url");
        token = parts.join(".");
      }
      const provider = google({ clientId, clientSecret: randomUUID() });
      const transport = createAdmissionProviderTransport([{ origin: "https://www.googleapis.com", pathname: "/oauth2/v3/certs", method: "GET", respond: () => Response.json(signer.jwks) }]);
      const result = await withAdmissionProviderTransport(transport, () => verifyGoogleIdTokenEvidence(token, provider));
      expect(result).toMatchObject({ status: "insufficient" });
      expect(result).not.toHaveProperty("cause");
      if (failure === "algorithm") expect(transport.receipts).toEqual([]);
    },
  );

  it("should isolate concurrent account captures when callbacks A and B interleave", async () => {
    const signerA = await createAdmissionGoogleTokenFixture();
    const signerB = await createAdmissionGoogleTokenFixture();
    const clientIdA = randomUUID();
    const clientIdB = randomUUID();
    const subjectA = randomUUID();
    const subjectB = randomUUID();
    const emailA = `synthetic-${randomUUID()}@gmail.com`;
    const emailB = `synthetic-${randomUUID()}@workspace.example.invalid`;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tokenA = await signerA.sign({ iss: "https://accounts.google.com", aud: clientIdA, sub: subjectA, iat: nowSeconds, exp: nowSeconds + 3600, email: emailA, email_verified: true });
    const tokenB = await signerB.sign({ iss: "https://accounts.google.com", aud: clientIdB, sub: subjectB, iat: nowSeconds, exp: nowSeconds + 3600, email: emailB, email_verified: true, hd: "workspace.example.invalid" });
    const transport = createAdmissionProviderTransport([{ origin: "https://www.googleapis.com", pathname: "/oauth2/v3/certs", method: "GET", respond: () => Response.json({ keys: [...signerA.jwks.keys, ...signerB.jwks.keys] }) }]);
    const [first, second] = await withAdmissionProviderTransport(transport, () => Promise.all([
      verifyGoogleIdTokenEvidence(tokenA, google({ clientId: clientIdA, clientSecret: randomUUID() })),
      verifyGoogleIdTokenEvidence(tokenB, google({ clientId: clientIdB, clientSecret: randomUUID() })),
    ]));
    expect(first).toMatchObject({ status: "verified", evidence: { subject: subjectA, normalizedEmail: emailA, classification: "gmail" } });
    expect(second).toMatchObject({ status: "verified", evidence: { subject: subjectB, normalizedEmail: emailB, classification: "workspace" } });
  });

  it("should keep a malformed token insufficient without invoking the provider", async () => {
    const provider = google({ clientId: randomUUID(), clientSecret: randomUUID() });
    const transport = createAdmissionProviderTransport([]);
    const result = await withAdmissionProviderTransport(transport, () => verifyGoogleIdTokenEvidence("not-a-token", provider));
    expect(result).toMatchObject({ status: "insufficient", reason: "token_malformed" });
    expect(transport.receipts).toEqual([]);
    expect(transport.deniedRequests).toBe(0);
  });

  it.each([undefined, null, "", 37])("should keep a signed unusable subject %s insufficient without exposing token material", async (subject) => {
    const signer = await createAdmissionGoogleTokenFixture(), clientId = randomUUID();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await signer.sign({ iss: "https://accounts.google.com", aud: clientId, sub: subject, iat: nowSeconds, exp: nowSeconds + 3600, email: `synthetic-${randomUUID()}@gmail.com`, email_verified: true });
    const transport = createAdmissionProviderTransport([{ origin: "https://www.googleapis.com", pathname: "/oauth2/v3/certs", method: "GET", respond: () => Response.json(signer.jwks) }]);
    const result = await withAdmissionProviderTransport(transport, () => verifyGoogleIdTokenEvidence(token, google({ clientId, clientSecret: randomUUID() })));
    expect(result).toMatchObject({ status: "insufficient" });
    expect(result).not.toHaveProperty("evidence");
    expect(result).not.toHaveProperty("cause");
    expect(JSON.stringify(result)).not.toContain(token);
  });
});
