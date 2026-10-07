/** @vitest-environment node */
/** Exercises one current reviewer page snapshot through only owned account/query ports. @module admission-review-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionReviewPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-page-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { GetAdmissionReviewUseCases } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-use-cases";
import { loadAdmissionReviewPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-review-page";
import { buildAdmissionReviewRoute } from "@/lib/academy-admissions/admission-routes";

/** Own current identity never derives a role, applicant or session from page input. */
function fixture() {
  const now = new Date("2026-10-07T03:00:00Z"), tribeId = randomUUID();
  const account: AuthenticatedAccount = { userId: "synthetic-reviewer", normalizedEmail: "reviewer@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-07T04:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const review = { list: vi.fn<GetAdmissionReviewUseCases["list"]>(async () => ({ ok: true, value: { items: [], nextCursor: null } })), detail: vi.fn<GetAdmissionReviewUseCases["detail"]>(async () => ({ ok: false, failure: { code: "resource_unavailable" } })) };
  const resolveTribe = { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) };
  const page = new GetAdmissionReviewPageUseCase(accounts, { review, resolveTribe }, () => now);
  return { accounts, account, review, resolveTribe, page, query: { slug: "synthetic-academy", requestId: randomUUID() } };
}

describe("current reviewer SSR snapshot", () => {
  it("should consume the canonical reviewer notification link and select that exact request", async () => {
    const data = fixture(), admissionRequestId = randomUUID();
    const link = new URL(buildAdmissionReviewRoute(data.query.slug, admissionRequestId), "https://tutribu.example.invalid");
    const open = vi.fn(async () => data.page);
    const result = await loadAdmissionReviewPageState({ params: { slug: data.query.slug }, query: Object.fromEntries(link.searchParams) }, open);
    expect(result).toMatchObject({ kind: "unavailable", code: "resource_unavailable" });
    expect(data.review.detail).toHaveBeenCalledWith(expect.objectContaining({ admissionRequestId }));
  });

  it("should expose one stable viewer-scoped snapshot without session, email, Google account or writer ports", async () => {
    const data = fixture();
    const result = await data.page.execute(data.query);
    expect(result).toMatchObject({ ok: true, value: { kind: "ready", viewerId: data.account.userId, slug: data.query.slug, renderedAt: "2026-10-07T03:00:00.000Z", page: { items: [], nextCursor: null } } });
    expect(JSON.stringify(result)).not.toContain(data.account.session.id);
    expect(JSON.stringify(result)).not.toContain(data.account.normalizedEmail);
    expect(data.review.list).toHaveBeenCalledTimes(1);
    expect(data.review.detail).not.toHaveBeenCalled();
  });

  it("should discard partial private state when the native session changes and keep selected request absence genuine", async () => {
    const data = fixture();
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce({ ...data.account, session: { ...data.account.session, id: randomUUID() } });
    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(await data.page.execute({ ...data.query, admissionRequestId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
  });

  it("should reject role/account flags before opening native page composition and map private failure to Spanish", async () => {
    const data = fixture(), open = vi.fn(async () => data.page);
    expect(await loadAdmissionReviewPageState({ params: { slug: data.query.slug }, query: { role: "leader" } }, open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(open).not.toHaveBeenCalled();
    data.review.list.mockResolvedValueOnce({ ok: false, failure: { code: "permission_denied", cause: new Error("Synthetic private SQL diagnostic") } });
    const denied = await loadAdmissionReviewPageState({ params: { slug: data.query.slug }, query: {} }, open);
    expect(denied).toMatchObject({ kind: "unavailable", code: "permission_denied", message: expect.any(String) });
    expect(denied).not.toHaveProperty("page");
    expect(JSON.stringify(denied)).not.toContain("Synthetic private SQL diagnostic");
  });
});
