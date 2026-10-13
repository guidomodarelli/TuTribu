/** Stages fixed audit facts with their original ledger instead of copying mutation payloads. @module postgres-admission-audit-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionAuditEvent } from "../../domain/entities/admission-audit-event";
import type { AdmissionAuditRepository } from "../../domain/repositories/admission-audit-repository";

/** Uses the already authorized owner's transaction and retains its rollback/commit boundary. */
export class PostgresAdmissionAuditRepository implements AdmissionAuditRepository {
  /** @param database - Original business transaction after the owner's current authorization and locks. */
  constructor(private readonly database: RequestDatabase) {}

  /** @param event - Owner-generated event with explicit metadata. @returns After staging; commit belongs to the original writer. */
  async append(event: AdmissionAuditEvent): Promise<void> {
    await this.database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,cause,resource_version,metadata,created_at) values (${event.tribeId},${event.actorUserId},${event.resourceType},${event.resourceId},${event.operationId},${event.eventType},${event.rule},${event.cause},${event.resourceVersion},${JSON.stringify(event.metadata)}::jsonb,${event.createdAt})`);
  }
}
