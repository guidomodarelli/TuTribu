import { describe, expect, it, vi, type Mock } from "vitest";

import { PostgresTribeEventOccurrenceExceptionRepository } from "@/src/modules/events/infrastructure/repositories/postgres-tribe-event-occurrence-exception-repository";
import { PostgresTribeEventProposalRepository } from "@/src/modules/events/infrastructure/repositories/postgres-tribe-event-proposal-repository";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const PROPOSAL_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const TRIBE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TRIBE_SLUG = "matematica-pro";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
        return getSqlText(chunk);
      }

      return "";
    })
    .join("");
}

/**
 * Runs the repository against a fake request transaction whose `execute`
 * answers each statement in order.
 */
function createExecutor(execute: Mock) {
  return async <T,>(callback: (database: never) => Promise<T>) =>
    callback({ execute } as never);
}

const WEEKLY_SCHEDULE = {
  endsAt: "2026-05-07T22:00:00.000Z",
  recurrenceFrequency: "weekly" as const,
  recurrenceUntil: null,
  startsAt: "2026-05-07T21:00:00.000Z",
};

const proposalRow = {
  created_at: "2026-05-01T12:00:00.000Z",
  description: null,
  duration_minutes: 90,
  event_id: null,
  event_type: "workshop",
  id: PROPOSAL_ID,
  proposer_name: "Ana",
  review_note: null,
  reviewed_at: null,
  starts_at: "2026-05-20T21:00:00.000Z",
  status: "pending",
  title: "Taller de repaso",
};

