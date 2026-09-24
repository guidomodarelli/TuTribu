import { sql } from "drizzle-orm";

import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_PROPOSAL_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventProposal,
  TribeEventProposalStatus,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  ApproveTribeEventProposalRepositoryCommand,
  CreateTribeEventProposalRepositoryCommand,
  ListTribeEventProposalsRepositoryQuery,
  RejectTribeEventProposalRepositoryCommand,
  TribeEventProposalApprovalResult,
  TribeEventProposalCreationResult,
  TribeEventProposalListing,
  TribeEventProposalReference,
  TribeEventProposalRepository,
  TribeEventProposalReviewResult,
} from "@/src/modules/events/domain/repositories/tribe-event-proposal-repository";
import {
  RETURNING_TRIBE_EVENT_COLUMNS,
  mapCount,
  mapDateValue,
  mapNullableDateValue,
  mapTribeEvent,
  mapTribeEventType,
  type TribeEventDatabaseExecutor,
  type TribeEventRow,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-sql";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type ProposalRow = {
  created_at: Date | string;
  description: string | null;
  duration_minutes: number | string | null;
  event_id: string | null;
  event_type: string | null;
  id: string;
  proposer_name: string | null;
  review_note: string | null;
  reviewed_at: Date | string | null;
  starts_at: Date | string;
  status: string | null;
  title: string;
};

/**
 * Proposals panel row. Only the manager queue selects `pending_count`: a
 * window count evaluated before the `limit`, so it carries the uncapped
 * pending total of the tribe.
 */
type ProposalListRow = ProposalRow & {
  pending_count?: number | string | null;
};

type TribeAccessRow = {
  can_manage: boolean | null;
  can_read: boolean | null;
  is_active_member: boolean | null;
  tribe_id: string;
};

type LockedProposalRow = {
  can_manage: boolean | null;
  proposed_by: string;
  status: string | null;
  tribe_id: string;
  viewer_id: string | null;
};

/**
 * Prefix of the per-member advisory lock that serializes the anti-spam count
 * and the insert of a proposal (two concurrent submissions of the same
 * member can never both slip under the cap).
 */
const PROPOSAL_LOCK_PREFIX = "tribe_event_proposal:";
const PROPOSAL_LOCK_SEPARATOR = ":";

/**
 * Columns of a proposal plus the public name of its author (never the email).
 */
const PROPOSAL_COLUMNS = sql`
  event_proposals.id,
  event_proposals.title,
  event_proposals.description,
  event_proposals.starts_at,
  event_proposals.duration_minutes,
  event_proposals.event_type,
  event_proposals.status,
  event_proposals.review_note,
  event_proposals.reviewed_at,
  event_proposals.event_id,
  event_proposals.created_at,
  proposer.name as proposer_name
`;

function mapProposalStatus(value: string | null): TribeEventProposalStatus {
  return (
    Object.values(TRIBE_EVENT_PROPOSAL_STATUS).find((status) => status === value) ??
    TRIBE_EVENT_PROPOSAL_STATUS.pending
  );
}

function mapProposal(row: ProposalRow): TribeEventProposal {
  return {
    createdAt: mapDateValue(row.created_at),
    description: row.description,
    durationMinutes: mapCount(row.duration_minutes),
    eventId: row.event_id,
    eventType: mapTribeEventType(row.event_type),
    id: row.id,
    proposerName: row.proposer_name,
    reviewNote: row.review_note,
    reviewedAt: mapNullableDateValue(row.reviewed_at),
    startsAt: mapDateValue(row.starts_at),
    status: mapProposalStatus(row.status),
    title: row.title,
  };
}

async function readTribeAccess(
  database: RequestDatabase,
  tribeSlug: string
): Promise<TribeAccessRow | null> {
  const result = await database.execute(sql`
    select
      tribes.id as tribe_id,
      public.can_read_tribe_content(tribes.id) as can_read,
      public.is_active_tribe_member(tribes.id) as is_active_member,
      public.can_manage_tribe_events(tribes.id) as can_manage
    from public.tribes
    where tribes.slug = ${tribeSlug}
    limit 1
  `);

  return (result.rows?.[0] ?? null) as TribeAccessRow | null;
}

