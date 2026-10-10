/** Reports complete evaluator coverage from actual execution guards, independently of stored policy or provider readiness. @module read-admission-runtime-use-case */
import type { AdmissionActivationRuntimeReader } from "../../domain/repositories/admission-activation-preflight-reader";
import type { AdmissionExecutionCapabilitiesReader } from "../../domain/repositories/admission-execution-capabilities";
import { REQUIRED_ADMISSION_EXECUTION_SOURCES, REQUIRED_ADMISSION_EXECUTION_MODES } from "../../constants/admission-execution-capabilities";

/** Absence of any published evaluator path closes cutover; a callable manual subset is not full runtime readiness. */
export class ReadAdmissionRuntimeUseCase implements AdmissionActivationRuntimeReader {
  /** @param evaluator - Actual installed evaluator whose supported profile also controls its execution. */
  constructor(private readonly evaluator: AdmissionExecutionCapabilitiesReader) {}

  /** @param tribeId - Already authorized target; code coverage is global while inventory remains tenant-scoped. @returns Complete coverage, without creating work, RPC or optimistic defaults. */
  async isPrepared(tribeId: string): Promise<boolean> {
    if (!tribeId) return false;
    const coverage = this.evaluator.getCapabilities();
    return coverage.additionalVerification && REQUIRED_ADMISSION_EXECUTION_SOURCES.every((source) => coverage.sources.includes(source))
      && REQUIRED_ADMISSION_EXECUTION_MODES.every((mode) => coverage.policyModes.includes(mode));
  }
}
