/** Validates aggregate admission-retention inputs and preserves an original uncertain operation. @module purge-admission-data-tests */
import { describe, expect, it, vi } from "vitest";
import { PurgeAdmissionDataUseCase } from "@/src/modules/academy-admissions/application/use-cases/purge-admission-data-use-case";
import { AdmissionRetentionError } from "@/src/modules/academy-admissions/domain/errors/admission-retention-error";
import { ADMISSION_DATA_RETENTION_OPERATION } from "@/src/modules/academy-admissions/constants/admission-retention";

describe("aggregate admission data retention", () => {
  it("should provide bounded defaults when no backend overrides are supplied", async () => {
    const result = { importMaterial: { purgedRows: 1, completedImports: 0 }, privateData: { requestsMinimized: 1, auditEventsPurged: 1, archivedAuditEventsPurged: 0, remainingRequests: false, remainingAuditEvents: true } };
    const purge = vi.fn().mockResolvedValue(result);
    expect(await new PurgeAdmissionDataUseCase({ purge }).execute()).toEqual(result);
    expect(purge).toHaveBeenCalledExactlyOnceWith({ importRowLimit: 500, requestLimit: 100, auditLimit: 500 });
  });

  it("should forward each independent ceiling when the backend selects boundary-sized batches", async () => {
    const purge = vi.fn().mockResolvedValue({});
    const useCase = new PurgeAdmissionDataUseCase({ purge });
    await useCase.execute({ importRowLimit: 1, requestLimit: 1, auditLimit: 1 });
    await useCase.execute({ importRowLimit: 2_000, requestLimit: 500, auditLimit: 2_000 });
    expect(purge.mock.calls).toEqual([[{ importRowLimit: 1, requestLimit: 1, auditLimit: 1 }], [{ importRowLimit: 2_000, requestLimit: 500, auditLimit: 2_000 }]]);
  });

  it("should reject every invalid ceiling before invoking the destructive owner", async () => {
    const purge = vi.fn(), useCase = new PurgeAdmissionDataUseCase({ purge });
    for (const field of ["importRowLimit", "requestLimit", "auditLimit"] as const) {
      for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_001]) {
        await expect(useCase.execute({ [field]: limit })).rejects.toMatchObject({ code: "invalid_input", operation: ADMISSION_DATA_RETENTION_OPERATION });
      }
    }
    await expect(useCase.execute({ requestLimit: 501 })).rejects.toMatchObject({ code: "invalid_input" });
    expect(purge).not.toHaveBeenCalled();
  });

  it("should preserve the original typed outcome and cause when commit cannot be confirmed", async () => {
    const cause = new Error("Synthetic aggregate commit acknowledgement unavailable");
    const original = new AdmissionRetentionError("operation_unresolved", { cause }, ADMISSION_DATA_RETENTION_OPERATION);
    const purge = vi.fn().mockRejectedValue(original);
    await expect(new PurgeAdmissionDataUseCase({ purge }).execute()).rejects.toBe(original);
    expect(original.cause).toBe(cause);
    expect(purge).toHaveBeenCalledOnce();
  });
});
