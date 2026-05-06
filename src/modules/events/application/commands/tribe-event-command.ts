export type ListTribeEventsQuery = {
  month?: string | string[];
  tribeSlug: string;
};

export type CreateTribeEventCommand = {
  description: string;
  endsAt: string;
  meetingUrl: string;
  startsAt: string;
  title: string;
  tribeSlug: string;
};

export type UpdateTribeEventCommand = CreateTribeEventCommand & {
  eventId: string;
};

export type DeleteTribeEventCommand = {
  eventId: string;
  tribeSlug: string;
};
