/** Prepares an open manual/OFF academy without any delivery, Google proof or real recipient. @module admission-entry-sample-database */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareContactVerificationDatabase } from "./contact-verification-database-fixture";
import { ADMISSION_ENTRY_SAMPLE } from "./constants/admission-entry-sample";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

/**
 * Seeds only configuration and its synthetic owner on an already guarded disposable branch.
 * @param database - Branch owned and removed by the current test run.
 * @param security - Independent generated keyrings shared privately with the native application server.
 * @returns A current manual/OFF tribe and the guarded SQL context for later effect assertions.
 */
export async function prepareAdmissionEntrySampleDatabase(database: AcademyAdmissionTestDatabase, security: MessagingSecurityConfig) {
  const fixture = await prepareContactVerificationDatabase(database, security);
  const tribeId = randomUUID(), slug = `entry-sample-${tribeId}`;
  await database.withContext(fixture.own, async (transaction) => {
    const activatedAt = (await transaction.execute<{ instant: string }>(sql`select clock_timestamp()::text as instant`)).rows[0].instant;
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},${ADMISSION_ENTRY_SAMPLE.tribeName},${slug},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},${ADMISSION_ENTRY_SAMPLE.academyAccessModel},true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},${TRIBE_MEMBER_ROLE.leader},${TRIBE_MEMBERSHIP_STATUS.active})`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,requires_whatsapp_number,mode,contact_type,is_open,requires_additional_verification,activated_at) values (${tribeId},false,${ADMISSION_POLICY_MODE.manualReview},${ADMISSION_CONTACT_TYPE.email},true,false,${activatedAt})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${activatedAt} where id=${tribeId}`);
  });
  return { ...fixture, tribeId, slug };
}
