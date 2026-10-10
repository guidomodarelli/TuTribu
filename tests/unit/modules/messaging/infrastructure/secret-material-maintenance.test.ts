/** @vitest-environment node */
/** Exercises private credential destruction, retained references and revocation rollback with real PostgreSQL. @module secret-material-maintenance-tests */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase,type AcademyAdmissionTestDatabase} from "@/tests/support/academy-admission-database";
import {prepareContactVerificationIssuer} from "@/tests/support/contact-verification-issuance-fixture";
import {PostgresSecretMaterialMaintenance} from "@/src/modules/messaging/infrastructure/repositories/postgres-secret-material-maintenance";
import {createRequestMessagingMaintenanceAuthorizer} from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";

/** Seeds only synthetic material and the real retired deadline; no private key or plaintext is returned. */
async function prepareRetired(database:AcademyAdmissionTestDatabase){
  const fixture=await prepareContactVerificationIssuer(database);
  await database.applyMigration("20261005100000_guard_messaging_secret_retirement.sql");
  await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_secret_envelopes set retired_at=clock_timestamp()-interval '25 hours' where connection_id=${fixture.scope.connectionId}`));
  return fixture;
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("retired credential material maintenance",()=>{
  it("should purge due bytes with a bounded authorized operation and preserve its version reference on replay",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRetired(database),secret=randomUUID();
      const authorize=createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/messaging",{headers:{authorization:`Bearer ${secret}`}}),()=>secret);
      const maintenance=new PostgresSecretMaterialMaintenance((run)=>database.withContext(fixture.own,run),authorize);
      expect(await maintenance.purgeRetired(1)).toBe(1);
      expect(await maintenance.purgeRetired(1)).toBe(0);
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select envelope.iv is null as iv_removed,envelope.ciphertext is null as ciphertext_removed,envelope.purged_at is not null as purged,resource.secret_ref=envelope.secret_ref as reference_retained from public.messaging_secret_envelopes envelope join public.messaging_connection_versions resource on resource.secret_ref=envelope.secret_ref where envelope.connection_id=${fixture.scope.connectionId}`)).rows).toEqual([{iv_removed:true,ciphertext_removed:true,purged:true,reference_retained:true}]);
      });
      await expect(maintenance.purgeRetired(0)).rejects.toMatchObject({code:"invalid_input"});
      await expect(maintenance.purgeRetired(101)).rejects.toMatchObject({code:"invalid_input"});
    });
  },180_000);

  it("should preserve an indeterminate commit failure and reconcile already purged bytes without restoring material",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRetired(database);let loseReply=true;
      const maintenance=new PostgresSecretMaterialMaintenance(async(run)=>{
        const result=await database.withContext(fixture.own,run);
        if(loseReply){loseReply=false;throw new Error("Synthetic purge commit response lost");}
        return result;
      },async()=>true);
      await expect(maintenance.purgeRetired(1)).rejects.toMatchObject({code:"operation_unresolved",cause:{message:"Synthetic purge commit response lost"}});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select iv is null as iv_removed,ciphertext is null as ciphertext_removed,purged_at is not null as purged from public.messaging_secret_envelopes where connection_id=${fixture.scope.connectionId}`)).rows)).toEqual([{iv_removed:true,ciphertext_removed:true,purged:true}]);
      expect(await maintenance.purgeRetired(1)).toBe(0);
    });
  },180_000);

  it("should rollback byte destruction if the live maintenance bearer is withdrawn before commit and deny a forged flag",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRetired(database),original=randomUUID();let current:string|undefined=original,checks=0;
      const authority=createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/messaging",{headers:{authorization:`Bearer ${original}`}}),()=>current);
      const maintenance=new PostgresSecretMaterialMaintenance((run)=>database.withContext(fixture.own,run),async()=>{const allowed=await authority();checks+=1;if(checks===2)current=undefined;return allowed;});
      await expect(maintenance.purgeRetired(1)).rejects.toMatchObject({code:"permission_denied"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select iv is not null as iv_retained,ciphertext is not null as ciphertext_retained,purged_at from public.messaging_secret_envelopes where connection_id=${fixture.scope.connectionId}`)).rows)).toEqual([{iv_retained:true,ciphertext_retained:true,purged_at:null}]);
      let checkouts=0;
      const forged=createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/messaging",{method:"POST",body:JSON.stringify({maintenance:true})}),()=>original);
      const denied=new PostgresSecretMaterialMaintenance((run)=>{checkouts+=1;return database.withContext(fixture.own,run);},forged);
      await expect(denied.purgeRetired(1)).rejects.toMatchObject({code:"permission_denied"});expect(checkouts).toBe(0);
    });
  },180_000);
});
