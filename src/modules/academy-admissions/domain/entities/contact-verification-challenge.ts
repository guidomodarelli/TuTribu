/** Models a private local challenge; provider delivery never changes its verification state. */
import type { AdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";

/** Exact challenge scope, including policy epoch only for admission. */
export type VerificationChallengeScope = {
  userId: string; tribeId: string; contact: AdmissionContact;
  purpose: "admission" | "connection_diagnostic"; verificationEpoch: number | null;
  connectionId: string; connectionVersion: number; securityEpoch: string;
  channel: "email" | "whatsapp" | "sms";
};

/** Private material scope authenticated by code MAC and transient envelope adapters. */
export type VerificationCodeContext = Omit<VerificationChallengeScope, "securityEpoch"> & {
  challengeId: string; createdAt: Date; expiresAt: Date;
};

/** Stored facts protected by the writer's current-challenge lock and CAS version. */
export type ContactVerificationChallenge = VerificationChallengeScope & {
  id: string; version: number; state: "issued" | "verified" | "invalidated" | "expired";
  createdAt: Date; expiresAt: Date; failedAttempts: number;
  verifiedAt: Date | null; invalidatedAt: Date | null; invalidationReason: string | null;
  codeMac: Uint8Array | null; macKeyId: string;
  codeEnvelopeId: string | null; deliveryId: string;
};
