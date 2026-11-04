/** Coordinates reminders, finite source pages and complete-group preparation without sending a message. @module prepare-admission-email-notifications-use-case */
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionNotificationCollectionProgress } from "../../domain/repositories/admission-notification-collection-progress";
import type { AdmissionNotificationGroupPreparation } from "../../domain/repositories/admission-notification-group-preparation";
import type { AdmissionNotificationProducer, AdmissionNotificationProducerResult, AdmissionNotificationProducerRuntime, AdmissionNotificationProducerStep, AdmissionNotificationProducerTribeResult } from "../../domain/repositories/admission-notification-producer";
import { ADMISSION_NOTIFICATION_PRODUCER_LIMITS, ADMISSION_NOTIFICATION_PRODUCER_PHASE, ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS, ADMISSION_NOTIFICATION_PRODUCER_STOP } from "../../constants/admission-notification-producer";
import { ADMISSION_NOTIFICATION_PREPARATION_STATUS } from "../../constants/admission-notification-email-intent";

/** Ready-group preparation outcome for one fair tenant turn. */
type TribeGroupPreparationOutcome = { preparation: AdmissionNotificationProducerStep; groupsExamined: number; stoppedAtDeadline: boolean };

/** Source collection outcome for one fair tenant turn. */
type TribeSourceCollectionOutcome = { collection: AdmissionNotificationProducerStep; operationId: string | null; hasContinuation: boolean | null; stoppedAtDeadline: boolean };

/** @returns A step that never ran. */
function createNotRunStep(): AdmissionNotificationProducerStep {
  return { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.notRun, count: 0, code: null };
}

/** @param preparation - Current preparation step. @param result - One complete-group preparation outcome. @returns The step counting new queued groups and deferring unavailable or early groups. */
function applyGroupPreparationResult(preparation: AdmissionNotificationProducerStep, result: Awaited<ReturnType<AdmissionNotificationGroupPreparation["prepare"]>>): AdmissionNotificationProducerStep {
  let next = preparation;
  if (result.status === ADMISSION_NOTIFICATION_PREPARATION_STATUS.queued && !result.replayed) next = { ...next, count: next.count + 1 };
  if (result.status === ADMISSION_NOTIFICATION_PREPARATION_STATUS.unavailable || result.status === ADMISSION_NOTIFICATION_PREPARATION_STATUS.notDue) next = { ...next, status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.deferred, code: ADMISSION_ERROR_CODE.connectionIncomplete };
  return next;
}

/** Runs one page per fair tenant turn and keeps every confirmed earlier effect when a later step fails. */
export class PrepareAdmissionEmailNotificationsUseCase {
  /** @param producer - Private fair selection and reminder owner. @param progress - Atomic source/member checkpoint owner. @param preparation - Atomic complete group/outbox owner. @param runtime - Native clock, IDs and private diagnostic sink. */
  constructor(private readonly producer: AdmissionNotificationProducer, private readonly progress: AdmissionNotificationCollectionProgress, private readonly preparation: AdmissionNotificationGroupPreparation, private readonly runtime: AdmissionNotificationProducerRuntime) {}

  /** @param error - Original private failure, never copied to a response. @param phase - Safe producer operation name. @param tribeId - Native selected scope, if one exists. @param operationId - Original collection page, if one was issued. @returns A closed failure code without inferring rollback or repeating work. */
  private failed(error: unknown, phase: string, tribeId?: string, operationId?: string): AdmissionNotificationProducerStep {
    this.runtime.report(error, { phase, ...(tribeId ? { tribeId } : {}), ...(operationId ? { operationId } : {}) });
    // A host authority or recovery stop rejected the step before its commit, so it is a definitive failure rather than an uncertain one.
    const stop = this.runtime.classifyStop?.(error) ?? null;
    if (stop === ADMISSION_NOTIFICATION_PRODUCER_STOP.authorityUnavailable) return { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.failed, count: 0, code: ADMISSION_ERROR_CODE.permissionDenied };
    if (stop === ADMISSION_NOTIFICATION_PRODUCER_STOP.recoveryLocked) return { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.failed, count: 0, code: ADMISSION_ERROR_CODE.connectionIncomplete };
    const code = error instanceof AdmissionOperationError ? error.code : ADMISSION_ERROR_CODE.unexpectedFailure;
    return { status: code === ADMISSION_ERROR_CODE.operationUnresolved ? ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.unresolved : ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.failed, count: 0, code };
  }

