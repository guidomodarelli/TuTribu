/** Coordinates irreversible scope closure in the tribe owner's current transaction. @module close-academy-admission-scope-use-case */
import type { AdmissionScopeClosureEvent, AdmissionScopeClosureWriter } from "../../domain/repositories/admission-scope-closure-writer";

/** A pause uses its policy owner and never enters this retirement operation. */
export class CloseAcademyAdmissionScopeUseCase {
  /** @param writer - Admission owner bound to the original lifecycle transaction. */
  constructor(private readonly writer: AdmissionScopeClosureWriter) {}
  /** @param event - Actual tribe/mode owner mutation. @returns After its irreversible admission effects have been staged together. */
  execute(event: AdmissionScopeClosureEvent): Promise<void> { return this.writer.close(event); }
}
