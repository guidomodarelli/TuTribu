import { sql } from "drizzle-orm";

import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventCalendarFeedSnapshot,
  TribeEventCalendarFeedSubscription,
  TribeEventCalendarFeedTokenOwner,
} from "@/src/modules/events/domain/entities/tribe-event-calendar-feed";
import type {
  IssueTribeEventCalendarFeedTokenCommand,
  ReadTribeEventCalendarFeedQuery,
  TribeEventCalendarFeedReader,
  TribeEventCalendarFeedSubscriptionLookup,
  TribeEventCalendarFeedTokenIssueResult,
  TribeEventCalendarFeedTokenQuery,
  TribeEventCalendarFeedTokenRepository,
  TribeEventCalendarFeedTokenRevokeResult,
} from "@/src/modules/events/domain/repositories/tribe-event-calendar-feed-repository";
import {
  TRIBE_EVENT_COLUMNS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS,
  buildSeriesInRangePredicate,
  mapDateValue,
  mapNullableDateValue,
  mapTribeEvent,
  mapTribeEventOccurrenceExceptions,
  type TribeEventDatabaseExecutor,
  type TribeEventOccurrenceExceptionRow,
  type TribeEventRow,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-sql";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Type filter of the feed series, applied in SQL before the row limit. An
 * empty selection keeps every type.
 */
function buildEventTypePredicate(eventTypes: ReadTribeEventCalendarFeedQuery["eventTypes"]) {
  return eventTypes.length === 0
    ? sql``
    : sql`and events.event_type = any(${sql.param([...eventTypes])}::text[])`;
}

/**
 * Builds a request-scoped executor whose `app.current_user_id` is `userId`
 * (null: no app user). The feed reader needs one without a user to resolve
 * the token and one bound to the token owner to read the calendar.
 */
export type TribeEventDatabaseExecutorFactory = (
  userId: string | null
) => TribeEventDatabaseExecutor;

type TokenAccessRow = {
  can_read: boolean | null;
  created_at: Date | string | null;
  last_used_at?: Date | string | null;
  tribe_id: string;
};

type SubscriptionRow = {
  created_at: Date | string;
  last_used_at: Date | string | null;
};

type ResolvedTokenRow = {
  token_hash: string;
  token_id: string;
  tribe_id: string;
  user_id: string;
};

type FeedTribeRow = {
  id: string;
  name: string;
};

type FeedSeriesRow = TribeEventRow & {
  updated_at: Date | string;
};

/**
 * Serializes regenerations of one member's token in one tribe.
 */
const FEED_TOKEN_LOCK_PREFIX = "event_calendar_feed_token:";
const FEED_TOKEN_LOCK_SEPARATOR = ":";

function mapSubscription(row: SubscriptionRow): TribeEventCalendarFeedSubscription {
  return {
    createdAt: mapDateValue(row.created_at),
    lastUsedAt: mapNullableDateValue(row.last_used_at),
  };
}

/**
 * Tribe of the slug, whether the signed-in member can read it, and their
 * active subscription (dates only, never the hash). No row: unknown slug.
 */
async function readTokenAccess(
  database: RequestDatabase,
  tribeSlug: string
): Promise<TokenAccessRow | null> {
  const result = await database.execute(sql`
    select
      tribes.id as tribe_id,
      coalesce(public.can_read_tribe_content(tribes.id), false) as can_read,
      active_token.created_at,
      active_token.last_used_at
    from public.tribes
    left join lateral (
      select
        event_calendar_feed_tokens.created_at,
        event_calendar_feed_tokens.last_used_at
      from public.event_calendar_feed_tokens
      where event_calendar_feed_tokens.tribe_id = tribes.id
        and event_calendar_feed_tokens.user_id = public.current_app_user_id()
        and event_calendar_feed_tokens.revoked_at is null
      limit 1
    ) active_token
      on true
    where tribes.slug = ${tribeSlug}
    limit 1
  `);

  return ((result.rows ?? [])[0] as TokenAccessRow | undefined) ?? null;
}

/**
 * Tokens of the signed-in member. Every statement repeats the owner guard
 * (`user_id = current_app_user_id()`) because the runtime role bypasses RLS;
 * the policies protect every other role.
 */
export class PostgresTribeEventCalendarFeedTokenRepository
  implements TribeEventCalendarFeedTokenRepository
{
  constructor(private readonly executeWithDatabase: TribeEventDatabaseExecutor) {}

  async findActive({
    tribeSlug,
  }: TribeEventCalendarFeedTokenQuery): Promise<TribeEventCalendarFeedSubscriptionLookup> {
    return this.executeWithDatabase(async (database) => {
      const access = await readTokenAccess(database, tribeSlug);

      if (!access) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      if (!access.can_read) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      return {
        status: TRIBE_EVENT_MUTATION_STATUS.found,
        subscription: access.created_at
          ? mapSubscription({
              created_at: access.created_at,
              last_used_at: access.last_used_at ?? null,
            })
          : null,
      };
    });
  }

  async issue({
    tokenHash,
    tribeSlug,
  }: IssueTribeEventCalendarFeedTokenCommand): Promise<TribeEventCalendarFeedTokenIssueResult> {
    return this.executeWithDatabase(async (database) => {
      const access = await readTokenAccess(database, tribeSlug);

      if (!access) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      if (!access.can_read) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      // Two regenerations at once (double click, two tabs) run one after the
      // other: each revokes the previous token before inserting its own, so
      // the partial unique index of active tokens is never hit. `revoked_at`
      // uses clock_timestamp(): now() is the start of this transaction, which
      // can be older than the token a concurrent regeneration committed while
      // this one waited for the lock (revoked_at >= created_at is a CHECK).
      await database.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(
            ${FEED_TOKEN_LOCK_PREFIX} || public.current_app_user_id() || ${FEED_TOKEN_LOCK_SEPARATOR} || ${access.tribe_id},
            0
          )
        )
      `);
      await database.execute(sql`
        update public.event_calendar_feed_tokens
        set revoked_at = timezone('utc', clock_timestamp())
        where event_calendar_feed_tokens.tribe_id = ${access.tribe_id}
          and event_calendar_feed_tokens.user_id = public.current_app_user_id()
          and event_calendar_feed_tokens.revoked_at is null
      `);

      const inserted = await database.execute(sql`
        insert into public.event_calendar_feed_tokens (user_id, tribe_id, token_hash)
        values (public.current_app_user_id(), ${access.tribe_id}, ${tokenHash})
        returning created_at, last_used_at
      `);
      const row = ((inserted.rows ?? [])[0] as SubscriptionRow | undefined) ?? null;

      return row
        ? {
            status: TRIBE_EVENT_MUTATION_STATUS.feedTokenIssued,
            subscription: mapSubscription(row),
          }
        : { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
    });
  }

  /**
   * Revokes the member's own link without requiring read access to the tribe
   * content (only the slug must resolve). A member who was blocked may no
   * longer see the tribe under strict RLS and then gets "not found"; their
   * link is already refused by the feed in that state.
   */
  async revoke({
    tribeSlug,
  }: TribeEventCalendarFeedTokenQuery): Promise<TribeEventCalendarFeedTokenRevokeResult> {
    return this.executeWithDatabase(async (database) => {
      const access = await readTokenAccess(database, tribeSlug);

      if (!access) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      await database.execute(sql`
        update public.event_calendar_feed_tokens
        set revoked_at = timezone('utc', clock_timestamp())
        where event_calendar_feed_tokens.tribe_id = ${access.tribe_id}
          and event_calendar_feed_tokens.user_id = public.current_app_user_id()
          and event_calendar_feed_tokens.revoked_at is null
      `);

      return { status: TRIBE_EVENT_MUTATION_STATUS.feedTokenRevoked };
    });
  }
}

/**
 * Session-less reader of the calendar feed. The token is resolved through
 * the `resolve_event_calendar_feed_token` SECURITY DEFINER function (no app
 * user); everything else runs in a transaction whose app user is the token
 * owner, repeating `can_read_tribe_content` and the token ownership in SQL,
 * so the owner's membership is checked on every request.
 */
export class PostgresTribeEventCalendarFeedReader implements TribeEventCalendarFeedReader {
  constructor(private readonly createExecutor: TribeEventDatabaseExecutorFactory) {}

  async resolveToken(tokenHash: string): Promise<TribeEventCalendarFeedTokenOwner | null> {
    return this.createExecutor(null)(async (database) => {
      const result = await database.execute(sql`
        select token_id, user_id, tribe_id, token_hash
        from public.resolve_event_calendar_feed_token(${tokenHash})
      `);
      const row = ((result.rows ?? [])[0] as ResolvedTokenRow | undefined) ?? null;

      return row
        ? {
            tokenHash: row.token_hash,
            tokenId: row.token_id,
            tribeId: row.tribe_id,
            userId: row.user_id,
          }
        : null;
    });
  }

  async readAsOwner(
    query: ReadTribeEventCalendarFeedQuery
  ): Promise<TribeEventCalendarFeedSnapshot | null> {
    return this.createExecutor(query.owner.userId)(async (database) => {
      const tribe = await this.readAccessibleTribe(database, query);

      if (!tribe) {
        return null;
      }

      // Calendar apps poll every hour or more often; the write happens at
      // most once per `lastUsedRefreshMinutes`, not on every request.
      await database.execute(sql`
        update public.event_calendar_feed_tokens
        set last_used_at = timezone('utc', now())
        where event_calendar_feed_tokens.id = ${query.owner.tokenId}
          and event_calendar_feed_tokens.user_id = public.current_app_user_id()
          and event_calendar_feed_tokens.revoked_at is null
          and (
            event_calendar_feed_tokens.last_used_at is null
            or event_calendar_feed_tokens.last_used_at
              < timezone('utc', now()) - make_interval(mins => ${query.lastUsedRefreshMinutes})
          )
      `);

      const seriesResult = await database.execute(sql`
        select ${TRIBE_EVENT_COLUMNS}, events.updated_at
        from public.events
        where events.tribe_id = ${tribe.id}
          and public.can_read_tribe_content(events.tribe_id)
          and ${buildSeriesInRangePredicate({
            rangeEnd: query.rangeEnd,
            rangeStart: query.rangeStart,
          })}
          ${buildEventTypePredicate(query.eventTypes)}
        order by events.starts_at desc, events.id asc
        limit ${query.maxSeries}
      `);
      const seriesRows = (seriesResult.rows ?? []) as FeedSeriesRow[];

      if (seriesRows.length === 0) {
        return { exceptions: [], series: [], tribeName: tribe.name };
      }

      // Every exception of the included series (not only the window): the
      // calendar app expands the RRULE over its whole history.
      const exceptionsResult = await database.execute(sql`
        select ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS}
        from public.event_occurrence_exceptions
        where event_occurrence_exceptions.tribe_id = ${tribe.id}
          and public.can_read_tribe_content(event_occurrence_exceptions.tribe_id)
          and event_occurrence_exceptions.event_id = any(${sql.param(
            seriesRows.map((row) => row.id)
          )}::uuid[])
        order by event_occurrence_exceptions.original_starts_at desc
        limit ${query.maxExceptions}
      `);

      return {
        exceptions: mapTribeEventOccurrenceExceptions(
          (exceptionsResult.rows ?? []) as TribeEventOccurrenceExceptionRow[]
        ),
        series: seriesRows.map((row) => ({
          event: mapTribeEvent(row),
          updatedAt: mapDateValue(row.updated_at),
        })),
        tribeName: tribe.name,
      };
    });
  }

  /**
   * The tribe of the slug, only when the token still belongs to it, is still
   * active, and its owner can read the tribe right now.
   */
  private async readAccessibleTribe(
    database: RequestDatabase,
    query: ReadTribeEventCalendarFeedQuery
  ): Promise<FeedTribeRow | null> {
    const result = await database.execute(sql`
      select tribes.id, tribes.name
      from public.tribes
      inner join public.event_calendar_feed_tokens
        on event_calendar_feed_tokens.tribe_id = tribes.id
      where tribes.slug = ${query.tribeSlug}
        and event_calendar_feed_tokens.id = ${query.owner.tokenId}
        and event_calendar_feed_tokens.user_id = public.current_app_user_id()
        and event_calendar_feed_tokens.revoked_at is null
        and public.can_read_tribe_content(tribes.id)
      limit 1
    `);

    return ((result.rows ?? [])[0] as FeedTribeRow | undefined) ?? null;
  }
}
