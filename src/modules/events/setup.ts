import type {
  CreateTribeEventCommand,
  DeleteTribeEventCommand,
  ListTribeEventsQuery,
  UpdateTribeEventCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventCreationResult,
  TribeEventDeletionResult,
  TribeEventListResult,
  TribeEventUpdateResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  createTribeEvent,
  deleteTribeEvent,
  listTribeEvents,
  updateTribeEvent,
} from "@/src/modules/events/application/use-cases/manage-tribe-events-use-cases";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

type EventsModuleDependencies = {
  tribeEventRepository: TribeEventRepository;
};

type EventsModule = {
  useCases: {
    createTribeEvent: (
      command: CreateTribeEventCommand
    ) => Promise<TribeEventCreationResult>;
    deleteTribeEvent: (
      command: DeleteTribeEventCommand
    ) => Promise<TribeEventDeletionResult>;
    listTribeEvents: (query: ListTribeEventsQuery) => Promise<TribeEventListResult>;
    updateTribeEvent: (
      command: UpdateTribeEventCommand
    ) => Promise<TribeEventUpdateResult>;
  };
};

export function buildEventsModule({
  tribeEventRepository,
}: EventsModuleDependencies): EventsModule {
  return {
    useCases: {
      createTribeEvent: createTribeEvent({ tribeEventRepository }),
      deleteTribeEvent: deleteTribeEvent({ tribeEventRepository }),
      listTribeEvents: listTribeEvents({ tribeEventRepository }),
      updateTribeEvent: updateTribeEvent({ tribeEventRepository }),
    },
  };
}
