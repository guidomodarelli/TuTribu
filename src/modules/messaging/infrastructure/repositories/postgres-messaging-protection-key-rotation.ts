/** Rotates active credential envelopes under current platform authority without changing BYOK, counters or original intents. @module postgres-messaging-protection-key-rotation */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingProtectionKeyRotation, MessagingProtectionKeyRotationCommand, MessagingProtectionKeyRotationResult, MessagingProtectionKeyState } from "../../domain/repositories/messaging-protection-key-rotation";
import { MessagingProtectionKeyRotationError } from "../../domain/errors/messaging-protection-key-rotation-error";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import { messagingProtectionKeyStateMatches, projectMessagingProtectionKeyState } from "../config/messaging-protection-key-state";
import { createMessagingSecretCipher, type MessagingSecretEnvelope, type MessagingSecretContext } from "../encryption/messaging-secret-cipher";
import { MessagingCryptographyError } from "../encryption/messaging-cryptography-error";
import { assertMessagingPrivateMacKeyMaterial } from "./assert-messaging-key-material";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_KEY_PURPOSE } from "../../constants/messaging-cryptography";
import { CONTACT_BUDGET_CONTINUITY_WINDOW_MS, CONTACT_BUDGET_REQUEST_EVENT } from "../../constants/contact-budget";
import { MESSAGE_DELIVERY_STATE } from "../../constants/message-delivery";
import { VERIFICATION_CHALLENGE_STATE } from "@/src/modules/academy-admissions/constants/verification-challenge";
import { ADMISSION_OPERATION_STARTED_STATE } from "@/src/modules/academy-admissions/constants/admission-operation";

/** Keeps live platform authority, routing-only facts and key import independently injectable at composition. */
export type MessagingProtectionKeyRotationDependencies = {
  execute: <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
  authorize: (database?: RequestDatabase) => Promise<boolean>;
  readRecoveryLock: (database?: RequestDatabase) => Promise<boolean>;
  readKeyState: () => Promise<MessagingProtectionKeyState>;
  readSecurityConfig: () => Promise<MessagingSecurityConfig>;
};
/** Contains only consumed private SQL columns; no backend schema revalidation occurs. */
type RotationRow = { secret_ref: string; tribe_id: string; connection_id: string; connection_version: number; environment: string; security_epoch: string; key_id: string; format: number; iv: Uint8Array; ciphertext: Uint8Array };

/** Publishes counts only after the original bounded transaction and its live postconditions commit. */
export class PostgresMessagingProtectionKeyRotation implements MessagingProtectionKeyRotation {
  /** @param dependencies - Explicit owner-only backend, current recovery/state and external key source; no provider exists here. */
  constructor(private readonly dependencies: MessagingProtectionKeyRotationDependencies) {}

