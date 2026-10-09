/** Reads bounded leader-only list metadata through the existing guarded database executor. @module postgres-allowlist-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { AllowlistReader, AllowlistPage, AllowlistQuery } from "../../domain/repositories/allowlist-management";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ALLOWLIST_CURSOR_SEPARATOR, ALLOWLIST_SEARCH_PATTERN, ALLOWLIST_SEARCH_ESCAPE, ALLOWLIST_CURSOR_TIMESTAMP_FORMAT, ALLOWLIST_CURSOR_TIME_ZONE } from "../../constants/allowlist-management";
import { authorizeAdmissionLeader } from "./postgres-admission-leader-authorizer";
import { mapAllowlistEntryRow, type AllowlistEntryRow } from "./allowlist-entry-row-mapper";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

type ContextExecutor = <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Holds current leader/session scope for the whole read without recency, keyrings or write effects. */
export class PostgresAllowlistReader implements AllowlistReader {
  /** @param execute - Existing safe checkout/transaction scope for the current account. */
  constructor(private readonly execute: ContextExecutor) {}

  /** @param database - Original read transaction. @param context - Current leader. @param resourceId - Exact authorized tribe or entry. @returns Nothing while the actor and academy mode remain available. */
  private async authorize(database: RequestDatabase, context: AuthorizedAdmissionContext, resourceId: string) {
    await authorizeAdmissionLeader(database, context, { action: ADMISSION_ACTION.manageAllowlist, resourceId });
    const settings = (await database.execute<{ access_model: string }>(sql`select access_model from public.tribe_academy_settings where tribe_id=${context.tribeId} for share`)).rows[0];
    if (settings?.access_model !== TRIBE_ACCESS_MODEL.academy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  }

  /** @param context - Actual current leader of the requested tribe. @param query - Boundary-validated search, state, cursor and page size. @returns Current entries and a stable next cursor without returning bindings or another tribe. */
  async list(context: AuthorizedAdmissionContext, query: AllowlistQuery): Promise<AllowlistPage> {
    return this.execute(context, async (database) => {
      await this.authorize(database, context, context.tribeId);
      const search = query.search ? `%${query.search.replace(ALLOWLIST_SEARCH_PATTERN, ALLOWLIST_SEARCH_ESCAPE)}%` : null;
      const filters = [sql`tribe_id=${context.tribeId}`];
      if (query.status) filters.push(sql`status=${query.status}`);
      if (search !== null) filters.push(sql`(normalized_contact ilike ${search} escape '\\' or display_name ilike ${search} escape '\\')`);
      if (query.cursor) filters.push(sql`(created_at,id)<(${query.cursor.createdAt}::timestamptz,${query.cursor.id}::uuid)`);
      const rows = (await database.execute<AllowlistEntryRow & { cursor_timestamp: string }>(sql`select id,tribe_id,contact_type,normalized_contact,display_name,status,version,origin,import_id,created_by_user_id,updated_by_user_id,created_at,updated_at,to_char(created_at at time zone ${ALLOWLIST_CURSOR_TIME_ZONE},${ALLOWLIST_CURSOR_TIMESTAMP_FORMAT}) as cursor_timestamp from public.academy_allowlist_entries where ${sql.join(filters, sql` and `)} order by created_at desc,id desc limit ${query.limit + 1}`)).rows;
      const pageRows = rows.slice(0, query.limit), entries = pageRows.map(mapAllowlistEntryRow), last = pageRows.at(-1);
      await this.authorize(database, context, context.tribeId);
      return { entries, nextCursor: rows.length > query.limit && last ? [last.cursor_timestamp, last.id].join(ALLOWLIST_CURSOR_SEPARATOR) : null };
    });
  }

  /** @param context - Actual current leader and exact entry scope. @param entryId - Own entry reference. @returns Current entity or absence without granting permission through the id. */
  async read(context: AuthorizedAdmissionContext, entryId: string) {
    return this.execute(context, async (database) => {
      await this.authorize(database, context, entryId);
      const row = (await database.execute<AllowlistEntryRow>(sql`select id,tribe_id,contact_type,normalized_contact,display_name,status,version,origin,import_id,created_by_user_id,updated_by_user_id,created_at,updated_at from public.academy_allowlist_entries where tribe_id=${context.tribeId} and id=${entryId}`)).rows[0];
      await this.authorize(database, context, entryId);
      return row ? mapAllowlistEntryRow(row) : null;
    });
  }
}
