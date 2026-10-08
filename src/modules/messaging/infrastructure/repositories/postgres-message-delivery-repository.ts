/** Commits queue claims, attempt markers and receipts through the existing guarded executor. @module postgres-message-delivery-repository */
import "server-only";
import { purgeVerificationMaterial } from "./postgres-verification-material-maintenance";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessageDeliveryRepository, ClaimedMessageDelivery, MessageDeliveryAuthorization, MessageDeliveryReceipt, MessageDeliveryCompletion,FocalDeliveryDispatchScope } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessageDeliveryAttempt } from "@/src/modules/messaging/domain/entities/message-delivery-attempt";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingDeliveryStorageError } from "@/src/modules/messaging/domain/errors/messaging-delivery-storage-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_SECRET_DELIVERY_SCOPE } from "@/src/modules/messaging/constants/messaging-secret-access";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_AUTHORIZATION_OUTCOME, MESSAGE_COMPLETION_OUTCOME, MESSAGE_STORAGE_OPERATION } from "@/src/modules/messaging/constants/message-delivery";
import {ADMISSION_VERIFICATION_PURPOSE} from "@/src/modules/academy-admissions/constants/admission-eligibility";

/** Each call owns a short guarded transaction; RPC and secret reads happen after it returns. */
type DeliveryDatabaseExecutor = <Result>(actorUserId: string | null, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Platform authority must not take shared tribe/policy locks before the SQL primitives take exclusive locks. */
type DeliveryMaintenanceAuthorizer = (database: RequestDatabase, operation: (typeof MESSAGE_STORAGE_OPERATION)[keyof typeof MESSAGE_STORAGE_OPERATION]) => Promise<boolean>;
/** Only consumed persisted fields are projected; PostgreSQL rows are never schema-validated. */
type AttemptRow = { id: string; delivery_id: string; tribe_id: string; connection_id: string; connection_version: number; sequence: number; reservation_id: string; lease_token: string; send_authorized_at: string | Date; authorized_usage_policy_version: number; recipient_country: string | null; state: MessageDeliveryAttempt["state"]; completed_at: string | Date | null; correlation_id: string | null; provider_message_id: string | null; safe_reason: string | null; version: number };

/** Owns DB-only transitions and never retries a lost marker or a pool acquisition. */
export class PostgresMessageDeliveryRepository implements MessageDeliveryRepository {
  /**
   * @param execute - Existing guarded maintenance/contributing-actor executor, never a nested checkout.
   * @param authorizeMaintenance - Mandatory current backend-purpose/bearer authority, without domain row locks.
   * @param readSecurityConfig - Local external epoch/recovery snapshot, without RPC under locks.
   */
  constructor(private readonly execute: DeliveryDatabaseExecutor, private readonly authorizeMaintenance: DeliveryMaintenanceAuthorizer, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>,private readonly focalScope?:Readonly<FocalDeliveryDispatchScope>) {}

  /** @param context - Claimed or marked own identity. @param operation - Exact server action. @returns Nothing for a matching focal launch or a global backend worker. @throws Closed denial before crossing another request's queue scope. */
  private assertDispatchScope(context:FocalDeliveryDispatchScope|ClaimedMessageDelivery|AuthorizedDeliveryMessagingContext,operation:(typeof MESSAGE_STORAGE_OPERATION)[keyof typeof MESSAGE_STORAGE_OPERATION]):void{
    if(this.focalScope&&(context.deliveryId!==this.focalScope.deliveryId||context.tribeId!==this.focalScope.tribeId||context.contributingLeaderUserId!==this.focalScope.contributingLeaderUserId||"connectionId"in context&&(context.connectionId!==this.focalScope.connectionId||context.connectionVersion!==this.focalScope.connectionVersion)))throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.permissionDenied,{operation});
  }

  /** @param database - Current transaction. @param operation - Fixed server-owned action. @returns Nothing while platform authority remains valid. */
  private async authorizeMaintenanceAction(database: RequestDatabase, operation: (typeof MESSAGE_STORAGE_OPERATION)[keyof typeof MESSAGE_STORAGE_OPERATION]): Promise<void> {
    if (!await this.authorizeMaintenance(database, operation)) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.permissionDenied, { operation });
  }

  /** @param command - Backend-owned lease and bounded batch values. @returns The exact purpose-specific private claim or global maintenance claim, without broadening a focal launch. */
  private claimQuery(command:{leaseToken:string;limit:number;leaseSeconds:number}){
    const scope=this.focalScope;
    if(!scope)return sql`public.claim_messaging_deliveries_fairly(${command.leaseToken},${command.limit},${command.leaseSeconds})`;
    if("purpose"in scope&&scope.purpose===ADMISSION_VERIFICATION_PURPOSE.admission)return sql`public.claim_scoped_messaging_admission(${scope.deliveryId},${scope.tribeId},${scope.contributingLeaderUserId},${scope.applicantUserId},${scope.challengeId},${scope.connectionId},${scope.connectionVersion},${command.leaseToken},${command.leaseSeconds})`;
    return sql`public.claim_scoped_messaging_diagnostic(${scope.deliveryId},${scope.tribeId},${scope.contributingLeaderUserId},${scope.connectionId},${scope.connectionVersion},${command.leaseToken},${command.leaseSeconds})`;
  }

  /** @param command - Original bounded lease request. @returns Committed fair claims with no credential material. */
  async claim(command: { leaseToken: string; limit: number; leaseSeconds: number }): Promise<ClaimedMessageDelivery[]> {
    try {
      return await this.execute(this.focalScope?.contributingLeaderUserId??null, async (database) => {
        await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.claim);
        const claims=this.claimQuery(command);
        const rows = (await database.execute<{ delivery_id: string; delivery_version: number; tribe_id: string; contributed_by_user_id: string | null }>(sql`select claim.delivery_id,claim.delivery_version,delivery.tribe_id,connection.contributed_by_user_id from ${claims} claim join public.message_deliveries delivery on delivery.id=claim.delivery_id join public.tenant_messaging_connections connection on connection.id=delivery.connection_id and connection.tribe_id=delivery.tribe_id`)).rows;
        await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.claim);
        return rows.map((row) => ({ deliveryId: row.delivery_id, tribeId: row.tribe_id, version: row.delivery_version, leaseToken: command.leaseToken, contributingLeaderUserId: row.contributed_by_user_id }));
      });
    } catch (error) {
      if (error instanceof MessagingDeliveryStorageError) throw error;
      throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation: MESSAGE_STORAGE_OPERATION.claim, cause: error });
    }
  }

  /**
   * Persists marker and reservation before returning an original worker context.
   * @param claim - Original confirmed private lease, never an authority token from the browser.
   * @param requestId - Server correlation identity for this dispatch.
   * @returns A committed marker or a closed queue outcome; a lost commit never grants RPC.
   * @throws MessagingDeliveryStorageError on indeterminate persistence, with no automatic marker retry.
   */
  async authorize(claim: ClaimedMessageDelivery, requestId: string): Promise<MessageDeliveryAuthorization> {
    this.assertDispatchScope(claim,MESSAGE_STORAGE_OPERATION.authorize);
    try {
      return await this.execute(claim.contributingLeaderUserId, async (database) => {
        await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.authorize);
        const configuration = await this.readSecurityConfig();
        if (configuration.recoveryLocked) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.connectionIncomplete, { operation: MESSAGE_STORAGE_OPERATION.authorize, deliveryId: claim.deliveryId });
        const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
        if (actor !== claim.contributingLeaderUserId) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.permissionDenied, { operation: MESSAGE_STORAGE_OPERATION.authorize, deliveryId: claim.deliveryId });
        const owned = (await database.execute(sql`select id from public.message_deliveries where id=${claim.deliveryId} and tribe_id=${claim.tribeId}`)).rows[0];
        if (!owned) return { outcome: MESSAGE_AUTHORIZATION_OUTCOME.stale, deliveryId: claim.deliveryId, deliveryVersion: null };
        const marker = (await database.execute<{ outcome: MessageDeliveryAuthorization["outcome"]; attempt_id: string | null; delivery_version: number | null }>(sql`select * from public.authorize_messaging_delivery_attempt(${claim.deliveryId},${claim.leaseToken},${claim.version},${configuration.environment},${configuration.securityEpoch})`)).rows[0];
        await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.authorize);
        const afterMarker = await this.readSecurityConfig();
        if (afterMarker.recoveryLocked || afterMarker.environment !== configuration.environment || afterMarker.securityEpoch !== configuration.securityEpoch) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.connectionIncomplete, { operation: MESSAGE_STORAGE_OPERATION.authorize, deliveryId: claim.deliveryId });
        if (marker.outcome !== MESSAGE_AUTHORIZATION_OUTCOME.authorized) return { outcome: marker.outcome, deliveryId: claim.deliveryId, deliveryVersion: marker.delivery_version };
        const row = (await database.execute<{ connection_id: string; connection_version: number; environment: string; security_epoch: string; contributed_by_user_id: string | null; secret_ref: string | null; send_authorized_at: string | Date; authorized_usage_policy_version: number; attempt_version: number; lease_until: string | Date }>(sql`select delivery.connection_id,delivery.connection_version,delivery.environment,delivery.security_epoch,connection.contributed_by_user_id,resource.secret_ref,attempt.send_authorized_at,attempt.authorized_usage_policy_version,attempt.version as attempt_version,delivery.lease_until from public.message_deliveries delivery join public.tenant_messaging_connections connection on connection.id=delivery.connection_id and connection.tribe_id=delivery.tribe_id join public.messaging_connection_versions resource on resource.connection_id=delivery.connection_id and resource.tribe_id=delivery.tribe_id and resource.version=delivery.connection_version join public.message_delivery_attempts attempt on attempt.id=${marker.attempt_id} and attempt.delivery_id=delivery.id where delivery.id=${claim.deliveryId}`)).rows[0];
        if (!row || row.contributed_by_user_id !== actor || !row.secret_ref) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.connectionIncomplete, { operation: MESSAGE_STORAGE_OPERATION.authorize, deliveryId: claim.deliveryId });
        this.assertDispatchScope({...claim,connectionId:row.connection_id,connectionVersion:row.connection_version},MESSAGE_STORAGE_OPERATION.authorize);
        await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.authorize);
        const latest = await this.readSecurityConfig();
        const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        if (latest.recoveryLocked || latest.environment !== configuration.environment || latest.securityEpoch !== configuration.securityEpoch || new Date(row.lease_until) <= now) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.connectionIncomplete, { operation: MESSAGE_STORAGE_OPERATION.authorize, deliveryId: claim.deliveryId });
        return { outcome: MESSAGE_AUTHORIZATION_OUTCOME.authorized, deliveryVersion: marker.delivery_version!, context: { authorizationPurpose: MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery, contributingLeaderUserId: actor!, tribeId: claim.tribeId, connectionId: row.connection_id, connectionVersion: row.connection_version, environment: row.environment, securityEpoch: row.security_epoch, secretRef: row.secret_ref, requestId, operation: MESSAGING_SECRET_DELIVERY_SCOPE.operation, deliveryId: claim.deliveryId, attemptId: marker.attempt_id!, attemptVersion: row.attempt_version, leaseToken: claim.leaseToken, sendAuthorizedAt: new Date(row.send_authorized_at), authorizedUsagePolicyVersion: row.authorized_usage_policy_version } };
      });
    } catch (error) {
      if (error instanceof MessagingDeliveryStorageError) throw error;
      throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation: MESSAGE_STORAGE_OPERATION.authorize, deliveryId: claim.deliveryId, cause: error });
    }
  }

  /** @param context - Exact original attempt scope. @returns Current private receipt without authorizing another send. */
  async readAttempt(context: AuthorizedDeliveryMessagingContext): Promise<MessageDeliveryAttempt | null> {
    this.assertDispatchScope(context,MESSAGE_STORAGE_OPERATION.read);
    return this.execute(context.contributingLeaderUserId, async (database) => {
      await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.read);
      const row = (await database.execute<AttemptRow>(sql`select * from public.message_delivery_attempts where id=${context.attemptId} and delivery_id=${context.deliveryId} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and lease_token=${context.leaseToken}`)).rows[0];
      await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.read);
      return row ? { id: row.id, deliveryId: row.delivery_id, tribeId: row.tribe_id, connectionId: row.connection_id, connectionVersion: row.connection_version, sequence: row.sequence, reservationId: row.reservation_id, leaseToken: row.lease_token, sendAuthorizedAt: new Date(row.send_authorized_at), authorizedUsagePolicyVersion: row.authorized_usage_policy_version, recipientCountry: row.recipient_country, state: row.state, completedAt: row.completed_at ? new Date(row.completed_at) : null, correlationId: row.correlation_id, providerMessageId: row.provider_message_id, safeReason: row.safe_reason, version: row.version } : null;
    });
  }

  /** @param receipt - Original attempt evidence. @returns Confirmed historical receipt, without checking current secret availability. */
  async complete(receipt: MessageDeliveryReceipt): Promise<MessageDeliveryCompletion> {
    const context = receipt.context;
    this.assertDispatchScope(context,MESSAGE_STORAGE_OPERATION.complete);
    try {
      return await this.execute(context.contributingLeaderUserId, async (database) => {
        await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.complete);
        const current = (await database.execute<{ version: number; state: MessageDeliveryAttempt["state"] }>(sql`select version,state from public.message_delivery_attempts where id=${context.attemptId} and delivery_id=${context.deliveryId} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and lease_token=${context.leaseToken}`)).rows[0];
        if (!current) return { outcome: MESSAGE_COMPLETION_OUTCOME.stale, attemptVersion: null, deliveryVersion: null };
        // Late evidence may confirm the same unknown marker after lease reconciliation advanced its version.
        const expectedVersion = current.state !== MESSAGE_ATTEMPT_STATE.inFlight ? current.version : context.attemptVersion;
        const result = (await database.execute<{ outcome: MessageDeliveryCompletion["outcome"]; attempt_version: number | null; delivery_version: number | null }>(sql`select * from public.complete_messaging_delivery_attempt(${context.attemptId},${context.leaseToken},${expectedVersion},${receipt.outcome},${receipt.providerMessageId},${receipt.correlationId},${receipt.reason})`)).rows[0];
        if (result.outcome !== MESSAGE_COMPLETION_OUTCOME.stale && receipt.outcome !== MESSAGE_ATTEMPT_STATE.unknown) {
          await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.purgeVerificationMaterial);
          await purgeVerificationMaterial(database, { limit: 1, deliveryId: context.deliveryId });
          await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.purgeVerificationMaterial);
        }
        await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.complete);
        return { outcome: result.outcome, attemptVersion: result.attempt_version, deliveryVersion: result.delivery_version };
      });
    } catch (error) {
      if (error instanceof MessagingDeliveryStorageError) throw error;
      throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation: MESSAGE_STORAGE_OPERATION.complete, deliveryId: context.deliveryId, attemptId: context.attemptId, cause: error });
    }
  }

  /** @param limit - Bounded expired-lease batch. @returns Confirmed transitions with possible sends remaining charged. */
  async reconcileExpiredLeases(limit: number): Promise<number> {
    if(this.focalScope)throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.permissionDenied,{operation:MESSAGE_STORAGE_OPERATION.reconcile});
    return this.execute(null, async (database) => {
      await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.reconcile);
      const result = (await database.execute<{ total: number }>(sql`select public.reconcile_expired_messaging_leases(${limit}) as total`)).rows[0].total;
      await this.authorizeMaintenanceAction(database, MESSAGE_STORAGE_OPERATION.reconcile);
      return result;
    });
  }
}
