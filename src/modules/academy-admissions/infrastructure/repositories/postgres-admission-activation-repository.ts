/** Reads actual cutover metadata and membership history inside the original leader transaction. @module postgres-admission-activation-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionActivationInventoryReader, AdmissionActivationRuntimeReader, AdmissionActivationPreflightReader } from "../../domain/repositories/admission-activation-preflight-reader";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import { evaluateAdmissionActivationPreflight, type AdmissionActivationInventory } from "../../domain/policies/admission-activation-preflight";
import { ADMISSION_PREFLIGHT_STORAGE_TRIGGERS, ADMISSION_PREFLIGHT_INGRESS_TRIGGERS, ADMISSION_PREFLIGHT_ENABLED_TRIGGER_MODES, ADMISSION_PREFLIGHT_STORAGE_CONSTRAINTS, ADMISSION_PREFLIGHT_OWNER_FUNCTIONS, ADMISSION_PREFLIGHT_INGRESS_POLICY, ADMISSION_PREFLIGHT_RLS_TABLES, ADMISSION_PREFLIGHT_FUNCTION_SEARCH_PATHS } from "../../constants/admission-preflight";
import { authorizeAdmissionPolicy } from "./postgres-admission-policy-authorizer";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "@/src/modules/tribes/constants/tribe-page-access";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** This adapter never repairs unknown history, activates storage or assumes runtime readiness. */
export class PostgresAdmissionActivationRepository implements AdmissionActivationInventoryReader, AdmissionActivationPreflightReader {
  /** @param database - Original guarded transaction retaining leader/tenant locks. @param context - Exact current native query or mutation scope. @param runtime - Mandatory complete evaluator/entrypoint owner, bound without RPC. */
  constructor(private readonly database: RequestDatabase, private readonly context: AuthorizedAdmissionContext, private readonly runtime: AdmissionActivationRuntimeReader) {}

