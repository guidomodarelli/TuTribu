/** Projects current tested messaging resources without exposing SDK/persistence contracts to admission. @module admission-verification-readiness-reader */

/** The policy chooses one exact selected resource/version and one explicit main channel. */
export type AdmissionVerificationResourceScope = { tribeId: string; connectionId: string | null; connectionVersion: number | null; channel: "email" | "sms" | "whatsapp"; requiresSmsAlternative: boolean };
/** These are current locked owner facts, never a browser claim or diagnostic success toast. */
export type AdmissionVerificationReadiness = {
  channelPrepared: boolean; smsAlternativePrepared: boolean; verificationQuotaPositive: boolean;
  /** Private routing metadata permits final local keyring coherence; it never enters a public DTO. */
  securityScope?: { environment: string; securityEpoch: string; credentialKeyId: string };
};

export interface AdmissionVerificationReadinessReader {
  /** @param scope - Exact authorized tenant and selected resource. @returns Current tested capability and positive configured quota, without any provider call. */
  read(scope: AdmissionVerificationResourceScope): Promise<AdmissionVerificationReadiness>;
}
