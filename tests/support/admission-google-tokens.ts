/**
 * Builds signed synthetic Google tokens for the real Better Auth verifier.
 *
 * @module admission-google-tokens
 */
import { randomUUID } from "node:crypto";

/**
 * Creates an ephemeral signer and a public JWKS without persisted key material.
 *
 * @returns Public JWKS and a signer scoped to the generated private CryptoKey.
 */
export async function createAdmissionGoogleTokenFixture() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const keyId = randomUUID();
  const publicKey = { ...await crypto.subtle.exportKey("jwk", keyPair.publicKey), kid: keyId, alg: "RS256", use: "sig" };
  return {
    jwks: { keys: [publicKey] },
    /**
     * Signs only the synthetic claims supplied for this scenario.
     *
     * @param claims - Scenario claims, including explicit issuer/audience/times.
     * @param algorithmLabel - Header value used to exercise the RS256 allowlist.
     * @returns A signed token retained only in the test's memory.
     */
    async sign(claims: Record<string, unknown>, algorithmLabel = "RS256") {
      const header = Buffer.from(JSON.stringify({ alg: algorithmLabel, kid: keyId })).toString("base64url");
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const input = `${header}.${payload}`;
      const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(input));
      return `${input}.${Buffer.from(signature).toString("base64url")}`;
    },
  };
}
