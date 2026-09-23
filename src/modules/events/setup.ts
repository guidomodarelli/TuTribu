import type {
  ApproveTribeEventProposalCommand,
  ClearTribeEventAttendanceCommand,
  ClearTribeEventOccurrenceExceptionCommand,
  CreateTribeEventCommand,
  CreateTribeEventProposalCommand,
  DeleteTribeEventCommand,
  GetTribeEventAttendanceReportQuery,
  GetTribeEventAttendanceStreakQuery,
  GetTribeEventQuery,
  ListTribeEventProposalsQuery,
  ListTribeEventsQuery,
  ListUpcomingTribeEventsQuery,
  RejectTribeEventProposalCommand,
  SaveTribeEventOccurrenceExceptionCommand,
  SetTribeEventAttendanceCommand,
  UpdateTribeEventCommand,
  WithdrawTribeEventProposalCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventAttendanceMutationResult,
  TribeEventAttendanceReportLookupResult,
  TribeEventAttendanceStreakResult,
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
  getTribeEventAttendanceStreak,
  setTribeEventAttendance,
} from "@/src/modules/events/application/use-cases/tribe-event-attendance-use-cases";
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
import type { TribeEventOccurrenceExceptionRepository } from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import type { TribeEventProposalRepository } from "@/src/modules/events/domain/repositories/tribe-event-proposal-repository";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

type EventsModuleDependencies = {
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
    getTribeEventAttendanceReport: (
      query: GetTribeEventAttendanceReportQuery
    ) => Promise<TribeEventAttendanceReportLookupResult>;
    getTribeEventAttendanceStreak: (
      query: GetTribeEventAttendanceStreakQuery
    ) => Promise<TribeEventAttendanceStreakResult | null>;
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
      getTribeEventAttendanceStreak: getTribeEventAttendanceStreak(dependencies),
      listTribeEventProposals: listTribeEventProposals(dependencies),
      listTribeEvents: listTribeEvents(dependencies),
      listUpcomingTribeEvents: listUpcomingTribeEvents(dependencies),
      rejectTribeEventProposal: rejectTribeEventProposal(dependencies),
      saveTribeEventOccurrenceException: saveTribeEventOccurrenceException(dependencies),
      setTribeEventAttendance: setTribeEventAttendance(dependencies),
      updateTribeEvent: updateTribeEvent(dependencies),
      withdrawTribeEventProposal: withdrawTribeEventProposal(dependencies),
    },
  };
}
