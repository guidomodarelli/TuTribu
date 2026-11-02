/** Copy of the messaging pages' own failure surface, distinct from the applicant's admission page. @module messaging-route-error */

/** Title and the sign-in action of a messaging page whose content cannot be shown or managed. */
export const MESSAGING_ROUTE_ERROR_COPY = {
  title: "No podemos mostrar la mensajería de la academia",
  /** The session is missing, expired or was opened without the Google identity sensitive messaging changes need: the exit is the same. */
  reauthenticate: "Volver a ingresar con Google",
} as const;
