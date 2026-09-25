import { describe, expect, it, vi } from "vitest";

import {
  approveTribeEventProposal,
  createTribeEventProposal,
  listTribeEventProposals,
  rejectTribeEventProposal,
  withdrawTribeEventProposal,
} from "@/src/modules/events/application/use-cases/tribe-event-proposal-use-cases";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_PROPOSAL_LIMIT,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventProposal,
} from "@/src/modules/events/domain/entities/tribe-event";
import { createTribeEventProposalRepositoryDouble } from "../support/tribe-event-repository-doubles";

const PROPOSAL_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const TRIBE_SLUG = "matematica-pro";

const proposal: TribeEventProposal = {
  createdAt: "2026-05-01T12:00:00.000Z",
  description: "Repasamos parciales",
  durationMinutes: 90,
  eventId: null,
  eventType: "workshop",
  id: PROPOSAL_ID,
  proposerName: "Ana",
  reviewNote: null,
  reviewedAt: null,
  startsAt: "2026-05-20T21:00:00.000Z",
  status: "pending",
  title: "Taller de repaso",
};

const createdEvent: TribeEvent = {
  capacity: null,
  description: "Repasamos parciales",
  endsAt: "2026-05-20T22:30:00.000Z",
  eventType: "workshop",
  id: EVENT_ID,
  meetingUrl: null,
  recurrenceFrequency: "none",
  recurrenceUntil: null,
  startsAt: "2026-05-20T21:00:00.000Z",
  title: "Taller de repaso",
};

const approvalCommand = {
  capacity: null,
  description: "Repasamos parciales",
  endsAt: "2026-05-20T22:30:00.000Z",
  eventType: "workshop" as const,
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  proposalId: PROPOSAL_ID,
  recurrenceFrequency: "none" as const,
  recurrenceUntil: null,
  startsAt: "2026-05-20T21:00:00.000Z",
  title: "Taller de repaso",
  tribeSlug: TRIBE_SLUG,
  visibleMonth: "2026-05",
};

describe("tribe event proposal use cases", () => {
  it("creates a proposal with the anti-spam cap of pending proposals", async () => {
    const create = vi.fn(async () => ({
      proposal,
      status: TRIBE_EVENT_MUTATION_STATUS.proposalCreated,
    }));
    const execute = createTribeEventProposal({
      tribeEventProposalRepository: createTribeEventProposalRepositoryDouble({ create }),
    });

    await expect(
      execute({
        description: null,
        durationMinutes: 90,
        eventType: "workshop",
        startsAt: proposal.startsAt,
        title: proposal.title,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ proposal, status: TRIBE_EVENT_MUTATION_STATUS.proposalCreated });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ pendingLimit: TRIBE_EVENT_PROPOSAL_LIMIT.pendingPerMember })
    );
  });

  it("lists the panel with bounded sizes", async () => {
    const list = vi.fn(async () => ({
      canReviewProposals: true,
      pendingCount: 73,
      proposals: [proposal],
      status: TRIBE_EVENT_MUTATION_STATUS.found,
    }));
    const execute = listTribeEventProposals({
      tribeEventProposalRepository: createTribeEventProposalRepositoryDouble({ list }),
    });

    await expect(execute({ tribeSlug: TRIBE_SLUG })).resolves.toMatchObject({
      canReviewProposals: true,
      pendingCount: 73,
      proposals: [proposal],
    });
    expect(list).toHaveBeenCalledWith({
      authorListSize: TRIBE_EVENT_PROPOSAL_LIMIT.authorListSize,
      managerListSize: TRIBE_EVENT_PROPOSAL_LIMIT.managerListSize,
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("approves with the confirmed fields and returns the new event slots of the month", async () => {
    const approve = vi.fn(async () => ({
      event: createdEvent,
      proposal: { ...proposal, eventId: EVENT_ID, status: "approved" as const },
      status: TRIBE_EVENT_MUTATION_STATUS.proposalApproved,
    }));
    const execute = approveTribeEventProposal({
      tribeEventProposalRepository: createTribeEventProposalRepositoryDouble({ approve }),
    });

    const result = await execute(approvalCommand);

    expect(approve).toHaveBeenCalledWith({
      event: {
        capacity: null,
        description: "Repasamos parciales",
        endsAt: "2026-05-20T22:30:00.000Z",
        eventType: "workshop",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        recurrenceFrequency: "none",
        recurrenceUntil: null,
        startsAt: "2026-05-20T21:00:00.000Z",
        title: "Taller de repaso",
      },
      proposalId: PROPOSAL_ID,
      tribeSlug: TRIBE_SLUG,
    });
    expect(result).toMatchObject({
      event: { eventType: "workshop", id: EVENT_ID },
      occurrences: [{ eventType: "workshop", occurrenceKey: `${EVENT_ID}@${createdEvent.startsAt}` }],
      status: TRIBE_EVENT_MUTATION_STATUS.proposalApproved,
    });
  });

  it("applies the event business rules before approving", async () => {
    const approve = vi.fn();
    const execute = approveTribeEventProposal({
      tribeEventProposalRepository: createTribeEventProposalRepositoryDouble({ approve }),
    });

    await expect(
      execute({ ...approvalCommand, endsAt: "2026-05-20T20:00:00.000Z" })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidDate });
    await expect(
      execute({ ...approvalCommand, meetingUrl: "javascript:alert(1)" })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl });
    expect(approve).not.toHaveBeenCalled();
  });

  it("reports a proposal that was already resolved (double click or another manager)", async () => {
    const execute = approveTribeEventProposal({
      tribeEventProposalRepository: createTribeEventProposalRepositoryDouble({
        approve: vi.fn(async () => ({ status: TRIBE_EVENT_MUTATION_STATUS.proposalResolved })),
      }),
    });

    await expect(execute(approvalCommand)).resolves.toEqual({
      status: TRIBE_EVENT_MUTATION_STATUS.proposalResolved,
    });
  });

  it("forwards rejections with their note and withdrawals", async () => {
    const reject = vi.fn(async () => ({
      proposal: { ...proposal, reviewNote: "Ya hay un taller", status: "rejected" as const },
      status: TRIBE_EVENT_MUTATION_STATUS.proposalRejected,
    }));
    const withdraw = vi.fn(async () => ({ status: TRIBE_EVENT_MUTATION_STATUS.notFound }));
    const repository = createTribeEventProposalRepositoryDouble({ reject, withdraw });

    await expect(
      rejectTribeEventProposal({ tribeEventProposalRepository: repository })({
        proposalId: PROPOSAL_ID,
        reviewNote: "Ya hay un taller",
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toMatchObject({ status: TRIBE_EVENT_MUTATION_STATUS.proposalRejected });
    await expect(
      withdrawTribeEventProposal({ tribeEventProposalRepository: repository })({
        proposalId: PROPOSAL_ID,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.notFound });
    expect(reject).toHaveBeenCalledWith({
      proposalId: PROPOSAL_ID,
      reviewNote: "Ya hay un taller",
      tribeSlug: TRIBE_SLUG,
    });
  });
});
