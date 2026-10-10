/** Locks local lifecycle resources and rechecks current native authority without reading credentials. @module postgres-messaging-lifecycle-authorizer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingConnectionLifecycleContext, MessagingConnectionLifecycleOperation } from "../../domain/repositories/messaging-connection-lifecycle";
import type { TenantMessagingConnection } from "../../domain/entities/tenant-messaging-connection";
import { authorizeMessagingTribeManagement } from "./postgres-messaging-usage-authorizer";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** Only lifecycle fields needed by local actions are consumed; no row schema or credential lookup is introduced. */
export type LockedMessagingLifecycleRow={id:string;version:number;state:TenantMessagingConnection["state"];state_reason:string|null;retired_at:Date|string|null;is_selected:boolean};
/** @param database - Existing native transaction. @param context - Exact current account/leader/connection recency. @returns After current authority/lifetime checks. @throws AdmissionOperationError preserving a closed current denial and cause. */
export async function assertMessagingLifecycleAuthority(database:RequestDatabase,context:MessagingConnectionLifecycleContext):Promise<void>{
  try{await authorizeMessagingTribeManagement(database,context);}catch(error){if(error instanceof MessagingUsageOperationError)throw new AdmissionOperationError(Object.values(ADMISSION_ERROR_CODE).find((candidate)=>candidate===error.code)??ADMISSION_ERROR_CODE.unexpectedFailure,{cause:error});throw error;}
}
/** @param database - Existing native transaction. @param context - Current exact local scope. @param operation - Fixed server-selected action. @returns Own connection/version locks and current authority sampled after waits. @throws AdmissionOperationError before claim/effect on foreign/missing resource or expired authority. */
export async function authorizeMessagingLifecycleResource(database:RequestDatabase,context:MessagingConnectionLifecycleContext,operation:MessagingConnectionLifecycleOperation):Promise<LockedMessagingLifecycleRow>{
  if(context.operation!==operation)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  await assertMessagingLifecycleAuthority(database,context);
  const row=(await database.execute<LockedMessagingLifecycleRow>(sql`select id,version,state,state_reason,retired_at,is_selected from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId} for update`)).rows[0];
  if(!row)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  await database.execute(sql`select id from public.messaging_connection_versions where connection_id=${context.connectionId} and tribe_id=${context.tribeId} order by version for update`);
  await assertMessagingLifecycleAuthority(database,context);
  return row;
}
