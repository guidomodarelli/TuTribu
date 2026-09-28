/**
 * SQL building blocks of academy access shared with other modules through the
 * composition root (verification decisions and verified payments write audit
 * events and grants inside their own transactions, so the effects are atomic).
 *
 * @module academy-access-sql
 */

import { sql } from "drizzle-orm";

import {
  ENROLLMENT_ACTIVATION_ORIGIN,
  PRODUCT_KEY,
  type AccessGrantSourceType,
} from "@/src/modules/product-access/constants/product-access";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

export type AcademyAuditEvent = {
  action: string;
  actorUserId: string | null;
  correlationId: string | null;
  entityId: string;
  entityType: string;
  fromState: string | null;
  reason: string | null;
  subjectUserId: string | null;
  toState: string | null;
  tribeId: string;
};

/**
 * Appends one audit event. It stores ids and transitions, never emails,
 * private links or financial data.
 *
 * @param database - Transaction-scoped database.
 * @param event - Audit event.
 */
export async function recordAcademyAuditEvent(
  database: RequestDatabase,
  event: AcademyAuditEvent
): Promise<void> {
  await database.execute(sql`
    insert into public.academy_audit_events (
      tribe_id,
      actor_user_id,
      subject_user_id,
      action,
      entity_type,
      entity_id,
      from_state,
      to_state,
      reason,
      correlation_id
    )
    values (
      ${event.tribeId},
      ${event.actorUserId},
      ${event.subjectUserId},
      ${event.action},
      ${event.entityType},
      ${event.entityId},
      ${event.fromState},
      ${event.toState},
      ${event.reason},
      ${event.correlationId}
    )
  `);
}

export type AcademyGrantInsert = {
  createdBy: string | null;
  endsAt: Date;
  sourceKey: string;
  sourceType: AccessGrantSourceType;
  /** Null means the database clock at insert time. */
  startsAt: Date | null;
  tribeId: string;
  userId: string;
};

export type AcademyGrantInsertResult = {
  grantId: string;
  inserted: boolean;
};

/**
 * Inserts a grant keyed by its business source (idempotent) and records the
 * first academy activation (drip origin) when this is the member's first
 * effective grant. Neither a renewal, a second bonus nor a re-entry resets
 * `first_activated_at`.
 *
 * @param database - Transaction-scoped database.
 * @param grant - Grant to insert.
 * @returns The grant id and whether this call inserted it.
 */
export async function insertAcademyGrantWithEnrollment(
  database: RequestDatabase,
  grant: AcademyGrantInsert
): Promise<AcademyGrantInsertResult> {
  const result = await database.execute(sql`
    with inserted_grant as (
      insert into public.member_access_grants (
        tribe_id,
        user_id,
        product_key,
        source_type,
        source_key,
        starts_at,
        ends_at,
        created_by
      )
      values (
        ${grant.tribeId},
        ${grant.userId},
        ${PRODUCT_KEY.academy},
        ${grant.sourceType},
        ${grant.sourceKey},
        coalesce(${grant.startsAt}::timestamptz, now()),
        ${grant.endsAt},
        ${grant.createdBy}
      )
      on conflict (tribe_id, product_key, source_type, source_key) do nothing
      returning id, starts_at, ends_at
    ),
    enrollment as (
      insert into public.member_product_enrollments (
        tribe_id,
        user_id,
        product_key,
        first_activated_at,
        activation_origin
      )
      select
        ${grant.tribeId},
        ${grant.userId},
        ${PRODUCT_KEY.academy},
        -- The real activation moment: a grant only activates once it covers now.
        greatest(inserted_grant.starts_at, now()),
        ${ENROLLMENT_ACTIVATION_ORIGIN.firstGrant}
      from inserted_grant
      where inserted_grant.ends_at > now()
      on conflict (tribe_id, user_id, product_key) do nothing
      returning 1
    )
    select
      (select id from inserted_grant) as grant_id,
      (select count(*) from enrollment) as enrollment_count
  `);
  const insertedRow = (result.rows?.[0] ?? null) as { grant_id: string | null } | null;

  if (insertedRow?.grant_id) {
    return { grantId: insertedRow.grant_id, inserted: true };
  }

  // The source already existed (possibly committed by a concurrent writer
  // while the insert waited): a new statement sees it with a fresh snapshot.
  const existingResult = await database.execute(sql`
    select member_access_grants.id as grant_id
    from public.member_access_grants
    where member_access_grants.tribe_id = ${grant.tribeId}
      and member_access_grants.product_key = ${PRODUCT_KEY.academy}
      and member_access_grants.source_type = ${grant.sourceType}
      and member_access_grants.source_key = ${grant.sourceKey}
    limit 1
  `);
  const row = (existingResult.rows?.[0] ?? null) as { grant_id: string | null } | null;

  if (!row?.grant_id) {
    throw new Error("insertAcademyGrantWithEnrollment failed: grant row not resolved", {
      cause: { sourceType: grant.sourceType, tribeId: grant.tribeId },
    });
  }

  return { grantId: row.grant_id, inserted: false };
}