  /** @param database - Original transaction when acquired. @returns After both live gates and native backend context pass. @throws MessagingProtectionKeyRotationError before key import for missing authority/recovery. */
  private async assertAuthority(database?: RequestDatabase): Promise<void> {
    if (!await this.dependencies.authorize(database)) throw new MessagingProtectionKeyRotationError(MESSAGING_ERROR_CODE.permissionDenied);
    if (await this.dependencies.readRecoveryLock(database)) throw new MessagingProtectionKeyRotationError(MESSAGING_ERROR_CODE.resourceUnavailable);
    if (!await this.dependencies.authorize(database)) throw new MessagingProtectionKeyRotationError(MESSAGING_ERROR_CODE.permissionDenied);
    if (database) {
      const native = (await database.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_function_privilege(current_user,'public.claim_messaging_secret_key_rotation(text,text,text,integer)','EXECUTE') as allowed`)).rows[0].allowed;
      if (!native) throw new MessagingProtectionKeyRotationError(MESSAGING_ERROR_CODE.permissionDenied);
    }
  }

  /** @param original - Fixed deployment/key topology. @param database - Original owner transaction. @returns After a fresh routing-only snapshot and post-await authority. @throws MessagingProtectionKeyRotationError when deployment or retained-key topology changes. */
  private async assertState(original: MessagingProtectionKeyState, database: RequestDatabase): Promise<void> {
    await this.assertAuthority(database);
    const current = await this.dependencies.readKeyState();
    if (!messagingProtectionKeyStateMatches(original, current)) throw new MessagingProtectionKeyRotationError(MESSAGING_ERROR_CODE.resourceUnavailable);
    await this.assertAuthority(database);
  }

  /** @param database - Current backend transaction. @param state - Own external routing snapshot. @returns Only while active identity/MAC windows retain a usable predecessor. @throws MessagingProtectionKeyRotationError rather than inventing another budget identity. */
  private async assertContinuity(database: RequestDatabase, state: MessagingProtectionKeyState): Promise<void> {
    const contactKeys = sql.join(state.keyrings.contact_fingerprint.keyIds.map((keyId) => sql`${keyId}`), sql`, `);
    const payloadKeys = sql.join(state.keyrings.operation_payload.keyIds.map((keyId) => sql`${keyId}`), sql`, `);
    const otpKeys = sql.join(state.keyrings.otp_envelope.keyIds.map((keyId) => sql`${keyId}`), sql`, `);
    const verificationKeys = sql.join(state.keyrings.verification_mac.keyIds.map((keyId) => sql`${keyId}`), sql`, `);
    const blocked = (await database.execute<{ blocked: boolean }>(sql`select (
      exists(select 1 from public.messaging_usage_events event where event.event_type=${CONTACT_BUDGET_REQUEST_EVENT} and event.contact_subject_id is not null and event.occurred_at>clock_timestamp()-${CONTACT_BUDGET_CONTINUITY_WINDOW_MS}::bigint*interval '1 millisecond' and event.occurred_at<=clock_timestamp() and not exists(select 1 from public.messaging_contact_fingerprint_aliases alias where alias.subject_id=event.contact_subject_id and alias.fingerprint_key_id in (${contactKeys})))
      or exists(select 1 from public.academy_admission_contact_bindings binding join public.academy_admission_tribe_namespaces namespace on namespace.tribe_id=binding.tribe_id where namespace.retired_at is null and binding.normalized_contact is null and binding.fingerprint_key_id not in (${contactKeys}))
      or exists(select 1 from public.academy_admission_operations operation where operation.state=${ADMISSION_OPERATION_STARTED_STATE} and operation.fingerprint_key_id not in (${payloadKeys}))
      or exists(select 1 from public.message_deliveries delivery where delivery.environment=${state.environment} and delivery.security_epoch=${state.securityEpoch} and (delivery.state=${MESSAGE_DELIVERY_STATE.unknown} or delivery.state=${MESSAGE_DELIVERY_STATE.queued} and delivery.deadline_at>clock_timestamp()) and delivery.payload_mac_key_id not in (${payloadKeys}))
      or exists(select 1 from public.contact_verification_challenges challenge join public.tenant_messaging_connections connection on connection.id=challenge.connection_id and connection.tribe_id=challenge.tribe_id where connection.environment=${state.environment} and challenge.security_epoch=${state.securityEpoch} and challenge.state=${VERIFICATION_CHALLENGE_STATE.issued} and challenge.is_current and challenge.invalidated_at is null and challenge.expires_at>clock_timestamp() and challenge.mac_key_id not in (${verificationKeys}))
      or exists(select 1 from public.verification_code_envelopes envelope join public.contact_verification_challenges challenge on challenge.id=envelope.challenge_id and challenge.tribe_id=envelope.tribe_id join public.message_deliveries delivery on delivery.id=envelope.delivery_id and delivery.tribe_id=envelope.tribe_id where envelope.environment=${state.environment} and envelope.security_epoch=${state.securityEpoch} and envelope.expires_at>clock_timestamp() and challenge.state=${VERIFICATION_CHALLENGE_STATE.issued} and challenge.is_current and challenge.invalidated_at is null and challenge.code_envelope_id=envelope.id and delivery.state not in (${MESSAGE_DELIVERY_STATE.accepted},${MESSAGE_DELIVERY_STATE.delivered},${MESSAGE_DELIVERY_STATE.cancelled}) and envelope.key_id not in (${otpKeys}))
    ) as blocked`)).rows[0].blocked;
    if (blocked) throw new MessagingProtectionKeyRotationError(MESSAGING_ERROR_CODE.resourceUnavailable);
  }

  /** @param database - Locked current owner. @param row - Original native resource tuple. @returns Current SQL eligibility before each key selection. */
  private async scopeIsCurrent(database: RequestDatabase, row: RotationRow): Promise<boolean> {
    return (await database.execute<{ current: boolean }>(sql`select public.messaging_secret_rotation_scope_is_current(${row.secret_ref},${row.tribe_id},${row.connection_id},${row.connection_version},${row.environment},${row.security_epoch},${row.key_id}) as current`)).rows[0].current;
  }

  /** @param database - Original guarded backend transaction. @param state - Original routing facts. @returns Fresh current nonextractable keys only after claimed native resource checks. @throws MessagingProtectionKeyRotationError for topology/recovery changes. */
  private async readCurrentConfig(database: RequestDatabase, state: MessagingProtectionKeyState): Promise<MessagingSecurityConfig> {
    await this.assertState(state, database);
    const config = await this.dependencies.readSecurityConfig();
    if (!messagingProtectionKeyStateMatches(state, projectMessagingProtectionKeyState(config))) throw new MessagingProtectionKeyRotationError(MESSAGING_ERROR_CODE.resourceUnavailable);
    await this.assertState(state, database);
    return config;
  }

  /** @param command - Application-validated batch ceiling with independent SQL enforcement. @returns Confirmed cipher effects and current-scope remaining work, without credentials or key material. @throws MessagingProtectionKeyRotationError preserving a crypto/commit cause and never retrying implicitly. */
  async rotate(command: MessagingProtectionKeyRotationCommand): Promise<MessagingProtectionKeyRotationResult> {
    try {
      await this.assertAuthority();
      const state = await this.dependencies.readKeyState();
      if (!messagingProtectionKeyStateMatches(state, state)) throw new MessagingProtectionKeyRotationError(MESSAGING_ERROR_CODE.resourceUnavailable);
      return await this.dependencies.execute(async (database) => {
        await this.assertState(state, database);
        await this.assertContinuity(database, state);
        const rows = (await database.execute<RotationRow>(sql`select * from public.claim_messaging_secret_key_rotation(${state.environment},${state.securityEpoch},${state.keyrings.credential.activeKeyId},${command.limit})`)).rows;
        const initial = await this.readCurrentConfig(database, state);
        await assertMessagingPrivateMacKeyMaterial(database, initial, MESSAGING_KEY_PURPOSE.operationPayload);
        await assertMessagingPrivateMacKeyMaterial(database, initial, MESSAGING_KEY_PURPOSE.contactFingerprint);
        const rewritten: { envelope: MessagingSecretEnvelope; scope: MessagingSecretContext }[] = [];
        for (const row of rows) {
          await this.assertState(state, database);
          if (!await this.scopeIsCurrent(database, row)) continue;
          const config = await this.readCurrentConfig(database, state);
          const scope = { tribeId: row.tribe_id, connectionId: row.connection_id, connectionVersion: row.connection_version, resourceId: row.secret_ref };
          const cipher = createMessagingSecretCipher(config);
          const plaintext = await cipher.open({ format: row.format, purpose: MESSAGING_KEY_PURPOSE.credential, environment: row.environment, securityEpoch: row.security_epoch, keyId: row.key_id, iv: row.iv, ciphertext: row.ciphertext }, scope);
          if (!await this.scopeIsCurrent(database, row)) continue;
          const envelope = await cipher.seal(plaintext, scope);
          const latest = await this.readCurrentConfig(database, state);
          await createMessagingSecretCipher(latest).open(envelope, scope);
          const changed = (await database.execute<{ changed: boolean }>(sql`select public.rotate_current_messaging_secret_material(${row.secret_ref},${row.tribe_id},${row.connection_id},${row.connection_version},${row.environment},${row.security_epoch},${row.key_id},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)}) as changed`)).rows[0].changed;
          if (changed) rewritten.push({ envelope, scope });
          await this.assertState(state, database);
        }
        const final = await this.readCurrentConfig(database, state);
        await assertMessagingPrivateMacKeyMaterial(database, final, MESSAGING_KEY_PURPOSE.operationPayload);
        await assertMessagingPrivateMacKeyMaterial(database, final, MESSAGING_KEY_PURPOSE.contactFingerprint);
        for (const prepared of rewritten) await createMessagingSecretCipher(final).open(prepared.envelope, prepared.scope);
        await this.assertContinuity(database, state);
        const remaining = (await database.execute<{ credentials: boolean; otp: boolean }>(sql`select
          exists(select 1 from public.messaging_secret_envelopes envelope where envelope.environment=${state.environment} and envelope.security_epoch=${state.securityEpoch} and envelope.key_id<>${state.keyrings.credential.activeKeyId} and envelope.retired_at is null and envelope.purged_at is null and public.messaging_secret_rotation_scope_is_current(envelope.secret_ref,envelope.tribe_id,envelope.connection_id,envelope.connection_version,envelope.environment,envelope.security_epoch,envelope.key_id)) as credentials,
          exists(select 1 from public.verification_code_envelopes envelope join public.contact_verification_challenges challenge on challenge.id=envelope.challenge_id and challenge.tribe_id=envelope.tribe_id join public.message_deliveries delivery on delivery.id=envelope.delivery_id and delivery.tribe_id=envelope.tribe_id where envelope.environment=${state.environment} and envelope.security_epoch=${state.securityEpoch} and envelope.key_id<>${state.keyrings.otp_envelope.activeKeyId} and envelope.expires_at>clock_timestamp() and challenge.state=${VERIFICATION_CHALLENGE_STATE.issued} and challenge.is_current and challenge.invalidated_at is null and challenge.code_envelope_id=envelope.id and delivery.state not in (${MESSAGE_DELIVERY_STATE.accepted},${MESSAGE_DELIVERY_STATE.delivered},${MESSAGE_DELIVERY_STATE.cancelled})) as otp`)).rows[0];
        await this.assertState(state, database);
        return { rotatedCredentials: rewritten.length, remainingCredentials: remaining.credentials, pendingOtpMaterial: remaining.otp };
      });
    } catch (error) {
      if (error instanceof MessagingProtectionKeyRotationError) throw error;
      throw new MessagingProtectionKeyRotationError(error instanceof MessagingCryptographyError ? MESSAGING_ERROR_CODE.resourceUnavailable : MESSAGING_ERROR_CODE.operationUnresolved, { cause: error });
    }
  }
}
