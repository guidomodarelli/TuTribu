/** Defines admission-specific bounded production without transport, SDK or browser authority. @module admission-notification-producer */
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionNotificationGroupPreparationCommand } from "./admission-notification-group-preparation";

/** Distinguishes unavailable work and an uncertain commit from a confirmed zero count. */
export type AdmissionNotificationProducerStepStatus = "completed" | "deferred" | "failed" | "unresolved" | "not_run";
/** Reports confirmed effects only; failures retain their own private diagnostics outside this result. */
export type AdmissionNotificationProducerStep = { readonly status: AdmissionNotificationProducerStepStatus; readonly count: number; readonly code: AdmissionErrorCode | null };
/** Preserves each bounded tenant's original page and independent preparation disposition; null continuation means no current observation or an uncertain commit. */
export type AdmissionNotificationProducerTribeResult = { readonly tribeId: string; readonly operationId: string | null; readonly collection: AdmissionNotificationProducerStep; readonly preparation: AdmissionNotificationProducerStep; readonly hasContinuation: boolean | null; readonly groupsExamined: number };
/** Describes one bounded invocation; completed never asserts global queue exhaustion or external delivery. */
export type AdmissionNotificationProducerResult = { readonly reminders: AdmissionNotificationProducerStep; readonly tribes: readonly AdmissionNotificationProducerTribeResult[]; readonly selection: AdmissionNotificationProducerStep; readonly stoppedAtDeadline: boolean; readonly limitReached: boolean };
/** Owns private fair locators and logical reminders; each implementation rechecks current job authority. */
export interface AdmissionNotificationProducer {
  /** @param excludedTribeIds - Already examined in this bounded invocation. @returns One durably rotated tenant locator, never collection or dispatch authority. */
  selectNextTribe(excludedTribeIds: readonly string[]): Promise<string | null>;
  /** @param tribeId - Current backend tenant. @returns Only due original groups covered by a full available source sweep, with their original CAS. */
  readReadyGroups(tribeId: string): Promise<readonly AdmissionNotificationGroupPreparationCommand[]>;
  /** @returns The commit-confirmed number of new three-day logical reminders; zero does not assert no locked or remaining work. */
  materializeReminders(): Promise<number>;
}
/** A host stop that rejected a step inside its own transaction before any effect: the host deadline, its job authority or its recovery lock. */
export type AdmissionNotificationProducerStop = "deadline_reached" | "authority_unavailable" | "recovery_locked";
/** Keeps host clocks and IDs outside business rules, with safe context for private diagnostics. */
export type AdmissionNotificationProducerRuntime = {
  readonly now: () => number;
  readonly createId: () => string;
  readonly report: (error: unknown, context: { readonly phase: string; readonly tribeId?: string; readonly operationId?: string }) => void;
  /**
   * Recognizes a host stop behind an owner failure, which owners otherwise wrap as unresolved; absent when the host has no such guard.
   * @param error - Failure of one producer step.
   * @returns The host stop, or null for any other failure.
   */
  readonly classifyStop?: (error: unknown) => AdmissionNotificationProducerStop | null;
};
