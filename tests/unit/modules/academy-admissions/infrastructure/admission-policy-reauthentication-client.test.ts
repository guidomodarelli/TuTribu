/** Exercises the real own reauthentication creation DTO and same-origin transport. @module admission-policy-reauthentication-client-tests */
import { describe, expect, it, vi } from "vitest";
import { createAdmissionPolicyReauthenticationClient } from "@/lib/academy-admissions/admission-policy-reauthentication-client";

describe("policy reauthentication browser creation", () => {
  it("should create only a confirmed exact policy intent and expose a guarded local continuation without starting OAuth or retrying", async () => {
    const command = { tribeId: "83ecbfaf-0e7c-4afb-aefc-62b62800d367", resourceId: "83ecbfaf-0e7c-4afb-aefc-62b62800d367", operation: "update_admission_policy" as const, returnPath: "/synthetic-academy/academia/admissions/settings", confirmed: true as const };
    const transport = vi.fn<typeof fetch>(async () => Response.json({ intentId: "297d47c2-5419-4c3d-a339-e8b7970275ca", state: "created", outcome: "pending", safeMessage: "Confirmá tu cuenta.", returnPath: command.returnPath }));
    const client = createAdmissionPolicyReauthenticationClient(transport), signal = new AbortController().signal;
    expect(await client.create(command, signal)).toEqual({ status: "ready", href: "/auth/reauthenticate?intentId=297d47c2-5419-4c3d-a339-e8b7970275ca" });
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][0]).toBe("/api/auth/reauthentication/intents");
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual(command);
    transport.mockResolvedValueOnce(Response.json({ intentId: "297d47c2-5419-4c3d-a339-e8b7970275ca", state: "created", outcome: "pending", safeMessage: "Confirmá tu cuenta.", returnPath: "/foreign-academy" }));
    expect(await client.create(command, signal)).toMatchObject({ status: "failed" });
    transport.mockRejectedValueOnce(new TypeError("Synthetic response loss"));
    expect(await client.create(command, signal)).toMatchObject({ status: "failed" });
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
