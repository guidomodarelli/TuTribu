/** Defines immutable configuration staging independently of SQL, SDK or public provider payloads. @module messaging-connection-configuration */
import type {AuthorizedMessagingContext} from "./messaging-repositories";
import type {MessagingConnectionInspector,MessagingSenderResource,MessagingTemplateResource} from "./messaging-connection-inspector";
import type {AdmissionOperationResult} from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type {TenantMessagingConnection} from "../entities/tenant-messaging-connection";

/** Boundary-normalized resource references never grant actor/credential/provider authority. */
export type MessagingConnectionConfigurationInput={operationId:string;expectedVersion:number;confirmed:true;channel:"email"|"sms"|"whatsapp";senderId:string;templateId?:string;templateLanguage?:string};
/** A no-op keeps its current version and diagnostic lifetime; changed configuration requires fresh proof. */
export type MessagingConnectionConfigurationResult={id:string;name:string;version:number;configurationVersion:number;state:TenantMessagingConnection["state"];maskedCredential:"••••••••";changed:boolean};
/** Only exact detail-confirmed fields and transient key material reach the private version owner. */
export type MessagingConfigurationInspection={credential:string;sender:MessagingSenderResource;template?:MessagingTemplateResource};
/** Read-only confirmation does not provision or send messages. */
export interface MessagingConfigurationInspectorFactory{
  /** @param context - Current exact authorized resource. @param credential - Transient current private material. @returns Fresh detail-only SDK operations. */
  create(context:AuthorizedMessagingContext,credential:string):Pick<MessagingConnectionInspector,"retrieveSender"|"retrieveTemplate">;
}
/** Preparation has no mutations; final commit owns the ledger and repeats CAS/authority. */
export interface MessagingConnectionConfigurationOperations{
  /** @param context - Current native authority. @param input - Original stable caller intent. @returns Original replay/progress or current CAS/no-op facts, without opening secrets. */
  prepare(context:AuthorizedMessagingContext,input:MessagingConnectionConfigurationInput):Promise<{state:"prepared";configurationVersion:number;changed:boolean}|AdmissionOperationResult<MessagingConnectionConfigurationResult>>;
  /** @param context - Original current scope, independently revalidated by storage. @param input - Stable original intent. @param inspection - Exact private detail evidence, or null only for a current no-op. @returns Atomic immutable version/envelope and original minimal result, without sending or activating. */
  commit(context:AuthorizedMessagingContext,input:MessagingConnectionConfigurationInput,inspection:MessagingConfigurationInspection|null):Promise<AdmissionOperationResult<MessagingConnectionConfigurationResult>>;
}
