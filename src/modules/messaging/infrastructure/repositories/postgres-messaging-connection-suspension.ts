/** Atomically stops local connection use without decrypting credentials or depending on provider availability. @module postgres-messaging-connection-suspension */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingConnectionLifecycleActions, MessagingConnectionLifecycleContext, MessagingConnectionLifecycleDependencies, MessagingConnectionSuspensionInput } from "../../domain/repositories/messaging-connection-lifecycle";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import type { MessagingConnectionLifecycleResult } from "../../application/results/messaging-connection-lifecycle-result";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";
import { MESSAGING_CONNECTION_SECURITY_REASON } from "../../constants/messaging-connection-security";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { authorizeMessagingLifecycleResource } from "./postgres-messaging-lifecycle-authorizer";
import { runMessagingConnectionLifecycle, type MessagingConnectionLifecycleExecutor } from "./messaging-connection-lifecycle-ledger";
import {createAdmissionConnectionAuditEvent} from "@/src/modules/academy-admissions/domain/entities/admission-messaging-audit-event";
import {PostgresAdmissionAuditRepository} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-audit-repository";

/** The connection row itself fences all later credential/dispatch authorization; slots and historic versions stay occupied. */
export class PostgresMessagingConnectionSuspension implements Pick<MessagingConnectionLifecycleActions<MessagingConnectionLifecycleResult>,"suspend">{
  /** @param execute - Current native actor's guarded executor. @param readSecurityConfig - Independent operation MAC keys, with no provider request. @param composeDependencies - Owning feature effects in the same protected transaction. */
  constructor(private readonly execute:MessagingConnectionLifecycleExecutor,private readonly readSecurityConfig:()=>Promise<MessagingSecurityConfig>,private readonly composeDependencies:(database:RequestDatabase)=>MessagingConnectionLifecycleDependencies){}
  /** @param database - Existing actor transaction. @param context - Exact local suspension scope. @returns Locked own-tribe resource after current account/leader checks. @throws AdmissionOperationError before claim/effect when current authority or resource differs. */
  private authorize(database:RequestDatabase,context:MessagingConnectionLifecycleContext){return authorizeMessagingLifecycleResource(database,context,REAUTHENTICATION_OPERATION.suspendMessagingConnection);}
  /** @param context - Current exact local authority. @param input - Original confirmed cause/CAS. @returns Original local stop commit or registered progress; no external cancellation/revocation is promised. */
  async suspend(context:MessagingConnectionLifecycleContext,input:MessagingConnectionSuspensionInput){
    return runMessagingConnectionLifecycle({execute:this.execute,readSecurityConfig:this.readSecurityConfig,context,operationType:REAUTHENTICATION_OPERATION.suspendMessagingConnection,operationId:input.operationId,intent:{connectionId:context.connectionId,expectedVersion:input.expectedVersion,confirmed:input.confirmed,reason:input.reason},authorize:(database)=>this.authorize(database,context),effect:async(database,ledgerId)=>{
      /* Consent is rechecked at runtime: callers outside the typed boundary may send it unset. */
      if(!(input.confirmed as boolean)||!Object.values(MESSAGING_CONNECTION_SECURITY_REASON).includes(input.reason))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const row=await this.authorize(database,context);
      if(row.version!==input.expectedVersion)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
      if(row.state===MESSAGING_CONNECTION_STATE.disconnected||row.retired_at!==null)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      if(row.state===MESSAGING_CONNECTION_STATE.suspended&&row.state_reason===input.reason)return{id:row.id,version:row.version,state:MESSAGING_CONNECTION_STATE.suspended,reason:input.reason,changed:false};
      const now=new Date((await database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
      await database.execute(sql`update public.tenant_messaging_connections set state=${MESSAGING_CONNECTION_STATE.suspended},state_reason=${input.reason},version=version+1,updated_at=${now} where id=${row.id} and tribe_id=${context.tribeId} and version=${input.expectedVersion}`);
      if(input.reason===MESSAGING_CONNECTION_SECURITY_REASON.suspectedCompromise)await this.composeDependencies(database).invalidateCompromisedEvidence(context,ledgerId);
      await this.authorize(database,context);
      await new PostgresAdmissionAuditRepository(database).append(createAdmissionConnectionAuditEvent({tribeId:context.tribeId,actorUserId:context.actorUserId,operationId:ledgerId,eventType:REAUTHENTICATION_OPERATION.suspendMessagingConnection,connectionId:row.id,version:row.version+1,state:MESSAGING_CONNECTION_STATE.suspended,configurationVersion:row.selected_version??row.candidate_version,previous:{state:row.state,version:row.version,configurationVersion:row.selected_version??row.candidate_version},channel:null,rule:input.reason,cause:input.reason,createdAt:now}));
      return{id:row.id,version:row.version+1,state:MESSAGING_CONNECTION_STATE.suspended,reason:input.reason,changed:true};
    }});
  }
}
