/** @vitest-environment node */
/** Exercises registered delivery actions at the real global-recency HTTP input boundary. @module message-delivery-reauthentication-http-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { postReauthenticationIntent } from "@/src/modules/auth/infrastructure/api/reauthentication-route-handlers";

describe("message delivery global recency registration", () => {
  it.each(["reconcile_message_delivery", "recover_notification_delivery"])("should accept the registered %s action and delegate only normalized scope", async (operation) => {
    const tribeId = randomUUID(), resourceId = randomUUID(), intentId = randomUUID();
    const returnPath = "/synthetic-tribe/academia/admissions/messaging/connections";
    const calls: unknown[] = [];
    const response = await postReauthenticationIntent(new Request("https://app.example.test/api/auth/reauthentication/intents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tribeId, operation, resourceId, returnPath, confirmed: true }),
    }), async () => ({
      useCases: {
        createIntent: { execute: async (input) => { calls.push(input); return { ok: true as const, value: { intentId, state: "created" as const, outcome: "pending" as const, safeMessage: "Confirmá tu autenticación con Google para continuar.", returnPath } }; } },
        readIntent: { execute: async () => ({ ok: false as const, failure: { code: "intent_not_found" as const } }) },
      },
    }));
    expect(response.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ tribeId, operation, resourceId, returnPath, confirmed: true });
    expect(calls[0]).not.toHaveProperty("userId");
    expect(await response.json()).toMatchObject({ intentId, state: "created", outcome: "pending" });
  });

  it("should reject unknown actions and browser authority before opening native services", async () => {
    let opened = 0;
    for (const extra of [{ operation: "retry_any_delivery" }, { operation: "recover_notification_delivery", verified: true, actorUserId: randomUUID() }]) {
      const response = await postReauthenticationIntent(new Request("https://app.example.test/api/auth/reauthentication/intents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tribeId: randomUUID(), resourceId: randomUUID(), returnPath: "/synthetic-tribe", confirmed: true, ...extra }),
      }), async () => { opened += 1; throw new Error("Invalid global recency must not open native services"); });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ code: "invalid_input" });
    }
    expect(opened).toBe(0);
  });
});
