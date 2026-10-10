/** Executes the private credential purge under current platform authority and an existing guarded transaction. @module postgres-secret-material-maintenance */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {SecretMaterialMaintenance} from "@/src/modules/messaging/domain/repositories/secret-material-maintenance";
import {MessagingSecretMaterialError} from "@/src/modules/messaging/domain/errors/messaging-secret-material-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {SECRET_MATERIAL_PURGE} from "@/src/modules/messaging/constants/secret-material-maintenance";

type MaterialDatabaseExecutor=<Result>(run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;

/** Requires live maintenance authority; it cannot recover credential bytes or alter provider state. */
export class PostgresSecretMaterialMaintenance implements SecretMaterialMaintenance {
  /**
   * @param execute - Existing guarded maintenance executor; no nested checkout occurs.
   * @param authorize - Current server-purpose authority, rechecked before and after persistence.
   */
  constructor(private readonly execute:MaterialDatabaseExecutor,private readonly authorize:()=>Promise<boolean>){}

  /**
   * Purges at most the requested number of due retired envelopes with SQL's SKIP LOCKED primitive.
   * @param limit - Integer batch size within the named SQL ceiling.
   * @returns Count only after confirmed commit; references and lifecycle metadata remain stored.
   * @throws MessagingSecretMaterialError when bounds/authority fail or commit visibility is indeterminate.
   */
  async purgeRetired(limit:number):Promise<number>{
    if(!Number.isInteger(limit)||limit<1||limit>SECRET_MATERIAL_PURGE.maximumBatchSize)throw new MessagingSecretMaterialError(MESSAGING_ERROR_CODE.invalidInput);
    try{
      if(!await this.authorize())throw new MessagingSecretMaterialError(MESSAGING_ERROR_CODE.permissionDenied);
      return await this.execute(async(database)=>{
        if(!await this.authorize())throw new MessagingSecretMaterialError(MESSAGING_ERROR_CODE.permissionDenied);
        const count=(await database.execute<{count:number}>(sql`select public.purge_retired_messaging_secret_material(${limit}) as count`)).rows[0].count;
        if(!await this.authorize())throw new MessagingSecretMaterialError(MESSAGING_ERROR_CODE.permissionDenied);
        return count;
      });
    }catch(error){
      if(error instanceof MessagingSecretMaterialError)throw error;
      throw new MessagingSecretMaterialError(MESSAGING_ERROR_CODE.operationUnresolved,{cause:error});
    }
  }
}
