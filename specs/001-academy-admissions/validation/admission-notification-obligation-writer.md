# Contrato y audiencia del writer de obligaciones

Este incremento integra el modelo de seis eventos en el puerto transaccional existente. Conserva las 212 tareas originales: 174 completas y 38 pendientes; T180, T181, T185 y US8 mantienen su alcance completo.

## Contrato implementado

- El dominio de notificaciones conserva una única definición de AdmissionNotificationObligation. El puerto original de admisiones la reexporta como tipo, sin añadir dependencias de infraestructura ni duplicar el vocabulario de cinco eventos anterior.
- La política resolveAdmissionNotificationAudience dirige pendiente y recordatorio a revisores, y aprobación, rechazo, cancelación y vencimiento al solicitante. El writer y los candidatos de correo consumen la misma regla. El recordatorio sigue siendo un hecho de notificación, sin otra transición de la solicitud.
- record selecciona líderes y guardianes activos de la misma tribu bajo los locks existentes. recordMany materializa esos eventos por la misma vía y conserva las inserciones en bloque para resoluciones del solicitante. No concede membresía ni incorpora notas o contacto al payload interno.
- Obligación, avisos y su auditoría permanecen en la transacción original del owner. El hecho y su auditoría propia también deben confirmar juntos. Los errores nativos se propagan al owner; este colaborador no envía correo, inicia reintentos ni resuelve un commit incierto.

## Validación actual

La reproducción con el writer productivo anterior llegó a materializar el recordatorio y falló al obtener un aviso frente a los dos revisores actuales esperados: **cero aprobados, un fallo y un caso fuera del filtro**, con inputs registrados estables. El intento previo había fallado en la preparación por intentar confirmar una decisión sin su obligación; no llegó al writer y se conserva como diagnóstico separado.

La primera ejecución completa del writer corregido terminó **1 aprobado/1 fallido, sin filtros**. El recordatorio pasó. El caso mixto observó las obligaciones, avisos y auditoría de notificación staged, y comprobó su rollback; al confirmar el retry, PostgreSQL rechazó el fixture porque faltaba la auditoría propia de la decisión. La revisión verificó ese P2. Se añadió el efecto real del fixture en la misma transacción, conservando las guardas y sin modificar el código productivo para eludirlas.

La repetición actual completa terminó el **2026-10-15T16:08:41.210Z**, con **dos casos Native aprobados, cero fallos y cero filtrados**, y sus trece inputs registrados estables:

1. El recordatorio materializa únicamente líder y guardián activos de la tribu, con audiencia revisora y payload vacío. Excluye guardián silenciado, miembro básico y responsable de otra tribu. Después de quitar el rol del guardián, el siguiente hecho pendiente solo materializa el aviso del líder. La auditoría conserva la fuente y audiencia mínimas, sin dar membresía al solicitante.
2. Un lote mixto de pendiente, recordatorio y rechazo conserva sus destinatarios. Antes del aborto explícito se observan tres obligaciones, cinco avisos, ocho hechos de auditoría de notificación y uno del origen. Después se comprueba cero en cada conjunto, y la solicitud vuelve a pendiente sin decisión. El retry explícito confirma el conjunto; repetir originales falla con 23505 y mantiene los ocho hechos de notificación.

Pasaron además **33 casos de dominio en dos archivos completos**: seis selecciones de audiencia y los 27 casos existentes de candidatos/grupos, sin filtros e inputs registrados estables. Son 35 casos distintos actuales; las ejecuciones anteriores y las aserciones internas no se suman. Lint focal, tipos de producto y tipos de pruebas pasaron, estos últimos después de completar el fixture.

El Native ejecuta el journal real en ramas propias, con pg, Drizzle y guards originales; no usa dobles de esos componentes ni del writer. La conciliación oficial posterior del **2026-10-15T16:09:45.551Z** confirmó producción y el piloto original, con cero ramas temporales. No hubo envíos externos. La arquitectura se comprobó en cuatro vistas reales de Chromium/WebKit a 390 y 1280 px, sin overflow y con el enlace local disponible; se inspeccionaron visualmente Chromium de escritorio y WebKit móvil. La evidencia sanitizada está en [admission-notification-obligation-writer-results.json](admission-notification-obligation-writer-results.json).

## Alcance restante

El owner conserva la autorización y el orden canónico de locks; la audiencia por sí sola no acredita permiso del actor. Faltan el productor de grupos, el recordatorio automático con selección temporal y efectos atómicos, el destinatario confiable actual, habilitación de correo, intent completo sellado de outbox, recuperación/retención, mantenimiento y recorridos públicos. Este control no acredita los seis AC de US8, SC-015, T211 ni los gates operativos.

El [CI completo de dd2b184a](https://github.com/guidomodarelli/TuTribu/actions/runs/38764361941) aprobó 5308 casos y el build de 53 páginas. Corresponde a la persistencia de grupos guardada anteriormente; no se atribuye al writer posterior, cuyo siguiente commit tendrá su propio control completo.
