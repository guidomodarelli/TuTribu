import type {
  ClearTribeEventAttendanceCommand,
  CreateTribeEventCommand,
  DeleteTribeEventCommand,
  GetTribeEventAttendanceReportQuery,
  GetTribeEventAttendanceStreakQuery,
  GetTribeEventQuery,
  ListTribeEventsQuery,
  ListUpcomingTribeEventsQuery,
  SetTribeEventAttendanceCommand,
  UpdateTribeEventCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventAttendanceMutationResult,
  TribeEventAttendanceReportLookupResult,
  TribeEventAttendanceStreakSnapshotResult,
  TribeEventDeleteResult,
  TribeEventListResult,
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
  listTribeEvents,
  updateTribeEvent,
} from "@/src/modules/events/application/use-cases/manage-tribe-events-use-cases";
import {
  clearTribeEventAttendance,
  getTribeEventAttendanceReport,
  setTribeEventAttendance,
} from "@/src/modules/events/application/use-cases/tribe-event-attendance-use-cases";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

type EventsModuleDependencies = {
  tribeEventRepository: TribeEventRepository;
};

type EventsModule = {
  useCases: {
    clearTribeEventAttendance: (
      command: ClearTribeEventAttendanceCommand
    ) => Promise<TribeEventAttendanceMutationResult>;
    createTribeEvent: (command: CreateTribeEventCommand) => Promise<TribeEventSaveResult>;
    deleteTribeEvent: (
      command: DeleteTribeEventCommand
    ) => Promise<TribeEventDeleteResult>;
    getTribeEvent: (query: GetTribeEventQuery) => Promise<TribeEventResult | null>;
    getTribeEventAttendanceReport: (
      query: GetTribeEventAttendanceReportQuery
    ) => Promise<TribeEventAttendanceReportLookupResult>;
    getTribeEventAttendanceStreakSnapshot: (
      query: GetTribeEventAttendanceStreakQuery
    ) => Promise<TribeEventAttendanceStreakSnapshotResult>;
    listTribeEvents: (query: ListTribeEventsQuery) => Promise<TribeEventListResult>;
    listUpcomingTribeEvents: (
      query: ListUpcomingTribeEventsQuery
    ) => Promise<TribeEventUpcomingListResult>;
    setTribeEventAttendance: (
      command: SetTribeEventAttendanceCommand
    ) => Promise<TribeEventAttendanceMutationResult>;
    updateTribeEvent: (command: UpdateTribeEventCommand) => Promise<TribeEventSaveResult>;
  };
};

export function buildEventsModule({
  tribeEventRepository,
}: EventsModuleDependencies): EventsModule {
  return {
    useCases: {
      clearTribeEventAttendance: clearTribeEventAttendance({ tribeEventRepository }),
      createTribeEvent: createTribeEvent({ tribeEventRepository }),
      deleteTribeEvent: deleteTribeEvent({ tribeEventRepository }),
      getTribeEvent: getTribeEvent({ tribeEventRepository }),
      getTribeEventAttendanceReport: getTribeEventAttendanceReport({ tribeEventRepository }),
      getTribeEventAttendanceStreakSnapshot: getTribeEventAttendanceStreakSnapshot({
        tribeEventRepository,
      }),
      listTribeEvents: listTribeEvents({ tribeEventRepository }),
      listUpcomingTribeEvents: listUpcomingTribeEvents({ tribeEventRepository }),
      setTribeEventAttendance: setTribeEventAttendance({ tribeEventRepository }),
      updateTribeEvent: updateTribeEvent({ tribeEventRepository }),
    },
  };
}
