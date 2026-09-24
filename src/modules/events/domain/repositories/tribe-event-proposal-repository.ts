import type {
  TRIBE_EVENT_MUTATION_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventProposal,
  TribeEventType,
} from "@/src/modules/events/domain/entities/tribe-event";
import type { PersistTribeEventCommand } from "@/src/modules/events/domain/repositories/tribe-event-repository";

/**
 * Persistence of member proposals. Authorization is repeated in SQL (the
 * runtime role bypasses RLS): creating needs an active membership, reviewing
 * needs `can_manage_tribe_events`, withdrawing needs to be the author.
 */

export type CreateTribeEventProposalRepositoryCommand = {
  description: string | null;
  durationMinutes: number;
  eventType: TribeEventType;
  /** Anti-spam cap of pending proposals per member, checked under a lock. */
  pendingLimit: number;
  startsAt: string;
  title: string;
  tribeSlug: string;
};

export type ListTribeEventProposalsRepositoryQuery = {
  /** Size of the author list (own proposals, newest first). */
  authorListSize: number;
  /** Size of the manager queue (pending proposals, oldest first). */
  managerListSize: number;
  tribeSlug: string;
};

export type TribeEventProposalReference = {
  proposalId: string;
  tribeSlug: string;
};

export type ApproveTribeEventProposalRepositoryCommand = TribeEventProposalReference & {
  /** Event fields confirmed (and possibly edited) by the manager. */
  event: Omit<PersistTribeEventCommand, "tribeSlug">;
};

export type RejectTribeEventProposalRepositoryCommand = TribeEventProposalReference & {
  reviewNote: string | null;
};

type ProposalFailureStatus =
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound
  | typeof TRIBE_EVENT_MUTATION_STATUS.proposalResolved;

export type TribeEventProposalCreationResult =
  | {
      proposal: TribeEventProposal;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.proposalCreated;
    }
  | {
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
        | typeof TRIBE_EVENT_MUTATION_STATUS.notFound
        | typeof TRIBE_EVENT_MUTATION_STATUS.proposalLimitReached;
    };

/**
 * `canReviewProposals` tells whether the list is the manager queue (every
 * pending proposal of the tribe) or the author's own proposals.
 * `pendingCount` is the uncapped number of pending proposals of the tribe for
 * managers (the queue itself is bounded by `managerListSize`) and 0 for
 * members.
 */
export type TribeEventProposalListing =
  | {
      canReviewProposals: boolean;
      pendingCount: number;
      proposals: TribeEventProposal[];
      status: typeof TRIBE_EVENT_MUTATION_STATUS.found;
    }
  | {
      status: typeof TRIBE_EVENT_MUTATION_STATUS.forbidden | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;
    };

export type TribeEventProposalApprovalResult =
  | {
      event: TribeEvent;
      proposal: TribeEventProposal;
      status: typeof TRIBE_EVENT_MUTATION_STATUS.proposalApproved;
    }
  | {
      status: ProposalFailureStatus;
    };

export type TribeEventProposalReviewResult =
  | {
      proposal: TribeEventProposal;
      status:
        | typeof TRIBE_EVENT_MUTATION_STATUS.proposalRejected
        | typeof TRIBE_EVENT_MUTATION_STATUS.proposalWithdrawn;
    }
  | {
      status: ProposalFailureStatus;
    };

export type TribeEventProposalRepository = {
  /**
   * Creates the event and marks the proposal approved in one transaction,
   * holding the proposal row lock: a second approval (double click or another
   * manager) finds it resolved and never creates a second event.
   */
  approve: (
    command: ApproveTribeEventProposalRepositoryCommand
  ) => Promise<TribeEventProposalApprovalResult>;
  create: (
    command: CreateTribeEventProposalRepositoryCommand
  ) => Promise<TribeEventProposalCreationResult>;
  list: (query: ListTribeEventProposalsRepositoryQuery) => Promise<TribeEventProposalListing>;
  reject: (
    command: RejectTribeEventProposalRepositoryCommand
  ) => Promise<TribeEventProposalReviewResult>;
  withdraw: (command: TribeEventProposalReference) => Promise<TribeEventProposalReviewResult>;
};
