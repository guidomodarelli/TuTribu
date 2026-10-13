/** Integrates actual membership events without treating an approval as enduring membership authority. @module reconcile-admission-membership-use-case */
import type { AdmissionMembershipLifecycleEvent, AdmissionMembershipLifecycleWriter } from "../../domain/repositories/admission-membership-lifecycle-writer";

/** Keeps request closure in the caller's atomic membership transaction rather than scheduling a second mutation. */
export class ReconcileAdmissionMembershipUseCase {
  /** @param writer - Admission owner bound to the membership owner's current transaction. */
  constructor(private readonly writer: AdmissionMembershipLifecycleWriter) {}
  /** @param event - Trusted facts from the changed member instance, never a public reason or paid flag. @returns After the request owner has reconciled the terminal effects. */
  execute(event: AdmissionMembershipLifecycleEvent): Promise<void> { return this.writer.reconcile(event); }
}
