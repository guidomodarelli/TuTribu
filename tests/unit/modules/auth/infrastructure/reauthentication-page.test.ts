/** @vitest-environment node */
/** Validates the actual server page boundary before identity lookup and prop serialization. */
import { describe, expect, it, vi } from "vitest";
import { loadReauthenticationPageState } from "@/src/modules/auth/infrastructure/composition/reauthentication-page";

const intent = { intentId: "20ca5bf6-8517-4e0d-a7d7-24144fcb0ea8", state: "created", outcome: "pending", safeMessage: "Confirmá tu autenticación con Google para continuar.", returnPath: "/synthetic-tribe" } as const;

describe("reauthentication server page boundary", () => {
  it("should load the current server intent once without a session-based redirect", async () => {
    const execute = vi.fn(async () => ({ ok: true as const, value: intent }));
    const createModule = vi.fn(async () => ({ useCases: { readIntent: { execute } } }));
    expect(await loadReauthenticationPageState({ intentId: intent.intentId }, createModule)).toEqual({ kind: "ready", intent, oauthFailed: false });
    expect(createModule).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ intentId: intent.intentId });
  });

  it.each([{}, { intentId: "invalid" }, { intentId: [intent.intentId, intent.intentId] }])("should reject invalid query input before identity lookup", async (query) => {
    const createModule = vi.fn();
    expect(await loadReauthenticationPageState(query, createModule)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(createModule).not.toHaveBeenCalled();
  });

  it("should expose only a fixed OAuth failure flag rather than provider error text", async () => {
    const state = await loadReauthenticationPageState({ intentId: intent.intentId, error: "sensitive-provider-value", error_description: "provider-details" }, async () => ({ useCases: { readIntent: { execute: async () => ({ ok: true, value: intent }) } } }));
    expect(state).toEqual({ kind: "ready", intent, oauthFailed: true });
    expect(JSON.stringify(state)).not.toMatch(/sensitive-provider-value|provider-details/);
  });

  it("should reject unusable public props without serializing private values", async () => {
    const state = await loadReauthenticationPageState({ intentId: intent.intentId }, async () => ({ useCases: { readIntent: { execute: async () => ({ ok: true, value: { ...intent, nonce: "private-value" } }) } } }), vi.fn());
    expect(state).toMatchObject({ kind: "unavailable", code: "public_contract_unusable" });
    expect(JSON.stringify(state)).not.toContain("private-value");
  });

  it("should map an unexpected server exception to safe props and closed diagnostics", async () => {
    const diagnose = vi.fn();
    const state = await loadReauthenticationPageState({ intentId: intent.intentId }, async () => { throw new Error("private-stack-and-token"); }, diagnose);
    expect(state).toMatchObject({ kind: "unavailable", code: "unexpected_failure" });
    expect(JSON.stringify([state, diagnose.mock.calls])).not.toContain("private-stack-and-token");
    expect(diagnose).toHaveBeenCalledWith({ code: "unexpected_failure", stage: "load" });
  });
});
