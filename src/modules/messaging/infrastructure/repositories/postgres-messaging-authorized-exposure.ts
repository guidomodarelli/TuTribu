/** Appends fixed scope facts after native authorization and own projection/decryption, without copied contents. @module postgres-messaging-authorized-exposure */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecretAccessContext, AuthorizedMessagingContext, MessagingSecurityFacts } from "../../domain/repositories/messaging-repositories";
import type { MessagingResourceExposure, MessagingResourceExposureRecorder } from "../../domain/repositories/messaging-resource-exposure";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { MessagingPlatformSecurityError } from "../../domain/errors/messaging-platform-security-error";
import { PLATFORM_SECURITY_REQUIREMENT } from "@/src/modules/shared/constants/platform-security";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "../../constants/messaging-connection";
import { MESSAGING_AUTHORIZED_EXPOSURE } from "../../constants/messaging-authorized-exposure";
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "@/src/modules/academy-admissions/constants/admission-audit";
import { ADMISSION_ACTIVITY_EXPOSURE } from "@/src/modules/academy-admissions/constants/admission-activity";
import { createAdmissionResourceAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import { PostgresAdmissionAuditRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-audit-repository";
import { authorizeMessagingSecret, messagingSecretLifetimeFailure, messagingSecretLifetimeIsCurrent } from "./postgres-messaging-secret-authorizer";

/** Own fixed extent, never a raw provider page, token, envelope or credential. */
type AuthorizedExposureDetails = { surface: "connection_resources" | "operational_secret"; resourceKind: "senders" | "templates" | "credential"; itemCount: number };
/** @param database - Original owner transaction after native authorization. @param context - Actual resource version and purpose. @param details - Fixed selected extent. @returns After staging the fact at the SQL clock; no ledger is fabricated for the read. */
export async function appendMessagingAuthorizedExposure(database: RequestDatabase, context: MessagingSecretAccessContext, details: AuthorizedExposureDetails): Promise<void> {
  const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
  await new PostgresAdmissionAuditRepository(database).append(createAdmissionResourceAuditEvent({
    tribeId: context.tribeId, actorUserId: context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader ? context.actorUserId : null,
    operationId: null, resourceType: ADMISSION_AUDIT_RESOURCE_TYPE.exposure, resourceId: context.connectionId, resourceVersion: context.connectionVersion,
    eventType: ADMISSION_ACTIVITY_EXPOSURE.event, rule: context.operation, cause: null, createdAt: now, metadata: details,
  }));
}

/** Rechecks native scope and current external security state without another decryption or provider request. */
export class PostgresMessagingResourceExposureRecorder implements MessagingResourceExposureRecorder {
  /** @param execute - Native exact-account owner transaction. @param readSecurityFacts - Live hosting state without using any provider material. */
  constructor(private readonly execute: <Value>(context: AuthorizedMessagingContext, run: (database: RequestDatabase) => Promise<Value>) => Promise<Value>, private readonly readSecurityFacts: () => Promise<MessagingSecurityFacts>) {}
  /** @param context - Original account/session/resource scope. @param exposure - Guarded own page extent. @returns After the actual read fact commits and all current constraints remain valid. */
  record(context: AuthorizedMessagingContext, exposure: MessagingResourceExposure): Promise<void> {
    return this.execute(context, async (database) => {
      const authorization = await authorizeMessagingSecret(database, context);
      const requireCurrent = async () => {
        const facts = await this.readSecurityFacts();
        if (facts.recoveryLocked) throw new MessagingPlatformSecurityError(PLATFORM_SECURITY_REQUIREMENT.recoveryLocked);
        if (facts.environment !== context.environment || facts.securityEpoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
        const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        if (!messagingSecretLifetimeIsCurrent(authorization, now)) throw new MessagingSecretAccessError(messagingSecretLifetimeFailure(authorization, now));
      };
      await requireCurrent();
      await appendMessagingAuthorizedExposure(database, context, { surface: MESSAGING_AUTHORIZED_EXPOSURE.resources, resourceKind: exposure.kind, itemCount: exposure.itemCount });
      await requireCurrent();
    });
  }
}
