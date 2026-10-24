/** @vitest-environment node */
/** Exercises current notification dependencies under actual native activation authority without keys, provider transport or settings initialization. @module messaging-selection-notifications-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionCreation } from "@/tests/support/messaging-connection-fixture";
import { PostgresMessagingSelectionDependencies } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-messaging-selection-dependencies";
import { authorizeMessagingSecret } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-secret-authorizer";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { readAdmissionEmailLifecycleDependency } from "@/src/modules/notifications/infrastructure/repositories/admission-email-lifecycle-reader";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("current notification requirements during selection",()=>{
  it("should require the owned enabled email channel even with no admission policy and preserve those independent settings",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database);await database.applyMigration("20261008161500_create_admission_email_settings.sql");const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Candidata de dependencias",apiKey:randomUUID()});if(created.state!=="completed")throw new Error("Expected encrypted candidate fixture");
      const context=await database.withContext(fixture.fixture.own,async(transaction):Promise<AuthorizedMessagingContext>=>{
        const secretRef=(await transaction.execute<{secret_ref:string}>(sql`select secret_ref from public.messaging_connection_versions where connection_id=${created.result.id} and version=1`)).rows[0].secret_ref;
        return{tribeId:fixture.context.tribeId,connectionId:created.result.id,connectionVersion:1,secretRef,environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch,requestId:randomUUID(),authorizationPurpose:"sensitive_leader",resourceId:created.result.id,actorUserId:fixture.context.actorUserId,sessionId:fixture.context.sessionId,accountId:fixture.context.accountId,subject:fixture.context.subject,operation:"activate_messaging_connection"};
      });
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        await transaction.execute(sql`select id from public.tribes where id=${context.tribeId} for update`);await authorizeMessagingSecret(transaction,context,true);const dependencies=new PostgresMessagingSelectionDependencies(transaction,readAdmissionEmailLifecycleDependency);
        expect(await dependencies.requiredChannels(context)).toEqual([]);expect((await transaction.execute(sql`select count(*)::int as count from public.admission_email_settings where tribe_id=${context.tribeId}`)).rows).toEqual([{count:0}]);
        await transaction.execute(sql`insert into public.admission_email_settings(tribe_id,enabled,enabled_at) values (${context.tribeId},true,clock_timestamp())`);const before=(await transaction.execute(sql`select enabled,version,enabled_at from public.admission_email_settings where tribe_id=${context.tribeId}`)).rows[0];expect(await dependencies.requiredChannels(context)).toEqual(["email"]);expect((await transaction.execute(sql`select enabled,version,enabled_at from public.admission_email_settings where tribe_id=${context.tribeId}`)).rows[0]).toEqual(before);expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_policies where tribe_id=${context.tribeId}`)).rows).toEqual([{count:0}]);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,contact_type,requires_additional_verification,phone_channel,allow_sms_alternative) values (${context.tribeId},'phone',true,'whatsapp',true)`);expect(await dependencies.requiredChannels(context)).toEqual(["whatsapp","sms","email"]);
        await transaction.execute(sql`update public.admission_email_settings set enabled=false,version=version+1 where tribe_id=${context.tribeId}`);expect(await dependencies.requiredChannels(context)).toEqual(["whatsapp","sms"]);
        await transaction.execute(sql`update public.academy_admission_policies set contact_type='email',phone_channel=null,allow_sms_alternative=false,version=version+1 where tribe_id=${context.tribeId}`);await transaction.execute(sql`update public.admission_email_settings set enabled=true,version=version+1 where tribe_id=${context.tribeId}`);expect(await dependencies.requiredChannels(context)).toEqual(["email"]);
      });
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`drop table public.admission_email_settings`));await expect(database.withContext(fixture.fixture.own,async(transaction)=>{await transaction.execute(sql`select id from public.tribes where id=${context.tribeId} for update`);await authorizeMessagingSecret(transaction,context,true);return new PostgresMessagingSelectionDependencies(transaction,readAdmissionEmailLifecycleDependency).requiredChannels(context);})).rejects.toMatchObject({cause:{code:"42P01"}});
    });
  },600_000);
});
