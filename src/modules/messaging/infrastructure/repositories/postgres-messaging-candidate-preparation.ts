/** Reads exact local preparation facts after the owning writer has locked the connection and configuration. @module postgres-messaging-candidate-preparation */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingConnectionConfiguration, MessagingConnectionCapability } from "@/src/modules/messaging/domain/entities/messaging-connection-version";
import { assessMessagingCandidatePreparation } from "@/src/modules/messaging/domain/policies/messaging-candidate-preparation";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_CREDENTIAL_PUBLIC_STATE } from "@/src/modules/messaging/constants/messaging-public-contract";

/** Consumes only immutable resource references and independently stored credential facts. */
type PreparationVersionRow = { email_sender_id: string | null; sms_sender_id: string | null; whatsapp_sender_id: string | null; whatsapp_template_id: string | null; whatsapp_template_language: string | null; credential_validation_status: string; credential_validated_at: Date | string | null };
/** Keeps channel confirmation tied to the same sender/template/language and local test time. */
type PreparationCapabilityRow = { channel: MessagingConnectionCapability["channel"]; state: MessagingConnectionCapability["state"]; sender_id: string; template_id: string | null; template_language: string | null; tested_at: Date | string | null };

/**
 * Assesses only the current unselected candidate; the writer owns lifecycle CAS and its original ledger.
 * @param database - Existing transaction holding connection/version write locks before capability locks.
 * @param context - Current authorized exact configuration, not provider data or browser authority.
 * @returns Draft/ready for this candidate, or null when selected, retired or outside the candidate scope.
 */
export async function readMessagingCandidatePreparationState(database: RequestDatabase, context: AuthorizedMessagingContext): Promise<"draft" | "ready" | null> {
  const connection = (await database.execute<{ state: string }>(sql`select state from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId} and is_candidate and not is_selected and candidate_version=${context.connectionVersion} and retired_at is null`)).rows[0];
  if (!connection || connection.state !== MESSAGING_CONNECTION_STATE.draft && connection.state !== MESSAGING_CONNECTION_STATE.ready) return null;
  const version = (await database.execute<PreparationVersionRow>(sql`select email_sender_id,sms_sender_id,whatsapp_sender_id,whatsapp_template_id,whatsapp_template_language,credential_validation_status,credential_validated_at from public.messaging_connection_versions where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and version=${context.connectionVersion} and retired_at is null`)).rows[0];
  if (!version) return null;
  const capabilities = (await database.execute<PreparationCapabilityRow>(sql`select channel,state,sender_id,template_id,template_language,tested_at from public.messaging_connection_capabilities where connection_id=${context.connectionId} and tribe_id=${context.tribeId} and connection_version=${context.connectionVersion} order by channel`)).rows;
  const configuration: MessagingConnectionConfiguration = { emailSenderId: version.email_sender_id, smsSenderId: version.sms_sender_id, whatsappSenderId: version.whatsapp_sender_id, whatsappTemplateId: version.whatsapp_template_id, whatsappTemplateLanguage: version.whatsapp_template_language };
  const credentialValidated = version.credential_validation_status === MESSAGING_CREDENTIAL_PUBLIC_STATE.valid && version.credential_validated_at !== null && Number.isFinite(new Date(version.credential_validated_at).getTime());
  const preparation = assessMessagingCandidatePreparation({ configuration, credentialValidated, capabilities: capabilities.map((capability) => ({ channel: capability.channel, state: capability.state, senderId: capability.sender_id, templateId: capability.template_id, templateLanguage: capability.template_language, testedAt: capability.tested_at === null ? null : new Date(capability.tested_at) })) });
  return preparation.prepared ? MESSAGING_CONNECTION_STATE.ready : MESSAGING_CONNECTION_STATE.draft;
}
