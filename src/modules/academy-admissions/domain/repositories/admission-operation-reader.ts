/** Reads an original actor/tribe operation without claims, effects or provider details. @module admission-operation-reader */
import type { AdmissionCommandScope } from "./admission-repositories";
/** The concrete owner supplies the supported result projection and current permission per operation. */
export interface AdmissionOperationReader<Result> {
  read(scope: AdmissionCommandScope, operationId: string): Promise<Result | null>;
}
