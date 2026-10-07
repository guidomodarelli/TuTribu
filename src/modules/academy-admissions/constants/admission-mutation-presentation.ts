/** Owns safe mutation acknowledgement and local admission navigation. @module admission-mutation-presentation */
export const ADMISSION_MUTATION_MESSAGE = { pending: "Tu solicitud quedó en revisión.", admitted: "Tu ingreso básico a la academia quedó confirmado.", alreadyMember: "Ya tenés una pertenencia vigente a esta academia." } as const;
/** A request link carries only an opaque own reference, never a token or external origin. */
export const ADMISSION_REQUEST_HREF_PREFIX = "/admissions/requests/";
