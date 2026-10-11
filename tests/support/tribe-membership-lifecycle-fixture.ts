/** Seeds real global sessions and protected membership state exclusively on the owned test branch. @module tribe-membership-lifecycle-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { SUBSCRIPTION_MEMBERSHIP_MIGRATIONS } from "./constants/subscription-membership-reconciliation";
import { createMessagingSecurityConfig, type MessagingKeyPurpose } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeMembershipLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-membership-lifecycle-repository";
import { ManageTribeMembershipUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-membership-use-cases";
import { createAdmissionMembershipLifecycleWriter } from "@/src/modules/academy-admissions/setup";
import type { TribeMembershipLifecycleContext } from "@/src/modules/tribes/domain/repositories/tribe-membership-lifecycle-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param database - Confirmed isolated test branch. @param withSuccessor - Seeds an existing active guardian before cutover for the actual leadership transfer flow. @returns Synthetic native accounts, original memberships and real owner composition without external RPC. */
export async function prepareTribeMembershipLifecycle(database: AcademyAdmissionTestDatabase, withSuccessor = false) {
  for (const migration of SUBSCRIPTION_MEMBERSHIP_MIGRATIONS) await database.applyMigration(migration);
  await database.applyMigration("20261005095000_guard_global_identity_context.sql");
  await database.applyMigration("20261005101000_guard_admission_operation_identity.sql");
  await database.applyMigration("20261007030000_capture_admission_decision_evidence.sql");
  const keyring = (purpose: MessagingKeyPurpose) => ({ activeKeyId: `${purpose}-synthetic`, keys: [{ id: `${purpose}-synthetic`, material: randomBytes(32) }] });
  const security = await createMessagingSecurityConfig({ environment: "synthetic-local", securityEpoch: "synthetic-membership", recoveryLocked: false, keyrings: { credential: keyring("credential"), otp_envelope: keyring("otp_envelope"), verification_mac: keyring("verification_mac"), invitation_token: keyring("invitation_token"), contact_fingerprint: keyring("contact_fingerprint"), operation_payload: keyring("operation_payload") } });
  const tribeId = randomUUID(), slug = `membership-${tribeId}`;
  const leader = { userId: randomUUID(), sessionId: randomUUID(), sessionToken: randomUUID(), email: "leader@example.test" };
  const applicant = { userId: randomUUID(), sessionId: randomUUID(), sessionToken: randomUUID(), email: "applicant@example.test" };
  const leaving = { userId: randomUUID(), sessionId: randomUUID(), sessionToken: randomUUID(), email: "leaving@example.test" };
  const successor = { userId: randomUUID(), sessionId: randomUUID(), sessionToken: randomUUID(), email: "successor@example.test" };
  const memberIds = { leader: randomUUID(), applicant: randomUUID(), leaving: randomUUID(), successor: randomUUID() }, requestId = randomUUID();
  await database.withContext({ userId: leader.userId, email: leader.email }, async (transaction) => {
    for (const actor of [leader, applicant, leaving, ...(withSuccessor ? [successor] : [])]) {
      const accountId = randomUUID(), subject = randomUUID();
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${actor.userId},'Synthetic lifecycle account',${actor.email},false,clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${actor.userId},'google',${subject},clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${actor.sessionId},${actor.userId},${actor.sessionToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${actor.sessionId},${actor.userId},${accountId},${subject},${actor.email})`);
    }
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic membership lifecycle',${slug},${leader.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(id,tribe_id,user_id,role,status,status_reason) values (${memberIds.leader},${tribeId},${leader.userId},'leader','active','none'),(${memberIds.applicant},${tribeId},${applicant.userId},'tribemate','removed','subscription_inactive'),(${memberIds.leaving},${tribeId},${leaving.userId},'tribemate','muted','none')`);
    if (withSuccessor) await transaction.execute(sql`insert into public.tribe_members(id,tribe_id,user_id,role,status) values (${memberIds.successor},${tribeId},${successor.userId},'guardian','active')`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    const activation = (await transaction.execute<{instant: Date}>(sql`select clock_timestamp() as instant`)).rows[0].instant;
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${activation})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${activation} where id=${tribeId}`);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${tribeId},${applicant.userId},'common',clock_timestamp()+interval '29 days')`);
  });
  /** Creates an actual stored session reader and owner whose transaction never accepts another caller actor. */
  function owner(actor: typeof leader, executeOverride?: <Result>(context: TribeMembershipLifecycleContext, run: (transaction: RequestDatabase) => Promise<Result>) => Promise<Result>) {
    const own = { userId: actor.userId, email: actor.email };
    const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: actor.userId, sessionId: actor.sessionId }), (_identity, run) => database.withContext(own, run));
    const execute = executeOverride ?? (<Result>(_context: TribeMembershipLifecycleContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(own, run));
    const writer = new PostgresTribeMembershipLifecycleRepository(execute, async () => security, createAdmissionMembershipLifecycleWriter);
    return { accounts, writer, useCases: new ManageTribeMembershipUseCases(accounts, writer) };
  }
  return { tribeId, slug, leader, applicant, leaving, successor, memberIds, requestId, security, owner };
}
