/** Reads only the exact provider identity under current native resource/attempt authority. @module postgres-current-messaging-provider */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {AuthorizedMessagingContext,AuthorizedDeliveryMessagingContext,MessagingSecurityFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import {authorizeMessagingSecret,messagingSecretLifetimeIsCurrent} from "./postgres-messaging-secret-authorizer";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";

/** The existing caller-owned checkout keeps native principal and current purpose; it never opens plaintext. */
export type MessagingProviderDatabaseExecutor=<Result>(context:AuthorizedMessagingContext|AuthorizedDeliveryMessagingContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
/** Resource identity has no default provider and cannot be recovered from an unrelated connection version. */
export class PostgresCurrentMessagingProvider{
  /** @param execute - Guarded native principal with existing transaction discipline. @param readSecurityFacts - Current non-secret environment/epoch/recovery state. */
  constructor(private readonly execute:MessagingProviderDatabaseExecutor,private readonly readSecurityFacts:()=>Promise<MessagingSecurityFacts>){}
  /** @param context - Exact currently authorized human resource or committed delivery attempt. @returns Only the stored provider identity after current authority is checked on both sides of SQL waits. */
  async read(context:AuthorizedMessagingContext|AuthorizedDeliveryMessagingContext):Promise<string>{
    return this.execute(context,async(database)=>{
      await authorizeMessagingSecret(database,context);
      const row=(await database.execute<{provider:string}>(sql`select provider from public.tenant_messaging_connections where id=${context.connectionId} and tribe_id=${context.tribeId} for share`)).rows[0];
      const authority=await authorizeMessagingSecret(database,context),security=await this.readSecurityFacts(),now=new Date((await database.execute<{now:string|Date}>(sql`select clock_timestamp() as now`)).rows[0].now);
      if(!row||security.recoveryLocked||security.environment!==context.environment||security.securityEpoch!==context.securityEpoch||!messagingSecretLifetimeIsCurrent(authority,now))throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      return row.provider;
    });
  }
}
