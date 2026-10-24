/** Coordinates reminders, finite source pages and complete-group preparation without sending a message. @module prepare-admission-email-notifications-use-case */
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionNotificationCollectionProgress } from "../../domain/repositories/admission-notification-collection-progress";
import type { AdmissionNotificationGroupPreparation } from "../../domain/repositories/admission-notification-group-preparation";
import type { AdmissionNotificationProducer, AdmissionNotificationProducerResult, AdmissionNotificationProducerRuntime, AdmissionNotificationProducerStep, AdmissionNotificationProducerTribeResult } from "../../domain/repositories/admission-notification-producer";
import { ADMISSION_NOTIFICATION_PRODUCER_LIMITS, ADMISSION_NOTIFICATION_PRODUCER_PHASE, ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS } from "../../constants/admission-notification-producer";
import { ADMISSION_NOTIFICATION_PREPARATION_STATUS } from "../../constants/admission-notification-email-intent";

/** Runs one page per fair tenant turn and keeps every confirmed earlier effect when a later step fails. */
export class PrepareAdmissionEmailNotificationsUseCase {
  /** @param producer - Private fair selection and reminder owner. @param progress - Atomic source/member checkpoint owner. @param preparation - Atomic complete group/outbox owner. @param runtime - Native clock, IDs and private diagnostic sink. */
  constructor(private readonly producer: AdmissionNotificationProducer, private readonly progress: AdmissionNotificationCollectionProgress, private readonly preparation: AdmissionNotificationGroupPreparation, private readonly runtime: AdmissionNotificationProducerRuntime) {}

  /** @param error - Original private failure, never copied to a response. @param phase - Safe producer operation name. @param tribeId - Native selected scope, if one exists. @param operationId - Original collection page, if one was issued. @returns A closed failure code without inferring rollback or repeating work. */
  private failed(error: unknown, phase: string, tribeId?: string, operationId?: string): AdmissionNotificationProducerStep {
    this.runtime.report(error, { phase, ...(tribeId ? { tribeId } : {}), ...(operationId ? { operationId } : {}) });
    const code = error instanceof AdmissionOperationError ? error.code : ADMISSION_ERROR_CODE.unexpectedFailure;
    return { status: code === ADMISSION_ERROR_CODE.operationUnresolved ? ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.unresolved : ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.failed, count: 0, code };
  }

  /** @param deadlineAtMilliseconds - Existing host-run deadline; it is never extended for this phase. @returns The original combined logical-reminder and email preparation workflow, without sending a message. */
  async execute(deadlineAtMilliseconds: number): Promise<AdmissionNotificationProducerResult> {
    return this.runBoundedPreparation(deadlineAtMilliseconds, true);
  }

  /** @param deadlineAtMilliseconds - Original shared maintenance deadline. @returns Only email source/group preparation when the maintenance owner composes logical reminders independently. */
  async prepareGroups(deadlineAtMilliseconds: number): Promise<AdmissionNotificationProducerResult> {
    return this.runBoundedPreparation(deadlineAtMilliseconds, false);
  }

  /** @param deadlineAtMilliseconds - Original host deadline, never extended. @param includeReminders - Explicit private composition, never browser input. @returns Bounded confirmed work with every omission or uncertainty visible. */
  private async runBoundedPreparation(deadlineAtMilliseconds: number, includeReminders: boolean): Promise<AdmissionNotificationProducerResult> {
    const tribes: AdmissionNotificationProducerTribeResult[] = [];
    const notRun: AdmissionNotificationProducerStep = { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.notRun, count: 0, code: null };
    let reminders = notRun, selection = notRun;
    let stoppedAtDeadline = this.runtime.now() >= deadlineAtMilliseconds;
    if (!Number.isFinite(deadlineAtMilliseconds)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (!stoppedAtDeadline && includeReminders) {
      try { reminders = { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: await this.producer.materializeReminders(), code: null }; }
      catch (error) { reminders = this.failed(error, ADMISSION_NOTIFICATION_PRODUCER_PHASE.reminders); }
    }
    for (let index = 0; index < ADMISSION_NOTIFICATION_PRODUCER_LIMITS.tribes; index++) {
      if (this.runtime.now() >= deadlineAtMilliseconds) { stoppedAtDeadline = true; break; }
      let tribeId: string | null;
      try { tribeId = await this.producer.selectNextTribe(tribes.map((tribe) => tribe.tribeId)); }
      catch (error) { selection = { ...this.failed(error, ADMISSION_NOTIFICATION_PRODUCER_PHASE.selection), count: selection.count }; break; }
      if (tribeId === null) { selection = { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: selection.count, code: null }; break; }
      selection = { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: selection.count + 1, code: null };
      let collection = notRun, preparation = notRun, operationId: string | null = null, groupsExamined = 0;
      let hasContinuation: boolean | null = null;
      // Already certified windows get their turn before another potentially slow source page.
      try {
        if (this.runtime.now() < deadlineAtMilliseconds) {
          const groups = await this.producer.readReadyGroups(tribeId);
          preparation = { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: 0, code: null };
          for (const group of groups) {
            if (this.runtime.now() >= deadlineAtMilliseconds) { stoppedAtDeadline = true; break; }
            const result = await this.preparation.prepare(group);
            groupsExamined++;
            if (result.status === ADMISSION_NOTIFICATION_PREPARATION_STATUS.queued && !result.replayed) preparation = { ...preparation, count: preparation.count + 1 };
            if (result.status === ADMISSION_NOTIFICATION_PREPARATION_STATUS.unavailable || result.status === ADMISSION_NOTIFICATION_PREPARATION_STATUS.notDue) preparation = { ...preparation, status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.deferred, code: ADMISSION_ERROR_CODE.connectionIncomplete };
          }
        }
      } catch (error) { preparation = { ...this.failed(error, ADMISSION_NOTIFICATION_PRODUCER_PHASE.preparation, tribeId), count: preparation.count }; }
      if (this.runtime.now() < deadlineAtMilliseconds) {
        try {
          const original = await this.progress.readProgress(tribeId);
          hasContinuation = original.hasContinuation;
          if (this.runtime.now() >= deadlineAtMilliseconds) stoppedAtDeadline = true;
          else {
            operationId = this.runtime.createId();
            const page = await this.progress.collectPage({ tribeId, operationId, expectedVersion: original.version, softDeadlineAtMilliseconds: deadlineAtMilliseconds });
            hasContinuation = !page.sweepComplete;
            collection = { status: page.sweepHadUnavailable ? ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.deferred : ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: page.collected, code: page.sweepHadUnavailable ? ADMISSION_ERROR_CODE.connectionIncomplete : null };
          }
        } catch (error) {
          collection = this.failed(error, ADMISSION_NOTIFICATION_PRODUCER_PHASE.collection, tribeId, operationId ?? undefined);
          if (collection.status === ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.unresolved) hasContinuation = null;
        }
      }
      tribes.push({ tribeId, operationId, collection, preparation, hasContinuation, groupsExamined });
    }
    return { reminders, tribes, selection, stoppedAtDeadline: stoppedAtDeadline || this.runtime.now() >= deadlineAtMilliseconds, limitReached: tribes.length === ADMISSION_NOTIFICATION_PRODUCER_LIMITS.tribes };
  }
}
