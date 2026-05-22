import type {
  RecordTribeWelcomeSelectionResult as DomainRecordTribeWelcomeSelectionResult,
  TribeWelcomeSelection as DomainTribeWelcomeSelection,
  TribeWelcomeSelectionStatus as DomainTribeWelcomeSelectionStatus,
} from "@/src/modules/tribes/domain/repositories/tribe-welcome-selection-repository";

export type TribeWelcomeSelectionStatus = DomainTribeWelcomeSelectionStatus;

export type TribeWelcomeSelectionResult = DomainTribeWelcomeSelection;

export type RecordTribeWelcomeSelectionResult =
  DomainRecordTribeWelcomeSelectionResult;
