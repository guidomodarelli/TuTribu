/** Reads current leader metadata or a minimal guardian alert without opening credentials. @module postgres-messaging-configuration-reader */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {MessagingConfigurationContext,MessagingConfigurationReader} from "@/src/modules/messaging/domain/repositories/messaging-configuration-reader";
import {messagingConfigurationSchema,type MessagingConfigurationResult,type MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_GENERIC_CREDENTIAL_MASK,MESSAGING_CREDENTIAL_PUBLIC_STATE,MESSAGING_CAPABILITY_PUBLIC_STATE} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CREDENTIAL_MODE} from "@/src/modules/messaging/constants/messaging-credential-validation";
import {MESSAGING_CONNECTION_STATE} from "@/src/modules/messaging/constants/messaging-connection";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {TRIBE_MEMBERSHIP_STATUS} from "@/src/modules/tribes/constants/tribe-page-access";
import {readMessagingUsageSnapshot} from "./postgres-messaging-usage-projection";
import {MESSAGING_GUARD_OUTCOME} from "@/src/modules/messaging/constants/messaging-leader-guard";
import type {MessagingSecurityFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingPlatformRequirementReader} from "./messaging-platform-requirement-reader";

/** Each callback uses the actual current native account's protected transaction. */
export type MessagingConfigurationExecutor=<Result>(context:MessagingConfigurationContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
/** Contains only consumed non-secret storage facts. */
type ConnectionRow={id:string;name:string;contributed_by_user_id:string;version:number;state:MessagingConfigurationConnection["state"];environment:string;security_epoch:string;selected_version:number|null;candidate_version:number|null;is_selected:boolean;is_candidate:boolean};

/** Selected and candidate remain separate projections even when the same connection holds both versions. */
/** @param status - Stored credential validation status. @param isTestMode - Provider test mode observed by that validation. @returns The credential mode, unknown until a valid validation observed it. */
function storedCredentialMode(status:string,isTestMode:boolean|null){
  if(status!==MESSAGING_CREDENTIAL_PUBLIC_STATE.valid||isTestMode===null)return MESSAGING_CREDENTIAL_MODE.unknown;
  return isTestMode?MESSAGING_CREDENTIAL_MODE.test:MESSAGING_CREDENTIAL_MODE.production;
}

export class PostgresMessagingConfigurationReader implements MessagingConfigurationReader<MessagingConfigurationResult>{
  /**
   * @param execute - Guarded native principal.
   * @param readSecurityFacts - Current non-secret external identity/recovery state, without loading keyrings.
   * @param readPlatformRequirement - The same import and enrolled-proof checks the ledger runs before a leader write.
   */
  constructor(private readonly execute:MessagingConfigurationExecutor,private readonly readSecurityFacts:()=>Promise<MessagingSecurityFacts>,private readonly readPlatformRequirement:MessagingPlatformRequirementReader){}
  /** @param database - Existing protected transaction. @param context - Server-derived audience and exact scope. @returns Current canonical leader after session/audience checks, locked for this projection. */
  private async authorize(database:RequestDatabase,context:MessagingConfigurationContext):Promise<string>{
    // One call keeps the former order: actor, live session, tribe and memberships FOR SHARE, then liveness again.
    const checked=(await database.execute<{outcome:string;members:{user_id:string;role:string;status:string}[]|null}>(sql`select outcome,members from public.authorize_messaging_configuration_reader(${context.tribeId},${context.actorUserId},${context.sessionId})`)).rows[0];
    if(checked?.outcome===MESSAGING_GUARD_OUTCOME.authenticationRequired)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
    if(checked?.outcome!==MESSAGING_GUARD_OUTCOME.checked||!checked.members)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    const actor=context.actorUserId,members=checked.members;
    const leaders=members.filter((member)=>member.role===TRIBE_MEMBER_ROLE.leader&&member.status===TRIBE_MEMBERSHIP_STATUS.active),membership=members.find((member)=>member.user_id===actor);
    // Fail closed even if a caller bypasses the static contract (casts, untyped composition).
    const audience:string=context.audience;
    if(audience!==TRIBE_MEMBER_ROLE.leader&&audience!==TRIBE_MEMBER_ROLE.guardian)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    const role=context.audience===TRIBE_MEMBER_ROLE.leader?TRIBE_MEMBER_ROLE.leader:TRIBE_MEMBER_ROLE.guardian;
    if(leaders.length!==1||membership?.role !== role||membership.status!==TRIBE_MEMBERSHIP_STATUS.active||context.audience===TRIBE_MEMBER_ROLE.leader&&leaders[0].user_id!==actor)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    return leaders[0].user_id;
  }
  /**
   * @param database - Authorized leader transaction. @param context - Exact current tenant.
   * @param slot - Exact slot holder and its fixed selected/candidate version.
   * @param security - Current platform environment and epoch; a connection sealed under others needs a new key.
   * @returns Minimal current version/capability metadata or absence for retired resources.
   */
  private async connection(database:RequestDatabase,context:MessagingConfigurationContext,slot:{row:ConnectionRow|undefined;configurationVersion:number|null|undefined},security:MessagingSecurityFacts):Promise<MessagingConfigurationConnection|null>{
    const{row,configurationVersion}=slot;
    if(!row||!configurationVersion)return null;
    const version=(await database.execute<{credential_validation_status:MessagingConfigurationConnection["credentialState"];is_test_mode:boolean|null}>(sql`select credential_validation_status,is_test_mode from public.messaging_connection_versions where connection_id=${row.id} and tribe_id=${context.tribeId} and version=${configurationVersion} and retired_at is null for share`)).rows[0];
    if(!version)return null;
    const capabilities=(await database.execute<{channel:MessagingConfigurationConnection["capabilities"][number]["channel"];state:MessagingConfigurationConnection["capabilities"][number]["state"];checked_at:Date|string|null;tested_at:Date|string|null}>(sql`select channel,state,checked_at,tested_at from public.messaging_connection_capabilities where connection_id=${row.id} and tribe_id=${context.tribeId} and connection_version=${configurationVersion} order by channel for share`)).rows;
    return{id:row.id,name:row.name,version:row.version,configurationVersion,state:row.state,credentialState:version.credential_validation_status,credentialMode:storedCredentialMode(version.credential_validation_status,version.is_test_mode),maskedCredential:MESSAGING_GENERIC_CREDENTIAL_MASK,securityCurrent:row.environment===security.environment&&row.security_epoch===security.securityEpoch,capabilities:capabilities.map((capability)=>({channel:capability.channel,state:capability.state,checkedAt:capability.checked_at?new Date(capability.checked_at).toISOString():null,testedAt:capability.tested_at?new Date(capability.tested_at).toISOString():null}))};
  }
  /** @param context - Exact current native audience. @returns Own guarded metadata, without state changes, keyring/secret or provider access. */
  async read(context:MessagingConfigurationContext):Promise<MessagingConfigurationResult>{
    return this.execute(context,async(database)=>{
      const currentLeaderUserId=await this.authorize(database,context);
      const rows=(await database.execute<ConnectionRow>(sql`select id,name,contributed_by_user_id,version,state,environment,security_epoch,is_selected,is_candidate,selected_version,candidate_version from public.tenant_messaging_connections where tribe_id=${context.tribeId} and retired_at is null and (is_selected or is_candidate) order by id for share`)).rows;
      const selectedRow=rows.find((row)=>row.is_selected),candidateRow=rows.find((row)=>row.is_candidate);
      const security=await this.readSecurityFacts(),selected=await this.connection(database,context,{row:selectedRow,configurationVersion:selectedRow?.selected_version},security);
      let value:MessagingConfigurationResult;
      if(context.audience===TRIBE_MEMBER_ROLE.guardian){
        const ready=selectedRow?.contributed_by_user_id===currentLeaderUserId&&selected?.state===MESSAGING_CONNECTION_STATE.active&&selected.credentialState===MESSAGING_CREDENTIAL_PUBLIC_STATE.valid&&selected.credentialMode===MESSAGING_CREDENTIAL_MODE.production&&selected.capabilities.some((capability)=>capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.prepared&&capability.testedAt!==null);
        const current=!security.recoveryLocked&&selectedRow?.environment===security.environment&&selectedRow.security_epoch===security.securityEpoch;
        const healthy=ready&&current?"available":"attention_required";
        value={audience:"guardian",operationalAlert:selectedRow?healthy:"not_configured"};
      }else value={audience:"leader",selected,candidate:await this.connection(database,context,{row:candidateRow,configurationVersion:candidateRow?.candidate_version},security),usage:await readMessagingUsageSnapshot(database,context.tribeId),platformRequirement:await this.readPlatformRequirement(database)};
      await this.authorize(database,context);
      const parsed=messagingConfigurationSchema.safeParse(value);if(!parsed.success)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.publicContractUnusable);return parsed.data;
    });
  }
}