  /** @param context - Current server scope; not a browser role. @returns Locked actual metadata and aggregate history, with no defaults/backfill. */
  async read(context: AuthorizedAdmissionContext): Promise<AdmissionActivationInventory> {
    if (context.tribeId !== this.context.tribeId || context.userId !== this.context.userId || context.sessionId !== this.context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    await authorizeAdmissionPolicy(this.database, context, context.sensitiveOperation);
    const settings = (await this.database.execute<{ access_model: string }>(sql`select access_model from public.tribe_academy_settings where tribe_id=${context.tribeId} for share`)).rows[0];
    const activation = (await this.database.execute<{ policy_present: boolean; marker_consistent: boolean }>(sql`select policy.tribe_id is not null as policy_present,tribe.admissions_control_activated_at is not distinct from policy.activated_at as marker_consistent from public.tribes tribe left join public.academy_admission_policies policy on policy.tribe_id=tribe.id where tribe.id=${context.tribeId}`)).rows[0];
    const requiredTables = [...new Set([...ADMISSION_PREFLIGHT_STORAGE_TRIGGERS, ...ADMISSION_PREFLIGHT_INGRESS_TRIGGERS].map((trigger) => trigger.table))];
    const triggers = (await this.database.execute<{ table_name: string; trigger_name: string; enabled: string }>(sql`select relation.relname as table_name,trigger.tgname as trigger_name,trigger.tgenabled as enabled from pg_catalog.pg_trigger trigger join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and relation.relname=any(${sql.param(requiredTables)}::text[]) and not trigger.tgisinternal`)).rows;
    const enabled = (required: { table: string; name: string }) => triggers.some((trigger) => trigger.table_name === required.table && trigger.trigger_name === required.name && ADMISSION_PREFLIGHT_ENABLED_TRIGGER_MODES.includes(trigger.enabled));
    const relations = (await this.database.execute<{ table_name: string; rls: boolean; forced: boolean }>(sql`select relation.relname as table_name,relation.relrowsecurity as rls,relation.relforcerowsecurity as forced from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and relation.relname=any(${sql.param(ADMISSION_PREFLIGHT_RLS_TABLES)}::text[])`)).rows;
    const constraints = (await this.database.execute<{ table_name: string; name: string; validated: boolean }>(sql`select relation.relname as table_name,constraint_record.conname as name,constraint_record.convalidated as validated from pg_catalog.pg_constraint constraint_record join pg_catalog.pg_class relation on relation.oid=constraint_record.conrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and relation.relname=any(${sql.param(requiredTables)}::text[])`)).rows;
    const functions = (await this.database.execute<{ name: string; signature: string; owner_execution: boolean; configuration: string[] | null; public_execution: boolean }>(sql`select procedure.proname as name,oidvectortypes(procedure.proargtypes) as signature,procedure.prosecdef as owner_execution,procedure.proconfig as configuration,exists(select 1 from aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) permission where permission.grantee=0 and permission.privilege_type='EXECUTE') as public_execution from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace where namespace.nspname='public' and procedure.proname=any(${sql.param(ADMISSION_PREFLIGHT_OWNER_FUNCTIONS.map((procedure) => procedure.name))}::text[])`)).rows;
    const ingressPolicy = (await this.database.execute(sql`select policyname from pg_catalog.pg_policies where schemaname='public' and tablename='tribe_members' and policyname=${ADMISSION_PREFLIGHT_INGRESS_POLICY}`)).rows[0];
    const members = (await this.database.execute<{ role: string; status: string; status_reason: string; commercial_recovery_status: string | null }>(sql`select role,status,status_reason,commercial_recovery_status from public.tribe_members where tribe_id=${context.tribeId} order by id for share`)).rows;
    const commercial = members.filter((member) => (member.status === TRIBE_MEMBERSHIP_STATUS.removed || member.status === TRIBE_MEMBERSHIP_STATUS.blocked) && (member.status_reason === TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive || member.status_reason === TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked));
    const runtimePrepared = await this.runtime.isPrepared(context.tribeId);
    await authorizeAdmissionPolicy(this.database, context, context.sensitiveOperation);
    return { tribeId: context.tribeId, isAcademy: settings?.access_model === TRIBE_ACCESS_MODEL.academy, policyPresent: Boolean(activation?.policy_present), markerConsistent: Boolean(activation?.marker_consistent),
      storagePrepared: ADMISSION_PREFLIGHT_STORAGE_TRIGGERS.every(enabled)
        && ADMISSION_PREFLIGHT_RLS_TABLES.every((table) => relations.some((relation) => relation.table_name === table && relation.rls && relation.forced))
        && ADMISSION_PREFLIGHT_STORAGE_CONSTRAINTS.every((required) => constraints.some((constraint) => constraint.table_name === required.table && constraint.name === required.name && constraint.validated))
        && ADMISSION_PREFLIGHT_OWNER_FUNCTIONS.every((required) => functions.some((procedure) => procedure.name === required.name && procedure.signature.replaceAll(" ", "") === required.signature && procedure.owner_execution && procedure.public_execution === required.publicExecution && procedure.configuration?.some((setting) => ADMISSION_PREFLIGHT_FUNCTION_SEARCH_PATHS.includes(setting)))),
      ingressProtected: ADMISSION_PREFLIGHT_INGRESS_TRIGGERS.every(enabled) && Boolean(ingressPolicy), runtimePrepared,
      unknownCommercialMemberCount: commercial.filter((member) => member.commercial_recovery_status === null).length,
      privilegedCommercialMemberCount: commercial.filter((member) => member.role !== TRIBE_MEMBER_ROLE.tribemate).length };
  }

  /** @param tribeId - Exact authorized target. @returns Closed current inventory result; no mutation or permission token is produced. */
  async isPrepared(tribeId: string): Promise<boolean> {
    if (tribeId !== this.context.tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    return evaluateAdmissionActivationPreflight(tribeId, await this.read(this.context)).prepared;
  }
}
