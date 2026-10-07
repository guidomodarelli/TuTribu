/** Defines a stable private contact budget identity without provider or SQL contracts. @module messaging-contact-budget-repository */
import type { AdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";

/** Protected index material stays backend-only; the subject remains stable across keyring rotation. */
export type MessagingContactBudgetIdentity = { subjectId: string; fingerprintKeyId: string; fingerprint: Uint8Array };
export interface MessagingContactBudgetRepository {
  /**
   * Resolves one budget subject using all retained platform-owned contact keys.
   * @param contact - Canonical contact from the owning input/domain boundary.
   * @returns A stable private subject and the active protected index, without resetting consumption.
   */
  resolve(contact: AdmissionContact): Promise<MessagingContactBudgetIdentity>;
}
