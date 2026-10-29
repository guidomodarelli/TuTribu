/** Owns private group/member storage states independently of message transport. @module admission-notification-group-storage-constants */
import type { AdmissionNotificationGroupMemberState, AdmissionNotificationGroupState } from "../domain/entities/admission-notification-group";
import { ADMISSION_NOTIFICATION_EXPIRED_STATUS, ADMISSION_NOTIFICATION_FROZEN_STATUS, ADMISSION_NOTIFICATION_SUPPRESSED_STATUS } from "./admission-notification-groups";

/** Keeps a mutable bucket available for source collection and current eligibility decisions. */
const ADMISSION_NOTIFICATION_GROUP_OPEN = "open";
/** Retains an original member before its bucket disposition is committed. */
const ADMISSION_NOTIFICATION_GROUP_MEMBER_PENDING = "pending";
/** Binds a live source to its immutable frozen reference manifest. */
const ADMISSION_NOTIFICATION_GROUP_MEMBER_INCLUDED = "included";
/** Owns the durable bucket lifecycle without implying provider delivery state. */
export const ADMISSION_NOTIFICATION_GROUP_STATE = { open: ADMISSION_NOTIFICATION_GROUP_OPEN, frozen: ADMISSION_NOTIFICATION_FROZEN_STATUS, suppressed: ADMISSION_NOTIFICATION_SUPPRESSED_STATUS, expired: ADMISSION_NOTIFICATION_EXPIRED_STATUS } as const satisfies Record<string, AdmissionNotificationGroupState>;
/** Owns original source dispositions, including explicitly excluded expired work. */
export const ADMISSION_NOTIFICATION_GROUP_MEMBER_STATE = { pending: ADMISSION_NOTIFICATION_GROUP_MEMBER_PENDING, included: ADMISSION_NOTIFICATION_GROUP_MEMBER_INCLUDED, suppressed: ADMISSION_NOTIFICATION_SUPPRESSED_STATUS, expired: ADMISSION_NOTIFICATION_EXPIRED_STATUS } as const satisfies Record<string, AdmissionNotificationGroupMemberState>;
