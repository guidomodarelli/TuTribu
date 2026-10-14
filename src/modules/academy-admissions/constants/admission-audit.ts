/** Names the complete private audit resource vocabulary independently of commands and public metrics. @module admission-audit-constants */
import {ADMISSION_RESOURCE_KIND} from "./admission-authorization";
import {ADMISSION_MESSAGING_LIFECYCLE_EVIDENCE} from "./messaging-lifecycle-evidence";
import {NOTIFICATION_DELIVERY_RECOVERY_AUDIT} from "@/src/modules/messaging/constants/notification-delivery-recovery";
import type {AdmissionResourceAuditKind} from "../domain/entities/admission-resource-audit-event";
import { ADMISSION_NOTIFICATION_AUDIT } from "@/src/modules/notifications/constants/admission-notification-audit";

/** Keeps every model branch scoped to an existing owner rather than accepting an arbitrary resource label. */
export const ADMISSION_AUDIT_RESOURCE_TYPE={request:ADMISSION_RESOURCE_KIND.request,allowlistEntry:ADMISSION_RESOURCE_KIND.allowlistEntry,personalInvitation:ADMISSION_RESOURCE_KIND.personalInvitation,usagePolicy:"messaging_usage_policy",connection:ADMISSION_MESSAGING_LIFECYCLE_EVIDENCE.resourceType,exposure:"authorized_exposure",delivery:NOTIFICATION_DELIVERY_RECOVERY_AUDIT.resourceType,notification:ADMISSION_NOTIFICATION_AUDIT.resourceType,protection:"messaging_protection",proof:"admission_proof",membership:"membership",retention:"retention_run"} as const satisfies Record<string,AdmissionResourceAuditKind>;
