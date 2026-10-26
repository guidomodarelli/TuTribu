# Materialización privada de recordatorios de admisión

Este incremento añade una primitiva SQL privada sobre el contrato de seis eventos guardado en 8e808230. Conserva las 212 tareas originales: 174 completas y 38 pendientes. T185, T186 y US8 mantienen su alcance completo.

## Contrato implementado

- materialize_admission_notification_reminders selecciona pendientes de al menos 72 horas transcurridas y todavía no vencidas. Usa horas físicas, sin depender del día local. La obligación única de solicitud/evento conserva el recordatorio original entre repeticiones.
- Omite fences de tribu ocupados antes del límite, toma las membresías revisoras antes de solicitudes/obligaciones y repite el reloj y la existencia del original después de los locks. El lote procesa por defecto cincuenta solicitudes, con rango permitido de uno a cien; el límite cuenta fuentes, no avisos individuales.
- Reutiliza las primitivas originales de obligación y aviso, con sus auditorías mínimas en la misma transacción. Notifica únicamente a líderes y guardianes activos de la tribu. No cambia solicitud, decisión, versión ni membresía, y no agrega contacto ni motivos al payload interno.
- El owner conserva la transacción y su confirmación. Los errores se propagan; no existe un fallback de cero ni un retry automático. Si otra corrida confirmó el original, una siguiente consulta lo omite. Cero efectos no se interpreta como ausencia global de trabajo pendiente.
- La función es SECURITY DEFINER con search_path fijo y EXECUTE público revocado. No incorpora endpoint, coordinador protegido, scheduler ni transporte externo.

## Validación actual

El rojo Native preparó el journal real original y alcanzó la invocación de la función: **42883**, función inexistente, con **cero aprobados, un fallo y dos casos fuera del filtro**, e inputs registrados estables.

La ejecución actual del archivo completo terminó el **2026-10-15T16:25:46.185Z**, con **tres casos aprobados, cero fallos y cero filtrados**, y sus ocho inputs registrados estables:

1. Dos corridas concurrentes con límite uno y un catch-up explícito conservan exactamente las dos fuentes maduras y vivas de ámbitos distintos. Cada corrida respeta su límite; la carrera puede observar un original ya confirmado. El replay posterior produce cero. Solo existen los tres avisos de los revisores actuales y sus cinco hechos de auditoría; solicitudes jóvenes/vencidas quedan excluidas, la versión original permanece y ningún solicitante adquiere membresía.
2. Una transacción mantiene un fence real sobre la primera tribu. El límite uno procesa la otra tribu antes de liberarlo. El finally libera y espera al holder; la siguiente corrida recupera la primera fuente y el replay no duplica. El límite local de espera del test permite detectar un bloqueo incorrecto sin esperar al timeout general.
3. Antes de abortar el owner se observan dos obligaciones, tres avisos y cinco hechos de auditoría; después se comprueba cero en los tres conjuntos. Un retry explícito confirma las dos fuentes y otro replay produce cero. El rol de request no puede ejecutar la función, con 42501; tamaños cero, superior al máximo y nulo se rechazan con 23514.

Son tres casos de un archivo completo; aserciones, rojos y repeticiones no se suman. Se usan PostgreSQL, pg, Drizzle, journal y guards reales en ramas propias, sin dobles de esas dependencias, sin desactivar guardas ni reescribir fechas persistidas. Lint focal y tipos de pruebas pasaron; el código TypeScript de producto no cambió respecto del commit anterior.

La conciliación oficial posterior del **2026-10-15T16:27:26.551Z** confirmó producción y el piloto original, con cero ramas temporales. No hubo envíos externos. La arquitectura se comprobó en cuatro vistas reales de Chromium/WebKit a 390 y 1280 px, sin overflow y con su enlace local disponible; se inspeccionaron visualmente Chromium de escritorio y WebKit móvil. La evidencia sanitizada está en [admission-notification-reminders-results.json](admission-notification-reminders-results.json).

## Alcance restante

Faltan la composición de mantenimiento con autorización y recovery lock actuales, resultados por paso, trabajo restante, salud y confirmación incierta; endpoint, driver, scheduler y su medición operativa; productor de grupos, correo confiable, habilitación de correo, outbox completo y recorridos públicos. El conteo de esta primitiva no acredita una corrida completa del sistema ni SC-015.

El [workflow de 8e808230](https://github.com/guidomodarelli/TuTribu/actions/runs/38767589231) corresponde al contrato y writer guardados anteriormente. No se atribuye a esta edición posterior; el siguiente commit conserva su propio control completo. El cierre de T185/T186/US8, T211 y los gates operativos permanece pendiente.
