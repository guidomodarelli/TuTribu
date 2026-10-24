/** Projects local proof/contact/resource facts for the initial native submission without consuming or locking mutable evidence early. @module postgres-admission-submission-proof-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionSubmissionFacts, AdmissionLocalProofFacts } from "../../domain/policies/admission-eligibility";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { VerificationChallengeScope } from "../../domain/entities/contact-verification-challenge";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { ADMISSION_VERIFICATION_PURPOSE } from "../../constants/admission-eligibility";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";

/** Consumes the actual private proof origin and dates without schema-validating PostgreSQL payloads. */
type SubmissionProofRow = { id: string; user_id: string; tribe_id: string; contact_type: "email" | "phone"; normalized_contact: string; recipient_country: string | null; purpose: "admission"; channel: VerificationChallengeScope["channel"]; verification_epoch: number; connection_id: string; connection_version: number; security_epoch: string; status: AdmissionLocalProofFacts["status"]; verified_at: Date | string; apply_before: Date | string; applied_request_id: string | null };
/** Snapshot reads do not take proof/binding SHARE locks that would need upgrading after the new request is inserted. */
export class PostgresAdmissionSubmissionProofReader {
  /** @param database - Original native submission transaction. @param readSecurityConfig - Live external environment/epoch without provider RPC. */
  constructor(private readonly database: RequestDatabase, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}
  /** @param scope - Actual submitting account/tribe. @param proofId - Opaque proposed own proof. @param facts - Current locked policy/account/contact facts. @returns Own current evidence/resource/binding hints and immutable scope; the atomic writer revalidates before consumption. */
  async read(scope: AdmissionCommandScope, proofId: string, facts: AdmissionSubmissionFacts) {
    const row = (await this.database.execute<SubmissionProofRow>(sql`select proof.id,proof.user_id,proof.tribe_id,proof.contact_type,proof.normalized_contact,delivery.recipient_country,challenge.purpose,challenge.channel,proof.verification_epoch,proof.connection_id,proof.connection_version,proof.security_epoch,proof.status,proof.verified_at,proof.apply_before,proof.applied_request_id from public.academy_admission_verification_proofs proof join public.contact_verification_challenges challenge on challenge.id=proof.challenge_id and challenge.user_id=proof.user_id and challenge.tribe_id=proof.tribe_id join public.message_deliveries delivery on delivery.id=challenge.delivery_id and delivery.tribe_id=challenge.tribe_id where proof.id=${proofId} and proof.user_id=${scope.userId} and proof.tribe_id=${scope.tribeId} and challenge.purpose=${ADMISSION_VERIFICATION_PURPOSE.admission}`)).rows[0];
    if (!row || row.contact_type === ADMISSION_CONTACT_TYPE.phone && !row.recipient_country) return null;
    const contact = row.contact_type === ADMISSION_CONTACT_TYPE.email ? { type: ADMISSION_CONTACT_TYPE.email, value: row.normalized_contact } : { type: ADMISSION_CONTACT_TYPE.phone, value: row.normalized_contact, country: row.recipient_country! };
    const proof: AdmissionLocalProofFacts = { id: row.id, userId: row.user_id, tribeId: row.tribe_id, contact, purpose: row.purpose, verificationEpoch: row.verification_epoch, connectionId: row.connection_id, connectionVersion: row.connection_version, securityEpoch: row.security_epoch, status: row.status, verifiedAt: new Date(row.verified_at), applyBefore: new Date(row.apply_before), appliedRequestId: row.applied_request_id };
    const resource = facts.policy?.messagingConnectionId && facts.policy.messagingConnectionVersion ? (await this.database.execute<{ environment: string; security_epoch: string }>(sql`select environment,security_epoch from public.messaging_connection_versions where connection_id=${facts.policy.messagingConnectionId} and tribe_id=${scope.tribeId} and version=${facts.policy.messagingConnectionVersion} for share`)).rows[0] : null;
    const config = await this.readSecurityConfig();
    const currentConnection = resource && !config.recoveryLocked && resource.environment === config.environment && resource.security_epoch === config.securityEpoch ? { id: facts.policy!.messagingConnectionId!, version: facts.policy!.messagingConnectionVersion!, securityEpoch: config.securityEpoch } : null;
    const binding = (await this.database.execute<{ owner_user_id: string }>(sql`select owner_user_id from public.academy_admission_contact_bindings where tribe_id=${scope.tribeId} and contact_type=${contact.type} and normalized_contact=${contact.value}`)).rows[0];
    const verificationScope: VerificationChallengeScope = { userId: scope.userId, tribeId: scope.tribeId, purpose: ADMISSION_VERIFICATION_PURPOSE.admission, verificationEpoch: proof.verificationEpoch, connectionId: proof.connectionId, connectionVersion: proof.connectionVersion, securityEpoch: proof.securityEpoch, channel: row.channel, contact };
    return { proof, currentConnection, contactBinding: binding ? { ownerUserId: binding.owner_user_id, contact } : null, scope: verificationScope };
  }
}
