/** Creates attribution-only recovery references without persisting historical tokens. @module legacy-admission-scope */
import { LEGACY_ADMISSION_ARRIVAL } from "@/src/modules/academy-admissions/constants/legacy-admission-arrival";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** @param token - Canonical historical token read from the current URL. @returns One-way domain-separated reference, never an authorization proof. @throws When native cryptography or the token is unavailable. */
export async function createLegacyAdmissionBrowserScope(token: string): Promise<string> {
  if (!LEGACY_ADMISSION_ARRIVAL.canonicalTokenPattern.test(token) || !globalThis.crypto?.subtle) throw new Error(ADMISSION_ERROR_CODE.invalidInput);
  const material = new TextEncoder().encode(`${LEGACY_ADMISSION_ARRIVAL.hashDomain}${token}`);
  const digest = await globalThis.crypto.subtle.digest(LEGACY_ADMISSION_ARRIVAL.hashAlgorithm, material);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(LEGACY_ADMISSION_ARRIVAL.hexRadix).padStart(LEGACY_ADMISSION_ARRIVAL.hexByteWidth, "0")).join("");
}
