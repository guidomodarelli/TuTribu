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

/** @param database - Confirmed isolated test branch. @param withSuccessor - Seeds an existing active guardian before cutover for the actual leadership transfer flow. @param historyAgeDays - Initializes a coherent old tenant/account/pending snapshot without editing persisted dates or the database clock. @returns Synthetic native accounts, original memberships and real owner composition without external RPC. */
export async function prepareTribeMembershipLifecycle(database: AcademyAdmissionTestDatabase, withSuccessor = false, historyAgeDays = 0) {
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
  const historical = { userId: randomUUID(), sessionId: randomUUID(), sessionToken: randomUUID(), email: "historical@example.test" };
  const memberIds = { leader: randomUUID(), applicant: randomUUID(), leaving: randomUUID(), successor: randomUUID() }, requestId = randomUUID(), historicalRequestId = randomUUID();
  await database.withContext({ userId: leader.userId, email: leader.email }, async (transaction) => {
    const createdAt = (await transaction.execute<{created_at: Date}>(sql`select clock_timestamp()-${historyAgeDays}*interval '1 day' as created_at`)).rows[0].created_at;
    for (const actor of [leader, applicant, leaving, ...(withSuccessor ? [successor] : []), ...(historyAgeDays > 0 ? [historical] : [])]) {
      const accountId = randomUUID(), subject = randomUUID();
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${actor.userId},'Synthetic lifecycle account',${actor.email},false,${createdAt},clock_timestamp())`);
      await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${actor.userId},'google',${subject},${createdAt},clock_timestamp())`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${actor.sessionId},${actor.userId},${actor.sessionToken},clock_timestamp()+interval '1 hour',${createdAt},clock_timestamp())`);
      await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${actor.sessionId},${actor.userId},${accountId},${subject},${actor.email})`);
    }
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,created_at) values (${tribeId},'Synthetic membership lifecycle',${slug},${leader.userId},${createdAt})`);
    await transaction.execute(sql`insert into public.tribe_members(id,tribe_id,user_id,role,status,status_reason,created_at) values (${memberIds.leader},${tribeId},${leader.userId},'leader','active','none',${createdAt}),(${memberIds.applicant},${tribeId},${applicant.userId},'tribemate','removed','subscription_inactive',${createdAt}),(${memberIds.leaving},${tribeId},${leaving.userId},'tribemate','muted','none',${createdAt})`);
    if (withSuccessor) await transaction.execute(sql`insert into public.tribe_members(id,tribe_id,user_id,role,status,created_at) values (${memberIds.successor},${tribeId},${successor.userId},'guardian','active',${createdAt})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    const activation = historyAgeDays > 0 ? createdAt : (await transaction.execute<{instant: Date}>(sql`select clock_timestamp() as instant`)).rows[0].instant;
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at,created_at,updated_at) values (${tribeId},true,${activation},${createdAt},clock_timestamp())`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${activation} where id=${tribeId}`);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${tribeId},${applicant.userId},'common',clock_timestamp()+interval '29 days')`);
    if (historyAgeDays > 0) await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at,original_policy_snapshot) values (${historicalRequestId},${tribeId},${historical.userId},'common','email',${historical.email},'declared',${createdAt},${createdAt}::timestamptz+interval '30 days',(select jsonb_build_object('version',version,'verificationEpoch',verification_epoch,'mode',mode,'contactType',contact_type,'requiresAdditionalVerification',requires_additional_verification,'isOpen',is_open,'allowCommonExceptions',allow_common_exceptions) from public.academy_admission_policies where tribe_id=${tribeId}))`);
  });
  /** Creates an actual stored session reader and owner whose transaction never accepts another caller actor. */
  function owner(actor: typeof leader, executeOverride?: <Result>(context: TribeMembershipLifecycleContext, run: (transaction: RequestDatabase) => Promise<Result>) => Promise<Result>) {
    const own = { userId: actor.userId, email: actor.email };
    const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: actor.userId, sessionId: actor.sessionId }), (_identity, run) => database.withContext(own, run));
    const execute = executeOverride ?? (<Result>(_context: TribeMembershipLifecycleContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(own, run));
    const writer = new PostgresTribeMembershipLifecycleRepository(execute, async () => security, createAdmissionMembershipLifecycleWriter);
    return { accounts, writer, useCases: new ManageTribeMembershipUseCases(accounts, writer) };
  }
  return { tribeId, slug, leader, applicant, leaving, successor, historical, historicalRequestId, memberIds, requestId, security, owner };
}
