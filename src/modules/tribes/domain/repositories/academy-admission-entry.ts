/** Connects an explicit academy entry to its admission owner without a persistence or HTTP dependency. @module academy-admission-entry */
export type RequestAcademyAdmissionCommand = {
  tribeSlug: string; requestId: string; operationId: string; expectedPolicyVersion: number; confirmed: true;
  phone?: string; country?: string; proofId?: string; message?: string; invitationToken?: string; legacyInvitationToken?: string;
};
/** The owner determines its own result contract; this compatibility entry never invents membership. */
export interface AcademyAdmissionEntry<Result> {
  submit(command: RequestAcademyAdmissionCommand): Promise<Result>;
}
