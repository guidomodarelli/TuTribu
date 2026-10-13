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
    await this.appendMany([event]);
  }

  /**
   * Stages an owner-derived collection with one parameterized SQL statement in the existing transaction.
   * @param events - Fixed private facts selected by their domain constructors; an empty collection has no effect.
   * @returns After staging all rows; authorization, rollback and commit remain with the original owner.
   */
  async appendMany(events: readonly AdmissionAuditEvent[]): Promise<void> {
    if(events.length===0)return;
    const rows=events.map((event)=>({tribe_id:event.tribeId,actor_user_id:event.actorUserId,resource_type:event.resourceType,resource_id:event.resourceId,operation_id:event.operationId,event_type:event.eventType,rule:event.rule,cause:event.cause,resource_version:event.resourceVersion,metadata:event.metadata,created_at:event.createdAt}));
    await this.database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,cause,resource_version,metadata,created_at) select event.tribe_id,event.actor_user_id,event.resource_type,event.resource_id,event.operation_id,event.event_type,event.rule,event.cause,event.resource_version,event.metadata,event.created_at from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as event(tribe_id uuid,actor_user_id text,resource_type text,resource_id uuid,operation_id uuid,event_type text,rule text,cause text,resource_version integer,metadata jsonb,created_at timestamptz)`);
  }
}
