/** Reads actual cutover metadata and membership history inside the original leader transaction. @module postgres-admission-activation-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionActivationInventoryReader, AdmissionActivationRuntimeReader, AdmissionActivationPreflightReader, AdmissionActivationPreparation } from "../../domain/repositories/admission-activation-preflight-reader";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import { evaluateAdmissionActivationPreflight, type AdmissionActivationInventory } from "../../domain/policies/admission-activation-preflight";
import { ADMISSION_PREFLIGHT_STORAGE_TRIGGERS, ADMISSION_PREFLIGHT_INGRESS_TRIGGERS, ADMISSION_PREFLIGHT_ENABLED_TRIGGER_MODES, ADMISSION_PREFLIGHT_STORAGE_CONSTRAINTS, ADMISSION_PREFLIGHT_OWNER_FUNCTIONS, ADMISSION_PREFLIGHT_INGRESS_POLICY, ADMISSION_PREFLIGHT_RLS_TABLES, ADMISSION_PREFLIGHT_FUNCTION_SEARCH_PATHS } from "../../constants/admission-preflight";
import { authorizeAdmissionPolicy } from "./postgres-admission-policy-authorizer";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { isCommercialMembershipState } from "../../domain/entities/commercial-membership-review";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** Locked academy settings (null when the row is missing), activation marker and catalog metadata read together; only the settings row is locked. */
type CatalogRow = {
  access_model: string | null;
  admission_enabled: boolean | null;
  activation: { policy_present: boolean; marker_consistent: boolean; control_activated: boolean } | null;
  triggers: { table_name: string; trigger_name: string; enabled: string }[];
  relations: { table_name: string; rls: boolean; forced: boolean }[];
  constraints: { table_name: string; name: string; validated: boolean }[];
  functions: { name: string; signature: string; owner_execution: boolean; configuration: string[] | null; public_execution: boolean }[];
  ingress_policy: boolean;
};

/** This adapter never repairs unknown history, activates storage or assumes runtime readiness. */
export class PostgresAdmissionActivationRepository implements AdmissionActivationInventoryReader, AdmissionActivationPreflightReader {
  /** @param database - Original guarded transaction retaining leader/tenant locks. @param context - Exact current native query or mutation scope. @param runtime - Mandatory complete evaluator/entrypoint owner, bound without RPC. @param readRecoveryLock - Current external hosting lock, without loading keyrings or credentials. */
  constructor(private readonly database: RequestDatabase, private readonly context: AuthorizedAdmissionContext, private readonly runtime: AdmissionActivationRuntimeReader, private readonly readRecoveryLock: () => Promise<boolean>) {}

  /** @param context - Current server scope; not a browser role. @returns Locked actual metadata and aggregate history, with no defaults/backfill. */
  async read(context: AuthorizedAdmissionContext): Promise<AdmissionActivationInventory> {
    return (await this.inspect(context)).inventory;
  }

