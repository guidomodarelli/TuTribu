import type {
  TribeWelcome,
  TribeWelcomeLink,
  TribeWelcomeLinkType as DomainTribeWelcomeLinkType,
  TribeWelcomeRule,
  TribeWelcomeSaveResult as DomainTribeWelcomeSaveResult,
} from "@/src/modules/tribes/domain/repositories/tribe-welcome-repository";

export type TribeWelcomeLinkType = DomainTribeWelcomeLinkType;

export type TribeWelcomeRuleResult = TribeWelcomeRule;

export type TribeWelcomeLinkResult = TribeWelcomeLink;

export type TribeWelcomeResult = TribeWelcome;

export type TribeWelcomeSaveResult = DomainTribeWelcomeSaveResult;
