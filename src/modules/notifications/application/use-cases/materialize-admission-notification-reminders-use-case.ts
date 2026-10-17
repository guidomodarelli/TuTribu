/** Keeps unique internal reminders independent from optional email preparation and configuration. @module materialize-admission-notification-reminders-use-case */
import type { AdmissionNotificationProducer } from "../../domain/repositories/admission-notification-producer";

/** Uses the original key-independent protected SQL owner without duplicating its eligibility rules. */
export class MaterializeAdmissionNotificationRemindersUseCase {
  /** @param reminders - Original protected commit-confirming materializer. */
  constructor(private readonly reminders: Pick<AdmissionNotificationProducer, "materializeReminders">) {}
  /** @returns Only new logical reminders confirmed by the original transaction; zero does not assert queue exhaustion. */
  async execute(): Promise<{ created: number }> { return { created: await this.reminders.materializeReminders() }; }
}
