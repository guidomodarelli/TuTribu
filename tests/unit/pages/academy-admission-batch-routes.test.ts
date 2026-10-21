/** @vitest-environment node */
/** Exercises the batch HTTP boundary with actual authority resolution and projection, replacing only own account, authorization and persistence ports. @module academy-admission-batch-routes-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionBatchDecisionHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-batch-decision-handler";
import { DecideAdmissionRequestsBatchUseCase } from "@/src/modules/academy-admissions/application/use-cases/decide-admission-requests-batch-use-case";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionBatchDecisionWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-batch-decision-writer";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** @returns Native HTTP inputs and actual use cases backed only by inward port doubles. */
function batchRoute() {
  const now = new Date("2026-10-16T04:00:00Z"), tribeId = randomUUID();
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "reviewer@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-16T05:00:00Z") }, googleAccount: null, identityEvidence: null};
  const actor: AdmissionActorFacts = { userId: account.userId, tribeId, role: "guardian", status: "active" };
  const accounts = { getAuthenticatedAccount: vi.fn(async () => account) };
  const resolver = new ResolveAdmissionContextUseCase(accounts, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const writer = { decideBatch: vi.fn<AdmissionBatchDecisionWriter["decideBatch"]>(async (input) => ({ state: "completed", operationId: input.operationId, replayed: false, result: { results: input.items.map((item) => ({ admissionRequestId: item.admissionRequestId, status: input.decision === "approve" ? "approved" : "rejected", version: item.expectedVersion + 1 })) } })) };
  const useCase = new DecideAdmissionRequestsBatchUseCase(resolver, writer);
  const services = { resolveTribe: { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) }, decideBatch: { execute: vi.fn<DecideAdmissionRequestsBatchUseCase["execute"]>((input) => useCase.execute(input)) } };
  const open = vi.fn(async () => services);
  const items: { requestId: string; expectedVersion: number }[] = [{ requestId: randomUUID(), expectedVersion: 1 }, { requestId: randomUUID(), expectedVersion: 3 }];
  const input = { operationId: randomUUID(), confirmed: true as const, decision: "approve" as const, internalReason: "  Motivo interno reservado  ", externalMessage: "  Mensaje externo distinto  ", items };
  const context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
  const request = (body: unknown = input, query = "", origin = "https://tutribu.example.invalid") => new Request(`https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/request-decisions${query}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
  return { account, actor, accounts, tribeId, writer, services, open, input, context, request, handler: createAdmissionBatchDecisionHandler(open) };
}

describe("admission batch decision HTTP", () => {
  it("should execute one explicit canonical selection through current native authority and return only the original minimal results", async () => {
    // Given two concrete selected resources and distinct internal and external messages.
    const fixture = batchRoute();
    fixture.input.items[0].requestId = fixture.input.items[0].requestId.toUpperCase();

    // When the real use case resolves the reviewer and projects the committed own snapshot.
    const response = await fixture.handler(fixture.request(), fixture.context), body = await response.json();

    // Then the HTTP result and counts name only that selection; no browser account or private note is returned.
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ operationId: fixture.input.operationId, state: "completed", result: "all_succeeded", completedCount: 2, failedCount: 0, unresolvedCount: 0, items: fixture.input.items.map((item) => ({ requestId: item.requestId.toLowerCase(), status: "approved", version: item.expectedVersion + 1 })) });
    expect(fixture.writer.decideBatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ userId: fixture.account.userId, sessionId: fixture.account.session.id, tribeId: fixture.tribeId, internalReason: "Motivo interno reservado", externalMessage: "Mensaje externo distinto", items: fixture.input.items.map((item) => ({ admissionRequestId: item.requestId.toLowerCase(), expectedVersion: item.expectedVersion })) }));
    expect(JSON.stringify(body)).not.toContain("Motivo interno reservado");
    expect(JSON.stringify(body)).not.toContain(fixture.account.userId);
    expect(JSON.stringify(body)).not.toContain(fixture.account.session.id);
    expect(body).not.toHaveProperty("externalMessage");
  });

  it.each(["mixed", "all_rejected"] as const)("should preserve a terminal %s outcome as HTTP 200 without turning row conflicts into global success", async (kind) => {
    const fixture = batchRoute();
    fixture.writer.decideBatch.mockImplementationOnce(async (input) => ({ state: "completed", operationId: input.operationId, replayed: true, result: { results: input.items.map((item, index) => kind === "mixed" && index === 0 ? { admissionRequestId: item.admissionRequestId, status: "approved", version: item.expectedVersion + 1 } : { admissionRequestId: item.admissionRequestId, status: "conflict", code: "request_conflict" }) } }));
    const response = await fixture.handler(fixture.request(), fixture.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "completed", result: kind, completedCount: kind === "mixed" ? 1 : 0, failedCount: kind === "mixed" ? 1 : 2, unresolvedCount: 0 });
  });

  it("should retain exact unresolved rows only when the atomic owner reports genuinely registered progress", async () => {
    const fixture = batchRoute();
    fixture.writer.decideBatch.mockResolvedValueOnce({ state: "started", operationId: fixture.input.operationId });
    const response = await fixture.handler(fixture.request(), fixture.context);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ operationId: fixture.input.operationId, state: "started", result: "incomplete", completedCount: 0, failedCount: 0, unresolvedCount: 2, items: fixture.input.items.map((item) => ({ requestId: item.requestId, status: "unresolved", code: "operation_unresolved" })) });
    expect(fixture.writer.decideBatch).toHaveBeenCalledOnce();
  });

  it("should accept fifty explicitly selected versions and reject fifty-one before opening any module", async () => {
    const fixture = batchRoute();
    const items = Array.from({ length: 50 }, () => ({ requestId: randomUUID(), expectedVersion: 1 }));
    const response = await fixture.handler(fixture.request({ ...fixture.input, items }), fixture.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ completedCount: 50, failedCount: 0, unresolvedCount: 0 });
    const rejected = batchRoute();
    const invalid = await rejected.handler(rejected.request({ ...rejected.input, items: [...items, { requestId: randomUUID(), expectedVersion: 1 }] }), rejected.context);
    expect(invalid.status).toBe(400);
    expect(rejected.open).not.toHaveBeenCalled();
  });

  it.each(["unconfirmed", "empty", "duplicate", "version", "fractional version", "blank rejection reason", "long reason", "long external", "actor", "sender", "row authority"])("should reject %s input at the actual boundary before composition or persistence", async (variant) => {
    const fixture = batchRoute(), input: Record<string, unknown> = { ...fixture.input };
    if (variant === "unconfirmed") input.confirmed = false;
    if (variant === "empty") input.items = [];
    if (variant === "duplicate") input.items = [fixture.input.items[0], { ...fixture.input.items[0], requestId: fixture.input.items[0].requestId.toUpperCase() }];
    if (variant === "version") input.items = [{ ...fixture.input.items[0], expectedVersion: 0 }];
    if (variant === "fractional version") input.items = [{ ...fixture.input.items[0], expectedVersion: 1.5 }];
    if (variant === "blank rejection reason") { input.decision = "reject"; input.internalReason = "   "; }
    if (variant === "long reason") input.internalReason = "a".repeat(501);
    if (variant === "long external") input.externalMessage = "a".repeat(201);
    if (variant === "actor") input.userId = fixture.account.userId;
    if (variant === "sender") input.sender = "sender@example.test";
    if (variant === "row authority") input.items = [{ ...fixture.input.items[0], role: "leader" }];
    const response = await fixture.handler(fixture.request(input), fixture.context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_input", requestId: expect.any(String) });
    expect(fixture.open).not.toHaveBeenCalled();
    expect(fixture.writer.decideBatch).not.toHaveBeenCalled();
  });

  it("should reject query authority, malformed route input and foreign browser origin before composition", async () => {
    const fixture = batchRoute();
    expect((await fixture.handler(fixture.request(fixture.input, "?role=leader"), fixture.context)).status).toBe(400);
    expect((await fixture.handler(fixture.request(), { params: Promise.resolve({ slug: "../foreign" }) })).status).toBe(400);
    expect((await fixture.handler(fixture.request(fixture.input, "", "https://foreign.example.invalid"), fixture.context)).status).toBe(403);
    expect(fixture.open).not.toHaveBeenCalled();
  });

  it.each(["removed", "expired"])("should deny current %s authority without registering any batch progress", async (variant) => {
    const fixture = batchRoute();
    if (variant === "removed") fixture.actor.status = "removed";
    else fixture.account.session.expiresAt = new Date("2026-10-16T03:59:59Z");
    const response = await fixture.handler(fixture.request(), fixture.context);
    expect(response.status).toBe(variant === "removed" ? 403 : 401);
    expect(await response.json()).toMatchObject({ code: variant === "removed" ? "permission_denied" : "authentication_required" });
    expect(fixture.writer.decideBatch).not.toHaveBeenCalled();
  });

  it("should preserve an indeterminate original operation and private cause without automatically retrying the writer", async () => {
    const fixture = batchRoute();
    fixture.writer.decideBatch.mockRejectedValueOnce(new AdmissionOperationError("operation_unresolved", { operationId: fixture.input.operationId, cause: new Error("synthetic-private-database-detail") }));
    const response = await fixture.handler(fixture.request(), fixture.context), body = await response.json();
    expect(response.status).toBe(202);
    expect(body).toMatchObject({ code: "operation_unresolved", operation: { operationId: fixture.input.operationId, state: "started" } });
    expect(JSON.stringify(body)).not.toContain("synthetic-private-database-detail");
    expect(body).not.toHaveProperty("cause");
    expect(fixture.writer.decideBatch).toHaveBeenCalledOnce();
  });

  it.each(["operation", "selection", "summary", "opposite decision", "cancelled", "uncommitted success", "partial unresolved"])("should reject an unusable own %s response rather than expose unrelated or unconfirmed results", async (variant) => {
    const fixture = batchRoute();
    const own = await fixture.services.decideBatch.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), ...fixture.input, items: fixture.input.items.map((item) => ({ admissionRequestId: item.requestId, expectedVersion: item.expectedVersion })), externalMessage: null });
    if (!own.ok) throw new Error("Synthetic current authority must yield a batch result");
    const value = structuredClone(own.value);
    if (variant === "operation") value.operationId = randomUUID();
    if (variant === "selection") value.items[0].requestId = randomUUID();
    if (variant === "summary") value.completedCount = 0;
    if (variant === "opposite decision") value.items[0].status = "rejected";
    if (variant === "cancelled") value.items[0].status = "cancelled";
    if (variant === "uncommitted success") value.state = "started";
    if (variant === "partial unresolved") {
      value.state = "started"; value.result = "incomplete"; value.completedCount = 1; value.unresolvedCount = 1;
      value.items[1] = { requestId: fixture.input.items[1].requestId, status: "unresolved", code: "operation_unresolved", safeMessage: "La operación todavía no está confirmada." };
    }
    fixture.services.decideBatch.execute.mockResolvedValueOnce({ ok: true, value });
    const response = await fixture.handler(fixture.request(), fixture.context), body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ code: "public_contract_unusable" });
    expect(body).not.toHaveProperty("items");
  });
});
