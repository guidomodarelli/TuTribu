/** Names the connection workspace tabs and their advisory next steps. @module messaging-connections-workspace */
/** Workspace sections in operational order; security and recovery stay secondary and last. */
export type MessagingConnectionsTab="connection"|"channels"|"tests"|"activation"|"security";
export const MESSAGING_CONNECTIONS_TAB={connection:"connection",channels:"channels",tests:"tests",activation:"activation",security:"security"} as const satisfies Record<MessagingConnectionsTab,MessagingConnectionsTab>;
export const MESSAGING_CONNECTIONS_TAB_ORDER=[MESSAGING_CONNECTIONS_TAB.connection,MESSAGING_CONNECTIONS_TAB.channels,MESSAGING_CONNECTIONS_TAB.tests,MESSAGING_CONNECTIONS_TAB.activation,MESSAGING_CONNECTIONS_TAB.security] as const satisfies readonly MessagingConnectionsTab[];
export const MESSAGING_CONNECTIONS_TAB_LABEL={connection:"Conexión",channels:"Canales",tests:"Pruebas",activation:"Activación",security:"Seguridad"} as const satisfies Record<MessagingConnectionsTab,string>;

/** Ordered steps shown in the stepper; security is a secondary section outside the progress. */
export const MESSAGING_CONNECTIONS_STEP_ORDER=[MESSAGING_CONNECTIONS_TAB.connection,MESSAGING_CONNECTIONS_TAB.channels,MESSAGING_CONNECTIONS_TAB.tests,MESSAGING_CONNECTIONS_TAB.activation] as const satisfies readonly MessagingConnectionsTab[];
export const MESSAGING_CONNECTIONS_STEP_DESCRIPTION={connection:"Guardá y comprobá la clave de Zavu.",channels:"Elegí remitentes y plantillas.",tests:"Probá cada canal con un código.",activation:"Revisá los requisitos y activá."} as const satisfies Record<(typeof MESSAGING_CONNECTIONS_STEP_ORDER)[number],string>;
/** Copy of the stepper and its secondary actions. */
export const MESSAGING_CONNECTIONS_STEPPER_COPY={label:"Pasos de la conexión",complete:"Conexión activa para la academia",security:"Seguridad y retiro",steps:"Volver a los pasos"} as const;

/** Advisory progress derived from own metadata; the server still decides every requirement at commit time. */
export type MessagingConnectionsNextStep="saveCandidate"|"validateCredential"|"prepareChannel"|"testChannel"|"activate"|"active";
export const MESSAGING_CONNECTIONS_NEXT_STEP={saveCandidate:"saveCandidate",validateCredential:"validateCredential",prepareChannel:"prepareChannel",testChannel:"testChannel",activate:"activate",active:"active"} as const satisfies Record<MessagingConnectionsNextStep,MessagingConnectionsNextStep>;
export const MESSAGING_CONNECTIONS_NEXT_STEP_TAB={saveCandidate:"connection",validateCredential:"connection",prepareChannel:"channels",testChannel:"tests",activate:"activation",active:"activation"} as const satisfies Record<MessagingConnectionsNextStep,MessagingConnectionsTab>;
export const MESSAGING_CONNECTIONS_NEXT_STEP_COPY={saveCandidate:"Guardá la clave de Zavu para crear una conexión candidata.",validateCredential:"Comprobá la credencial de la candidata.",prepareChannel:"Prepará al menos un canal con sus recursos de Zavu.",testChannel:"Enviá una prueba y confirmá el código recibido.",activate:"Revisá los requisitos y activá la candidata.",active:"La conexión candidata es la seleccionada para la academia."} as const satisfies Record<MessagingConnectionsNextStep,string>;