async function readProposal(
  database: RequestDatabase,
  proposalId: string
): Promise<TribeEventProposal> {
  const result = await database.execute(sql`
    select ${PROPOSAL_COLUMNS}
    from public.event_proposals
    left join public."user" proposer
      on proposer.id = event_proposals.proposed_by
    where event_proposals.id = ${proposalId}
  `);

  return mapProposal(result.rows?.[0] as ProposalRow);
}

/**
 * Locks the viewer's own membership in the tribe `FOR SHARE` before any
 * proposal write (create, withdraw, approve, reject). A concurrent demotion,
 * block, or removal of the viewer (any write on that row) waits until the
 * request commits, and a change that committed while this statement waited
 * is visible to the next statement, so the authorization read afterwards
 * (`is_active_tribe_member` by `readTribeAccess`, `can_manage_tribe_events`
 * and `can_read_tribe_content` by `lockProposal`) cannot go stale before
 * the write. The runtime role bypasses RLS, so without this lock a member
 * blocked after the access read could still insert a pending proposal. It
 * runs before the advisory and proposal locks to keep the membership → other
 * rows order that attendance answers also follow. No row (not a member) is
 * fine: the later read reports `forbidden` or `notFound`.
 */
async function lockViewerMembership(
  database: RequestDatabase,
  tribeSlug: string
): Promise<void> {
  await database.execute(sql`
    select tribe_members.id
    from public.tribe_members
    inner join public.tribes
      on tribes.id = tribe_members.tribe_id
    where tribes.slug = ${tribeSlug}
      and tribe_members.user_id = public.current_app_user_id()
    for share of tribe_members
  `);
}

/**
 * Locks the proposal row (FOR UPDATE) inside the request transaction. A
 * concurrent review of the same proposal waits here and then sees the
 * resolved status, which is what makes approval idempotent. Every write
 * calls `lockViewerMembership` first so the authorization read here stays
 * valid until the write commits.
 */
async function lockProposal(
  database: RequestDatabase,
  { proposalId, tribeSlug }: TribeEventProposalReference
): Promise<LockedProposalRow | null> {
  const result = await database.execute(sql`
    select
      event_proposals.tribe_id,
      event_proposals.proposed_by,
      event_proposals.status,
      public.can_manage_tribe_events(event_proposals.tribe_id) as can_manage,
      public.current_app_user_id() as viewer_id
    from public.event_proposals
    inner join public.tribes
      on tribes.id = event_proposals.tribe_id
    where event_proposals.id = ${proposalId}
      and tribes.slug = ${tribeSlug}
      and public.can_read_tribe_content(tribes.id)
    for update of event_proposals
  `);

  return (result.rows?.[0] ?? null) as LockedProposalRow | null;
}

/**
 * Status of a locked proposal a manager wants to review: missing, not a
 * manager, or no longer pending.
 */
function resolveReviewFailure(
  proposal: LockedProposalRow | null
):
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound
  | typeof TRIBE_EVENT_MUTATION_STATUS.proposalResolved
  | null {
  if (!proposal) {
    return TRIBE_EVENT_MUTATION_STATUS.notFound;
  }

  if (!proposal.can_manage) {
    return TRIBE_EVENT_MUTATION_STATUS.forbidden;
  }

  return proposal.status === TRIBE_EVENT_PROPOSAL_STATUS.pending
    ? null
    : TRIBE_EVENT_MUTATION_STATUS.proposalResolved;
}

/**
 * Postgres adapter of member proposals. Every statement runs in the request
 * transaction (`withRequestContext`) and repeats the authorization in SQL
 * because the runtime role bypasses RLS. This adapter is the only writer of
 * `event_proposals`: request roles may only read it, because RLS cannot
 * enforce the pending-proposal cap or the event created on approval.
 */
export class PostgresTribeEventProposalRepository implements TribeEventProposalRepository {
  constructor(private readonly executeWithDatabase: TribeEventDatabaseExecutor) {}

