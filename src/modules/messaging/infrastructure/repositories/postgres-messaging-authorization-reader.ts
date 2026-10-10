/** Reads current private messaging leadership and resource facts from the caller-owned transaction. @module postgres-messaging-authorization-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingAuthorizationReader, MessagingConnectionAuthorizationFacts, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

/** Selects a fixed server-owned resource version, never a caller-supplied SQL column. */
const MESSAGING_RESOURCE_SELECTION = { selected: "selected", candidate: "candidate", management: "management" } as const;
type MessagingResourceSelection = typeof MESSAGING_RESOURCE_SELECTION[keyof typeof MESSAGING_RESOURCE_SELECTION];

/** Keeps only consumed role and lifetime facts; backend rows are not schema revalidated. */
type MemberRow = {user_id:string;role:NonNullable<MessagingLeadershipFacts["membership"]>["role"];status:NonNullable<MessagingLeadershipFacts["membership"]>["status"]};

/** Resolves canonical current leadership without consulting historical tribe ownership or credential bytes. */
export class PostgresMessagingAuthorizationReader implements MessagingAuthorizationReader {
  /**
   * @param database - Existing guarded transaction, retaining tribe/session/member/resource locks.
   * @param sessionId - Actual server-resolved session identity; never a body field.
   * @param selection - Fixed composition choice for the selected or candidate resource version.
   */
  constructor(private readonly database:RequestDatabase,private readonly sessionId:string,private readonly selection:MessagingResourceSelection=MESSAGING_RESOURCE_SELECTION.selected){}

  /** Rechecks current SQL session expiry after resource waits. */
  private async sessionIsLive(userId:string):Promise<boolean>{
    return Boolean((await this.database.execute(sql`select id from public.session where id=${this.sessionId} and "userId"=${userId} and "expiresAt">clock_timestamp()`)).rows[0]);
  }

  /**
   * Locks tenant/session/actor and canonical active leader in the shared inward order.
   * @param tribeId - Exact tenant already selected by the inbound adapter.
   * @param userId - Server account identity that must match the guarded database actor.
   * @returns Current leadership facts or null for missing, expired, crossed or ambiguous authority.
   */
  async getCurrentLeadership(tribeId:string,userId:string):Promise<MessagingLeadershipFacts|null>{
    const actor=(await this.database.execute<{actor:string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if(!actor||actor!==userId)return null;
    if(!(await this.database.execute(sql`select id from public.tribes where id=${tribeId} for share`)).rows[0])return null;
    if(!(await this.database.execute(sql`select id from public.session where id=${this.sessionId} and "userId"=${userId} for share`)).rows[0])return null;
    const members=(await this.database.execute<MemberRow>(sql`select user_id,role,status from public.tribe_members where tribe_id=${tribeId} and (user_id=${userId} or role=${TRIBE_MEMBER_ROLE.leader}) order by user_id for share`)).rows;
    const leaders=members.filter((member)=>member.role===TRIBE_MEMBER_ROLE.leader&&member.status===TRIBE_MEMBERSHIP_STATUS.active);
    if(leaders.length!==1||!await this.sessionIsLive(userId))return null;
    const membership=members.find((member)=>member.user_id===userId);
    return {tribeId,leaderUserId:leaders[0].user_id,membership:membership?{userId:membership.user_id,role:membership.role,status:membership.status}:null};
  }

  /**
   * Reads only resource scope after current leader authority; no envelope/ciphertext is selected.
   * @param tribeId - Exact tenant of the connection.
   * @param connectionId - Server-selected private resource identity.
   * @returns Current selected/candidate metadata, or null without disclosing a foreign resource.
   */
  async getConnection(tribeId:string,connectionId:string):Promise<MessagingConnectionAuthorizationFacts|null>{
    const actor=(await this.database.execute<{actor:string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if(!actor)return null;
    const leadership=await this.getCurrentLeadership(tribeId,actor);
    if(leadership?.leaderUserId!==actor||leadership.membership?.role!==TRIBE_MEMBER_ROLE.leader||leadership.membership.status!==TRIBE_MEMBERSHIP_STATUS.active)return null;
    if(this.selection!==MESSAGING_RESOURCE_SELECTION.selected&&this.selection!==MESSAGING_RESOURCE_SELECTION.candidate&&this.selection!==MESSAGING_RESOURCE_SELECTION.management)return null;
    const version=this.selection===MESSAGING_RESOURCE_SELECTION.management?sql`case when connection.is_candidate and connection.candidate_version is not null then connection.candidate_version else connection.selected_version end`:this.selection===MESSAGING_RESOURCE_SELECTION.candidate?sql`connection.candidate_version`:sql`connection.selected_version`;
    const slot=this.selection===MESSAGING_RESOURCE_SELECTION.management?sql`((connection.is_candidate and connection.candidate_version is not null) or (connection.is_selected and connection.selected_version is not null))`:this.selection===MESSAGING_RESOURCE_SELECTION.candidate?sql`connection.is_candidate`:sql`connection.is_selected`;
    const row=(await this.database.execute<{id:string;tribe_id:string;version:number;contributed_by_user_id:string;state:MessagingConnectionAuthorizationFacts["state"];environment:string;security_epoch:string;retired_at:Date|string|null;secret_ref:string|null}>(sql`
      select connection.id,connection.tribe_id,resource.version,connection.contributed_by_user_id,connection.state,connection.environment,connection.security_epoch,coalesce(connection.retired_at,resource.retired_at) as retired_at,resource.secret_ref
      from public.tenant_messaging_connections connection join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id and resource.version=${version}
      where connection.id=${connectionId} and connection.tribe_id=${tribeId} and connection.contributed_by_user_id=${actor} and ${slot}
      for share of connection,resource
    `)).rows[0];
    if(!row||!await this.sessionIsLive(actor))return null;
    return {id:row.id,tribeId:row.tribe_id,version:row.version,contributedByUserId:row.contributed_by_user_id,state:row.state,environment:row.environment,securityEpoch:row.security_epoch,retiredAt:row.retired_at===null?null:new Date(row.retired_at),secretRef:row.secret_ref};
  }
}
