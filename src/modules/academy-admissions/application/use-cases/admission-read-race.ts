/** Retries a page read once when a write committed between two of its statements. @module admission-read-race */
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "../../constants/admission-errors";

/**
 * Codes a read raises when its consistency checks between statements fail: each statement of a READ COMMITTED transaction takes its own
 * snapshot, so saving the rules or deciding a request between two of them looks like a conflict although nothing is wrong.
 */
const ADMISSION_READ_RACE_CODES: ReadonlySet<AdmissionErrorCode> = new Set([ADMISSION_ERROR_CODE.policyConflict, ADMISSION_ERROR_CODE.requestConflict]);

/** @param code - Closed failure of a read. @returns Whether it is a race between the statements of the read. */
function isAdmissionReadRace(code: AdmissionErrorCode): boolean {
  return ADMISSION_READ_RACE_CODES.has(code);
}

/**
 * @param read - The whole read, which throws `AdmissionOperationError` for its consistency checks.
 * @returns Its value; a race is read once more, so a second failure (a real or repeated conflict) reaches the caller.
 */
export async function retryAdmissionReadRace<Value>(read: () => Promise<Value>): Promise<Value> {
  try { return await read(); }
  catch (error) {
    if (error instanceof AdmissionOperationError && isAdmissionReadRace(error.code)) return read();
    throw error;
  }
}

/**
 * @param read - The whole read, which returns its closed failure as a result.
 * @returns Its result; a race is read once more.
 */
export async function retryAdmissionReadRaceResult<Result extends { ok: true } | { ok: false; failure: { code: AdmissionErrorCode } }>(read: () => Promise<Result>): Promise<Result> {
  const first = await read();
  return !first.ok && isAdmissionReadRace(first.failure.code) ? read() : first;
}
