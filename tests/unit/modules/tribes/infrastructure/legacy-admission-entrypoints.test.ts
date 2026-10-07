/** @vitest-environment node */
/** Exercises actual legacy entrypoints under runtime bypass without a payment or external provider call. @module legacy-admission-entrypoints-tests */
import { createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { PostgresTribeFreeJoinRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-free-join-repository";
import { PostgresTribeInvitationRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-invitation-repository";
import { PostgresTribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";

/** Seeds a real synthetic tribe, policy marker and invitation, retaining only test-owned references. */
async function prepareEntryPoints(database:AcademyAdmissionTestDatabase,mode:"legacy"|"academy",protectedControl=false) {
  for(const migration of ["20261005090000_create_admission_identity_evidence.sql","20261005091000_create_academy_admission_core.sql","20261005091500_guard_admission_evidence_transitions.sql","20261005092000_create_tenant_messaging.sql","20261005092500_guard_messaging_attempts.sql","20261005093000_guard_academy_membership_sources.sql","20261006180000_guard_subscription_membership_sources.sql"]) await database.applyMigration(migration);
  const leaderId=randomUUID(),userId=randomUUID(),tribeId=randomUUID(),invitationId=randomUUID(),token=randomUUID();
  const slug=`entry-${tribeId}`,own={userId,email:`${userId}@example.test`},leader={userId:leaderId,email:null};
  await database.withContext(leader,async(transaction)=>{
    for(const id of [leaderId,userId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${id},'Synthetic entry account',${`${id}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,free_join_is_current,open_free_join_enabled) values (${tribeId},'Synthetic entry tribe',${slug},${leaderId},true,true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},${mode},${mode==="academy"})`);
    await transaction.execute(sql`insert into public.tribe_invitations(id,tribe_id,token_hash,created_by,status,subscription_association_type,created_at) values (${invitationId},${tribeId},${createHash('sha256').update(token).digest('hex')},${leaderId},'active','free',clock_timestamp())`);
    if(protectedControl) {
      const instant=(await transaction.execute<{instant:Date|string}>(sql`select clock_timestamp() as instant`)).rows[0].instant;
      await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${instant})`);
      await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${tribeId}`);
    }
  });
  const execute=<Result>(run:Parameters<typeof database.withContext<Result>>[1])=>database.withContext(own,run);
  return {leaderId,userId,tribeId,invitationId,token,slug,own,leader,execute,free:new PostgresTribeFreeJoinRepository(execute),invitations:new PostgresTribeInvitationRepository(execute)};
}

/** Configures a real synthetic membership price; provider access remains an injected own port. */
async function prepareMembershipPrice(database:AcademyAdmissionTestDatabase,fixture:Awaited<ReturnType<typeof prepareEntryPoints>>) {
  await database.withContext(fixture.leader,async(transaction)=>{
    const integrationId=randomUUID();
    await transaction.execute(sql`insert into public.tribe_payment_integrations(id,tribe_id,provider,account_label,status,access_token,token_expires_at,connected_by) values (${integrationId},${fixture.tribeId},'mercado_pago','Synthetic entry account','connected',${randomUUID()},clock_timestamp()+interval '1 day',${fixture.leaderId})`);
    await transaction.execute(sql`insert into public.tribe_subscription_prices(id,tribe_id,name,amount_cents,currency,frequency,status,is_current,mercado_pago_preapproval_plan_id,payment_integration_id,product_key,created_by) values (${randomUUID()},${fixture.tribeId},'Synthetic entry price',1500,'ARS','monthly','active',true,${randomUUID()},${integrationId},'membership',${fixture.leaderId})`);
    await transaction.execute(sql`update public.tribes set free_join_is_current=false where id=${fixture.tribeId}`);
  });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("legacy admission entrypoints",()=>{
  it("should return a safe closed result from the old invitation when protection is active without writing a membership",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareEntryPoints(database,"academy",true);
      expect(await fixture.invitations.accept({tribeSlug:fixture.slug,token:fixture.token})).toMatchObject({status:"invalid"});
      expect(await fixture.free.join({tribeSlug:fixture.slug})).toMatchObject({status:"forbidden"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows)).toEqual([]);
    });
  },180_000);

  it("should close a direct open checkout in an unprotected academy even when a current membership price remains stored",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareEntryPoints(database,"academy");
      await prepareMembershipPrice(database,fixture);
      let providerCalls=0;
      const unexpected=async()=>{providerCalls+=1;throw new Error("Controlled academy checkout unexpectedly called provider");};
      const repository=new PostgresTribeMemberSubscriptionRepository(fixture.execute,unexpected,unexpected,unexpected,unexpected,unexpected,unexpected,createPaidAdmissionResolutionWriter,randomUUID());
      const result=await repository.startOpenJoinSubscription({tribeSlug:fixture.slug,idempotencyKey:randomUUID()});
      expect(providerCalls).toBe(0);
      expect(result).toMatchObject({status:"missing_current_price"});
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.tribe_member_subscriptions where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
      });
    });
  },180_000);

  it.each(["open","invited","retry"] as const)("should preserve a real %s paid checkout and its blocked pending membership before provider confirmation",async(entryPoint)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareEntryPoints(database,"legacy");
      await prepareMembershipPrice(database,fixture);
      if(entryPoint==="invited") await database.withContext(fixture.leader,(transaction)=>transaction.execute(sql`update public.tribe_invitations set subscription_association_type='current' where id=${fixture.invitationId}`));
      if(entryPoint==="retry") await database.withContext(fixture.leader,async(transaction)=>{
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${fixture.userId},'tribemate','muted')`);
        await transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='payment_blocked' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`);
        const instant=(await transaction.execute<{instant:Date|string}>(sql`select clock_timestamp() as instant`)).rows[0].instant;
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${fixture.tribeId},true,${instant})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${fixture.tribeId}`);
        await transaction.execute(sql`update public.tribe_academy_settings set access_model='academy',admission_enabled=true where tribe_id=${fixture.tribeId}`);
      });
      let providerCalls=0;
      const providerId=randomUUID(),checkoutUrl=`https://checkout.example.test/${randomUUID()}`;
      const create=async()=>{providerCalls+=1;return {providerSubscriptionId:providerId,checkoutUrl};};
      const unexpected=async()=>{throw new Error("Classic checkout unexpectedly invoked a different provider operation");};
      const updateBackUrl=async()=>undefined;
      const repository=new PostgresTribeMemberSubscriptionRepository(fixture.execute,create,unexpected,unexpected,unexpected,updateBackUrl,unexpected,createPaidAdmissionResolutionWriter,randomUUID());
      const command={tribeSlug:fixture.slug,idempotencyKey:randomUUID()};
      const result=entryPoint==="invited" ? await repository.startCurrentPriceSubscription({...command,invitationToken:fixture.token})
        : entryPoint==="retry" ? await repository.retryCurrentPriceSubscriptionPayment(command)
        : await repository.startOpenJoinSubscription(command);
      expect(result).toMatchObject({status:"pending",checkoutUrl});
      expect(providerCalls).toBe(1);
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select role,status,status_reason from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows).toEqual([{role:"tribemate",status:"blocked",status_reason:"payment_blocked"}]);
        expect((await transaction.execute(sql`select product_key,status,mercado_pago_preapproval_id from public.tribe_member_subscriptions where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows).toEqual([{product_key:"membership",status:"pending",mercado_pago_preapproval_id:providerId}]);
      });
    });
  },180_000);

  it("should accept concurrent classic invitations once and preserve their stored free provenance",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareEntryPoints(database,"legacy");
      expect(await Promise.all([
        fixture.invitations.accept({tribeSlug:fixture.slug,token:fixture.token}),
        fixture.invitations.accept({tribeSlug:fixture.slug,token:fixture.token}),
      ])).toEqual([{status:"accepted"},{status:"accepted"}]);
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select role,status,joined_via,joined_via_invitation_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows).toEqual([{role:"tribemate",status:"active",joined_via:"free_invitation",joined_via_invitation_id:fixture.invitationId}]);
      });
    },{concurrentTransactions:2});
  },180_000);

  it("should report a revoked invitation to a non-member without creating membership or payment",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareEntryPoints(database,"legacy");
      await database.withContext(fixture.leader,(transaction)=>transaction.execute(sql`update public.tribe_invitations set status='revoked',revoked_at=clock_timestamp() where id=${fixture.invitationId}`));
      expect(await fixture.invitations.accept({tribeSlug:fixture.slug,token:fixture.token})).toEqual({status:"revoked"});
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.tribe_member_subscriptions where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
      });
    });
  },180_000);

  it("should retain protection after policy deletion and a return to classic settings",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareEntryPoints(database,"academy",true);
      await database.withContext(fixture.leader,async(transaction)=>{
        await transaction.execute(sql`delete from public.academy_admission_policies where tribe_id=${fixture.tribeId}`);
        await transaction.execute(sql`update public.tribe_academy_settings set access_model='legacy',admission_enabled=false where tribe_id=${fixture.tribeId}`);
      });
      expect(await fixture.invitations.accept({tribeSlug:fixture.slug,token:fixture.token})).toEqual({status:"invalid"});
      expect(await fixture.free.join({tribeSlug:fixture.slug})).toEqual({status:"forbidden"});
      await prepareMembershipPrice(database,fixture);
      let providerCalls=0;
      const unexpected=async()=>{providerCalls+=1;throw new Error("Protected entry unexpectedly invoked provider");};
      const repository=new PostgresTribeMemberSubscriptionRepository(fixture.execute,unexpected,unexpected,unexpected,unexpected,unexpected,unexpected,createPaidAdmissionResolutionWriter,randomUUID());
      expect(await repository.startOpenJoinSubscription({tribeSlug:fixture.slug,idempotencyKey:randomUUID()})).toEqual({status:"missing_current_price"});
      expect(providerCalls).toBe(0);
    });
  },180_000);

  it("should recheck current academy mode before reserving an initially eligible classic checkout",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareEntryPoints(database,"legacy");
      await prepareMembershipPrice(database,fixture);
      let changedMode=false,providerCalls=0;
      const execute:typeof fixture.execute=async(run)=>{
        const result=await fixture.execute(run);
        if(!changedMode){
          changedMode=true;
          await database.withContext(fixture.leader,(transaction)=>transaction.execute(sql`update public.tribe_academy_settings set access_model='academy',admission_enabled=true where tribe_id=${fixture.tribeId}`));
        }
        return result;
      };
      const unexpected=async()=>{providerCalls+=1;throw new Error("Changed academy mode unexpectedly invoked provider");};
      const repository=new PostgresTribeMemberSubscriptionRepository(execute,unexpected,unexpected,unexpected,unexpected,unexpected,unexpected,createPaidAdmissionResolutionWriter,randomUUID());
      expect(await repository.startOpenJoinSubscription({tribeSlug:fixture.slug,idempotencyKey:randomUUID()})).toEqual({status:"payment_blocked"});
      expect(changedMode).toBe(true);
      expect(providerCalls).toBe(0);
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.tribe_member_subscriptions where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
      });
    });
  },180_000);

  it("should preserve existing readable members behind a protected historical invitation without admitting another instance",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareEntryPoints(database,"academy");
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${fixture.userId},'guardian','muted')`));
      const before=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id,role,status,created_at from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows);
      await database.withContext(fixture.leader,async(transaction)=>{
        const instant=(await transaction.execute<{instant:Date|string}>(sql`select clock_timestamp() as instant`)).rows[0].instant;
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${fixture.tribeId},true,${instant})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${fixture.tribeId}`);
      });
      expect(await fixture.invitations.accept({tribeSlug:fixture.slug,token:fixture.token})).toMatchObject({status:"accepted"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id,role,status,created_at from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows)).toEqual(before);
    });
  },180_000);

  it("should preserve readable legacy membership and recover only a known commercial basic instance without changing its role or date",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareEntryPoints(database,"legacy");
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${fixture.userId},'tribemate','muted')`);
      });
      const before=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id,role,status,created_at from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows[0]);
      expect(await fixture.free.join({tribeSlug:fixture.slug})).toMatchObject({status:"already_member"});
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      expect(await fixture.free.join({tribeSlug:fixture.slug})).toMatchObject({status:"joined"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id,role,status,created_at from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows)).toEqual([before]);
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='none' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      expect(await fixture.free.join({tribeSlug:fixture.slug})).toMatchObject({status:"forbidden"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status,status_reason from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows)).toEqual([{status:"removed",status_reason:"none"}]);
    });
  },180_000);
});
