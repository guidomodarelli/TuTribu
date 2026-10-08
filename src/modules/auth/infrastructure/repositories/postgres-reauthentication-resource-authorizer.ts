/** Resolves current owned sensitive resources and exact return paths without reading any secrets. */
import "server-only";
import {sql} from "drizzle-orm";
import {REAUTHENTICATION_OPERATION_RESOURCE,REAUTHENTICATION_RESOURCE_KIND,type ReauthenticationOperation} from "@/src/modules/auth/constants/reauthentication-resources";
import type {ReauthenticationResourceAuthorizer} from "@/src/modules/auth/domain/repositories/recent-authentication-repository";
import type {RecentAuthenticationScope} from "@/src/modules/auth/domain/entities/recent-authentication-evidence";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import {REAUTHENTICATION_POLICY_OPERATIONS,REAUTHENTICATION_POLICY_SETTINGS_SEGMENT,REAUTHENTICATION_USAGE_OPERATIONS,REAUTHENTICATION_USAGE_SETTINGS_SEGMENT,REAUTHENTICATION_CONNECTION_OPERATIONS,REAUTHENTICATION_CONNECTION_SETTINGS_SEGMENT} from "../../constants/reauthentication-navigation";

/** Reads resource ownership under the auth writer's existing transaction and lock order. */
export class PostgresReauthenticationResourceAuthorizer implements ReauthenticationResourceAuthorizer {
  /** @param database - The caller's guarded transaction; no nested checkout or RPC is used. */
  constructor(private readonly database:RequestDatabase) {}

  /**
   * Revalidates action-specific resource ownership and the existing tribe landing route.
   * @param scope - Current private identity, exact action and owned resource.
   * @returns Allowed return targets or null for unknown, missing, foreign or retired resources.
   */
  async resolve(scope:RecentAuthenticationScope):Promise<{allowedReturnPaths:readonly string[]}|null> {
    const kind=REAUTHENTICATION_OPERATION_RESOURCE[scope.operation as ReauthenticationOperation];
    if(!kind) return null;
    const tribe=(await this.database.execute<{slug:string}>(sql`select slug from public.tribes where id=${scope.tribeId} for share`)).rows[0];
    if(!tribe) return null;
    let exists=false;
    switch(kind) {
      case REAUTHENTICATION_RESOURCE_KIND.tribe:exists=scope.resourceId===scope.tribeId;break;
      case REAUTHENTICATION_RESOURCE_KIND.connection:exists=(await this.database.execute(sql`select id from public.tenant_messaging_connections where id=${scope.resourceId} and tribe_id=${scope.tribeId} and retired_at is null for share`)).rows.length===1;break;
      case REAUTHENTICATION_RESOURCE_KIND.allowlistEntry:exists=(await this.database.execute(sql`select id from public.academy_allowlist_entries where id=${scope.resourceId} and tribe_id=${scope.tribeId} for share`)).rows.length===1;break;
      case REAUTHENTICATION_RESOURCE_KIND.allowlistImport:exists=(await this.database.execute(sql`select id from public.academy_allowlist_imports where id=${scope.resourceId} and tribe_id=${scope.tribeId} and actor_user_id=${scope.userId} for share`)).rows.length===1;break;
      case REAUTHENTICATION_RESOURCE_KIND.personalInvitation:exists=(await this.database.execute(sql`select id from public.academy_personal_invitations where id=${scope.resourceId} and tribe_id=${scope.tribeId} for share`)).rows.length===1;break;
      case REAUTHENTICATION_RESOURCE_KIND.admissionRequest:exists=(await this.database.execute(sql`select id from public.academy_admission_requests where id=${scope.resourceId} and tribe_id=${scope.tribeId} for share`)).rows.length===1;break;
    }
    if(!exists) return null;
    const landingPath=`/${encodeURIComponent(tribe.slug)}`;
    if(REAUTHENTICATION_USAGE_OPERATIONS.includes(scope.operation)) return {allowedReturnPaths:[landingPath,`${landingPath}/${REAUTHENTICATION_USAGE_SETTINGS_SEGMENT}`]};
    if(REAUTHENTICATION_CONNECTION_OPERATIONS.includes(scope.operation))return{allowedReturnPaths:[landingPath,`${landingPath}/${REAUTHENTICATION_CONNECTION_SETTINGS_SEGMENT}`]};
    return {allowedReturnPaths:REAUTHENTICATION_POLICY_OPERATIONS.includes(scope.operation)
      ?[landingPath,`${landingPath}/${REAUTHENTICATION_POLICY_SETTINGS_SEGMENT}`]:[landingPath]};
  }
}
