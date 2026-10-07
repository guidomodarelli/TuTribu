/** Projects the single usage owner inside an already authorized transaction without writes or provider access. @module postgres-messaging-usage-projection */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {MessagingUsagePolicyResult,MessagingUsagePolicyStateResult} from "@/src/modules/messaging/application/results/messaging-usage-policy-result";
import {messagingUsagePolicySchema} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import {MessagingUsageOperationError} from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_USAGE_POLICY_STATE} from "@/src/modules/messaging/constants/messaging-limits";
import {MESSAGE_USAGE_CATEGORY,MESSAGE_RESERVATION_STATE} from "@/src/modules/messaging/constants/message-delivery";

/** Consumed backend configuration columns, never schema-validated as a database row. */
export type MessagingUsagePolicyRow={version:number;allowed_countries:string[];verification_daily_limit:number;notification_daily_limit:number;platform_verification_daily_maximum:number;platform_notification_daily_maximum:number};
/** @param database - Existing authorized transaction. @param tribeId - Locked exact tenant. @param row - Consumed current configuration. @returns Guarded own aggregate facts without actor/recipient metadata. */
export async function projectMessagingUsagePolicy(database:RequestDatabase,tribeId:string,row:MessagingUsagePolicyRow):Promise<MessagingUsagePolicyResult>{
  const counts=(await database.execute<{verification:number;notification:number}>(sql`select count(*) filter(where category=${MESSAGE_USAGE_CATEGORY.verification})::int as verification,count(*) filter(where category=${MESSAGE_USAGE_CATEGORY.notification})::int as notification from public.messaging_usage_reservations where tribe_id=${tribeId} and state=${MESSAGE_RESERVATION_STATE.consumed} and reserved_at >= date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC' and reserved_at <= clock_timestamp()`)).rows[0];
  const result={version:row.version,allowedCountries:[...row.allowed_countries].sort(),verificationDailyLimit:row.verification_daily_limit,notificationDailyLimit:row.notification_daily_limit,platformMaximums:{verificationDailyLimit:row.platform_verification_daily_maximum,notificationDailyLimit:row.platform_notification_daily_maximum},consumption:{verificationToday:counts.verification,notificationToday:counts.notification}};
  const parsed=messagingUsagePolicySchema.safeParse(result);if(!parsed.success)throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.publicContractUnusable);return parsed.data;
}
/** @param database - Existing transaction whose caller holds tenant/identity authority. @param tribeId - Exact current tenant. @returns Sole current policy or true absence, without persisting defaults. */
export async function readMessagingUsageSnapshot(database:RequestDatabase,tribeId:string):Promise<MessagingUsagePolicyStateResult>{
  const row=(await database.execute<MessagingUsagePolicyRow>(sql`select version,allowed_countries,verification_daily_limit,notification_daily_limit,platform_verification_daily_maximum,platform_notification_daily_maximum from public.messaging_usage_policies where tribe_id=${tribeId} for share`)).rows[0];
  return row?{state:MESSAGING_USAGE_POLICY_STATE.configured,policy:await projectMessagingUsagePolicy(database,tribeId,row)}:{state:MESSAGING_USAGE_POLICY_STATE.notConfigured,policy:null};
}
