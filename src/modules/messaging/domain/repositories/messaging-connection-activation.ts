/** Defines current candidate activation and exact metadata selection dependencies without SDK/SQL/framework details. @module messaging-connection-activation */
import type {AuthorizedMessagingContext} from "./messaging-repositories";
import type {AdmissionOperationResult} from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type {TenantMessagingConnection} from "../entities/tenant-messaging-connection";

/** A selected effective version is distinct from the mutable connection lifecycle version. */
export type MessagingEffectiveSelection={connectionId:string;connectionVersion:number};
/** Server-owned confirmation/CAS cannot include channel readiness, test mode or actor permissions. */
export type MessagingConnectionActivationInput={operationId:string;expectedVersion:number;confirmed:true};
/** Minimal original commit facts do not expose key/provider/admin references or change verification settings. */
export type MessagingConnectionActivationResult={id:string;name:string;version:number;configurationVersion:number;state:TenantMessagingConnection["state"];maskedCredential:"••••••••";replaced:MessagingEffectiveSelection|null;policyVersion:number|null};
/** Runs metadata transition, retirement and dependency changes in the same protected atomic effect. */
export interface MessagingConnectionActivator{
  /** @param context - Current exact native leader/session/recency/resource. @param input - Original confirmed CAS action. @returns Confirmed original snapshot or genuine registered progress, without RPC or enabling codes/email preferences. */
  activate(context:AuthorizedMessagingContext,input:MessagingConnectionActivationInput):Promise<AdmissionOperationResult<MessagingConnectionActivationResult>>;
}
/** Feature owners implement their dependency changes in the writer's existing transaction. */
export interface MessagingSelectionDependencies{
  /** @param context - Exact currently authorized native activation. @returns Channels required by current existing policy/preferences, never a browser-selected subset. */
  requiredChannels(context:AuthorizedMessagingContext):Promise<readonly ("email"|"sms"|"whatsapp")[]>;
  /** @param context - Current native activation authority. @param previous - Existing selected scope, or null for initial selection. @param next - Confirmed fully prepared candidate. @param ledgerId - Private original commit identity for owner audit. @returns Current policy version after metadata-only reference changes; flags/rules/epoch and applied proofs are preserved. */
  replaceSelection(context:AuthorizedMessagingContext,previous:MessagingEffectiveSelection|null,next:MessagingEffectiveSelection,ledgerId:string):Promise<number|null>;
}
