# Ampliación privada de auditoría y productor de lista

Avance de T167/T169/T170 sobre `76fe9587`. Mantiene las 212 tareas originales y no cierra esos criterios ni los de retención, actividad, endpoints o gates operativos.

## Hechos implementados

- `AdmissionResourceAuditEvent` agrega once variantes propias al contrato de eventos de política y aplicación local existente. Solicitudes, lista, invitaciones, uso, conexiones, exposición autorizada, entregas, protección, pruebas, pertenencias y retención tienen metadata explícita por recurso. La proyección selecciona campos sin copiar el comando ni la metadata completa; no valida filas de PostgreSQL ni respuestas del SDK.
- El scope conserva tribu, recurso, actor, ledger original o ausencia explícita, versión, regla, causa y tiempo. Los procesos no inventan una operación ni un actor humano. El constructor copia el reloj y los países para que cambios posteriores del caller no modifiquen el snapshot. Los IDs privados nunca se usan como dimensiones públicas.
- Los códigos de error de mensajería pasan a su contrato de domain, con union explícita y constantes comprobadas mediante `satisfies`. El path previo de application reexporta el tipo; los 28 valores existentes y su copy seguro permanecen iguales. Esto evita que el nuevo contrato de domain dependa de application.
- Creación y edición manual de lista usan el constructor y el adapter de auditoría dentro del mismo writer autorizado, lock y commit original. Conservan el estado/versión bloqueados, destino, referencia de importación o ausencia y tipo de contacto. `createdAt` es el mismo reloj SQL del efecto, no una lectura posterior al append. Nombres, contacto y fingerprint siguen fuera del evento. No-op, conflicto y replay no crean otro evento.
- No cambia una tabla, policy SQL, constraint, permiso o recorrido de interfaz. La FK compuesta a la operación mantiene su autoridad y finalidad. Los manuales de esos recorridos conservan sus instrucciones y capturas; la arquitectura y el changelog documentan el cambio de registro interno.

## Validación ejecutada

- Antes de implementar el constructor, la suite nueva no pudo resolver el módulo ausente. Los casos no se atribuyen a ese run. Después de implementarlo, selección de campos, linaje, scope de procesos, ausencia de secretos, reloj/countries desligados y rechazo seguro de recurso desconocido pasan junto con política/prueba/métricas existentes: 32 aprobadas, cero fallidas y cero pendientes.
- La regresión final local añade contratos públicos reales de mensajería y de lista: 46 aprobadas, cero fallidas y cero pendientes. Tipos de producto, tipos de tests y lint pasan sobre las fuentes modificadas.
- La prueba PostgreSQL de la lista falló con el writer anterior por el registro incompleto y el reloj distinto. Un caso falló y el caso de competencia quedó fuera del filtro; se conserva ese reporte rojo. La ejecución final de los dos casos completos y el caso de permisos tiene tres aprobados, cero fallidos y cero pendientes: reloj exacto, actor/ledger/metadata, replay, respuesta de commit perdida, no-op, CAS, competencia y pérdida de rol. Las cuatro ramas propias de estas ejecuciones se retiraron con confirmación; la rama del piloto se conserva.
- Build real aprobado en el worktree aislado de este HEAD, con las nueve fuentes finales copiadas y cotejadas antes y después de la compilación. El entorno temporal se generó sólo en memoria. No se ejecutó un build en el checkout que mantiene el piloto real.
- Arquitectura renderizada en Chromium y WebKit a 390 y 1280: cuatro vistas, cero desbordamientos y cero errores JavaScript. El ancla de auditoría es única y sus dos enlaces resuelven los registros de validación existentes. No cambia una captura del manual ni se atribuye una pantalla de actividad a esta prueba.
- Revisión independiente Codex de los doce archivos terminada sin hallazgos accionables, con hashes iniciales/finales estables. Se verifica la misma fuente probada; la actualización final de evidencia conserva su revisión documental propia.

## Alcance pendiente

Conectar todos los demás productores efectivos y completar sus transiciones/detalles propios; lecturas y endpoints de actividad/métricas con autoridad actual y aislamiento; observabilidad, pantallas por rol, retención de solicitudes a 180 días y auditoría a 365 días. La disponibilidad de un tipo para un evento no prueba que su owner lo emita. T169/T170 y las matrices integrales de T166/T167 mantienen sus criterios originales pendientes.
