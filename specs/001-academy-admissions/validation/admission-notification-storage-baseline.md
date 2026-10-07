# Persistencia de avisos de preadmisión

**Feature**: `001-academy-admissions`. **Base**: `dc9479db759481455349aef936573967b2b14a0a`. T024, sin integración pública de T057 ni entrega externa.

## Responsabilidades

La obligación original conserva solicitud, cuenta, tribu y evento inmutables. La bandeja existente referencia esa obligación con FK compuesta y audiencia `applicant/reviewer`. El tipo deriva del evento y el payload es vacío. El productor privado participa en la transacción del caller autorizado; no abre otra conexión, decide solicitudes ni envía correo. Unique por obligación/destinatario y dedupe canónico preservan identidad y estado leído durante replay.

Preadmisión permite ver sólo la solicitud propia. Una audiencia revisora exige liderazgo/guardianía activa actual de la misma tribu. RLS aplica ambas reglas junto a destinatario propio; los tipos comunitarios conservan su permiso de contenido. El backend con bypass debe repetir esos predicados cuando se integre el reader público en T057. Fuente, audiencia y destinatario no se reescriben desde un rol privilegiado. No se introducen contactos, motivos internos ni secretos en el aviso.

## Evidencia ejecutada

El primer rojo SQL real fue 42883: el productor aún no existía. La migración implementa el contrato junto con Drizzle. En el primer ensayo completo pasaron dedupe concurrente y rollback/EXEC privado; dos lecturas recibieron 42501 porque el fixture no concedía SELECT a `tribe_members`, que usa el predicado comunitario histórico con permisos del invocador. Se agregó ese grant únicamente al rol efímero del fixture, conservando sus policies y ausencia de BYPASSRLS.

La ampliación pasó los cuatro primeros casos; el quinto debía aislar la FK cruzada pero usaba un destinatario ya notificado y PostgreSQL rechazó primero el unique con 23505. Se corrigió el fixture para usar un destinatario distinto y mantener la aserción exacta 23503. La suite siguiente pasó los cinco SQL sin skips en 118,12 segundos, con el código de producción estable.

La revisión detectó un P2 en el oráculo del payload: el INSERT omitía audiencia y podía pasar por esa causa. Se agregó una audiencia válida al caso de payload y otro INSERT independiente para NULL. La repetición focal del quinto caso, con ese archivo actualizado, pasó en 28,93 segundos; los cuatro restantes se excluyeron por selección, sin convertirlos en evidencia nueva. Se preservan 23503 para FK cruzada, 23514 para fuente/campos/payload y 42501 para propietario/producer no autorizado. El test confirma que replay conserva id/read_at y que ni source ni audiencia pueden reescribirse. La revisión nativa del delta cerró con cero hallazgos accionables y cinco hashes estables tras las ediciones notificadas; no ejecutó SQL ni editó archivos.

Lint y ambos typechecks finales pasaron. Las 47 regresiones locales de bandeja y Web Crypto pasaron. Build normal Node 24.21.0/Next 16.3.4 con variables sintéticas de proceso y SQL hacia loopback inaccesible: compilación 30,5 s, tipos 12,3 s y cuarenta páginas estáticas. Los tres documentos propietarios pasaron doce renders Chromium/WebKit a 390/1280, sin enlaces locales rotos, errores JavaScript ni desborde. La QA detectó la tabla histórica de notificaciones fuera del viewport móvil: se ajustó su layout y el wrapping de nombres técnicos; los doce renders finales pasaron. Todos los navegadores se cerraron.

## Límites y siguientes integraciones

T057 debe conectar casos de uso, reader, DTO público y copy; T180–T188 completan preferencias, correo y scheduler. Los tipos reservados no se añaden por sí solos al DTO actual ni a la campanita. No cambia un recorrido disponible de UI y no corresponde inventarlo en los manuales. Migraciones sólo en ramas propias, con eliminación y ausencia comprobada por el helper. No se enviaron mensajes, se aplicaron migraciones de producción ni se publicó configuración.

Decisiones: [notifications.htm](../../../docs/architecture/notifications.htm#admission-notice-storage) y [academy-admissions.htm](../../../docs/architecture/academy-admissions.htm).

## Integración parcial de la bandeja en T057

La fila own existía pero el reader entregó unreadCount0: rojo SQL19,07 s. El reader ahora comparte destinatario/visibilidad por audiencia entre listado y count. La migración20261007003000_read_admission_notification_subject.sql proyecta únicamente request/audience/tribename/slug de un aviso propio autorizado cuando la tribu sigue oculta bajo RLS; no abre contenido comunitario. El mapper consume discriminadores/IDs mínimos de PostgreSQL y application/browser guardan sólo su DTO propio; no schema-validan rows upstream.

Los tipos propios de admisión se separan de eventos/propuestas y sólo incorporan id/fechas/tribu y la referencia de request/audiencia. Copy español por hecho original, sin contacto, texto del solicitante, motivo de revisión ni secreto. Mark y markAll repiten visibilidad actual incluso con owner/bypass; perder rol reviewer no marca avisos que quedaron ocultos.

El primer focal del reader pasó22,75 s. La suite final terminó con siete SQL verdes, sin skips, en178,25 s: almacenamiento/dedupe/FK/rollback anteriores más bandeja propia ordinary sin miembro/mark/foreign y pérdida de rol en ambos roles con read_at intacto. Todas las ramas propias se eliminaron y confirmaron ausentes.24 locales de schema/repo/copy verdes;40 UI/center/rutas posteriores verdes, incluidos dos render/click de admisión por audiencia con beez-ui/Motion/Next reales. La aserción inicial del nuevo callback esperaba un objeto, pero el contrato público existente entrega notificationId; se corrigió el test a ese id sin cambiar el producto. Tipos de producto/tests y lint verdes; build original29 s/tipos12,1 s/cuarenta páginas.

Revisión nativa readonly del bloque parcial: cero hallazgos accionables y12 SHA256 inicial/final idénticos, sin ejecutar pruebas/SQL/build/red/procesos ni ediciones. La cobertura de navegación final sigue en T059/T061: los builders llevan al estado propio y a la revisión previstas, cuyas páginas todavía faltan. T057 permanece abierta por sus dependencias y esos recorridos. Manual/índices documentan esta limitación, mantienen el esquema anterior como esquema y no inventan capturas de admisión.

Los dos manuales internos validados por check-manual terminaron con cero errores; advertencias sólo por URL pública ausente (documentos locales sin publicación) y falta de catálogo central de traducciones. Se sincronizó el script de navegación vigente de Heritage y se registró el commit base dc9479db con los cambios locales de admisión identificados. Se revisaron manual, menú e índice:24 renders Chromium/WebKit390/1280 verdes, enlaces locales/anclas presentes, menú→manual, deep link/recarga, acordeón e Inicio funcionales, cero overflow/errores JS. El primer oráculo de Inicio esperaba hash#top; el boilerplate borra ese hash deliberadamente. La validación se corrigió para comprobar scroll al comienzo y encabezado visible, sin modificar esa conducta. Browsers cerrados y scripts propios de QA/diagnóstico retirados. No quedan procesos SQL/Next/review del bloque activos.
