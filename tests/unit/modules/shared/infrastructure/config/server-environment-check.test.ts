/** @vitest-environment node */

/** Covers the startup environment check against the real feature requirements and messaging keyring parser. */
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SERVER_ENVIRONMENT_REQUIREMENTS } from "@/src/modules/server-environment-requirements";
import { checkServerEnvironment, inspectServerEnvironment } from "@/src/modules/shared/infrastructure/config/server-environment-check";
import { MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

const keyrings = JSON.stringify(Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => [purpose, { activeKeyId: `${purpose}-1`, keys: [{ id: `${purpose}-1`, materialBase64: randomBytes(32).toString("base64") }] }])));
const completeEnvironment = {
  DATABASE_URL: "postgresql://synthetic-host/neondb",
  BETTER_AUTH_SECRET: "synthetic-secret",
  BETTER_AUTH_URL: "https://dev.tutribu.app",
  GOOGLE_CLIENT_ID: "synthetic-client",
  GOOGLE_CLIENT_SECRET: "synthetic-client-secret",
  MESSAGING_SECURITY_ENVIRONMENT: "development",
  MESSAGING_SECURITY_EPOCH: "1",
  MESSAGING_RECOVERY_LOCK: "false",
  MESSAGING_KEYRINGS_JSON: keyrings,
  CLOUDFLARE_ACCOUNT_ID: "synthetic-account",
  CLOUDFLARE_R2_ACCESS_KEY_ID: "synthetic-access",
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: "synthetic-secret-access",
  CLOUDFLARE_R2_BUCKET_NAME: "synthetic-bucket",
  CLOUDFLARE_IMAGES_API_TOKEN: "synthetic-token",
  CLOUDFLARE_IMAGES_ACCOUNT_HASH: "synthetic-hash",
};

describe("server environment check", () => {
  afterEach(() => vi.restoreAllMocks());

  it("should accept an environment that meets every feature requirement", async () => {
    expect(await inspectServerEnvironment(completeEnvironment, SERVER_ENVIRONMENT_REQUIREMENTS)).toEqual([]);
  });

  it("should name the feature and the missing variables, never their values", async () => {
    const { MESSAGING_KEYRINGS_JSON: _keyrings, CLOUDFLARE_R2_BUCKET_NAME: _bucket, ...environment } = completeEnvironment;
    const problems = await inspectServerEnvironment(environment, SERVER_ENVIRONMENT_REQUIREMENTS);
    expect(problems).toEqual([
      { feature: "messaging-security", severity: "blocking", missing: ["MESSAGING_KEYRINGS_JSON"] },
      { feature: "attachments-r2", severity: "degraded", missing: ["CLOUDFLARE_R2_BUCKET_NAME"] },
    ]);
    expect(JSON.stringify(problems)).not.toContain("synthetic");
  });

  it("should report unusable messaging keyrings by error class and code, as the admission ledger would read them", async () => {
    const problems = await inspectServerEnvironment({ ...completeEnvironment, MESSAGING_KEYRINGS_JSON: "{not json" }, SERVER_ENVIRONMENT_REQUIREMENTS);
    expect(problems).toEqual([{ feature: "messaging-security", severity: "blocking", missing: [], invalid: [{ name: "MessagingCryptographyError", code: MESSAGING_CRYPTO_ERROR.invalidConfiguration }, { name: "SyntaxError" }] }]);
  });

  it("should stop local development on a blocking problem after logging it, and only log a degraded one", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { DATABASE_URL: _database, ...withoutDatabase } = completeEnvironment;
    await expect(checkServerEnvironment(withoutDatabase, SERVER_ENVIRONMENT_REQUIREMENTS, { failOnBlocking: true })).rejects.toThrow(/environment is incomplete/);
    expect(errorLog).toHaveBeenCalledOnce();

    const { CLOUDFLARE_IMAGES_API_TOKEN: _token, ...withoutImages } = completeEnvironment;
    await expect(checkServerEnvironment(withoutImages, SERVER_ENVIRONMENT_REQUIREMENTS, { failOnBlocking: true })).resolves.toHaveLength(1);
    expect(warnLog).toHaveBeenCalledOnce();
  });

  it("should never stop a production server, only log why the feature is failing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { BETTER_AUTH_SECRET: _secret, ...environment } = completeEnvironment;
    await expect(checkServerEnvironment(environment, SERVER_ENVIRONMENT_REQUIREMENTS, { failOnBlocking: false })).resolves.toEqual([{ feature: "auth", severity: "blocking", missing: ["BETTER_AUTH_SECRET"] }]);
  });
});
