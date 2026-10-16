/** @vitest-environment node */
/** Exercises real history page boundaries and owned inward ports without mocking platform libraries. @module admission-review-history-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { GetAdmissionReviewHistoryUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-history-use-case";
import { GetAdmissionReviewHistoryPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-history-page-use-case";
import { loadAdmissionReviewHistoryPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-review-history-page";
import { buildAdmissionReviewHistoryRoute, buildAdmissionReviewHistoryReturnRoute } from "@/lib/academy-admissions/admission-review-history-routes";
import { ADMISSION_REVIEW_CURSOR_SEPARATOR } from "@/src/modules/academy-admissions/constants/admission-public-contract";

/** @returns Current synthetic identities, real page orchestration and only owned history/routing doubles. */
function fixture() {
  const now = new Date("2026-10-16T03:00:00Z"), tribeId = randomUUID(), admissionRequestId = randomUUID();
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "cuenta@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-16T04:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const nextCursor = `2026-10-15T02:00:00.123456Z${ADMISSION_REVIEW_CURSOR_SEPARATOR}${randomUUID()}`;
  const value = { tribeId, admissionRequestId, items: [{ id: randomUUID(), eventType: "unclassified" as const, fromStatus: null, toStatus: "pending" as const, resourceVersion: 1, actorKind: "unattributed" as const, createdAt: "2026-10-15T02:00:00.123Z" }], nextCursor };
  const history = { execute: vi.fn<GetAdmissionReviewHistoryUseCase["execute"]>(async () => ({ ok: true, value })) };
  const resolveTribe = { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) };
  const page = new GetAdmissionReviewHistoryPageUseCase(accounts, { history, resolveTribe }, () => now);
  const params = { slug: "academia-sintetica", requestId: admissionRequestId };
  const filters = { limit: 1, status: undefined, search: "  Solicitante de prueba  ", source: "common" as const, needsVerification: false, requiresExceptionReason: true, submittedFrom: "2026-10-01T00:00:00.123456Z", submittedUntil: "2026-10-16T00:00:00.999999Z" };
  return { account, accounts, tribeId, admissionRequestId, nextCursor, value, history, resolveTribe, page, params, filters, open: vi.fn(async () => page), query: { slug: params.slug, admissionRequestId, requestId: randomUUID(), filters: { limit: 25, status: "pending" as const } } };
}

