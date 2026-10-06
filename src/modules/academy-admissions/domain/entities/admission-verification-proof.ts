/** Models one admission proof, separate from a diagnostic and its message delivery. */
import type { VerificationChallengeScope } from "./contact-verification-challenge";

export type AdmissionVerificationProof = VerificationChallengeScope & {
  purpose: "admission"; verificationEpoch: number;
  id: string; challengeId: string; status: "available" | "applied" | "invalid";
  verifiedAt: Date; applyBefore: Date;
  appliedRequestId: string | null; appliedAt: Date | null;
  invalidatedAt: Date | null; invalidationReason: string | null;
};
