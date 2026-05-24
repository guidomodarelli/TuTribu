import type {
  TRIBE_WELCOME_LINK_TYPE,
  TRIBE_WELCOME_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-welcome";

export type TribeWelcomeLinkType =
  (typeof TRIBE_WELCOME_LINK_TYPE)[keyof typeof TRIBE_WELCOME_LINK_TYPE];

export type TribeWelcomeRule = {
  id: string;
  isActive: boolean;
  label: string;
  sortOrder: number;
};

export type TribeWelcomeLink = {
  badgeLabel: string;
  description: string | null;
  id: string;
  isActive: boolean;
  label: string;
  message: string | null;
  phoneNumber: string | null;
  sortOrder: number;
  type: TribeWelcomeLinkType;
  url: string | null;
};

export type TribeWelcome = {
  linksHeading: string;
  links: TribeWelcomeLink[];
  rules: TribeWelcomeRule[];
  selectionModalBenefit: string | null;
  selectionModalDescription: string;
  selectionModalTitle: string;
  welcomeMessage: string;
};

export type TribeWelcomeSaveResult = {
  status:
    | typeof TRIBE_WELCOME_SAVE_STATUS.forbidden
    | typeof TRIBE_WELCOME_SAVE_STATUS.notFound
    | typeof TRIBE_WELCOME_SAVE_STATUS.updated;
};

export type GetTribeWelcomeQuery = {
  tribeSlug: string;
};

export type GetTribeWelcomeByInvitationQuery = {
  token: string;
  tribeSlug: string;
};

export type SaveTribeWelcomeCommand = {
  linksHeading: string;
  links: TribeWelcomeLink[];
  rules: TribeWelcomeRule[];
  selectionModalBenefit: string | null;
  selectionModalDescription: string;
  selectionModalTitle: string;
  tribeSlug: string;
  welcomeMessage: string;
};

export type TribeWelcomeRepository = {
  getEditableByTribeSlug(query: GetTribeWelcomeQuery): Promise<TribeWelcome>;
  getByInvitation(query: GetTribeWelcomeByInvitationQuery): Promise<TribeWelcome>;
  getByTribeSlug(query: GetTribeWelcomeQuery): Promise<TribeWelcome>;
  save(command: SaveTribeWelcomeCommand): Promise<TribeWelcomeSaveResult>;
};
