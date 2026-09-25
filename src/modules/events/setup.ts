import type {
  ApproveTribeEventProposalCommand,
  ClearTribeEventAttendanceCommand,
  ClearTribeEventOccurrenceExceptionCommand,
  CreateTribeEventCommand,
  CreateTribeEventProposalCommand,
  DeleteTribeEventCommand,
  GetTribeEventAttendanceReportQuery,
  GetTribeEventAttendanceStreakQuery,
  GetTribeEventCalendarFeedQuery,
  GetTribeEventQuery,
  ListTribeEventProposalsQuery,
  ListTribeEventsQuery,
  ListUpcomingTribeEventsQuery,
  RejectTribeEventProposalCommand,
  SaveTribeEventOccurrenceExceptionCommand,
  SetTribeEventAttendanceCommand,
  TribeEventCalendarFeedTokenCommand,
  TribeEventCalendarFeedTokenIssueCommand,
  TribeEventCalendarFeedTokenRevokeCommand,
  UpdateTribeEventCommand,
  WithdrawTribeEventProposalCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventAttendanceMutationResult,
  TribeEventAttendanceReportLookupResult,
  TribeEventAttendanceStreakSnapshotResult,
  TribeEventCalendarFeedResult,
  TribeEventCalendarFeedSubscriptionLookupResult,
  TribeEventCalendarFeedTokenIssueResult,
  TribeEventCalendarFeedTokenRevokeResult,
  TribeEventCalendarResult,
  TribeEventDeleteResult,
  TribeEventListResult,
  TribeEventOccurrenceExceptionMutationResult,
  TribeEventProposalApproveResult,
  TribeEventProposalCreateResult,
  TribeEventProposalListLookupResult,
  TribeEventProposalReviewMutationResult,
  TribeEventResult,
  TribeEventSaveResult,
  TribeEventUpcomingListResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { getTribeEventAttendanceStreakSnapshot } from "@/src/modules/events/application/use-cases/get-tribe-event-attendance-streak-snapshot-use-case";
import { listUpcomingTribeEvents } from "@/src/modules/events/application/use-cases/list-upcoming-tribe-events-use-case";
import {
  createTribeEvent,
  deleteTribeEvent,
  getTribeEvent,
  getTribeEventCalendar,
  listTribeEvents,
  updateTribeEvent,
} from "@/src/modules/events/application/use-cases/manage-tribe-events-use-cases";
import {
  clearTribeEventAttendance,
  getTribeEventAttendanceReport,
  setTribeEventAttendance,
} from "@/src/modules/events/application/use-cases/tribe-event-attendance-use-cases";
import {
  getTribeEventCalendarFeed,
  getTribeEventCalendarFeedSubscription,
  issueTribeEventCalendarFeedToken,
  revokeTribeEventCalendarFeedToken,
} from "@/src/modules/events/application/use-cases/tribe-event-calendar-feed-use-cases";
import {
  clearTribeEventOccurrenceException,
  saveTribeEventOccurrenceException,
} from "@/src/modules/events/application/use-cases/tribe-event-occurrence-exception-use-cases";
import {
  approveTribeEventProposal,
  createTribeEventProposal,
  listTribeEventProposals,
  rejectTribeEventProposal,
  withdrawTribeEventProposal,
} from "@/src/modules/events/application/use-cases/tribe-event-proposal-use-cases";
import type {
  TribeEventCalendarFeedReader,
  TribeEventCalendarFeedTokenCodec,
  TribeEventCalendarFeedTokenRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-calendar-feed-repository";
import type { TribeEventOccurrenceExceptionRepository } from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import type { TribeEventProposalRepository } from "@/src/modules/events/domain/repositories/tribe-event-proposal-repository";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

type EventsModuleDependencies = {
  tribeEventCalendarFeedTokenCodec: TribeEventCalendarFeedTokenCodec;
  tribeEventCalendarFeedTokenRepository: TribeEventCalendarFeedTokenRepository;
  tribeEventOccurrenceExceptionRepository: TribeEventOccurrenceExceptionRepository;
  tribeEventProposalRepository: TribeEventProposalRepository;
  tribeEventRepository: TribeEventRepository;
};

type EventsModule = {
  useCases: {
    approveTribeEventProposal: (
      command: ApproveTribeEventProposalCommand
    ) => Promise<TribeEventProposalApproveResult>;
    clearTribeEventAttendance: (
      command: ClearTribeEventAttendanceCommand
    ) => Promise<TribeEventAttendanceMutationResult>;
    clearTribeEventOccurrenceException: (
      command: ClearTribeEventOccurrenceExceptionCommand
    ) => Promise<TribeEventOccurrenceExceptionMutationResult>;
    createTribeEvent: (command: CreateTribeEventCommand) => Promise<TribeEventSaveResult>;
    createTribeEventProposal: (
      command: CreateTribeEventProposalCommand
    ) => Promise<TribeEventProposalCreateResult>;
    deleteTribeEvent: (
      command: DeleteTribeEventCommand
    ) => Promise<TribeEventDeleteResult>;
    getTribeEvent: (query: GetTribeEventQuery) => Promise<TribeEventResult | null>;
    getTribeEventCalendar: (query: GetTribeEventQuery) => Promise<TribeEventCalendarResult | null>;
    getTribeEventCalendarFeedSubscription: (
      command: TribeEventCalendarFeedTokenCommand
    ) => Promise<TribeEventCalendarFeedSubscriptionLookupResult>;
    issueTribeEventCalendarFeedToken: (
      command: TribeEventCalendarFeedTokenIssueCommand
    ) => Promise<TribeEventCalendarFeedTokenIssueResult>;
    getTribeEventAttendanceReport: (
      query: GetTribeEventAttendanceReportQuery
    ) => Promise<TribeEventAttendanceReportLookupResult>;
    getTribeEventAttendanceStreakSnapshot: (
      query: GetTribeEventAttendanceStreakQuery
    ) => Promise<TribeEventAttendanceStreakSnapshotResult>;
    listTribeEventProposals: (
      query: ListTribeEventProposalsQuery
    ) => Promise<TribeEventProposalListLookupResult>;
    listTribeEvents: (query: ListTribeEventsQuery) => Promise<TribeEventListResult>;
    listUpcomingTribeEvents: (
      query: ListUpcomingTribeEventsQuery
    ) => Promise<TribeEventUpcomingListResult>;
    rejectTribeEventProposal: (
      command: RejectTribeEventProposalCommand
    ) => Promise<TribeEventProposalReviewMutationResult>;
    revokeTribeEventCalendarFeedToken: (
      command: TribeEventCalendarFeedTokenRevokeCommand
    ) => Promise<TribeEventCalendarFeedTokenRevokeResult>;
    saveTribeEventOccurrenceException: (
      command: SaveTribeEventOccurrenceExceptionCommand
    ) => Promise<TribeEventOccurrenceExceptionMutationResult>;
    setTribeEventAttendance: (
      command: SetTribeEventAttendanceCommand
    ) => Promise<TribeEventAttendanceMutationResult>;
    updateTribeEvent: (command: UpdateTribeEventCommand) => Promise<TribeEventSaveResult>;
    withdrawTribeEventProposal: (
      command: WithdrawTribeEventProposalCommand
    ) => Promise<TribeEventProposalReviewMutationResult>;
  };
};

export function buildEventsModule(dependencies: EventsModuleDependencies): EventsModule {
  return {
    useCases: {
      approveTribeEventProposal: approveTribeEventProposal(dependencies),
      clearTribeEventAttendance: clearTribeEventAttendance(dependencies),
      clearTribeEventOccurrenceException: clearTribeEventOccurrenceException(dependencies),
      createTribeEvent: createTribeEvent(dependencies),
      createTribeEventProposal: createTribeEventProposal(dependencies),
      deleteTribeEvent: deleteTribeEvent(dependencies),
      getTribeEvent: getTribeEvent(dependencies),
      getTribeEventAttendanceReport: getTribeEventAttendanceReport(dependencies),
      getTribeEventCalendar: getTribeEventCalendar(dependencies),
      getTribeEventCalendarFeedSubscription: getTribeEventCalendarFeedSubscription(dependencies),
      issueTribeEventCalendarFeedToken: issueTribeEventCalendarFeedToken(dependencies),
      getTribeEventAttendanceStreakSnapshot: getTribeEventAttendanceStreakSnapshot(dependencies),
      listTribeEventProposals: listTribeEventProposals(dependencies),
      listTribeEvents: listTribeEvents(dependencies),
      listUpcomingTribeEvents: listUpcomingTribeEvents(dependencies),
      rejectTribeEventProposal: rejectTribeEventProposal(dependencies),
      revokeTribeEventCalendarFeedToken: revokeTribeEventCalendarFeedToken(dependencies),
      saveTribeEventOccurrenceException: saveTribeEventOccurrenceException(dependencies),
      setTribeEventAttendance: setTribeEventAttendance(dependencies),
      updateTribeEvent: updateTribeEvent(dependencies),
      withdrawTribeEventProposal: withdrawTribeEventProposal(dependencies),
    },
  };
}

type EventsCalendarFeedModuleDependencies = {
  tribeEventCalendarFeedReader: TribeEventCalendarFeedReader;
  tribeEventCalendarFeedTokenCodec: TribeEventCalendarFeedTokenCodec;
};

type EventsCalendarFeedModule = {
  useCases: {
    getTribeEventCalendarFeed: (
      query: GetTribeEventCalendarFeedQuery
    ) => Promise<TribeEventCalendarFeedResult>;
  };
};

/**
 * Session-less slice of the events module used by the public calendar feed:
 * the token is the credential, so it is composed without any auth context.
 */
export function buildEventsCalendarFeedModule(
  dependencies: EventsCalendarFeedModuleDependencies
): EventsCalendarFeedModule {
  return {
    useCases: {
      getTribeEventCalendarFeed: getTribeEventCalendarFeed(dependencies),
    },
  };
}
