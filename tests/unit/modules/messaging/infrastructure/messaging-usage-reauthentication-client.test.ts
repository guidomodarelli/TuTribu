/** Exercises explicit global recency creation for exact usage actions without SDK mocks. @module messaging-usage-reauthentication-client-tests */
import { describe, expect, it, vi } from "vitest";
import { createMessagingUsageReauthenticationClient } from "@/lib/messaging/messaging-usage-reauthentication-client";

describe("usage explicit reauthentication creation", () => {
  it("should create one exact usage intent and only expose its guarded local continuation", async () => {
    const command = { tribeId: "83ecbfaf-0e7c-4afb-aefc-62b62800d367", resourceId: "83ecbfaf-0e7c-4afb-aefc-62b62800d367", operation: "initialize_messaging_usage" as const, returnPath: "/synthetic-academy/academia/admissions/messaging", confirmed: true as const };
    const transport = vi.fn<typeof fetch>(async () => Response.json({ intentId: "297d47c2-5419-4c3d-a339-e8b7970275ca", state: "created", outcome: "pending", safeMessage: "Confirmá tu cuenta.", returnPath: command.returnPath }));
    const client = createMessagingUsageReauthenticationClient(transport), signal = new AbortController().signal;
    expect(await client.create(command, signal)).toEqual({ status: "ready", href: "/auth/reauthenticate?intentId=297d47c2-5419-4c3d-a339-e8b7970275ca" });
    expect(transport).toHaveBeenCalledOnce();
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual(command);
    transport.mockResolvedValueOnce(Response.json({ intentId: "297d47c2-5419-4c3d-a339-e8b7970275ca", state: "created", outcome: "pending", safeMessage: "Confirmá tu cuenta.", returnPath: "/foreign-academy" }));
    expect(await client.create(command, signal)).toEqual({ status: "failed" });
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
