/** Generates contract-sized local codes without modulo bias or a weak random source. */
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { VERIFICATION_CODE_GENERATION } from "@/src/modules/academy-admissions/constants/verification-challenge";

/**
 * Samples a cryptographic unsigned integer with rejection before decimal reduction.
 * @returns Exactly six unpredictable decimal digits, including leading zeros.
 */
export function generateVerificationCode(): string {
  const cutoff = Math.floor(VERIFICATION_CODE_GENERATION.uint32Range / VERIFICATION_CODE_GENERATION.decimalRange) * VERIFICATION_CODE_GENERATION.decimalRange;
  const sample = new Uint32Array(1);
  do { crypto.getRandomValues(sample); } while (sample[0] >= cutoff);
  return (sample[0] % VERIFICATION_CODE_GENERATION.decimalRange).toString().padStart(ADMISSION_LIMIT.verificationCodeDigits, "0");
}
