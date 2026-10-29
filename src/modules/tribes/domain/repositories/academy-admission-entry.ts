/** Connects an explicit academy entry to its admission owner without a persistence or HTTP dependency. @module academy-admission-entry */
/** Explicit applicant intent of one admission, independent of how its tribe is addressed. */
export type AcademyAdmissionIntent = {
  requestId: string; operationId: string; expectedPolicyVersion: number; confirmed: true;
  phone?: string; country?: string; proofId?: string; message?: string; invitationToken?: string; legacyInvitationToken?: string;
  whatsappNumber?: string;
};
/** Admission intent addressed by the public tribe slug. */
export type RequestAcademyAdmissionCommand = AcademyAdmissionIntent & { tribeSlug: string };
/** The owner determines its own result contract; this compatibility entry never invents membership. */
export interface AcademyAdmissionEntry<Result> {
  submit(command: RequestAcademyAdmissionCommand): Promise<Result>;
}
