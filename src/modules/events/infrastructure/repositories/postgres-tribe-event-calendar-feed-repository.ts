import { sql } from "drizzle-orm";

import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
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
  buildSeriesWithOccurrenceInRangePredicate,
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
 * Type filter of the feed series, applied in SQL before the budgets. An
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
  calendar_sequence: number;
  /**
   * Complete set of still-valid exceptions of the series, aggregated as JSON
   * (timestamps come back as ISO strings); null when it has none.
   */
  exceptions: TribeEventOccurrenceExceptionRow[] | null;
  updated_at: Date | string;
};

/**
 * Serializes regenerations and revocations of one member's token in one tribe.
 */
const FEED_TOKEN_LOCK_PREFIX = "event_calendar_feed_token:";
const FEED_TOKEN_LOCK_SEPARATOR = ":";

/**
 * Takes the transaction-scoped lock of the signed-in member's token in the
 * tribe. Every write of that token (regeneration and revocation) takes it
 * first, so they apply in call order: the statements that follow start after
 * the previous writer committed and see its token.
 */
async function lockMemberFeedToken(database: RequestDatabase, tribeId: string): Promise<void> {
  await database.execute(sql`
    select pg_advisory_xact_lock(
      hashtextextended(
        ${FEED_TOKEN_LOCK_PREFIX} || public.current_app_user_id() || ${FEED_TOKEN_LOCK_SEPARATOR} || ${tribeId},
        0
      )
    )
  `);
}

/**
 * Revokes the signed-in member's active token in the tribe. `revoked_at` uses
 * clock_timestamp(): now() is the start of this transaction, which can be
 * older than a token another writer committed while this one waited for the
 * lock (revoked_at >= created_at is a CHECK).
 */
async function revokeActiveMemberFeedToken(
  database: RequestDatabase,
  tribeId: string
): Promise<void> {
  await database.execute(sql`
    update public.event_calendar_feed_tokens
    set revoked_at = timezone('utc', clock_timestamp())
    where event_calendar_feed_tokens.tribe_id = ${tribeId}
      and event_calendar_feed_tokens.user_id = public.current_app_user_id()
      and event_calendar_feed_tokens.revoked_at is null
  `);
}

/**
 * Reads, in ONE statement (one snapshot), the feed series that fit both
 * budgets together with their complete set of still-valid exceptions:
 *
 * 1. `candidate_series`: every series of the requested types with at least
 *    one occurrence overlapping the window (its cadence is checked in SQL,
 *    since nothing expands the series before the budgets) or a date moved
 *    into it, in feed order (most recent first). No row limit: a limit
 *    applied before the budgets could hide later series that still fit.
 * 2. `valid_exceptions`: the exceptions whose original start is still a
 *    slot of the current schedule (`is_tribe_event_series_occurrence`, the
 *    SQL mirror of the domain rule `buildTribeEventCalendarResult` applies).
 *    Stale rows kept after a schedule edit never count nor travel.
 * 3. `budget_walk`: greedy walk over the candidates in feed order. A series
 *    is kept when its valid exceptions and its components (1 + valid moved
 *    dates) fit what remains of both budgets; otherwise it is skipped and
 *    the walk goes on. It stops when the component budget is exhausted or
 *    no candidate remains. Costs are read from arrays by position, so every
 *    step is O(1) and the walk is linear in the candidates of the tribe.
 *
 * Reading series and exceptions in the same statement guarantees that a
 * concurrent exception change is seen together with the `calendar_sequence`
 * and `updated_at` it bumped, never paired with the previous ones.
 */
