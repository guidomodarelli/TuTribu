/** Names the connection workspace tabs, advisory next steps and the session-only tab reference restored after Google. @module messaging-connections-workspace */
/** Workspace sections in operational order; security and recovery stay secondary and last. */
export type MessagingConnectionsTab="connection"|"channels"|"tests"|"activation"|"security";
export const MESSAGING_CONNECTIONS_TAB={connection:"connection",channels:"channels",tests:"tests",activation:"activation",security:"security"} as const satisfies Record<MessagingConnectionsTab,MessagingConnectionsTab>;
export const MESSAGING_CONNECTIONS_TAB_ORDER=[MESSAGING_CONNECTIONS_TAB.connection,MESSAGING_CONNECTIONS_TAB.channels,MESSAGING_CONNECTIONS_TAB.tests,MESSAGING_CONNECTIONS_TAB.activation,MESSAGING_CONNECTIONS_TAB.security] as const satisfies readonly MessagingConnectionsTab[];
export const MESSAGING_CONNECTIONS_TAB_LABEL={connection:"Conexión",channels:"Canales",tests:"Pruebas",activation:"Activación",security:"Seguridad"} as const satisfies Record<MessagingConnectionsTab,string>;

/** Advisory progress derived from own metadata; the server still decides every requirement at commit time. */
export type MessagingConnectionsNextStep="saveCandidate"|"validateCredential"|"prepareChannel"|"testChannel"|"activate"|"active";
export const MESSAGING_CONNECTIONS_NEXT_STEP={saveCandidate:"saveCandidate",validateCredential:"validateCredential",prepareChannel:"prepareChannel",testChannel:"testChannel",activate:"activate",active:"active"} as const satisfies Record<MessagingConnectionsNextStep,MessagingConnectionsNextStep>;
export const MESSAGING_CONNECTIONS_NEXT_STEP_TAB={saveCandidate:"connection",validateCredential:"connection",prepareChannel:"channels",testChannel:"tests",activate:"activation",active:"activation"} as const satisfies Record<MessagingConnectionsNextStep,MessagingConnectionsTab>;
export const MESSAGING_CONNECTIONS_NEXT_STEP_COPY={saveCandidate:"Guardá la clave de Zavu para crear una conexión candidata.",validateCredential:"Comprobá la credencial de la candidata.",prepareChannel:"Prepará al menos un canal con sus recursos de Zavu.",testChannel:"Enviá una prueba y confirmá el código recibido.",activate:"Revisá los requisitos y activá la candidata.",active:"La conexión candidata es la seleccionada para la academia."} as const satisfies Record<MessagingConnectionsNextStep,string>;

/** Only the tab identifier is kept, per viewer and route, to reopen the same section after the Google confirmation. */
export const MESSAGING_CONNECTIONS_TAB_STORAGE_PREFIX="tutribu:messaging-connections-tab";
