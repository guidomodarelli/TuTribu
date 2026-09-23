import type {
  ApproveTribeEventProposalCommand,
  CreateTribeEventProposalCommand,
  ListTribeEventProposalsQuery,
  RejectTribeEventProposalCommand,
  WithdrawTribeEventProposalCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventProposalApproveResult,
  TribeEventProposalCreateResult,
  TribeEventProposalListLookupResult,
  TribeEventProposalReviewMutationResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { createBuenosAiresMonthRange } from "@/src/modules/events/application/services/buenos-aires-month";
import {
  NORMALIZED_EVENT_STATUS,
  normalizeTribeEventFields,
} from "@/src/modules/events/application/services/tribe-event-field-rules";
import {
  buildTribeEventOccurrences,
  toTribeEventResult,
} from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_PROPOSAL_LIMIT,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventProposalRepository } from "@/src/modules/events/domain/repositories/tribe-event-proposal-repository";

type TribeEventProposalDependencies = {
  tribeEventProposalRepository: TribeEventProposalRepository;
};

/**
 * "Proponer un encuentro": an active member proposes a meeting. The
 * repository enforces the membership and the anti-spam cap
 * (`TRIBE_EVENT_PROPOSAL_LIMIT.pendingPerMember`) under a per-member lock.
 */
export function createTribeEventProposal({
  tribeEventProposalRepository,
}: TribeEventProposalDependencies) {
  return async (
    command: CreateTribeEventProposalCommand
  ): Promise<TribeEventProposalCreateResult> =>
    tribeEventProposalRepository.create({
      description: command.description,
      durationMinutes: command.durationMinutes,
      eventType: command.eventType,
      pendingLimit: TRIBE_EVENT_PROPOSAL_LIMIT.pendingPerMember,
      startsAt: command.startsAt,
      title: command.title,
      tribeSlug: command.tribeSlug,
    });
}

/**
 * Proposals panel: managers get every pending proposal of the tribe; members
 * get their own proposals (any status) so they can follow and withdraw them.
 */
export function listTribeEventProposals({
  tribeEventProposalRepository,
}: TribeEventProposalDependencies) {
  return async (
    query: ListTribeEventProposalsQuery
  ): Promise<TribeEventProposalListLookupResult> =>
    tribeEventProposalRepository.list({
      authorListSize: TRIBE_EVENT_PROPOSAL_LIMIT.authorListSize,
      managerListSize: TRIBE_EVENT_PROPOSAL_LIMIT.managerListSize,
      tribeSlug: query.tribeSlug,
    });
}

/**
 * Approves a proposal with the event fields the manager confirmed. The same
 * business rules as creating an event apply; the repository creates the
 * event and resolves the proposal atomically, so a repeated or concurrent
 * approval gets `proposalResolved` instead of a second event.
 */
export function approveTribeEventProposal({
  tribeEventProposalRepository,
}: TribeEventProposalDependencies) {
  return async (
    command: ApproveTribeEventProposalCommand
  ): Promise<TribeEventProposalApproveResult> => {
    const normalizedFields = normalizeTribeEventFields(command);

    if (normalizedFields.status !== NORMALIZED_EVENT_STATUS.valid) {
      return { status: normalizedFields.status };
    }

    const result = await tribeEventProposalRepository.approve({
      event: normalizedFields.input,
      proposalId: command.proposalId,
      tribeSlug: command.tribeSlug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.proposalApproved) {
      return { status: result.status };
    }

    return {
      event: toTribeEventResult(result.event),
      occurrences:
        command.visibleMonth === null
          ? []
          : buildTribeEventOccurrences(
              [result.event],
              [],
              [],
              createBuenosAiresMonthRange(command.visibleMonth)
            ),
      proposal: result.proposal,
      status: result.status,
    };
  };
}

/**
 * Rejects a pending proposal with an optional note for the author.
 */
export function rejectTribeEventProposal({
  tribeEventProposalRepository,
}: TribeEventProposalDependencies) {
  return async (
    command: RejectTribeEventProposalCommand
  ): Promise<TribeEventProposalReviewMutationResult> =>
    tribeEventProposalRepository.reject(command);
}

/**
 * The author withdraws one of their pending proposals.
 */
export function withdrawTribeEventProposal({
  tribeEventProposalRepository,
}: TribeEventProposalDependencies) {
  return async (
    command: WithdrawTribeEventProposalCommand
  ): Promise<TribeEventProposalReviewMutationResult> =>
    tribeEventProposalRepository.withdraw(command);
}
