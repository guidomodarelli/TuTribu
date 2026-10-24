/** Projects admission-derived basic membership; SQL owns consumption, retirement and deferred timing. */
import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn, PgTableExtraConfig } from "drizzle-orm/pg-core";

/** Existing parents are injected by the shared composition root. */
type AdmissionMembershipSchemaParents = {
  tribes: {id:AnyPgColumn}; users: {id:AnyPgColumn};
  members: {id:AnyPgColumn;tribeId:AnyPgColumn;userId:AnyPgColumn};
  decisions: {id:AnyPgColumn;requestId:AnyPgColumn;tribeId:AnyPgColumn;userId:AnyPgColumn;outcome:AnyPgColumn};
};

/**
 * Builds the private table used to consume one decision for one member instance.
 * @param parents - Composed tribe/account/member/decision columns, without reading rows.
 * @returns The table projection; runtime authority remains with its own writers.
 */
export function createAdmissionMembershipEffectsSchema(parents: AdmissionMembershipSchemaParents) {
  return pgTable("academy_admission_membership_effects",{
    id:uuid("id").defaultRandom().primaryKey(),
    decisionId:uuid("decision_id").notNull(),
    requestId:uuid("request_id").notNull(),
    tribeId:uuid("tribe_id").notNull(),
    userId:text("user_id"),
    accountReferenceId:uuid("account_reference_id").notNull().defaultRandom(),
    minimizedAt:timestamp("minimized_at",{withTimezone:true}),
    memberId:uuid("member_id"),
    outcome:text("outcome").notNull().default("approved"),
    targetStatus:text("target_status").notNull(),
    createdAt:timestamp("created_at",{withTimezone:true}).notNull().default(sql`clock_timestamp()`),
    appliedAt:timestamp("applied_at",{withTimezone:true}),
    revokedAt:timestamp("revoked_at",{withTimezone:true}),
    revocationReason:text("revocation_reason"),
  },(table):PgTableExtraConfig=>({
    decisionKey:unique("academy_admission_membership_effects_decision_id_key").on(table.decisionId),
    requestKey:unique("academy_admission_membership_effects_request_id_key").on(table.requestId),
    tribeForeignKey:foreignKey({name:"academy_admission_membership_effects_tribe_id_fkey",columns:[table.tribeId],foreignColumns:[parents.tribes.id]}),
    userForeignKey:foreignKey({name:"academy_admission_membership_effects_user_id_fkey",columns:[table.userId],foreignColumns:[parents.users.id]}).onDelete("set null"),
    memberForeignKey:foreignKey({name:"academy_admission_membership_effects_member_id_fkey",columns:[table.memberId],foreignColumns:[parents.members.id]}).onDelete("set null"),
    outcomeCheck:check("admission_membership_effect_outcome_check",sql`${table.outcome}='approved'`),
    targetCheck:check("admission_membership_effect_target_check",sql`${table.targetStatus} in ('active','muted')`),
    scopeKey:unique("admission_membership_effect_scope_key").on(table.id,table.tribeId,table.userId,table.memberId),
    decisionScopeKey:unique("admission_membership_effect_decision_scope_key").on(table.id,table.decisionId,table.requestId,table.tribeId,table.userId,table.outcome),
    decisionForeignKey:foreignKey({name:"admission_membership_effect_decision_fkey",columns:[table.decisionId,table.requestId,table.tribeId,table.userId,table.outcome],foreignColumns:[parents.decisions.id,parents.decisions.requestId,parents.decisions.tribeId,parents.decisions.userId,parents.decisions.outcome]}),
    memberScopeForeignKey:foreignKey({name:"admission_membership_effect_member_scope_fkey",columns:[table.memberId,table.tribeId,table.userId],foreignColumns:[parents.members.id,parents.members.tribeId,parents.members.userId]}),
    revocationCheck:check("admission_membership_effect_revocation_check",sql`(${table.revokedAt} is null)=(${table.revocationReason} is null)`),
    timeCheck:check("admission_membership_effect_time_check",sql`(${table.appliedAt} is null or ${table.appliedAt}>=${table.createdAt}) and (${table.revokedAt} is null or (${table.appliedAt} is not null and ${table.revokedAt}>=${table.appliedAt}))`),
    minimizationCheck:check("admission_membership_effect_minimization_check",sql`(${table.minimizedAt} is null and ${table.userId} is not null) or (${table.minimizedAt} is not null and ${table.userId} is null and ${table.memberId} is null and ${table.minimizedAt}>=${table.createdAt} and (${table.appliedAt} is null or ${table.revokedAt} is not null))`),
    activeIndex:index("admission_membership_effect_active_idx").on(table.tribeId,table.userId).where(sql`${table.appliedAt} is not null and ${table.revokedAt} is null`),
  })).enableRLS();
}