function buildFeedSnapshotStatement(tribeId: string, query: ReadTribeEventCalendarFeedQuery) {
  return sql`
    with recursive candidate_series as materialized (
      select
        ${TRIBE_EVENT_COLUMNS},
        events.updated_at,
        events.calendar_sequence,
        row_number() over (order by events.starts_at desc, events.id asc) as feed_position
      from public.events
      where events.tribe_id = ${tribeId}
        and public.can_read_tribe_content(events.tribe_id)
        and ${buildSeriesWithOccurrenceInRangePredicate({
          rangeEnd: query.rangeEnd,
          rangeStart: query.rangeStart,
        })}
        ${buildEventTypePredicate(query.eventTypes)}
    ),
    valid_exceptions as materialized (
      select ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS}
      from public.event_occurrence_exceptions
      inner join candidate_series
        on candidate_series.id = event_occurrence_exceptions.event_id
      where event_occurrence_exceptions.tribe_id = ${tribeId}
        and public.can_read_tribe_content(event_occurrence_exceptions.tribe_id)
        and public.is_tribe_event_series_occurrence(
          event_occurrence_exceptions.original_starts_at,
          candidate_series.starts_at,
          candidate_series.recurrence_frequency,
          candidate_series.recurrence_until
        )
    ),
    series_costs as (
      select
        candidate_series.feed_position,
        count(valid_exceptions.event_id) as exception_count,
        1 + count(valid_exceptions.event_id) filter (
          where valid_exceptions.kind = ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved}
        ) as component_count
      from candidate_series
      left join valid_exceptions
        on valid_exceptions.event_id = candidate_series.id
      group by candidate_series.feed_position
    ),
    cost_arrays as (
      select
        array_agg(series_costs.exception_count order by series_costs.feed_position) as exception_counts,
        array_agg(series_costs.component_count order by series_costs.feed_position) as component_counts
      from series_costs
    ),
    budget_walk (feed_position, remaining_exceptions, remaining_components, is_selected) as (
      select
        0::bigint,
        ${query.maxExceptions}::bigint,
        ${query.maxComponents}::bigint,
        false
      union all
      select
        budget_walk.feed_position + 1,
        case
          when next_cost.fits then budget_walk.remaining_exceptions - next_cost.exception_count
          else budget_walk.remaining_exceptions
        end,
        case
          when next_cost.fits then budget_walk.remaining_components - next_cost.component_count
          else budget_walk.remaining_components
        end,
        next_cost.fits
      from budget_walk
      cross join cost_arrays
      cross join lateral (
        select
          cost_arrays.exception_counts[budget_walk.feed_position + 1] as exception_count,
          cost_arrays.component_counts[budget_walk.feed_position + 1] as component_count,
          cost_arrays.exception_counts[budget_walk.feed_position + 1]
              <= budget_walk.remaining_exceptions
            and cost_arrays.component_counts[budget_walk.feed_position + 1]
              <= budget_walk.remaining_components as fits
      ) as next_cost
      where budget_walk.feed_position < cardinality(cost_arrays.exception_counts)
        and budget_walk.remaining_components > 0
    )
    select
      candidate_series.*,
      (
        select jsonb_agg(
          to_jsonb(valid_exceptions)
          order by valid_exceptions.original_starts_at desc
        )
        from valid_exceptions
        where valid_exceptions.event_id = candidate_series.id
      ) as exceptions
    from budget_walk
    inner join candidate_series
      on candidate_series.feed_position = budget_walk.feed_position
    where budget_walk.is_selected
    order by candidate_series.feed_position
  `;
}

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
      // the partial unique index of active tokens is never hit.
      await lockMemberFeedToken(database, access.tribe_id);
      await revokeActiveMemberFeedToken(database, access.tribe_id);

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
   *
   * It takes the same lock as `issue`: without it, a revocation racing a
   * regeneration could snapshot only the old token, find it already revoked
   * after waiting for its row, and report success while the new token stays
   * active. With the lock, the operation that runs last decides the outcome.
   */
  async revoke({
    tribeSlug,
  }: TribeEventCalendarFeedTokenQuery): Promise<TribeEventCalendarFeedTokenRevokeResult> {
    return this.executeWithDatabase(async (database) => {
      const access = await readTokenAccess(database, tribeSlug);

      if (!access) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      await lockMemberFeedToken(database, access.tribe_id);
      await revokeActiveMemberFeedToken(database, access.tribe_id);

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

      const feedResult = await database.execute(buildFeedSnapshotStatement(tribe.id, query));
      const seriesRows = (feedResult.rows ?? []) as FeedSeriesRow[];

      return {
        exceptions: mapTribeEventOccurrenceExceptions(
          seriesRows.flatMap((row) => row.exceptions ?? [])
        ),
        series: seriesRows.map((row) => ({
          calendarSequence: Number(row.calendar_sequence),
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
