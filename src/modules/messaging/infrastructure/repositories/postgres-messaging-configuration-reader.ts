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
import type {MessagingSecurityFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** Each callback uses the actual current native account's protected transaction. */
export type MessagingConfigurationExecutor=<Result>(context:MessagingConfigurationContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
/** Contains only consumed non-secret storage facts. */
type ConnectionRow={id:string;name:string;contributed_by_user_id:string;version:number;state:MessagingConfigurationConnection["state"];environment:string;security_epoch:string;selected_version:number|null;candidate_version:number|null;is_selected:boolean;is_candidate:boolean};

/** Selected and candidate remain separate projections even when the same connection holds both versions. */
export class PostgresMessagingConfigurationReader implements MessagingConfigurationReader<MessagingConfigurationResult>{
  /** @param execute - Guarded native principal. @param readSecurityFacts - Current non-secret external identity/recovery state, without loading keyrings. */
  constructor(private readonly execute:MessagingConfigurationExecutor,private readonly readSecurityFacts:()=>Promise<MessagingSecurityFacts>){}
  /** @param database - Existing protected transaction. @param context - Server-derived audience and exact scope. @returns Current canonical leader after session/audience checks, locked for this projection. */
  private async authorize(database:RequestDatabase,context:MessagingConfigurationContext):Promise<string>{
    const actor=(await database.execute<{actor:string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if(actor!==context.actorUserId)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    const session=(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${actor} and "expiresAt">clock_timestamp() for share`)).rows[0];
    if(!session)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
    if(!(await database.execute(sql`select id from public.tribes where id=${context.tribeId} for share`)).rows[0])throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    const members=(await database.execute<{user_id:string;role:string;status:string}>(sql`select user_id,role,status from public.tribe_members where tribe_id=${context.tribeId} and (user_id=${actor} or role=${TRIBE_MEMBER_ROLE.leader}) order by user_id for share`)).rows;
    const leaders=members.filter((member)=>member.role===TRIBE_MEMBER_ROLE.leader&&member.status===TRIBE_MEMBERSHIP_STATUS.active),membership=members.find((member)=>member.user_id===actor);
    if(!(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${actor} and "expiresAt">clock_timestamp()`)).rows[0])throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
    if(context.audience!==TRIBE_MEMBER_ROLE.leader&&context.audience!==TRIBE_MEMBER_ROLE.guardian)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    const role=context.audience===TRIBE_MEMBER_ROLE.leader?TRIBE_MEMBER_ROLE.leader:TRIBE_MEMBER_ROLE.guardian;
    if(leaders.length!==1||!membership||membership.role!==role||membership.status!==TRIBE_MEMBERSHIP_STATUS.active||context.audience===TRIBE_MEMBER_ROLE.leader&&leaders[0].user_id!==actor)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    return leaders[0].user_id;
  }
  /** @param database - Authorized leader transaction. @param context - Exact current tenant. @param row - Exact slot holder. @param configurationVersion - Its fixed selected/candidate version. @returns Minimal current version/capability metadata or absence for retired resources. */
  private async connection(database:RequestDatabase,context:MessagingConfigurationContext,row:ConnectionRow|undefined,configurationVersion:number|null|undefined):Promise<MessagingConfigurationConnection|null>{
    if(!row||!configurationVersion)return null;
    const version=(await database.execute<{credential_validation_status:MessagingConfigurationConnection["credentialState"];is_test_mode:boolean|null}>(sql`select credential_validation_status,is_test_mode from public.messaging_connection_versions where connection_id=${row.id} and tribe_id=${context.tribeId} and version=${configurationVersion} and retired_at is null for share`)).rows[0];
    if(!version)return null;
    const capabilities=(await database.execute<{channel:MessagingConfigurationConnection["capabilities"][number]["channel"];state:MessagingConfigurationConnection["capabilities"][number]["state"];checked_at:Date|string|null;tested_at:Date|string|null}>(sql`select channel,state,checked_at,tested_at from public.messaging_connection_capabilities where connection_id=${row.id} and tribe_id=${context.tribeId} and connection_version=${configurationVersion} order by channel for share`)).rows;
    return{id:row.id,name:row.name,version:row.version,configurationVersion,state:row.state,credentialState:version.credential_validation_status,credentialMode:version.credential_validation_status===MESSAGING_CREDENTIAL_PUBLIC_STATE.valid&&version.is_test_mode!==null?version.is_test_mode?MESSAGING_CREDENTIAL_MODE.test:MESSAGING_CREDENTIAL_MODE.production:MESSAGING_CREDENTIAL_MODE.unknown,maskedCredential:MESSAGING_GENERIC_CREDENTIAL_MASK,capabilities:capabilities.map((capability)=>({channel:capability.channel,state:capability.state,checkedAt:capability.checked_at?new Date(capability.checked_at).toISOString():null,testedAt:capability.tested_at?new Date(capability.tested_at).toISOString():null}))};
  }
  /** @param context - Exact current native audience. @returns Own guarded metadata, without state changes, keyring/secret or provider access. */
  async read(context:MessagingConfigurationContext):Promise<MessagingConfigurationResult>{
    return this.execute(context,async(database)=>{
      const currentLeaderUserId=await this.authorize(database,context);
      const rows=(await database.execute<ConnectionRow>(sql`select id,name,contributed_by_user_id,version,state,environment,security_epoch,is_selected,is_candidate,selected_version,candidate_version from public.tenant_messaging_connections where tribe_id=${context.tribeId} and retired_at is null and (is_selected or is_candidate) order by id for share`)).rows;
      const selectedRow=rows.find((row)=>row.is_selected),candidateRow=rows.find((row)=>row.is_candidate);
      const selected=await this.connection(database,context,selectedRow,selectedRow?.selected_version);
      let value:MessagingConfigurationResult;
      if(context.audience===TRIBE_MEMBER_ROLE.guardian){
        const ready=selectedRow?.contributed_by_user_id===currentLeaderUserId&&selected?.state===MESSAGING_CONNECTION_STATE.active&&selected.credentialState===MESSAGING_CREDENTIAL_PUBLIC_STATE.valid&&selected.credentialMode===MESSAGING_CREDENTIAL_MODE.production&&selected.capabilities.some((capability)=>capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.prepared&&capability.testedAt!==null);
        const security=await this.readSecurityFacts(),current=security.recoveryLocked===false&&selectedRow?.environment===security.environment&&selectedRow.security_epoch===security.securityEpoch;
        value={audience:"guardian",operationalAlert:!selectedRow?"not_configured":ready&&current?"available":"attention_required"};
      }else value={audience:"leader",selected,candidate:await this.connection(database,context,candidateRow,candidateRow?.candidate_version),usage:await readMessagingUsageSnapshot(database,context.tribeId)};
      await this.authorize(database,context);
      const parsed=messagingConfigurationSchema.safeParse(value);if(!parsed.success)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.publicContractUnusable);return parsed.data;
    });
  }
}
