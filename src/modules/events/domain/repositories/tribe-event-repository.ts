import type {
  CreateTribeEventCommand,
  DeleteTribeEventCommand,
  UpdateTribeEventCommand,
} from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventCreationResult,
  TribeEventDeletionResult,
  TribeEventResult,
  TribeEventUpdateResult,
  TribeEventViewerPermissionsResult,
} from "@/src/modules/events/application/results/tribe-event-result";

export type ListTribeEventsByMonthQuery = {
  monthEnd: string;
  monthStart: string;
  tribeSlug: string;
};

export type TribeEventRepository = {
  create: (
    command: Omit<CreateTribeEventCommand, "description" | "endsAt" | "meetingUrl"> & {
      description: string | null;
      endsAt: string | null;
      meetingUrl: string | null;
    }
  ) => Promise<TribeEventCreationResult>;
  delete: (command: DeleteTribeEventCommand) => Promise<TribeEventDeletionResult>;
  listByTribeMonth: (
    query: ListTribeEventsByMonthQuery
  ) => Promise<{
    events: TribeEventResult[];
    viewerPermissions: TribeEventViewerPermissionsResult;
  }>;
  update: (
    command: Omit<UpdateTribeEventCommand, "description" | "endsAt" | "meetingUrl"> & {
      description: string | null;
      endsAt: string | null;
      meetingUrl: string | null;
    }
  ) => Promise<TribeEventUpdateResult>;
};
