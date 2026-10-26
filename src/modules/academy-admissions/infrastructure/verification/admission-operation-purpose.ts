/** Derives private owner metadata from the already normalized signed intent without changing its namespace or fingerprint. @module admission-operation-purpose */
import type {AdmissionOperationCommand} from "../../domain/entities/admission-operation";
import {VERIFICATION_ISSUANCE_OPERATION} from "../../constants/verification-issuance";
import {ADMISSION_VERIFICATION_PURPOSE} from "../../constants/admission-eligibility";

/** @param command - Native owner's normalized operation intent, not browser authority. @returns A known shared-issuance purpose or null when the original contract does not prove one. */
export function readAdmissionOperationVerificationPurpose(command:AdmissionOperationCommand){
  if(command.operationType!==VERIFICATION_ISSUANCE_OPERATION.issue&&command.operationType!==VERIFICATION_ISSUANCE_OPERATION.resend)return null;
  const intent=command.intent;
  if(!intent||typeof intent!=="object"||Array.isArray(intent)||!("purpose"in intent))return null;
  const purpose=intent.purpose;
  return purpose===ADMISSION_VERIFICATION_PURPOSE.admission||purpose===ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic?purpose:null;
}
