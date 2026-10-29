/** Retires local connection resources only after current owned dependencies allow ordinary disconnection. @module postgres-messaging-connection-disconnection */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingConnectionLifecycleActions, MessagingConnectionLifecycleContext, MessagingConnectionLifecycleDependencies, MessagingConnectionLifecycleInput } from "../../domain/repositories/messaging-connection-lifecycle";
import { runMessagingConnectionLifecycle, type MessagingConnectionLifecycleExecutor } from "./messaging-connection-lifecycle-ledger";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import type { MessagingConnectionLifecycleResult } from "../../application/results/messaging-connection-lifecycle-result";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";
import { MESSAGING_CONNECTION_REPLACEMENT } from "../../constants/messaging-connection-replacement";
import { MESSAGING_CONNECTION_ORDINARY_RETIREMENT_REASON } from "../../constants/messaging-connection-retirement";
import { MESSAGE_DELIVERY_STATE } from "../../constants/message-delivery";
import { assessMessagingConnectionRetirement } from "../../domain/policies/messaging-connection-retirement";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { authorizeMessagingLifecycleResource } from "./postgres-messaging-lifecycle-authorizer";
import {createAdmissionConnectionAuditEvent} from "@/src/modules/academy-admissions/domain/entities/admission-messaging-audit-event";
import {PostgresAdmissionAuditRepository} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-audit-repository";
import { purgeVerificationMaterial } from "./postgres-verification-material-maintenance";

/** No secret is opened and no old obligation is redirected to another credential/account. */
export class PostgresMessagingConnectionDisconnection implements Pick<MessagingConnectionLifecycleActions<MessagingConnectionLifecycleResult>,"disconnect">{
  /** @param execute - Current native actor's guarded executor. @param readSecurityConfig - Current operation MAC keys. @param composeDependencies - Current owning dependency/evidence adapters in this transaction. */
  constructor(private readonly execute:MessagingConnectionLifecycleExecutor,private readonly readSecurityConfig:()=>Promise<MessagingSecurityConfig>,private readonly composeDependencies:(database:RequestDatabase)=>MessagingConnectionLifecycleDependencies){}
  /** @param database - Existing native actor transaction. @param context - Exact current local disconnection scope. @returns Current own resource after all identity/resource/version lock waits. */
  private authorize(database:RequestDatabase,context:MessagingConnectionLifecycleContext){return authorizeMessagingLifecycleResource(database,context,REAUTHENTICATION_OPERATION.disconnectMessagingConnection);}
  /** @param context - Current connection-scoped local authority. @param input - Original confirmed resource CAS. @returns Original local retirement metadata, preserving accepted/unknown accounting and external revocation as a separate action. */
  async disconnect(context:MessagingConnectionLifecycleContext,input:MessagingConnectionLifecycleInput){
    return runMessagingConnectionLifecycle({execute:this.execute,readSecurityConfig:this.readSecurityConfig,context,operationType:REAUTHENTICATION_OPERATION.disconnectMessagingConnection,operationId:input.operationId,intent:{connectionId:context.connectionId,expectedVersion:input.expectedVersion,confirmed:input.confirmed},authorize:(database)=>this.authorize(database,context),effect:async(database,ledgerId)=>{
      if(!(input.confirmed as boolean))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const row=await this.authorize(database,context);
      if(row.version!==input.expectedVersion)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
      if(row.state===MESSAGING_CONNECTION_STATE.disconnected||row.retired_at!==null)return{id:row.id,version:row.version,state:MESSAGING_CONNECTION_STATE.disconnected,reason:null,changed:false};
      const dependencies=this.composeDependencies(database),facts=await dependencies.readRetirementFacts(context);
      if(!assessMessagingConnectionRetirement({...facts,isSelected:row.is_selected}).allowed)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
      const deliveries=(await database.execute<{id:string}>(sql`select id from public.message_deliveries where tribe_id=${context.tribeId} and connection_id=${context.connectionId} order by id for update`)).rows;
      await dependencies.retireReferences(context,ledgerId);
      await this.authorize(database,context);
      const now=new Date((await database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now),purgeAfter=new Date(now.getTime()+MESSAGING_CONNECTION_REPLACEMENT.purgeLifetimeMs);
      await database.execute(sql`update public.message_deliveries set state=${MESSAGE_DELIVERY_STATE.cancelled},last_outcome=${MESSAGING_CONNECTION_ORDINARY_RETIREMENT_REASON},lease_token=null,lease_until=null,version=version+1 where tribe_id=${context.tribeId} and connection_id=${context.connectionId} and state=${MESSAGE_DELIVERY_STATE.queued} and not exists(select 1 from public.message_delivery_attempts where delivery_id=public.message_deliveries.id)`);
      await database.execute(sql`update public.messaging_connection_versions set retired_at=${now},purge_after=${purgeAfter} where tribe_id=${context.tribeId} and connection_id=${context.connectionId} and retired_at is null`);
      await database.execute(sql`update public.messaging_secret_envelopes set retired_at=${now},purge_after=${purgeAfter} where tribe_id=${context.tribeId} and connection_id=${context.connectionId} and retired_at is null`);
      await database.execute(sql`update public.tenant_messaging_connections set state=${MESSAGING_CONNECTION_STATE.disconnected},state_reason=${MESSAGING_CONNECTION_ORDINARY_RETIREMENT_REASON},is_selected=false,selected_version=null,is_candidate=false,candidate_version=null,retired_at=${now},version=version+1,updated_at=${now} where id=${context.connectionId} and tribe_id=${context.tribeId} and version=${input.expectedVersion}`);
      for(const delivery of deliveries)await purgeVerificationMaterial(database,{limit:1,deliveryId:delivery.id});
      await this.authorize(database,context);
      await new PostgresAdmissionAuditRepository(database).append(createAdmissionConnectionAuditEvent({tribeId:context.tribeId,actorUserId:context.actorUserId,operationId:ledgerId,eventType:REAUTHENTICATION_OPERATION.disconnectMessagingConnection,connectionId:row.id,version:row.version+1,state:MESSAGING_CONNECTION_STATE.disconnected,configurationVersion:row.selected_version??row.candidate_version,previous:{state:row.state,version:row.version,configurationVersion:row.selected_version??row.candidate_version},channel:null,rule:MESSAGING_CONNECTION_ORDINARY_RETIREMENT_REASON,cause:MESSAGING_CONNECTION_ORDINARY_RETIREMENT_REASON,createdAt:now}));
      return{id:row.id,version:row.version+1,state:MESSAGING_CONNECTION_STATE.disconnected,reason:null,changed:true};
    }});
  }
}