  /** @param context - Current server scope. @returns The inventory and whether the protection marker is set, both from the same statement. */
  private async inspect(context: AuthorizedAdmissionContext): Promise<{ inventory: AdmissionActivationInventory; controlActivated: boolean }> {
    if (context.tribeId !== this.context.tribeId || context.userId !== this.context.userId || context.sessionId !== this.context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    await authorizeAdmissionPolicy(this.database, context, context.sensitiveOperation);
    const requiredTables = [...new Set([...ADMISSION_PREFLIGHT_STORAGE_TRIGGERS, ...ADMISSION_PREFLIGHT_INGRESS_TRIGGERS].map((trigger) => trigger.table))];
    // The settings row is locked FOR SHARE in the same statement that reads the unlocked marker and catalog metadata, before the members lock, so the lock order is unchanged; a missing row still yields the rest.
    const catalog = (await this.database.execute<CatalogRow>(sql`select
      settings.access_model,settings.admission_enabled,
      (select jsonb_build_object('policy_present',policy.tribe_id is not null,'marker_consistent',tribe.admissions_control_activated_at is not distinct from policy.activated_at,'control_activated',tribe.admissions_control_activated_at is not null) from public.tribes tribe left join public.academy_admission_policies policy on policy.tribe_id=tribe.id where tribe.id=${context.tribeId}) as activation,
      (select coalesce(jsonb_agg(jsonb_build_object('table_name',relation.relname,'trigger_name',trigger.tgname,'enabled',trigger.tgenabled)),'[]'::jsonb) from pg_catalog.pg_trigger trigger join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and relation.relname=any(${sql.param(requiredTables)}::text[]) and not trigger.tgisinternal) as triggers,
      (select coalesce(jsonb_agg(jsonb_build_object('table_name',relation.relname,'rls',relation.relrowsecurity,'forced',relation.relforcerowsecurity)),'[]'::jsonb) from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and relation.relname=any(${sql.param(ADMISSION_PREFLIGHT_RLS_TABLES)}::text[])) as relations,
      (select coalesce(jsonb_agg(jsonb_build_object('table_name',relation.relname,'name',constraint_record.conname,'validated',constraint_record.convalidated)),'[]'::jsonb) from pg_catalog.pg_constraint constraint_record join pg_catalog.pg_class relation on relation.oid=constraint_record.conrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and relation.relname=any(${sql.param(requiredTables)}::text[])) as constraints,
      (select coalesce(jsonb_agg(jsonb_build_object('name',procedure.proname,'signature',oidvectortypes(procedure.proargtypes),'owner_execution',procedure.prosecdef,'configuration',procedure.proconfig,'public_execution',exists(select 1 from aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) permission where permission.grantee=0 and permission.privilege_type='EXECUTE'))),'[]'::jsonb) from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace where namespace.nspname='public' and procedure.proname=any(${sql.param(ADMISSION_PREFLIGHT_OWNER_FUNCTIONS.map((procedure) => procedure.name))}::text[])) as functions,
      exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='tribe_members' and policyname=${ADMISSION_PREFLIGHT_INGRESS_POLICY}) as ingress_policy
      from (values (true)) as anchor(present) left join (select access_model,admission_enabled from public.tribe_academy_settings where tribe_id=${context.tribeId} for share) settings on true
    `)).rows[0];
    const { activation, triggers, relations, constraints, functions } = catalog;
    const ingressPolicy = catalog.ingress_policy;
    const enabled = (required: { table: string; name: string }) => triggers.some((trigger) => trigger.table_name === required.table && trigger.trigger_name === required.name && ADMISSION_PREFLIGHT_ENABLED_TRIGGER_MODES.includes(trigger.enabled));
    const members = (await this.database.execute<{ role: string; status: string; status_reason: string; commercial_recovery_status: string | null }>(sql`select role,status,status_reason,commercial_recovery_status from public.tribe_members where tribe_id=${context.tribeId} order by id for share`)).rows;
    const commercial = members.filter((member) => isCommercialMembershipState({ status: member.status, statusReason: member.status_reason }));
    const runtimePrepared = await this.runtime.isPrepared(context.tribeId);
    const recoveryLocked = await this.readRecoveryLock();
    await authorizeAdmissionPolicy(this.database, context, context.sensitiveOperation);
    const inventory: AdmissionActivationInventory = { tribeId: context.tribeId, isAcademy: catalog.access_model === TRIBE_ACCESS_MODEL.academy, policyPresent: Boolean(activation?.policy_present), markerConsistent: Boolean(activation?.marker_consistent),
      storagePrepared: ADMISSION_PREFLIGHT_STORAGE_TRIGGERS.every(enabled)
        && ADMISSION_PREFLIGHT_RLS_TABLES.every((table) => relations.some((relation) => relation.table_name === table && relation.rls && relation.forced))
        && ADMISSION_PREFLIGHT_STORAGE_CONSTRAINTS.every((required) => constraints.some((constraint) => constraint.table_name === required.table && constraint.name === required.name && constraint.validated))
        && ADMISSION_PREFLIGHT_OWNER_FUNCTIONS.every((required) => functions.some((procedure) => procedure.name === required.name && procedure.signature.replaceAll(" ", "") === required.signature && procedure.owner_execution && procedure.public_execution === required.publicExecution && procedure.configuration?.some((setting) => ADMISSION_PREFLIGHT_FUNCTION_SEARCH_PATHS.includes(setting)))),
      ingressProtected: ADMISSION_PREFLIGHT_INGRESS_TRIGGERS.every(enabled) && ingressPolicy, runtimePrepared,
      evaluatorEnabled: catalog.admission_enabled === true, recoveryLocked,
      unknownCommercialMemberCount: commercial.filter((member) => member.commercial_recovery_status === null).length,
      privilegedCommercialMemberCount: commercial.filter((member) => member.role !== TRIBE_MEMBER_ROLE.tribemate).length };
    return { inventory, controlActivated: Boolean(activation?.control_activated) };
  }

  /** @param tribeId - Exact authorized target. @returns Closed current inventory result with the tenant facts it read; no mutation or permission token is produced. */
  async readPreparation(tribeId: string): Promise<AdmissionActivationPreparation> {
    if (tribeId !== this.context.tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    const { inventory, controlActivated } = await this.inspect(this.context);
    return { prepared: evaluateAdmissionActivationPreflight(tribeId, inventory).prepared, isAcademy: inventory.isAcademy, evaluatorEnabled: inventory.evaluatorEnabled, controlActivated };
  }
}
