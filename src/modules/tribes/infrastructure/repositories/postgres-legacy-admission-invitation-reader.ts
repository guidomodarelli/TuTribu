/** Adapts the tribe-owned historical link to admission attribution on the original guarded transaction. @module postgres-legacy-admission-invitation-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { LegacyAdmissionInvitation, LegacyAdmissionInvitationQuery, LegacyAdmissionInvitationReader } from "@/src/modules/academy-admissions/domain/repositories/legacy-admission-invitation-reader";
import { hashTribeInvitationToken } from "../encryption/hash-tribe-invitation-token";

/** Reads only a proposed arrival; admission still owns policy, evidence, authorization and membership. */
export class PostgresLegacyAdmissionInvitationReader implements LegacyAdmissionInvitationReader {
  /** @param database - Original transaction already holding the admission tribe/account fence. */
  constructor(private readonly database: RequestDatabase) {}

  /**
   * Resolves and locks current attribution without touching subscription or invitation lifecycle.
   * @param query - Server-selected account/tribe and proposed token, never an actor flag.
   * @returns Minimal active own reference or absence; provider/PostgreSQL rows are consumed directly.
   */
  async findActiveByToken(query: LegacyAdmissionInvitationQuery): Promise<LegacyAdmissionInvitation | null> {
    const tokenHash = hashTribeInvitationToken(query.token);
    const row = (await this.database.execute<{ id: string; tribe_id: string }>(sql`
      select id,tribe_id from public.read_legacy_admission_invitation(
        ${query.tribeId},${query.userId},${query.sessionId},${tokenHash}
      )
    `)).rows[0];
    return row ? { id: row.id, tribeId: row.tribe_id } : null;
  }
}
