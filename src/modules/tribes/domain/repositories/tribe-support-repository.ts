import type {
  TRIBE_SUPPORT_CHANNEL,
  TRIBE_SUPPORT_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-support";

export type TribeSupportChannel =
  (typeof TRIBE_SUPPORT_CHANNEL)[keyof typeof TRIBE_SUPPORT_CHANNEL];

export type TribeSupportSettings = {
  channel: TribeSupportChannel;
  message: string | null;
  phoneNumber: string;
};

export type TribeSupportSaveStatus =
  | typeof TRIBE_SUPPORT_SAVE_STATUS.forbidden
  | typeof TRIBE_SUPPORT_SAVE_STATUS.notFound
  | typeof TRIBE_SUPPORT_SAVE_STATUS.updated;

export type TribeSupportSaveResult = {
  settings: TribeSupportSettings | null;
  status: TribeSupportSaveStatus;
};

export type GetTribeSupportQuery = {
  tribeSlug: string;
};

export type SaveTribeSupportCommand = {
  channel: TribeSupportChannel;
  message: string | null;
  phoneNumber: string;
  tribeSlug: string;
};

export type TribeSupportRepository = {
  getByTribeSlug(query: GetTribeSupportQuery): Promise<TribeSupportSettings | null>;
  save(command: SaveTribeSupportCommand): Promise<TribeSupportSaveResult>;
};