  async create(
    command: CreateTribeEventProposalRepositoryCommand
  ): Promise<TribeEventProposalCreationResult> {
    return this.executeWithDatabase(async (database) => {
      await lockViewerMembership(database, command.tribeSlug);
      const access = await readTribeAccess(database, command.tribeSlug);

      if (!access) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      if (!access.is_active_member) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      await database.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(
            ${PROPOSAL_LOCK_PREFIX} || ${access.tribe_id}::text || ${PROPOSAL_LOCK_SEPARATOR}
              || public.current_app_user_id(),
            0
          )
        )
      `);

      const pendingResult = await database.execute(sql`
        select count(*) as pending_count
        from public.event_proposals
        where event_proposals.tribe_id = ${access.tribe_id}
          and event_proposals.proposed_by = public.current_app_user_id()
          and event_proposals.status = ${TRIBE_EVENT_PROPOSAL_STATUS.pending}
      `);
      const pendingCount = mapCount(
        ((pendingResult.rows?.[0] ?? null) as { pending_count: number | string | null } | null)
          ?.pending_count ?? null
      );

      if (pendingCount >= command.pendingLimit) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.proposalLimitReached };
      }

      const insertResult = await database.execute(sql`
        insert into public.event_proposals (
          tribe_id,
          proposed_by,
          title,
          description,
          starts_at,
          duration_minutes,
          event_type,
          status,
          created_at,
          updated_at
        )
        values (
          ${access.tribe_id},
          public.current_app_user_id(),
          ${command.title},
          ${command.description},
          ${command.startsAt}::timestamptz,
          ${command.durationMinutes},
          ${command.eventType},
          ${TRIBE_EVENT_PROPOSAL_STATUS.pending},
          timezone('utc', now()),
          timezone('utc', now())
        )
        returning event_proposals.id
      `);
      const proposalId = (insertResult.rows?.[0] as { id: string }).id;

      return {
        proposal: await readProposal(database, proposalId),
        status: TRIBE_EVENT_MUTATION_STATUS.proposalCreated,
      };
    });
  }

  async list(query: ListTribeEventProposalsRepositoryQuery): Promise<TribeEventProposalListing> {
    return this.executeWithDatabase(async (database) => {
      const access = await readTribeAccess(database, query.tribeSlug);

      if (!access) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      if (!access.can_read) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      const canReviewProposals = Boolean(access.can_manage);
      const result = await database.execute(
        canReviewProposals
          ? sql`
              select ${PROPOSAL_COLUMNS},
                count(*) over () as pending_count
              from public.event_proposals
              left join public."user" proposer
                on proposer.id = event_proposals.proposed_by
              where event_proposals.tribe_id = ${access.tribe_id}
                and event_proposals.status = ${TRIBE_EVENT_PROPOSAL_STATUS.pending}
                and public.can_manage_tribe_events(event_proposals.tribe_id)
              order by event_proposals.created_at asc, event_proposals.id asc
              limit ${query.managerListSize}
            `
          : sql`
              select ${PROPOSAL_COLUMNS}
              from public.event_proposals
              left join public."user" proposer
                on proposer.id = event_proposals.proposed_by
              where event_proposals.tribe_id = ${access.tribe_id}
                and event_proposals.proposed_by = public.current_app_user_id()
              -- Pending rows first (bounded by the anti-spam cap) so resolved
              -- history can never push a withdrawable proposal past the limit.
              order by
                (event_proposals.status = ${TRIBE_EVENT_PROPOSAL_STATUS.pending}) desc,
                event_proposals.created_at desc,
                event_proposals.id desc
              limit ${query.authorListSize}
            `
      );

      const rows = (result.rows ?? []) as ProposalListRow[];

      return {
        canReviewProposals,
        pendingCount: canReviewProposals ? mapCount(rows[0]?.pending_count ?? null) : 0,
        proposals: rows.map(mapProposal),
        status: TRIBE_EVENT_MUTATION_STATUS.found,
      };
    });
  }

  async approve(
    command: ApproveTribeEventProposalRepositoryCommand
  ): Promise<TribeEventProposalApprovalResult> {
    return this.executeWithDatabase(async (database) => {
      await lockViewerMembership(database, command.tribeSlug);
      const lockedProposal = await lockProposal(database, command);
      const failure = resolveReviewFailure(lockedProposal);

      if (failure !== null || !lockedProposal) {
        return { status: failure ?? TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      const { event } = command;
      const eventResult = await database.execute(sql`
        insert into public.events as events (
          tribe_id,
          created_by,
          capacity,
          title,
          description,
          meeting_url,
          starts_at,
          ends_at,
          recurrence_frequency,
          recurrence_until,
          event_type,
          created_at,
          updated_at
        )
        values (
          ${lockedProposal.tribe_id},
          public.current_app_user_id(),
          ${event.capacity},
          ${event.title},
          ${event.description},
          ${event.meetingUrl},
          ${event.startsAt},
          ${event.endsAt},
          ${event.recurrenceFrequency},
          ${event.recurrenceUntil},
          ${event.eventType},
          timezone('utc', now()),
          timezone('utc', now())
        )
        ${RETURNING_TRIBE_EVENT_COLUMNS}
      `);
      const createdEvent = mapTribeEvent(eventResult.rows?.[0] as TribeEventRow);

      await database.execute(sql`
        update public.event_proposals
        set
          status = ${TRIBE_EVENT_PROPOSAL_STATUS.approved},
          reviewed_by = public.current_app_user_id(),
          reviewed_at = timezone('utc', now()),
          event_id = ${createdEvent.id},
          updated_at = timezone('utc', now())
        where event_proposals.id = ${command.proposalId}
          and event_proposals.status = ${TRIBE_EVENT_PROPOSAL_STATUS.pending}
      `);

      return {
        event: createdEvent,
        proposal: await readProposal(database, command.proposalId),
        status: TRIBE_EVENT_MUTATION_STATUS.proposalApproved,
      };
    });
  }

  async reject(
    command: RejectTribeEventProposalRepositoryCommand
  ): Promise<TribeEventProposalReviewResult> {
    return this.executeWithDatabase(async (database) => {
      await lockViewerMembership(database, command.tribeSlug);
      const failure = resolveReviewFailure(await lockProposal(database, command));

      if (failure !== null) {
        return { status: failure };
      }

      await database.execute(sql`
        update public.event_proposals
        set
          status = ${TRIBE_EVENT_PROPOSAL_STATUS.rejected},
          reviewed_by = public.current_app_user_id(),
          reviewed_at = timezone('utc', now()),
          review_note = ${command.reviewNote},
          updated_at = timezone('utc', now())
        where event_proposals.id = ${command.proposalId}
          and event_proposals.status = ${TRIBE_EVENT_PROPOSAL_STATUS.pending}
      `);

      return {
        proposal: await readProposal(database, command.proposalId),
        status: TRIBE_EVENT_MUTATION_STATUS.proposalRejected,
      };
    });
  }

  /**
   * Only the author withdraws; another member gets `notFound` so the
   * existence of someone else's proposal is never disclosed.
   */
  async withdraw(command: TribeEventProposalReference): Promise<TribeEventProposalReviewResult> {
    return this.executeWithDatabase(async (database) => {
      await lockViewerMembership(database, command.tribeSlug);
      const lockedProposal = await lockProposal(database, command);

      if (!lockedProposal || lockedProposal.proposed_by !== lockedProposal.viewer_id) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      if (lockedProposal.status !== TRIBE_EVENT_PROPOSAL_STATUS.pending) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.proposalResolved };
      }

      await database.execute(sql`
        update public.event_proposals
        set
          status = ${TRIBE_EVENT_PROPOSAL_STATUS.withdrawn},
          updated_at = timezone('utc', now())
        where event_proposals.id = ${command.proposalId}
          and event_proposals.proposed_by = public.current_app_user_id()
          and event_proposals.status = ${TRIBE_EVENT_PROPOSAL_STATUS.pending}
      `);

      return {
        proposal: await readProposal(database, command.proposalId),
        status: TRIBE_EVENT_MUTATION_STATUS.proposalWithdrawn,
      };
    });
  }
}