describe("PostgresTribeEventOccurrenceExceptionRepository", () => {
  it("upserts the exception of a date only for event managers", async () => {
    const execute = vi.fn(async (..._statements: unknown[]) => ({
      rows: [
        {
          event_id: EVENT_ID,
          kind: "cancelled",
          new_ends_at: null,
          new_starts_at: null,
          original_starts_at: new Date("2026-05-14T21:00:00.000Z"),
          reason: "Feriado",
          status: "exception_saved",
        },
      ],
    }));
    const repository = new PostgresTribeEventOccurrenceExceptionRepository(
      createExecutor(execute)
    );

    await expect(
      repository.save({
        eventId: EVENT_ID,
        kind: "cancelled",
        newEndsAt: null,
        newStartsAt: null,
        originalStartsAt: "2026-05-14T21:00:00.000Z",
        reason: "Feriado",
        schedule: WEEKLY_SCHEDULE,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({
      exception: {
        eventId: EVENT_ID,
        kind: "cancelled",
        newEndsAt: null,
        newStartsAt: null,
        originalStartsAt: "2026-05-14T21:00:00.000Z",
        reason: "Feriado",
      },
      status: "exception_saved",
    });

    const saveSql = getSqlText(execute.mock.calls[0]?.[0]);

    expect(saveSql).toContain("public.can_manage_tribe_events(target_event.tribe_id)");
    expect(saveSql).toContain("on conflict (event_id, original_starts_at) do update");
    // Answers hold the event row FOR SHARE while they read the exception of
    // their date, so the write locks it FOR UPDATE to serialize with them.
    expect(saveSql).toContain("for update of events");
    expect(saveSql).toContain("inner join open_occurrence");
  });

  it("maps a missing event and a viewer who cannot manage events", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: "not_found" }] })
      .mockResolvedValueOnce({ rows: [{ status: "forbidden" }] })
      .mockResolvedValueOnce({ rows: [{ status: "exception_cleared" }] })
      .mockResolvedValueOnce({ rows: [{ status: "forbidden" }] });
    const repository = new PostgresTribeEventOccurrenceExceptionRepository(
      createExecutor(execute)
    );
    const command = {
      eventId: EVENT_ID,
      kind: "cancelled" as const,
      newEndsAt: null,
      newStartsAt: null,
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      reason: null,
      schedule: WEEKLY_SCHEDULE,
      tribeSlug: TRIBE_SLUG,
    };

    await expect(repository.save(command)).resolves.toEqual({ status: "not_found" });
    await expect(repository.save(command)).resolves.toEqual({ status: "forbidden" });
    await expect(repository.clear(command)).resolves.toEqual({ status: "exception_cleared" });
    await expect(repository.clear(command)).resolves.toEqual({ status: "forbidden" });
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain("for update of events");
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain("using target_event, restorable_occurrence");
  });

  it("refuses the write when the locked event no longer has the validated schedule", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [{ status: "schedule_changed" }] });
    const repository = new PostgresTribeEventOccurrenceExceptionRepository(
      createExecutor(execute)
    );

    await expect(
      repository.save({
        eventId: EVENT_ID,
        kind: "cancelled",
        newEndsAt: null,
        newStartsAt: null,
        originalStartsAt: "2026-05-14T21:00:00.000Z",
        reason: null,
        schedule: WEEKLY_SCHEDULE,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ status: "schedule_changed" });
  });

  it("refills the waitlist of the restored date in the same transaction", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ restored: true, status: "exception_cleared" }] })
      .mockResolvedValueOnce({ rows: [{ promoted_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ restored: false, status: "exception_cleared" }] });
    const repository = new PostgresTribeEventOccurrenceExceptionRepository(
      createExecutor(execute)
    );
    const reference = {
      eventId: EVENT_ID,
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      tribeSlug: TRIBE_SLUG,
    };

    await expect(repository.clear(reference)).resolves.toEqual({ status: "exception_cleared" });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("public.refill_tribe_event_waitlists(");

    // Restoring a date without exception (a retry) has nothing to refill.
    await expect(repository.clear(reference)).resolves.toEqual({ status: "exception_cleared" });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("refuses the write and the restore when the database sees the occurrence ended", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: "occurrence_ended" }] })
      .mockResolvedValueOnce({ rows: [{ restored: false, status: "occurrence_ended" }] });
    const repository = new PostgresTribeEventOccurrenceExceptionRepository(
      createExecutor(execute)
    );

    await expect(
      repository.save({
        eventId: EVENT_ID,
        kind: "cancelled",
        newEndsAt: null,
        newStartsAt: null,
        originalStartsAt: "2026-05-14T21:00:00.000Z",
        reason: null,
        schedule: WEEKLY_SCHEDULE,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ status: "occurrence_ended" });
    await expect(
      repository.clear({
        eventId: EVENT_ID,
        originalStartsAt: "2026-05-14T21:00:00.000Z",
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ status: "occurrence_ended" });
    // Nothing was written, so there is nothing to refill.
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("refills the waitlist when a cancelled date is moved in the same transaction", async () => {
    const savedRow = {
      event_id: EVENT_ID,
      kind: "moved",
      new_ends_at: null,
      new_starts_at: new Date("2026-05-20T21:00:00.000Z"),
      original_starts_at: new Date("2026-05-14T21:00:00.000Z"),
      reason: null,
      status: "exception_saved",
    };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ ...savedRow, reactivated: true }] })
      .mockResolvedValueOnce({ rows: [{ promoted_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ ...savedRow, reactivated: false }] });
    const repository = new PostgresTribeEventOccurrenceExceptionRepository(
      createExecutor(execute)
    );
    const moveCommand = {
      eventId: EVENT_ID,
      kind: "moved" as const,
      newEndsAt: null,
      newStartsAt: "2026-05-20T21:00:00.000Z",
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      reason: null,
      schedule: WEEKLY_SCHEDULE,
      tribeSlug: TRIBE_SLUG,
    };

    await expect(repository.save(moveCommand)).resolves.toMatchObject({
      exception: { kind: "moved", originalStartsAt: "2026-05-14T21:00:00.000Z" },
      status: "exception_saved",
    });
    expect(execute).toHaveBeenCalledTimes(2);

    // Moving a date that was not cancelled keeps its waitlist as it was.
    await expect(repository.save(moveCommand)).resolves.toMatchObject({
      status: "exception_saved",
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("reads exceptions only for viewers who can read the tribe", async () => {
    const execute = vi.fn(async (..._statements: unknown[]) => ({
      rows: [
        {
          event_id: EVENT_ID,
          kind: "unknown",
          new_ends_at: null,
          new_starts_at: null,
          original_starts_at: "2026-05-14T21:00:00.000Z",
          reason: null,
        },
      ],
    }));
    const repository = new PostgresTribeEventOccurrenceExceptionRepository(
      createExecutor(execute)
    );

    await expect(repository.listByEvent({ eventId: EVENT_ID, tribeSlug: TRIBE_SLUG })).resolves.toEqual([]);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "public.can_read_tribe_content(tribes.id)"
    );
  });
});

