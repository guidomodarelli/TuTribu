/** Names the linear connection flow steps, their copy and the advisory next action. @module messaging-connections-workspace */
/** Kinds of step in the linear flow; a test step exists once per configured channel. Security and recovery stay outside the flow. */
export type MessagingConnectionsStepKind="key"|"credential"|"channels"|"test"|"activation";
export const MESSAGING_CONNECTIONS_STEP_KIND={key:"key",credential:"credential",channels:"channels",test:"test",activation:"activation"} as const satisfies Record<MessagingConnectionsStepKind,MessagingConnectionsStepKind>;
/** Short title and one-sentence description of each step; a test step names its channel. */
export const MESSAGING_CONNECTIONS_STEP_COPY={
  key:{title:"Clave",description:"Guardá la clave de Zavu como conexión candidata."},
  credential:{title:"Credencial",description:"Comprobá el acceso y el tipo de cuenta en Zavu."},
  channels:{title:"Canales",description:"Elegí el remitente y, en WhatsApp, la plantilla de cada canal que vas a usar."},
  /** @param channel - Visible channel label. */
  test:(channel:string)=>({title:`Probar ${channel}`,description:`Enviá un código de prueba por ${channel} y confirmá el que recibiste.`}),
  activation:{title:"Activación",description:"Revisá los requisitos y activá la conexión para la academia."},
} as const;
/** Copy of the flow shell, its blocked reasons and the secondary security section. */
export const MESSAGING_CONNECTIONS_FLOW_COPY={
  label:"Pasos de la conexión",next:"Siguiente",activate:"Activar conexión",replace:"Reemplazar conexión seleccionada",active:"Conexión activa",
  busy:"Esperá a que termine la operación en curso.",
  keyRequired:"Guardá la clave de Zavu para seguir.",
  /** Shown at Activación when the selection is already active and no new candidate exists. */
  selectedActive:"La conexión seleccionada ya está activa. Solo hace falta guardar otra clave en Clave si querés reemplazarla.",
  credentialRequired:"Comprobá la credencial para seguir.",
  channelRequired:"Guardá al menos un canal para seguir.",
  /** @param channel - Visible channel label. */
  testRequired:(channel:string)=>`Confirmá el código de ${channel} para seguir.`,
  /** A test consumes the daily code quota, so it waits until Países y cupos is saved. */
  usageRequired:"Antes de probar un canal, guardá Países y cupos: la prueba usa el cupo diario de códigos.",
  usageRequiredDetail:"Elegí los países permitidos y el cupo diario de códigos. Después volvé a este paso para enviar la prueba.",
  usageLink:"Ir a Países y cupos",
  savedKey:"Esta candidata también es la conexión seleccionada, así que su clave no se reemplaza desde acá. Para usar otra clave, gestionala en Seguridad y retiro.",
  security:"Seguridad y retiro",steps:"Volver a los pasos",securityRegion:"Seguridad",
} as const;
/** Advisory progress derived from own metadata; the server still decides every requirement at commit time. */
export type MessagingConnectionsNextStep="saveCandidate"|"validateCredential"|"prepareChannel"|"testChannel"|"activate"|"active";
export const MESSAGING_CONNECTIONS_NEXT_STEP={saveCandidate:"saveCandidate",validateCredential:"validateCredential",prepareChannel:"prepareChannel",testChannel:"testChannel",activate:"activate",active:"active"} as const satisfies Record<MessagingConnectionsNextStep,MessagingConnectionsNextStep>;
/** Destination of the single highlighted action: a flow step (a test step names its channel), the security section, or the usage page. */
export type MessagingConnectionsNextActionTarget={kind:"step";step:MessagingConnectionsStepKind}|{kind:"security"}|{kind:"usage"};
/** Copy of the single next action; every sentence says what is missing and why. Channel names come from the presentation labels. */
export const MESSAGING_CONNECTIONS_NEXT_ACTION_COPY={
  region:"Próxima acción",
  saveCandidate:{title:"Guardá la clave de Zavu",reason:"Todavía no hay una conexión candidata para probar y activar.",action:"Ir a Clave"},
  suspendedCandidate:{title:"La candidata está suspendida",reason:"Una candidata suspendida no puede activarse y sigue ocupando su lugar. Retirala en Seguridad y retiro para guardar otra clave; la conexión seleccionada no cambia.",action:"Ir a Seguridad y retiro"},
  credentialNotValidated:{title:"Comprobá la credencial",reason:"La clave quedó guardada, pero todavía no se comprobó con Zavu.",action:"Ir a Credencial"},
  credentialInvalid:{title:"Revisá la clave de Zavu",reason:"Zavu rechazó la clave guardada. Retirá esta candidata en Clave y guardá una clave nueva; la conexión seleccionada no cambia.",action:"Reemplazar la clave"},
  credentialUnavailable:{title:"Volvé a comprobar la credencial",reason:"No pudimos comprobar la clave con Zavu. Reintentá la comprobación.",action:"Ir a Credencial"},
  productionRequired:{title:"Usá una cuenta de producción",reason:"La clave comprobada es de una cuenta de prueba de Zavu. Para activar hace falta una cuenta de producción.",action:"Ir a Credencial"},
  noChannel:{title:"Prepará un canal",reason:"Ningún canal tiene remitente configurado todavía.",action:"Ir a Canales"},
  /** @param channels - Unavailable channel labels already joined. */
  unavailableChannels:(channels:string)=>({title:`Revisá ${channels} en Canales`,reason:`Zavu no tiene disponible ${channels}. La activación necesita comprobar todos los canales configurados.`,action:"Ir a Canales"}),
  /** @param channels - Pending channel labels already joined. */
  testTitle:(channels:string)=>`Falta probar ${channels}`,
  /** @param channel - The first pending channel, preselected in Pruebas. */
  testAction:(channel:string)=>`Probá ${channel}`,
  /** @param channels - Verified channel labels. @param plural - Whether more than one channel is verified. */
  verified:(channels:string,plural:boolean)=>`${channels} ya ${plural?"están comprobados":"está comprobado"}.`,
  /** @param channels - Channels without a confirmed code. */
  untested:(channels:string)=>`Falta ${channels}: todavía no se confirmó un código de prueba.`,
  /** @param channels - Channels whose last test is older than 24 hours. */
  stale:(channels:string)=>`${channels} necesita una prueba nueva: la anterior tiene más de 24 horas.`,
  /** @param channels - Phone channel labels. */
  usageRequired:{title:"Guardá Países y cupos",reason:"La prueba de un canal consume el cupo diario de códigos, y la academia todavía no lo guardó.",action:"Ir a Países y cupos"},
  /** @param channels - Phone channel labels. */
  countries:(channels:string)=>({title:"Guardá los países permitidos",reason:`${channels} necesita los países guardados antes de activar.`,action:"Preparar países y cupos"}),
  activateTitle:"Todo listo para activar",
  /** @param channels - Every verified channel. @param plural - Whether more than one channel is verified. */
  activateReason:(channels:string,plural:boolean)=>`${channels} ${plural?"están comprobados":"está comprobado"}. Activá la conexión para usarla en la academia.`,
  /** @param name - Current selection that the candidate replaces. */
  replaces:(name:string)=>`Reemplaza a ${name}.`,
  activateAction:"Activar conexión",
  activeTitle:"Conexión activa",
  activeReason:"La candidata es la conexión seleccionada para la academia.",
  selectedActiveReason:"La conexión seleccionada ya está activa para la academia. Para reemplazarla, guardá otra clave de Zavu en Clave.",
} as const;
