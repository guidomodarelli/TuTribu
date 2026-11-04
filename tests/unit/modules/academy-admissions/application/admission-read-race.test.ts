/** @vitest-environment node */

/** Covers the single reread of a page whose consistency checks met a write between two of its statements. */
import { describe, expect, it, vi } from "vitest";
import { retryAdmissionReadRace, retryAdmissionReadRaceResult } from "@/src/modules/academy-admissions/application/use-cases/admission-read-race";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

describe("admission read races", () => {
  it("should read once more after a rules or request change between statements", async () => {
    for (const code of [ADMISSION_ERROR_CODE.policyConflict, ADMISSION_ERROR_CODE.requestConflict]) {
      const read = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new AdmissionOperationError(code)).mockResolvedValueOnce("consistent snapshot");
      expect(await retryAdmissionReadRace(read)).toBe("consistent snapshot");
      expect(read).toHaveBeenCalledTimes(2);
    }
  });

  it("should not reread another failure and should surface a repeated race", async () => {
    const denied = vi.fn(async () => { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied); });
    await expect(retryAdmissionReadRace(denied)).rejects.toMatchObject({ code: ADMISSION_ERROR_CODE.permissionDenied });
    expect(denied).toHaveBeenCalledOnce();
    const racing = vi.fn(async () => { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict); });
    await expect(retryAdmissionReadRace(racing)).rejects.toMatchObject({ code: ADMISSION_ERROR_CODE.requestConflict });
    expect(racing).toHaveBeenCalledTimes(2);
  });

  it("should reread a result-returning read only for a race", async () => {
    const raced = vi.fn<() => Promise<{ ok: true } | { ok: false; failure: { code: typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE] } }>>()
      .mockResolvedValueOnce({ ok: false, failure: { code: ADMISSION_ERROR_CODE.requestConflict } }).mockResolvedValueOnce({ ok: true });
    expect(await retryAdmissionReadRaceResult(raced)).toEqual({ ok: true });
    const missing = vi.fn(async () => ({ ok: false as const, failure: { code: ADMISSION_ERROR_CODE.resourceUnavailable } }));
    expect(await retryAdmissionReadRaceResult(missing)).toEqual({ ok: false, failure: { code: ADMISSION_ERROR_CODE.resourceUnavailable } });
    expect(missing).toHaveBeenCalledOnce();
  });
});
