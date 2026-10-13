# Auditoría efectiva de invitaciones y filas importadas

Avance de T169/T170 sobre `f3e19f9f`; conserva el criterio íntegro de esas tareas y las matrices de retención/observabilidad pendientes. No cambia marcadores: 164 completadas, 48 pendientes y 212 originales.

## Responsabilidades implementadas

- `createPersonalInvitationAuditEvent` proyecta la entidad efectiva y el estado/versionado bloqueados del recurso anterior. Separa el estado de canje de la autorización retirada: `redeemed` puede mantenerse mientras la autorización pasa a retirada. Usa actor y ledger humanos actuales y el mismo `updatedAt` del efecto. No copia contacto, nombre interno ni material de token.
- Creación, renombrado, revocación activa, reemisión y materialización de vencimiento usan ese constructor y `PostgresAdmissionAuditRepository` dentro de la transacción original. El recurso nuevo tiene procedencia anterior nula; la revocación o expiración del anterior conserva su propia identidad y versión.
- El canje usa el mismo constructor con solicitante/ledger originales, estado activo anterior y la solicitud efectivamente presentada. Su fecha coincide con el canje persistido. El retiro de una canjeada conserva el vínculo original y no vuelve a emitir un token.
- La cancelación por retiro de autorización conserva regla, actor, ledger, decisión, versión de solicitud, snapshot de política y prueba aplicada o ausencia. El evento comparte el reloj de la decisión original. El motivo interno sigue en su owner privado y no se copia al evento. Una solicitud aprobada y su membresía permanecen intactas.
- Cada fila CSV efectivamente añadida conserva la referencia de importación, tipo de contacto, nueva versión y el reloj de entrada/resultado de fila. El evento queda en el mismo bloque original: un fallo revierte sus efectos y auditoría, y una reanudación conserva los lotes ya confirmados y sus operaciones anteriores. Filas sin cambio, conflicto u omitidas no generan otra alta auditada.
- Se mantienen autorización, locks, CAS, ámbito compuesto de operación/tribu, progreso y recuperación originales. No se modifica el schema ni una policy de PostgreSQL. El constructor consume hechos inward de sus owners; no schema-valida filas o payloads SDK. Los recorridos, permisos, plazos y mensajes de la interfaz mantienen sus instrucciones y capturas vigentes; se actualizan arquitectura y changelog por los registros nuevos.

## Evidencia ejecutada

- El contrato anterior perdió los campos de retiro de autorización: doce casos locales pasaron y dos fallaron, sin casos pendientes. La extensión del contrato y el constructor efectivo tienen regresión local aprobada; el reporte final incluye contratos propios de métricas, política/pruebas, mensajería y lista: 49 aprobados, cero fallidos y cero pendientes. Las repeticiones intermedias no se suman a ese total.
- PostgreSQL anterior: dos fallos por metadata/reloj incompletos en administración e importación parcial, con dos casos fuera del filtro. Esos rojos se conservan y no se convierten en evidencia aprobada.
- La ejecución final de siete casos PostgreSQL terminó con siete aprobados, cero fallidos y cero pendientes: administración/reemisión/expiración, importación parcial y mixta, canje real, retiro pendiente y retiro después de aprobación. Las nueve ramas propias de rojo y verde quedaron ausentes con confirmación, preservando la rama del piloto.
- Tipos de producto, tipos de tests y lint aprobados. Build aislado aprobado con las once fuentes finales cotejadas antes y después de la compilación y entorno temporal generado sólo en memoria. No se ejecutó un build sobre el checkout que mantiene el servidor del piloto.
- Arquitectura comprobada en Chromium y WebKit a 390 y 1280: cuatro vistas, cero desbordamiento y cero errores JavaScript, ancla única y tres enlaces existentes por vista. No se cambia ni acredita una pantalla nueva de actividad o una captura del manual.
- Revisión independiente Codex de los catorce archivos terminada sin hallazgos accionables y con hashes inicial/final estables. El cierre de evidencia y la nota de avance conservan revisión documental propia. T169/T170 y las matrices/gates restantes siguen abiertos.

## Alcance original restante

Conectar los productores de conexiones, uso, decisiones y demás transiciones de solicitudes, pruebas/verificación, entregas y exposiciones; readers/endpoints y logger safe; métricas efectivas, pantallas por rol y retención general. La disponibilidad de tipos o el cierre de estos productores no acredita T169/T170 completos, los gates operativos ni la entrega externa de Zavu.
