import type { TribeSupportChannel } from "@/src/modules/tribes/domain/repositories/tribe-support-repository";

export type TribeSupportSettingsResult = {
  channel: TribeSupportChannel;
  message: string | null;
  phoneNumber: string;
};
