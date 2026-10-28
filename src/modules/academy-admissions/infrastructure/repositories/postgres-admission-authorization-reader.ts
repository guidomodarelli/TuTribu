/** Resolves current session and tenant ownership through an existing guarded transaction. */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionAuthorizationReader, AdmissionAuthorizationResource, AdmissionResourceIdentity } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import { canPerformAdmissionAction, type AdmissionAction, type AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { ADMISSION_DECISION_ACTIONS, ADMISSION_OWN_REQUEST_ACTIONS, ADMISSION_RESOURCE_KIND } from "@/src/modules/academy-admissions/constants/admission-authorization";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { ACADEMY_ADMISSION_APPLICANT_LOCK_DOMAIN } from "@/src/modules/tribes/constants/academy-membership";

/** Consumes only current owned actor fields; the fixed tribe remains with the caller. */
type CurrentActorRow = { actor: Pick<AdmissionActorFacts, "userId" | "role" | "status"> | null };
/** Distinguishes absent scope from unavailable current authentication without granting permission. */
export type AdmissionSubmissionActorContext = { scopeLocked: boolean; actor: AdmissionActorFacts | null };

/** A caller binds the actual server session and fixed action, never a browser role. */
export class PostgresAdmissionAuthorizationReader implements AdmissionAuthorizationReader {
  /**
   * @param database - Existing guarded request/owner transaction, beginning with the shared tribe lock order.
   * @param sessionId - Actual private session identity resolved by auth.
   * @param action - Fixed action selected by the server use case.
   */
  constructor(private readonly database: RequestDatabase, private readonly sessionId: string, private readonly action: AdmissionAction) {}

  /** Samples current SQL session validity after all preceding resource waits. */
  private async sessionRemainsLive(userId: string): Promise<boolean> {
    return Boolean((await this.database.execute(sql`select id from public.session where id=${this.sessionId} and "userId"=${userId} and "expiresAt">clock_timestamp()`)).rows[0]);
  }

  /**
   * Locks current tenant/session/member facts without using historical tribe ownership.
   * @param tribeId - Exact tenant scope.
   * @param userId - Actual account identity; must equal PostgreSQL's current application actor.
   * @returns Current membership or null fields for an authenticated nonmember; null for unavailable scope/session.
   */
  async getCurrentActor(tribeId: string, userId: string): Promise<AdmissionActorFacts | null> {
    return this.readCurrentActor(tribeId, userId, false);
  }

  /**
   * Retains the writer's account lock before resolving current session and membership facts in one query.
   * @param tribeId - Exact tenant whose outer admission fence is already held by the writer.
   * @param userId - Actual native account, never a client-selected beneficiary.
   * @returns Current actor facts after the account lock, or null for an absent account or expired session.
   */
  async getCurrentActorWithLockedAccount(tribeId: string, userId: string): Promise<AdmissionActorFacts | null> {
    return this.readCurrentActor(tribeId, userId, true);
  }

  /**
   * Retains the original tenant/applicant fence before account and current session/member facts.
   * @param tribeId - Fixed submission academy selected by the server.
   * @param userId - Expected native applicant, still checked independently by the ledger.
   * @returns Scope availability and the current actor after all ordered waits, in one round trip.
   */
  async getCurrentActorWithSubmissionScope(tribeId: string, userId: string): Promise<AdmissionSubmissionActorContext> {
    const current = (await this.database.execute<CurrentActorRow & { scope_locked: boolean }>(sql`select scope_locked,actor from public.read_locked_admission_submission_actor(${tribeId},${userId},${this.sessionId},${ACADEMY_ADMISSION_APPLICANT_LOCK_DOMAIN})`)).rows[0];
    const actor = current?.actor;
    return { scopeLocked: current?.scope_locked ?? false, actor: actor?.userId === userId ? { userId: actor.userId, tribeId, role: actor.role, status: actor.status } : null };
  }

  /**
   * Keeps the optional account fence inside the same statement without caching authorization facts.
   * @param tribeId - Exact authorized tenant scope.
   * @param userId - Expected native actor, checked before any account or context locks.
   * @param lockAccount - Whether this writer also requires its original account SHARE lock.
   * @returns Only the current native actor projection after all required waits.
   */
  private async readCurrentActor(tribeId: string, userId: string, lockAccount: boolean): Promise<AdmissionActorFacts | null> {
    const accountFence = lockAccount ? sql`with locked_account as materialized (
      select id from public."user" where id=${userId} and public.current_app_user_id()=${userId} for share
    )` : sql``;
    const accountGuard = lockAccount ? sql`and locked_account.id=${userId}` : sql``;
    const accountSource = lockAccount ? sql`from locked_account` : sql``;
    // CASE rejects a foreign/missing native actor before invoking the locking projection.
    // Its account dependency precedes the VOLATILE helper, which checks final expiry after waits.
    const current = (await this.database.execute<CurrentActorRow>(sql`${accountFence} select case when public.current_app_user_id()=${userId} ${accountGuard} then (
      select jsonb_build_object('userId',current_actor.user_id,'role',current_actor.role,'status',current_actor.status)
      from public.read_admission_reviewer_context(${tribeId},${this.sessionId}) current_actor
    ) else null end as actor ${accountSource}`)).rows[0]?.actor;
    return current?.userId === userId ? { userId: current.userId, tribeId, role: current.role, status: current.status } : null;
  }

  /**
   * Reads only fixed resource families after current scoped authority; owned requests need no membership.
   * @param tribeId - Current authorized tenant, never inferred from an arbitrary resource id.
   * @param resource - Own resource kind/id, selecting a static query rather than a dynamic table.
   * @returns Minimal ownership or null; no contact, secret, provider metadata or cross-account request detail.
   */
  async getResource(tribeId: string, resource: AdmissionResourceIdentity): Promise<AdmissionAuthorizationResource | null> {
    const userId = (await this.database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if (!userId) return null;
    const actor = await this.getCurrentActor(tribeId, userId);
    if (!actor || this.deniesResource(resource.kind, actor, tribeId)) return null;
    const result = await this.readResourceRow(tribeId, resource, userId);
    if (!await this.sessionRemainsLive(userId)) return null;
    return result ?? null;
  }

  /**
   * @param kind - Requested resource family.
   * @param actor - Current scoped actor.
   * @param tribeId - Current authorized tenant.
   * @returns Whether the fixed action may not read that family: own requests are always readable, decisions need an active reviewer, the rest need the action permission and the family's own action.
   */
  private deniesResource(kind: AdmissionResourceIdentity["kind"], actor: AdmissionActorFacts, tribeId: string): boolean {
    const permission = canPerformAdmissionAction(actor, this.action, { tribeId });
    switch (kind) {
      case ADMISSION_RESOURCE_KIND.request: {
        if (ADMISSION_OWN_REQUEST_ACTIONS.has(this.action)) return false;
        const reviewer = actor.status === TRIBE_MEMBERSHIP_STATUS.active && (actor.role === TRIBE_MEMBER_ROLE.leader || actor.role === TRIBE_MEMBER_ROLE.guardian);
        return !(ADMISSION_DECISION_ACTIONS.has(this.action) ? reviewer : permission);
      }
      case ADMISSION_RESOURCE_KIND.allowlistEntry:
      case ADMISSION_RESOURCE_KIND.allowlistImport:
        return !permission || this.action !== ADMISSION_ACTION.manageAllowlist;
      case ADMISSION_RESOURCE_KIND.personalInvitation:
        return !permission || this.action !== ADMISSION_ACTION.manageInvitations;
      case ADMISSION_RESOURCE_KIND.connection:
        return !permission || (this.action !== ADMISSION_ACTION.manageConnection && this.action !== ADMISSION_ACTION.readConnectionMetadata && this.action !== ADMISSION_ACTION.readConnectionAlert);
      default:
        return false;
    }
  }

  /**
   * @param tribeId - Current authorized tenant.
   * @param resource - Own resource kind/id selecting a static query.
   * @param userId - Current native actor.
   * @returns The locked minimal ownership row, or undefined when absent.
   */
  private async readResourceRow(tribeId: string, resource: AdmissionResourceIdentity, userId: string): Promise<AdmissionAuthorizationResource | undefined> {
    switch (resource.kind) {
      case ADMISSION_RESOURCE_KIND.request: {
        const ownRequest = ADMISSION_OWN_REQUEST_ACTIONS.has(this.action);
        const row = (await this.database.execute<{ id: string; tribe_id: string; user_id: string }>(this.action === ADMISSION_ACTION.readInbox || this.action === ADMISSION_ACTION.readReviewHistory || ADMISSION_DECISION_ACTIONS.has(this.action)
          ? sql`select record->'request'->>'id' as id,record->'request'->>'tribeId' as tribe_id,record->'request'->>'userId' as user_id from public.read_admission_reviews(${tribeId},${this.sessionId},${resource.id},1)`
          : sql`select id,tribe_id,user_id from public.academy_admission_requests where tribe_id=${tribeId} and id=${resource.id} and (${!ownRequest} or user_id=${userId}) for share`)).rows[0];
        return row ? { id: row.id, tribeId: row.tribe_id, applicantUserId: row.user_id } : undefined;
      }
      case ADMISSION_RESOURCE_KIND.allowlistEntry:
        return (await this.database.execute<AdmissionAuthorizationResource>(sql`select id,tribe_id as "tribeId" from public.academy_allowlist_entries where tribe_id=${tribeId} and id=${resource.id} for share`)).rows[0];
      case ADMISSION_RESOURCE_KIND.allowlistImport:
        return (await this.database.execute<AdmissionAuthorizationResource>(sql`select id,tribe_id as "tribeId" from public.academy_allowlist_imports where tribe_id=${tribeId} and id=${resource.id} and actor_user_id=${userId} for share`)).rows[0];
      case ADMISSION_RESOURCE_KIND.personalInvitation:
        return (await this.database.execute<AdmissionAuthorizationResource>(sql`select id,tribe_id as "tribeId" from public.academy_personal_invitations where tribe_id=${tribeId} and id=${resource.id} for share`)).rows[0];
      case ADMISSION_RESOURCE_KIND.connection:
        return (await this.database.execute<AdmissionAuthorizationResource>(sql`select id,tribe_id as "tribeId" from public.tenant_messaging_connections where tribe_id=${tribeId} and id=${resource.id} and (${this.action !== ADMISSION_ACTION.manageConnection} or retired_at is null) for share`)).rows[0];
      default:
        return undefined;
    }
  }
}