  /**
   * The step checks the deadline before starting, but the host guard checks it again inside the step's transaction, so the deadline can
   * pass in between; that rejection rolled the step back and only means the budget ran out.
   * @param error - Failure of one step. @returns Whether the host deadline stopped the step before any effect.
   */
  private stoppedByDeadline(error: unknown): boolean {
    return this.runtime.classifyStop?.(error) === ADMISSION_NOTIFICATION_PRODUCER_STOP.deadlineReached;
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
    const notRun = createNotRunStep();
    let reminders = notRun, selection = notRun;
    let stoppedAtDeadline = this.runtime.now() >= deadlineAtMilliseconds;
    if (!Number.isFinite(deadlineAtMilliseconds)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (!stoppedAtDeadline && includeReminders) reminders = await this.materializeReminders();
    for (let index = 0; index < ADMISSION_NOTIFICATION_PRODUCER_LIMITS.tribes; index++) {
      if (this.runtime.now() >= deadlineAtMilliseconds) { stoppedAtDeadline = true; break; }
      let tribeId: string | null;
      try { tribeId = await this.producer.selectNextTribe(tribes.map((tribe) => tribe.tribeId)); }
      catch (error) {
        if (this.stoppedByDeadline(error)) { stoppedAtDeadline = true; break; }
        selection = { ...this.failed(error, ADMISSION_NOTIFICATION_PRODUCER_PHASE.selection), count: selection.count }; break;
      }
      if (tribeId === null) { selection = { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: selection.count, code: null }; break; }
      selection = { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: selection.count + 1, code: null };
      // Already certified windows get their turn before another potentially slow source page.
      const prepared = await this.prepareTribeGroups(tribeId, deadlineAtMilliseconds, notRun);
      const collected = await this.collectTribeSourcePage(tribeId, deadlineAtMilliseconds, notRun);
      if (prepared.stoppedAtDeadline || collected.stoppedAtDeadline) stoppedAtDeadline = true;
      tribes.push({ tribeId, operationId: collected.operationId, collection: collected.collection, preparation: prepared.preparation, hasContinuation: collected.hasContinuation, groupsExamined: prepared.groupsExamined });
    }
    return { reminders, tribes, selection, stoppedAtDeadline: stoppedAtDeadline || this.runtime.now() >= deadlineAtMilliseconds, limitReached: tribes.length === ADMISSION_NOTIFICATION_PRODUCER_LIMITS.tribes };
  }

  /** @returns The logical reminder step, keeping a failure private and closed. */
  private async materializeReminders(): Promise<AdmissionNotificationProducerStep> {
    try { return { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: await this.producer.materializeReminders(), code: null }; }
    catch (error) { return this.stoppedByDeadline(error) ? createNotRunStep() : this.failed(error, ADMISSION_NOTIFICATION_PRODUCER_PHASE.reminders); }
  }

  /** @param tribeId - Native selected scope. @param deadlineAtMilliseconds - Original host deadline. @param notRun - Step used when the phase never starts. @returns The ready-group preparation step, how many groups were examined and whether the deadline stopped it. */
  private async prepareTribeGroups(tribeId: string, deadlineAtMilliseconds: number, notRun: AdmissionNotificationProducerStep): Promise<TribeGroupPreparationOutcome> {
    let preparation = notRun, groupsExamined = 0, stoppedAtDeadline = false;
    try {
      if (this.runtime.now() >= deadlineAtMilliseconds) return { preparation, groupsExamined, stoppedAtDeadline };
      const groups = await this.producer.readReadyGroups(tribeId);
      preparation = { status: ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: 0, code: null };
      for (const group of groups) {
        if (this.runtime.now() >= deadlineAtMilliseconds) { stoppedAtDeadline = true; break; }
        const result = await this.preparation.prepare(group);
        groupsExamined++;
        preparation = applyGroupPreparationResult(preparation, result);
      }
    } catch (error) {
      // A deadline stop keeps the groups already prepared and leaves the rest for the next run.
      if (this.stoppedByDeadline(error)) stoppedAtDeadline = true;
      else preparation = { ...this.failed(error, ADMISSION_NOTIFICATION_PRODUCER_PHASE.preparation, tribeId), count: preparation.count };
    }
    return { preparation, groupsExamined, stoppedAtDeadline };
  }

  /** @param tribeId - Native selected scope. @param deadlineAtMilliseconds - Original host deadline. @param notRun - Step used when the phase never starts. @returns The source collection step, its operation, continuation and whether the deadline stopped it. */
  private async collectTribeSourcePage(tribeId: string, deadlineAtMilliseconds: number, notRun: AdmissionNotificationProducerStep): Promise<TribeSourceCollectionOutcome> {
    let collection = notRun, operationId: string | null = null, hasContinuation: boolean | null = null;
    if (this.runtime.now() >= deadlineAtMilliseconds) return { collection, operationId, hasContinuation, stoppedAtDeadline: false };
    try {
      const original = await this.progress.readProgress(tribeId);
      hasContinuation = original.hasContinuation;
      if (this.runtime.now() >= deadlineAtMilliseconds) return { collection, operationId, hasContinuation, stoppedAtDeadline: true };
      operationId = this.runtime.createId();
      const page = await this.progress.collectPage({ tribeId, operationId, expectedVersion: original.version, softDeadlineAtMilliseconds: deadlineAtMilliseconds });
      hasContinuation = !page.sweepComplete;
      collection = { status: page.sweepHadUnavailable ? ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.deferred : ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.completed, count: page.collected, code: page.sweepHadUnavailable ? ADMISSION_ERROR_CODE.connectionIncomplete : null };
    } catch (error) {
      if (this.stoppedByDeadline(error)) return { collection, operationId: null, hasContinuation, stoppedAtDeadline: true };
      collection = this.failed(error, ADMISSION_NOTIFICATION_PRODUCER_PHASE.collection, tribeId, operationId ?? undefined);
      if (collection.status === ADMISSION_NOTIFICATION_PRODUCER_STEP_STATUS.unresolved) hasContinuation = null;
    }
    return { collection, operationId, hasContinuation, stoppedAtDeadline: false };
  }
}
