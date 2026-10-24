/** Reads historical candidate recovery facts on the supplied branch without retaining its parent executors. @module messaging-restore-history-fixture */
import { sql } from "drizzle-orm";
import type { MessagingRestoreSql } from "./messaging-restore-fixture";

export { readMessagingRestoreHistory } from "./messaging-restore-observations-native";

/** @param database - Owned parent before copying. @param tribeId - An existing synthetic historical academy. @returns After creating a coherent protected manual/OFF checkpoint; no past human activation is asserted. */
export function seedMessagingRestoreManualPolicy(database: MessagingRestoreSql, tribeId: string) {
  return database.withContext({ userId: null, email: null }, async (transaction) => {
    const now = (await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now;
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,requires_whatsapp_number,is_open,requires_additional_verification,activated_at) values (${tribeId},false,true,false,${now})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
  });
}
