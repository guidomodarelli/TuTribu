/** @vitest-environment node */
/** Exercises compatibility routing through own domain/application ports only. @module academy-entry-bridge-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { joinTribeAcademyAdmission } from "@/src/modules/tribes/application/use-cases/join-tribe-academy-admission-use-case";
import { SubmitAcademyEntryUseCase } from "@/src/modules/academy-admissions/application/use-cases/submit-academy-entry-use-case";
import type { SubmitAdmissionUseCase } from "@/src/modules/academy-admissions/application/use-cases/submit-admission-use-case";

describe("explicit academy entry owner", () => {
  it("should normalize slug and forward the identical original intent without invoking the historical membership writer", async () => {
    const command = { tribeSlug: "  SYNTHETIC-ACADEMY  ", requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 1, confirmed: true as const };
    const outcome = { ok: true, value: { outcome: "pending" } }, entry = { submit: vi.fn(async () => outcome) }, repository = { join: vi.fn(async () => ({ status: "joined" as const })) };
    const execute = joinTribeAcademyAdmission({ academyAdmissionEntry: entry, tribeAcademyAdmissionRepository: repository });
    expect(await execute(command)).toEqual(outcome);
    expect(entry.submit).toHaveBeenCalledWith({ ...command, tribeSlug: "synthetic-academy" });
    expect(repository.join).not.toHaveBeenCalled();
    expect(await execute({ tribeSlug: " SYNTHETIC-ACADEMY " })).toEqual({ status: "joined" });
  });

  it("should resolve current scope then delegate original confirmation/version/key to admission, preserving a current denial", async () => {
    const tribeId = randomUUID(), operationId = randomUUID(), requestId = randomUUID();
    const resolver = { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) };
    const submission = { execute: vi.fn<SubmitAdmissionUseCase["execute"]>(async () => ({ ok: true, value: { state: "started", operationId } })) };
    const entry = new SubmitAcademyEntryUseCase(resolver, submission);
    expect(await entry.execute({ tribeSlug: "synthetic-academy", operationId, requestId, expectedPolicyVersion: 1, confirmed: true })).toMatchObject({ ok: true, value: { state: "started", operationId } });
    expect(submission.execute).toHaveBeenCalledWith({ tribeId, operationId, requestId, expectedPolicyVersion: 1, confirmed: true });
    submission.execute.mockResolvedValueOnce({ ok: false, failure: { code: "permission_denied" } });
    expect(await entry.execute({ tribeSlug: "synthetic-academy", operationId, requestId, expectedPolicyVersion: 1, confirmed: true })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
  });
});
