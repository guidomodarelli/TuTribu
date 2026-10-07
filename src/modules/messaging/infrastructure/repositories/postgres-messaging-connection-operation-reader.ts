/** Reads only current actor/tribe original connection mutations without claiming work or loading secret material. @module postgres-messaging-connection-operation-reader */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {MessagingUsageContext} from "../../domain/repositories/messaging-usage-operations";
import type {MessagingConnectionOperationReader} from "../../domain/repositories/messaging-connection-operation-reader";
import {authorizeMessagingUsage} from "./postgres-messaging-usage-authorizer";
import {MessagingUsageOperationError} from "../../domain/errors/messaging-usage-operation-error";
import {MessagingConnectionOperationError} from "../../domain/errors/messaging-connection-operation-error";
import {MESSAGING_ERROR_CODE} from "../../constants/messaging-errors";
import {MESSAGING_CONNECTION_DIRECT_LEDGER_TYPE,MESSAGING_CONNECTION_OPERATION_MAXIMUM_MATCHES,MESSAGING_CONNECTION_ISSUANCE_LEDGER_TYPE} from "../../constants/messaging-connection-operation";
import {ADMISSION_VERIFICATION_PURPOSE} from "@/src/modules/academy-admissions/constants/admission-eligibility";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {OPERATION_STATE} from "@/src/constants/operation-state";

/** Only consumed ledger metadata; the stored public_result is guarded as its own DTO by application. */
type ConnectionOperationRow={operation_type:string;state:string;idempotency_key:string;public_result:unknown};
/** The executor retains native current authority; no keyring or lease capability is accepted. */
export class PostgresMessagingConnectionOperationReader implements MessagingConnectionOperationReader{
  /** @param execute - Existing guarded native principal, selected by the owning composition root. */
  constructor(private readonly execute:<Result>(context:MessagingUsageContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>){}
  /** @param context - Current server-derived actor/session/tribe. @param operationId - Original caller UUID. @returns Only that actor's original metadata, registered progress or real absence. */
  async read(context:MessagingUsageContext,operationId:string):Promise<unknown|null>{
    try{return await this.execute(context,async(database)=>{
      await authorizeMessagingUsage(database,context);
      const rows=(await database.execute<ConnectionOperationRow>(sql`select operation_type,state,idempotency_key,public_result from public.academy_admission_operations where actor_user_id=${context.actorUserId} and tribe_id=${context.tribeId} and idempotency_key=${operationId} and (operation_type=any(${sql.param([...MESSAGING_CONNECTION_DIRECT_LEDGER_TYPE])}::text[]) or (operation_type=any(${sql.param([...MESSAGING_CONNECTION_ISSUANCE_LEDGER_TYPE])}::text[]) and verification_purpose=${ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic})) limit ${MESSAGING_CONNECTION_OPERATION_MAXIMUM_MATCHES}`)).rows;
      await authorizeMessagingUsage(database,context);
      if(rows.length>1)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.idempotencyConflict);
      const row=rows[0];if(!row)return null;
      const type=MESSAGING_CONNECTION_ISSUANCE_LEDGER_TYPE.some((namespace)=>namespace===row.operation_type)?REAUTHENTICATION_OPERATION.diagnoseMessagingConnection:row.operation_type;
      return{type,state:row.state,operationId:row.idempotency_key,replayed:true,...(row.state===OPERATION_STATE.completed?{result:row.public_result}:{})};
    });}catch(error){if(error instanceof MessagingUsageOperationError)throw new MessagingConnectionOperationError(error.code,{cause:error});throw error;}
  }
}
