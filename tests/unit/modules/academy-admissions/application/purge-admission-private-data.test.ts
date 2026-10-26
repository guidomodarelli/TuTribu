/** Exercises bounded private minimization through its owned persistence port. @module purge-admission-private-data-tests */
import { describe, expect, it, vi } from "vitest";
import { PurgeAdmissionPrivateDataUseCase } from "@/src/modules/academy-admissions/application/use-cases/purge-admission-private-data-use-case";
import { AdmissionRetentionError } from "@/src/modules/academy-admissions/domain/errors/admission-retention-error";

describe("private admission retention command", () => {
  it("should delegate the default bounded request and audit batches and publish only confirmed counts", async () => {
    const result = { requestsMinimized: 2, auditEventsPurged: 3, archivedAuditEventsPurged: 1, remainingRequests: true, remainingAuditEvents: false };
    const purge = vi.fn().mockResolvedValue(result);
    expect(await new PurgeAdmissionPrivateDataUseCase({ purge }).execute()).toEqual(result);
    expect(purge).toHaveBeenCalledOnce();
    expect(purge).toHaveBeenCalledWith({ requestLimit: 100, auditLimit: 500 });
  });

  it.each([{ requestLimit: 0 }, { requestLimit: 501 }, { requestLimit: 1.5 }, { auditLimit: 0 }, { auditLimit: 2001 }, { auditLimit: Number.NaN }])("should reject invalid bounds before invoking storage for %j", async (input) => {
    const purge = vi.fn();
    await expect(new PurgeAdmissionPrivateDataUseCase({ purge }).execute(input)).rejects.toMatchObject({ code: "invalid_input", operation: "purge_admission_private_data" });
    expect(purge).not.toHaveBeenCalled();
  });

  it("should preserve an indeterminate original commit error without reporting successful destruction", async () => {
    const cause = new Error("Synthetic private commit acknowledgement failure");
    const failure = new AdmissionRetentionError("operation_unresolved", { cause }, "purge_admission_private_data");
    const purge = vi.fn().mockRejectedValue(failure);
    await expect(new PurgeAdmissionPrivateDataUseCase({ purge }).execute({ requestLimit: 1, auditLimit: 1 })).rejects.toBe(failure);
    expect(failure.cause).toBe(cause);
    expect(purge).toHaveBeenCalledOnce();
  });
});
