export type TribeEventResult = {
  description: string | null;
  endsAt: string | null;
  id: string;
  meetingUrl: string | null;
  startsAt: string;
  title: string;
};

export type TribeEventViewerPermissionsResult = {
  canManageEvents: boolean;
};

export type TribeEventMonthResult = {
  current: string;
  next: string;
  previous: string;
};

export type TribeEventListResult = {
  events: TribeEventResult[];
  month: TribeEventMonthResult;
  viewerPermissions: TribeEventViewerPermissionsResult;
};

export type TribeEventCreationResult =
  | {
      event: TribeEventResult;
      status: "created";
    }
  | {
      status:
        | "forbidden"
        | "invalid_date"
        | "invalid_input"
        | "invalid_meeting_url"
        | "not_found";
    };

export type TribeEventUpdateResult =
  | {
      event: TribeEventResult;
      status: "updated";
    }
  | {
      status:
        | "forbidden"
        | "invalid_date"
        | "invalid_input"
        | "invalid_meeting_url"
        | "not_found";
    };

export type TribeEventDeletionResult = {
  status: "deleted" | "forbidden" | "not_found";
};
