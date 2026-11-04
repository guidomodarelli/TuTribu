/** Exercises declared-capability guards through the real React resource controller and own operation ports. @module messaging-resource-capabilities-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMessagingResourceController } from "@/app/(platform)/[slug]/academia/admissions/messaging/connections/messaging-resource-controller";
import type { MessagingResourcesBrowserClient } from "@/src/modules/messaging/application/ports/messaging-resources-browser-client";
import type { MessagingConfigurationConnection } from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type { MessagingUsageBrowserResult } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";

/** @returns An exact candidate and own browser ports; React, validators and transport result guards remain real. */
function capabilitiesFixture() {
  const candidate: MessagingConfigurationConnection = { id: randomUUID(), name: "Candidata de correo", version: 1, configurationVersion: 1, state: "draft", credentialState: "valid", credentialMode: "production", maskedCredential: "••••••••", securityCurrent: true, capabilities: [] };
  const client: MessagingResourcesBrowserClient = { read: vi.fn<MessagingResourcesBrowserClient["read"]>(async (scope) => ({ status: "ready", value: { connectionId: scope.connectionId, configurationVersion: scope.configurationVersion, items: [] } })), configure: vi.fn<MessagingResourcesBrowserClient["configure"]>() };
  const feedback = vi.fn(), configure = vi.fn(async () => {});
  const options = { candidate, slug: "synthetic", client, availableChannels: ["email"] as const, blocked: false, configure, feedback, conflict: vi.fn(),
    observe: async <Value,>(request: (signal: AbortSignal) => Promise<MessagingUsageBrowserResult<Value>>, settle: (value: MessagingUsageBrowserResult<Value>) => void) => { settle(await request(new AbortController().signal)); },
  };
  return { options, client, feedback, configure };
}

describe("resource controller implemented channels", () => {
  it("should reject a phone proposal and template read before any request while preserving the email draft", async () => {
    // Given a functional email-only metadata projection and a fresh controlled draft.
    const fixture = capabilitiesFixture(), { result } = renderHook(() => useMessagingResourceController(fixture.options));
    act(() => { result.current.change({ ...result.current.draft, channel: "sms" }); });
    expect(result.current.draft.channel).toBe("email");
    expect(fixture.feedback).toHaveBeenLastCalledWith({ kind: "alert", text: "Elegí uno de los canales disponibles para esta conexión." });

    // When a caller attempts a capability hidden by the presenter directly.
    await act(async () => { await result.current.readTemplates(); });
    expect(fixture.client.read).not.toHaveBeenCalled();expect(fixture.configure).not.toHaveBeenCalled();
  });

  it("should clear unsupported-choice feedback and keep explicit confirmation for a valid email save", async () => {
    const fixture = capabilitiesFixture(), { result } = renderHook(() => useMessagingResourceController(fixture.options));
    act(() => { result.current.change({ ...result.current.draft, channel: "whatsapp" }); });
    act(() => { result.current.change({ ...result.current.draft, channel: "email", senderId: "synthetic-email-sender" }); });
    expect(fixture.feedback).toHaveBeenLastCalledWith(null);expect(result.current.canSave).toBe(false);
    act(() => { result.current.confirm(true); });
    expect(result.current.canSave).toBe(true);
    await act(async () => { await result.current.save(); });
    expect(fixture.configure).toHaveBeenCalledExactlyOnceWith({ channel: "email", senderId: "synthetic-email-sender", templateId: "", templateLanguage: "" });
    expect(result.current.confirmed).toBe(false);expect(fixture.client.read).not.toHaveBeenCalled();
  });
});
