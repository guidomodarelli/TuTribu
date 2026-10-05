/** @vitest-environment node */

/** Exercises the controlled HTTP boundary with real SDK and Web Crypto calls. */
import { randomUUID } from "node:crypto";
import Zavu from "@zavudev/sdk";
import { google } from "better-auth/social-providers";
import { describe, expect, it } from "vitest";

import {
  createAdmissionProviderTransport,
  withAdmissionProviderTransport,
} from "./admission-provider-transport";

describe("admission provider transport", () => {
  it("should dispatch through the real Zavu SDK when the route is explicitly registered", async () => {
    // Arrange: credentials and message content exist only in this synthetic run.
    const apiKey = randomUUID();
    const senderId = randomUUID();
    const operationId = randomUUID();
    const messageId = randomUUID();
    const transport = createAdmissionProviderTransport([
      {
        origin: "https://api.zavu.dev",
        pathname: "/v1/messages",
        method: "POST",
        respond: async (request) => {
          expect(request.headers.get("authorization")).toBe(`Bearer ${apiKey}`);
          expect(request.headers.get("Zavu-Sender")).toBe(senderId);
          expect(await request.json()).toMatchObject({
            channel: "email",
            fallbackEnabled: false,
            idempotencyKey: operationId,
          });
          return Response.json({ message: { id: messageId, status: "accepted" } });
        },
      },
    ]);
    const client = new Zavu({
      apiKey,
      baseURL: "https://api.zavu.dev",
      fetch: transport.fetch,
      maxRetries: 0,
      logLevel: "off",
    });

    // Act.
    const result = await client.messages.send({
      "Zavu-Sender": senderId,
      to: "applicant@example.invalid",
      subject: "Verificación de prueba",
      text: randomUUID(),
      channel: "email",
      fallbackEnabled: false,
      idempotencyKey: operationId,
    });

    // Assert: receipts cannot retain a key, body, recipient, or provider payload.
    expect(result.message.id).toBe(messageId);
    expect(transport.receipts).toEqual([
      {
        origin: "https://api.zavu.dev",
        pathname: "/v1/messages",
        method: "POST",
        outcome: "responded",
        status: 200,
      },
    ]);
    expect(JSON.stringify(transport.receipts)).not.toContain(apiKey);
  });

  it("should deny outbound traffic when no exact route or method matches", async () => {
    // Arrange.
    const transport = createAdmissionProviderTransport([
      {
        origin: "https://api.zavu.dev",
        pathname: "/v1/me",
        method: "GET",
        respond: () => Response.json({ isTestMode: false }),
      },
    ]);

    // Act and assert: there is no fallback to native fetch.
    await expect(transport.fetch("https://unregistered.example.invalid/v1/me"))
      .rejects.toThrow("unregistered_route");
    await expect(transport.fetch("https://api.zavu.dev/v1/me", { method: "POST" }))
      .rejects.toThrow("unregistered_route");
    expect(transport.deniedRequests).toBe(2);
    expect(transport.receipts).toEqual([]);
  });

  it("should preserve an accepted effect when its HTTP response is lost", async () => {
    // Arrange: the controlled provider accepts work before the response disappears.
    let acceptedMessages = 0;
    const transport = createAdmissionProviderTransport([
      {
        origin: "https://api.zavu.dev",
        pathname: "/v1/messages",
        method: "POST",
        respond: () => {
          acceptedMessages += 1;
          throw new TypeError("Controlled response loss after acceptance");
        },
      },
    ]);
    const client = new Zavu({
      apiKey: randomUUID(),
      baseURL: "https://api.zavu.dev",
      fetch: transport.fetch,
      maxRetries: 0,
      logLevel: "off",
    });

    // Act and assert: the real SDK reports the uncertainty without another POST.
    await expect(client.messages.send({
      to: "applicant@example.invalid",
      channel: "email",
      subject: "Prueba",
      text: randomUUID(),
      fallbackEnabled: false,
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(Zavu.APIConnectionError);
    expect(acceptedMessages).toBe(1);
    expect(transport.receipts).toHaveLength(1);
    expect(transport.receipts[0]).toMatchObject({ outcome: "response_lost", status: null });
  });

  it("should cancel a waiting response when the caller aborts the request", async () => {
    // Arrange.
    const controller = new AbortController();
    const transport = createAdmissionProviderTransport([
      {
        origin: "https://api.zavu.dev",
        pathname: "/v1/me",
        method: "GET",
        respond: () => new Promise<Response>(() => undefined),
      },
    ]);

    // Act.
    const response = transport.fetch("https://api.zavu.dev/v1/me", { signal: controller.signal });
    controller.abort();

    // Assert.
    await expect(response).rejects.toMatchObject({ name: "AbortError" });
    expect(transport.receipts[0]).toMatchObject({ outcome: "aborted", status: null });
  });

  it("should verify a signed Google token when Better Auth uses the controlled JWKS endpoint", async () => {
    // Arrange: the public key is generated, never a checked-in credential.
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const keyId = randomUUID();
    const clientId = randomUUID();
    const nonce = randomUUID();
    const publicKey = {
      ...await crypto.subtle.exportKey("jwk", keyPair.publicKey),
      kid: keyId,
      alg: "RS256",
      use: "sig",
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: keyId })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: "https://accounts.google.com",
      aud: clientId,
      sub: randomUUID(),
      iat: nowSeconds,
      exp: nowSeconds + 3600,
      nonce,
    })).toString("base64url");
    const signingInput = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(signingInput),
    );
    const token = `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
    const transport = createAdmissionProviderTransport([
      {
        origin: "https://www.googleapis.com",
        pathname: "/oauth2/v3/certs",
        method: "GET",
        respond: () => Response.json({ keys: [publicKey] }),
      },
    ]);
    const originalFetch = globalThis.fetch;

    // Act.
    const provider = google({ clientId, clientSecret: randomUUID() });
    const result = await withAdmissionProviderTransport(transport, () => provider.verifyIdToken(token, nonce));

    // Assert: the native transport is restored even after a later callback failure.
    expect(result).toBe(true);
    expect(transport.receipts).toHaveLength(1);
    expect(globalThis.fetch).toBe(originalFetch);
    const wrongAudience = google({ clientId: randomUUID(), clientSecret: randomUUID() });
    expect(await withAdmissionProviderTransport(transport, () => wrongAudience.verifyIdToken(token, nonce))).toBe(false);
    expect(await withAdmissionProviderTransport(transport, () => provider.verifyIdToken(token, randomUUID()))).toBe(false);
    await expect(withAdmissionProviderTransport(transport, async () => {
      throw new Error("Controlled consumer failure");
    })).rejects.toThrow("Controlled consumer failure");
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("should reject overlapping global scopes without replacing the active boundary", async () => {
    // Arrange.
    const firstTransport = createAdmissionProviderTransport([]);
    const secondTransport = createAdmissionProviderTransport([]);
    const originalFetch = globalThis.fetch;

    // Act and assert.
    await withAdmissionProviderTransport(firstTransport, async () => {
      await expect(withAdmissionProviderTransport(secondTransport, async () => undefined))
        .rejects.toThrow("scope_overlap");
      expect(globalThis.fetch).toBe(firstTransport.fetch);
    });
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("should reject an already aborted request without starting a provider effect", async () => {
    // Arrange.
    const controller = new AbortController();
    controller.abort();
    let startedRequests = 0;
    const transport = createAdmissionProviderTransport([
      {
        origin: "https://api.zavu.dev",
        pathname: "/v1/me",
        method: "GET",
        respond: () => {
          startedRequests += 1;
          return Response.json({ isTestMode: false });
        },
      },
    ]);

    // Act and assert.
    await expect(transport.fetch("https://api.zavu.dev/v1/me", { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(startedRequests).toBe(0);
    expect(transport.receipts[0]).toMatchObject({ outcome: "aborted" });
  });
});
