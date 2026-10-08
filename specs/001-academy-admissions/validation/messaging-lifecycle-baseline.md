# Suspensión y desconexión de mensajería

Alcance pendiente: US7/T133–T143, más las cláusulas de lifecycle restantes de US6. El objetivo sigue activo, con 78/212 tareas completas y 134 pendientes. Esta evidencia no acredita un flujo de suspensión o desconexión operable.

Primer bloque: política pura `assessMessagingConnectionRetirement` para FR-050/051 y US-07-AC-03. Una candidata no seleccionada no altera las dependencias de la seleccionada. Para retirar ordinariamente la seleccionada debe estar desactivada la verificación requerida o pausada la admisión, y desactivados los avisos externos dependientes. La suspensión urgente conserva su transición separada y no depende de esta evaluación. Los hechos serán aportados por los owners vigentes bajo locks; el browser no puede conceder compatibilidad.

TDD `8f226e` rojo por módulo pendiente; `ac0e09` verde, 20 casos de dominio (cuatro nuevos y 16 existentes), tipos de producto/tests y lint. No hay SDK, SQL, autoridad ni secretos en la política. Las constantes pertenecen al módulo de mensajería. Revisión Codex read-only de tres archivos, manifiesto estable `55997F2764DC97723564E0BAF840B47B1152E4852F9DA16A83DB09B22CB91AFD`: cero hallazgos accionables.

Pendiente integrar el writer DB-only con identidad/recencia/CAS/ledger, preservar referencias y trabajos antiguos, resolver dependencias ordinarias, invalidar evidencia conforme causa de compromiso, guards de transferencia, routes/DTO propios, recuperación y controles accesibles. La política todavía no tiene consumidor productivo. La documentación arquitectónica existente mantiene retiro ordinario, suspensión urgente y revocación externa separados; los manuales se ampliarán cuando el recorrido esté disponible y validado.