describe("current request history page", () => {
  it("should publish one viewer-scoped snapshot without exposing session, contact or native identity facts", async () => {
    const data = fixture();
    expect(await data.page.execute(data.query)).toEqual({ ok: true, value: { kind: "ready", slug: data.params.slug, viewerId: data.account.userId, renderedAt: "2026-10-16T03:00:00.000Z", filters: data.query.filters, page: data.value, hasPrevious: false } });
    const state = await loadAdmissionReviewHistoryPageState({ params: data.params, query: {} }, data.open);
    expect(state).toMatchObject({ kind: "ready", page: data.value });
    expect(JSON.stringify(state)).not.toContain(data.account.session.id);
    expect(JSON.stringify(state)).not.toContain(data.account.normalizedEmail);
    expect(data.history.execute).toHaveBeenLastCalledWith(expect.objectContaining({ tribeId: data.tribeId, admissionRequestId: data.admissionRequestId, limit: 25 }));
  });

  it("should keep navigation filters distinct from history selection and preserve exact cursor microseconds", async () => {
    const data = fixture();
    const url = new URL(buildAdmissionReviewHistoryRoute(data.params.slug, data.admissionRequestId, data.filters, data.nextCursor), "https://example.invalid");
    const state = await loadAdmissionReviewHistoryPageState({ params: data.params, query: Object.fromEntries(url.searchParams) }, data.open);
    expect(state).toMatchObject({ kind: "ready", filters: { ...data.filters, search: "Solicitante de prueba" }, hasPrevious: true, page: { nextCursor: data.nextCursor } });
    expect(data.history.execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tribeId: data.tribeId, admissionRequestId: data.admissionRequestId, limit: 1, cursor: { at: "2026-10-15T02:00:00.123456Z", id: data.nextCursor.split(ADMISSION_REVIEW_CURSOR_SEPARATOR)[1] } }));
    expect(data.history.execute.mock.calls[0]?.[0]).not.toHaveProperty("search");
    expect(data.history.execute.mock.calls[0]?.[0]).not.toHaveProperty("status");
    expect(data.history.execute.mock.calls[0]?.[0]).not.toHaveProperty("source");
    const back = new URL(buildAdmissionReviewHistoryReturnRoute(data.params.slug, data.admissionRequestId, data.filters), "https://example.invalid");
    expect(Object.fromEntries(back.searchParams)).toMatchObject({ request: data.admissionRequestId, status: "all", needsVerification: "false", requiresExceptionReason: "true", submittedFrom: data.filters.submittedFrom, submittedUntil: data.filters.submittedUntil });
    expect(back.searchParams.has("historyCursor")).toBe(false);
    expect(url.pathname).toBe(`/${data.params.slug}/academia/admissions/history/${data.admissionRequestId}`);
  });

  it.each([
    { role: "leader" }, { userId: "synthetic" }, { tribeId: "synthetic" }, { request: "alternate" }, { returnTo: "https://example.invalid" },
    { historyCursor: "bad" }, { historyCursor: ["a", "b"] }, { cursor: "inbox-cursor" }, { status: "invented" }, { needsVerification: "1" },
    { limit: "51" }, { submittedFrom: "2026-10-17T00:00:00Z", submittedUntil: "2026-10-16T00:00:00Z" },
  ])("should reject invalid or authoritative browser input %j before composing any native read", async (query) => {
    const data = fixture();
    expect(await loadAdmissionReviewHistoryPageState({ params: data.params, query }, data.open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(data.open).not.toHaveBeenCalled();
    expect(data.history.execute).not.toHaveBeenCalled();
  });

  it("should reject malformed resource params before opening the request module", async () => {
    const data = fixture();
    expect(await loadAdmissionReviewHistoryPageState({ params: { ...data.params, requestId: "not-a-uuid" }, query: {} }, data.open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(data.open).not.toHaveBeenCalled();
  });

  it.each([null, "expired"])("should close before reading history when the initial native account is %s", async (accountState) => {
    const data = fixture();
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(accountState === null ? null : { ...data.account, session: { ...data.account.session, expiresAt: new Date("2026-10-16T02:59:59Z") } });
    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(data.resolveTribe.execute).not.toHaveBeenCalled();
    expect(data.history.execute).not.toHaveBeenCalled();
  });

  it.each(["userId", "sessionId", "expiresAt"])("should discard loaded facts when native %s changes before publication", async (field) => {
    const data = fixture();
    const current = field === "userId" ? { ...data.account, userId: randomUUID() } : { ...data.account, session: { ...data.account.session, ...(field === "sessionId" ? { id: randomUUID() } : { expiresAt: new Date("2026-10-16T02:59:59Z") }) } };
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce(current);
    const result = await data.page.execute(data.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(result).not.toHaveProperty("value");
  });

  it.each(["permission_denied", "resource_unavailable", "unexpected_failure"] as const)("should translate %s without serializing its private cause or partial history", async (code) => {
    const data = fixture();
    data.history.execute.mockResolvedValueOnce({ ok: false, failure: { code, cause: new Error("Private fixture diagnostic") } });
    const result = await loadAdmissionReviewHistoryPageState({ params: data.params, query: {} }, data.open);
    expect(result).toMatchObject({ kind: "unavailable", code, message: expect.any(String) });
    expect(result).not.toHaveProperty("page");
    expect(JSON.stringify(result)).not.toContain("Private fixture diagnostic");
  });

  it.each(["tribeId", "admissionRequestId"] as const)("should reject an owned history DTO crossing its selected %s", async (field) => {
    const data = fixture();
    data.history.execute.mockResolvedValueOnce({ ok: true, value: { ...data.value, [field]: randomUUID() } });
    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should reject extra private owned DTO fields and preserve an authorized empty result", async () => {
    const data = fixture();
    const contaminated = { ...data.value, internalReason: "private-fixture" };
    data.history.execute.mockResolvedValueOnce({ ok: true, value: contaminated });
    expect(await loadAdmissionReviewHistoryPageState({ params: data.params, query: {} }, data.open)).toMatchObject({ kind: "unavailable", code: "public_contract_unusable" });
    data.history.execute.mockResolvedValueOnce({ ok: true, value: { ...data.value, items: [], nextCursor: null } });
    expect(await data.page.execute(data.query)).toMatchObject({ ok: true, value: { page: { items: [], nextCursor: null }, hasPrevious: false } });
  });

  it("should sanitize a composition failure without exposing its runtime diagnostic", async () => {
    const data = fixture();
    data.open.mockRejectedValueOnce(new Error("Private fixture composition"));
    const state = await loadAdmissionReviewHistoryPageState({ params: data.params, query: {} }, data.open);
    expect(state).toMatchObject({ kind: "unavailable", code: "unexpected_failure" });
    expect(JSON.stringify(state)).not.toContain("Private fixture composition");
  });
});
