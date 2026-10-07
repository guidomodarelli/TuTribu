/** Projects only own transport after current native session and leader/challenge-owner authorization. @module postgres-message-delivery-reader */
import "server-only";
import {sql} from "drizzle-orm";
import type {z} from "zod";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {MessageDeliveryReader,MessageDeliveryReadContext} from "@/src/modules/messaging/domain/repositories/message-delivery-reader";
import {messageDeliverySchema} from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {TRIBE_MEMBERSHIP_STATUS} from "@/src/modules/tribes/constants/tribe-page-access";

/** Reads only fields used by the owned projection; no backend schema validation or provider/body fields. */
type DeliveryRow={id:string;state:z.infer<typeof messageDeliverySchema>["state"];purpose:z.infer<typeof messageDeliverySchema>["purpose"];channel:z.infer<typeof messageDeliverySchema>["channel"];created_at:Date|string;last_outcome:string|null};
/** Minimal session/canonical-role checks do not load keyrings or require a current connection credential. */
export class PostgresMessageDeliveryReader implements MessageDeliveryReader<z.infer<typeof messageDeliverySchema>>{
  /** @param execute - Actual native principal's protected existing database executor. */
  constructor(private readonly execute:<Result>(context:MessageDeliveryReadContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>){}
  /** @param database - Protected current actor transaction. @param context - Native identity and exact tenant. @param deliveryId - Own transport identity. @returns Whether canonical leader or associated challenge owner may read, with role/session locked until projection. */
  private async authorize(database:RequestDatabase,context:MessageDeliveryReadContext,deliveryId:string):Promise<boolean>{
    if((await database.execute<{actor:string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor!==context.actorUserId)throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
    if(!(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} and "expiresAt">clock_timestamp() for share`)).rows[0])throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
    if(!(await database.execute(sql`select id from public.tribes where id=${context.tribeId} for share`)).rows[0])return false;
    const leaders=(await database.execute<{user_id:string}>(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
    // Resend, dispatch and material purge hold delivery before its challenge.
    if(!(await database.execute(sql`select id from public.message_deliveries where id=${deliveryId} and tribe_id=${context.tribeId} for share`)).rows[0])return false;
    const ownsChallenge=Boolean((await database.execute(sql`select id from public.contact_verification_challenges where delivery_id=${deliveryId} and tribe_id=${context.tribeId} and user_id=${context.actorUserId} for share`)).rows[0]);
    if(!(await database.execute(sql`select id from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} and "expiresAt">clock_timestamp()`)).rows[0])throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
    return ownsChallenge||leaders.length===1&&leaders[0].user_id===context.actorUserId;
  }
  /** @param context - Current native principal and tenant. @param deliveryId - Exact owned resource. @returns Minimal guarded transport, without provider ID/body/recipient/key or state mutation. */
  async read(context:MessageDeliveryReadContext,deliveryId:string){
    return this.execute(context,async(database)=>{
      if(!await this.authorize(database,context,deliveryId))return null;
      const row=(await database.execute<DeliveryRow>(sql`select id,state,purpose,channel,created_at,last_outcome from public.message_deliveries where id=${deliveryId} and tribe_id=${context.tribeId} for share`)).rows[0];
      if(!await this.authorize(database,context,deliveryId)||!row)return null;
      const safeReason=Object.values(MESSAGING_ERROR_CODE).find((code)=>code===row.last_outcome);
      return messageDeliverySchema.parse({id:row.id,state:row.state,purpose:row.purpose,channel:row.channel,createdAt:new Date(row.created_at).toISOString(),...(safeReason?{safeReason}:{})});
    });
  }
}
