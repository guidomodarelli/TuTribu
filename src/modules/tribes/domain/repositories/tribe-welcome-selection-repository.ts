import type { TRIBE_WELCOME_SELECTION_STATUS } from "@/src/modules/tribes/constants/tribe-welcome";

export type TribeWelcomeSelectionStatus =
  (typeof TRIBE_WELCOME_SELECTION_STATUS)[keyof typeof TRIBE_WELCOME_SELECTION_STATUS];

export type TribeWelcomeSelection = {
  selectedAt: Date;
  userId: string;
  welcomeLinkId: string;
};

export type RecordTribeWelcomeSelectionCommand = {
  tribeSlug: string;
  welcomeLinkId: string;
};

export type RecordTribeWelcomeSelectionResult = {
  status: TribeWelcomeSelectionStatus;
};

export type ListTribeWelcomeSelectionsQuery = {
  tribeSlug: string;
};

export type TribeWelcomeSelectionRepository = {
  listByTribeSlug(
    query: ListTribeWelcomeSelectionsQuery
  ): Promise<TribeWelcomeSelection[]>;
  record(
    command: RecordTribeWelcomeSelectionCommand
  ): Promise<RecordTribeWelcomeSelectionResult>;
};