describe("PostgresTribeEventProposalRepository", () => {
  const createCommand = {
    description: null,
    durationMinutes: 90,
    eventType: "workshop" as const,
    pendingLimit: 3,
    startsAt: "2026-05-20T21:00:00.000Z",
    title: "Taller de repaso",
    tribeSlug: TRIBE_SLUG,
  };
  const memberAccess = {
    can_manage: false,
    can_read: true,
    is_active_member: true,
    tribe_id: TRIBE_ID,
  };

  it("serializes the pending count per member and refuses a proposal over the cap", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [memberAccess] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ pending_count: "3" }] });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));

    await expect(repository.create(createCommand)).resolves.toEqual({
      status: "proposal_limit_reached",
    });
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("pg_advisory_xact_lock");
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("creates a proposal under the cap and reads it back with the author name", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [memberAccess] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
      .mockResolvedValueOnce({ rows: [{ id: PROPOSAL_ID }] })
      .mockResolvedValueOnce({ rows: [proposalRow] });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));

    await expect(repository.create(createCommand)).resolves.toMatchObject({
      proposal: { eventType: "workshop", id: PROPOSAL_ID, proposerName: "Ana", status: "pending" },
      status: "proposal_created",
    });
  });

  it("rejects proposals from viewers who are not active members", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ ...memberAccess, is_active_member: false }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));

    await expect(repository.create(createCommand)).resolves.toEqual({ status: "forbidden" });
    await expect(repository.create(createCommand)).resolves.toEqual({ status: "not_found" });
  });

  it("locks the proposal and never creates an event for a resolved one", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({
      rows: [
        {
          can_manage: true,
          proposed_by: "member-1",
          status: "approved",
          tribe_id: TRIBE_ID,
          viewer_id: "leader-1",
        },
      ],
    });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));

    await expect(
      repository.approve({
        event: {
          capacity: null,
          description: null,
          endsAt: null,
          eventType: "workshop",
          meetingUrl: null,
          recurrenceFrequency: "none",
          recurrenceUntil: null,
          startsAt: "2026-05-20T21:00:00.000Z",
          title: "Taller de repaso",
        },
        proposalId: PROPOSAL_ID,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ status: "proposal_resolved" });
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("for update of event_proposals");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("creates the event and resolves the proposal in the same transaction", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({
        rows: [
          {
            can_manage: true,
            proposed_by: "member-1",
            status: "pending",
            tribe_id: TRIBE_ID,
            viewer_id: "leader-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            capacity: null,
            description: null,
            ends_at: null,
            event_type: "workshop",
            id: EVENT_ID,
            meeting_url: null,
            recurrence_frequency: "none",
            recurrence_until: null,
            starts_at: "2026-05-20T21:00:00.000Z",
            title: "Taller de repaso",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...proposalRow, event_id: EVENT_ID, reviewed_at: "2026-05-02T12:00:00.000Z", status: "approved" }],
      });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));

    await expect(
      repository.approve({
        event: {
          capacity: null,
          description: null,
          endsAt: null,
          eventType: "workshop",
          meetingUrl: null,
          recurrenceFrequency: "none",
          recurrenceUntil: null,
          startsAt: "2026-05-20T21:00:00.000Z",
          title: "Taller de repaso",
        },
        proposalId: PROPOSAL_ID,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toMatchObject({
      event: { eventType: "workshop", id: EVENT_ID },
      proposal: { eventId: EVENT_ID, status: "approved" },
      status: "proposal_approved",
    });
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain("insert into public.events");
    expect(getSqlText(execute.mock.calls[3]?.[0])).toContain("update public.event_proposals");
  });

  it("locks the reviewer membership before rechecking the manager authorization", async () => {
    const demotedReviewerProposal = {
      can_manage: false,
      proposed_by: "member-1",
      status: "pending",
      tribe_id: TRIBE_ID,
      viewer_id: "leader-1",
    };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [demotedReviewerProposal] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [demotedReviewerProposal] });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));

    await expect(
      repository.approve({
        event: {
          capacity: null,
          description: null,
          endsAt: null,
          eventType: "workshop",
          meetingUrl: null,
          recurrenceFrequency: "none",
          recurrenceUntil: null,
          startsAt: "2026-05-20T21:00:00.000Z",
          title: "Taller de repaso",
        },
        proposalId: PROPOSAL_ID,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ status: "forbidden" });
    await expect(
      repository.reject({ proposalId: PROPOSAL_ID, reviewNote: null, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({ status: "forbidden" });

    // A demotion or block of the reviewer waits for the FOR SHARE lock, and the
    // proposal lock reads can_manage_tribe_events in a later statement, so the
    // authorization it sees can no longer change before the review commits.
    for (const callIndex of [0, 2]) {
      const membershipLockSql = getSqlText(execute.mock.calls[callIndex]?.[0]);

      expect(membershipLockSql).toContain("tribe_members.user_id = public.current_app_user_id()");
      expect(membershipLockSql).toContain("for share of tribe_members");
      expect(getSqlText(execute.mock.calls[callIndex + 1]?.[0])).toContain(
        "for update of event_proposals"
      );
    }
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("hides someone else's proposal from a member who tries to withdraw it", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          can_manage: false,
          proposed_by: "member-2",
          status: "pending",
          tribe_id: TRIBE_ID,
          viewer_id: "member-1",
        },
      ],
    });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));

    await expect(
      repository.withdraw({ proposalId: PROPOSAL_ID, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({ status: "not_found" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("lists the pending queue for managers and the own proposals for members", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ ...memberAccess, can_manage: true }] })
      .mockResolvedValueOnce({ rows: [proposalRow] })
      .mockResolvedValueOnce({ rows: [memberAccess] })
      .mockResolvedValueOnce({ rows: [proposalRow] });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));
    const query = { authorListSize: 20, managerListSize: 50, tribeSlug: TRIBE_SLUG };

    await expect(repository.list(query)).resolves.toMatchObject({
      canReviewProposals: true,
      pendingCount: 0,
    });
    await expect(repository.list(query)).resolves.toMatchObject({
      canReviewProposals: false,
      pendingCount: 0,
    });
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("event_proposals.status =");
    expect(getSqlText(execute.mock.calls[3]?.[0])).toContain(
      "event_proposals.proposed_by = public.current_app_user_id()"
    );
  });

  it("ranks the author's pending proposals ahead of the capped resolved history", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [memberAccess] })
      .mockResolvedValueOnce({ rows: [proposalRow] });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));
    const query = { authorListSize: 20, managerListSize: 50, tribeSlug: TRIBE_SLUG };

    await expect(repository.list(query)).resolves.toMatchObject({
      canReviewProposals: false,
      proposals: [expect.objectContaining({ id: PROPOSAL_ID, status: "pending" })],
    });

    const authorQuery = getSqlText(execute.mock.calls[1]?.[0]).replace(/\s+/g, " ");

    // Older pending rows must survive the author cap: they still count toward
    // the anti-spam limit and "Mis propuestas" is the only place to withdraw them.
    expect(authorQuery).toMatch(
      /order by \(event_proposals\.status = pending\) desc, event_proposals\.created_at desc, event_proposals\.id desc limit/
    );
  });

  it("returns the uncapped pending total with the bounded manager queue in one query", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ ...memberAccess, can_manage: true }] })
      .mockResolvedValueOnce({ rows: [{ ...proposalRow, pending_count: "73" }] })
      .mockResolvedValueOnce({ rows: [{ ...memberAccess, can_manage: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeEventProposalRepository(createExecutor(execute));
    const query = { authorListSize: 20, managerListSize: 50, tribeSlug: TRIBE_SLUG };

    await expect(repository.list(query)).resolves.toMatchObject({
      canReviewProposals: true,
      pendingCount: 73,
      proposals: [expect.objectContaining({ id: PROPOSAL_ID })],
    });
    await expect(repository.list(query)).resolves.toMatchObject({
      canReviewProposals: true,
      pendingCount: 0,
      proposals: [],
    });
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
