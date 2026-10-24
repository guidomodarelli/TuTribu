/** @vitest-environment node */
/** Exercises server-derived ownership, normalization and original outcomes through own ports. @module update-admission-whatsapp-number-tests */
import { describe, expect, it, vi } from "vitest";
import { UpdateAdmissionWhatsappNumberUseCase } from "@/src/modules/academy-admissions/application/use-cases/update-admission-whatsapp-number-use-case";
import type { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AdmissionWhatsappNumberWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-whatsapp-number-writer";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";

/** @returns Owned identity and command ports; no platform, provider or database implementation is replaced. */
function prepareWhatsappCommand() {
  const input = { tribeId: "d2206668-53ca-4597-9203-a87946903b95", admissionRequestId: "2b2d68db-e514-4087-b332-39b14a6cdfd6", requestId: "correlation", operationId: "d36215f8-afb1-4c8c-8bee-96960525f050", expectedVersion: 2, confirmed: true as const, whatsappNumber: "+1 (415) 555-2671" };
  const execute = vi.fn<ResolveAdmissionContextUseCase["execute"]>().mockResolvedValue({ allowed: true, context: { userId: "actual-user", sessionId: "actual-session", tribeId: input.tribeId, requestId: input.requestId, action: "update_own_whatsapp_number", role: null, membershipStatus: null, resourceId: input.admissionRequestId, applicantUserId: "actual-user" } });
  const updateWhatsappNumber = vi.fn<AdmissionWhatsappNumberWriter["updateWhatsappNumber"]>().mockResolvedValue({ state: "completed", operationId: input.operationId, replayed: false, result: { admissionRequestId: input.admissionRequestId, version: 3, changed: true } });
  return { input, execute, updateWhatsappNumber, useCase: new UpdateAdmissionWhatsappNumberUseCase({ execute }, { updateWhatsappNumber }) };
}

describe("update own declared WhatsApp application", () => {
  it("should derive the actor and normalize the number before the own atomic writer", async () => {
    const data = prepareWhatsappCommand();
    expect(await data.useCase.execute(data.input)).toMatchObject({ ok: true, value: { state: "completed", operationId: data.input.operationId, result: { version: 3 } } });
    expect(data.execute).toHaveBeenCalledWith({ tribeId: data.input.tribeId, requestId: data.input.requestId, action: "update_own_whatsapp_number", resource: { kind: "admission_request", id: data.input.admissionRequestId } });
    expect(data.updateWhatsappNumber).toHaveBeenCalledExactlyOnceWith({ ...data.input, userId: "actual-user", sessionId: "actual-session", whatsappNumber: "+14155552671" });
  });

  it("should refuse foreign authority before writing or parsing private declared input", async () => {
    const data = prepareWhatsappCommand();
    data.execute.mockResolvedValue({ allowed: false, failure: { code: "permission_denied" } });
    expect(await data.useCase.execute(data.input)).toEqual({ ok: false, failure: { code: "permission_denied" } });
    expect(data.updateWhatsappNumber).not.toHaveBeenCalled();
  });

  it("should reject an invalid number without persisting its raw value or a write", async () => {
    const data = prepareWhatsappCommand();
    const result = await data.useCase.execute({ ...data.input, whatsappNumber: "invalid-private-input" });
    expect(result).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
    expect(JSON.stringify(result)).not.toContain("invalid-private-input");
    expect(data.updateWhatsappNumber).not.toHaveBeenCalled();
  });

  it("should preserve actual registered progress and never retry a possibly committed correction automatically", async () => {
    const data = prepareWhatsappCommand();
    data.updateWhatsappNumber.mockResolvedValueOnce({ state: "started", operationId: data.input.operationId });
    expect(await data.useCase.execute(data.input)).toEqual({ ok: true, value: { state: "started", operationId: data.input.operationId } });
    data.updateWhatsappNumber.mockRejectedValueOnce(new AdmissionOperationError("operation_unresolved", { operationId: data.input.operationId }));
    expect(await data.useCase.execute(data.input)).toMatchObject({ ok: false, failure: { code: "operation_unresolved" } });
    expect(data.updateWhatsappNumber).toHaveBeenCalledTimes(2);
  });
});
