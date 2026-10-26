# Autoridad actual del grupo completo antes del despacho

Alcance: incremento privado parcial de T185. T185, T186 y sus gates conservan el alcance original; el inventario continúa en 181 completas y 31 pendientes de las 212 tareas. La evidencia de este componente no acredita un envío externo ni el cierre de US8.

## Comportamiento implementado

`resolveAdmissionNotificationGroupAuthority` evalúa todos los miembros incluidos en el manifest original de un grupo congelado y compara su identidad, manifest ordenado, fuentes y menor vencimiento nativo. Una fuente ausente, adicional, duplicada o cambiada impide autorizar el original completo. La decisión no puede reconstruirse a partir de la primera obligación superviviente.

`PostgresAdmissionNotificationDeliveryAuthority` consume la procedencia explícita del outbox y conserva el executor transaccional del caller. Toma el fence exclusivo de tribu y política antes de los locks de fuentes y recursos. Comprueba destinatario confiable actual, rol, preferencias, habilitación del correo, capacidad probada y conexión/versiones originales. Verifica el MAC del intent completo con su destino transitorio y relojes nativos, y repite configuración externa y autenticación del payload al final. No convierte filas PostgreSQL en DTO público ni les aplica schemas.

La composición inyecta dos guards propios de negocio en mensajería: uno antes del marker y presupuesto, y otro para el intento ya autorizado antes de abrir la credencial o resolver su proveedor. Una entrega con procedencia agrupada exige el guard; omitirlo en la composición cierra ese recurso. Los intentos individuales y de códigos conservan su protocolo existente.

Una denegación definitiva antes del marker suprime sólo el original todavía en cola y con lease/CAS vigente, sin intentos anteriores. La supresión y su auditoría se confirman juntas; el guard final de autoridad o configuración puede revertirlas. La capacidad temporalmente indisponible produce un error tipado y conserva el trabajo para su recuperación posterior. No se reserva ni devuelve presupuesto al efectuar esa supresión.

Después del marker, una pérdida de permiso o preferencia impide volver a obtener la credencial o proveedor. El marker y la reserva original conservan sus owners y no se liberan por inferir que un error demuestra ausencia de envío.

## Decisiones de diseño

- El módulo `notifications` posee la interpretación del grupo y su MAC. El repositorio genérico de mensajería recibe puertos de autoridad, sin importar reglas de grupos desde su dominio.
- La procedencia explícita determina el recurso. No se busca otro tipo de recurso mediante un UUID coincidente.
- El control usa los facts actuales dentro de la misma transacción de su caller. No agrega checkout, caché de permisos entre transacciones, proveedor remoto ni retry de una confirmación incierta.
- El contenido, idempotencia, conexión y vencimiento del original permanecen íntegros. Un cambio no lo redirige a un recurso nuevo.

## Validación observada hasta este corte

| Comprobación | Resultado observado | Alcance |
| --- | --- | --- |
| Dominio y regresiones locales | 207 casos en 9 archivos; 0 fallidos y 0 omitidos | Manifest íntegro, autoridad por miembro, plazo en microsegundos, claves y contratos de mensajería/SDK existentes |
| Tipos de producto | Correctos | Código corregido tras la revisión y reproducción del P2 |
| Tipos de tests | Correctos | Incluye el fixture y los cuatro escenarios Native; no equivale a ejecutarlos |
| Lint | Correcto | Árbol actual del incremento |
| PostgreSQL real corregido | Cuatro pasados, cero fallidos y cero omitidos | Dos archivos completos, sin filtro, 2103 inputs estables y productor consumido |
| Regresión PostgreSQL del flujo anterior | Doce pasados, cero fallidos y cero omitidos | Cuatro archivos completos, sin filtro, 2105 inputs estables y productor consumido |
| Revisión del código corregido | Cero hallazgos accionables | 20 modificados, 7 normativos, 27 de contexto y 9 recibos estables; no certifica Native activo |
| Arquitectura y enlaces | Correctos | Ocho vistas y 88 enlaces en Chromium/WebKit a 390/1280; recursos heredados conservados |
| Limpieza de entornos | Cero temporales propias; tres originales conservadas | Inventario oficial de Neon posterior a todos los productores; tres ramas en total y ninguna eliminación manual |

La ejecución local usa Node 24.21.0 y Vitest real con un transporte de base cerrado. Su custodia conserva 2110 inputs y confirma que no cambiaron durante la ejecución. La primera ejecución local anterior tenía 173 casos en 7 archivos; los 207 posteriores la incluyen junto con regresiones del registro y sender. Esos números no se suman como casos distintos.

Los cuatro escenarios Native nuevos utilizan preparación real del grupo, criptografía real, marker y reserva persistidos. La cohorte completa confirmó: autorización actual y opt-out después del marker; indisponibilidad temporal y opt-out antes del presupuesto; eliminación real del segundo solicitante de un grupo de dos fuentes después de su ventana nativa; y restauración del material de protección con el mismo keyId. Se consumió la ejecución terminal con cero y se comprobaron estados, consumos y auditoría nativos.

La regresión separada confirma doce casos en cuatro archivos completos: preparación anterior del grupo, sus snapshots y material protegido, más issuer, marker, credencial, SDK real con transporte cerrado y resultados del flujo de códigos. Ambas cohortes actuales tienen fuente estable, ningún filtro ni omitido y productores consumidos. Son 16 casos Native distintos en seis archivos; junto con los 207 locales forman 223 casos actuales distintos por archivo y nombre. El contraste conjunto de código, documentación y evidencia conserva su propio recibo.

## Hallazgo y reproducción conservados

La primera revisión identificó un P2: cambiar únicamente el material de `operation_payload` manteniendo su keyId hacía que un MAC fallido se convirtiera en supresión definitiva. La reproducción Native completa, sin filtro, terminó cero pasados/un fallido/cero omitidos en un archivo y con 2102 inputs estables. Observó resolución exitosa con supresión, fila `suppressed` persistida y `stale` al restaurar el material original. No es un fallo de PostgreSQL ni se modificaron guards SQL para corregirlo.

La corrección compara primero las pruebas nativas inmutables ya reconciliadas mediante los helpers existentes según el principal actual. El material incorrecto genera `connection_incomplete` y permite conservar el original; un MAC inválido bajo material comprobado sigue denegando contenido. La segunda revisión verifica esa separación y termina sin hallazgos sobre el código corregido. Los helpers existentes no cambian y el guard no inscribe claves.

Antes de editar el archivo se archivaron sus bytes y se descalificaron expresamente dos cohortes baseline todavía activas. Terminaron tres/cero/cero en un archivo y doce/cero/cero en cuatro archivos, ambas con fuente inestable y productores consumidos; quedan excluidas de evidencia corregida. Las cohortes posteriores se ejecutaron completas sobre los bytes corregidos y permanecen estables. Los resultados del rojo y los baseline no se suman como cobertura verde actual.

## Alcance pendiente

El CI del padre `9d08699438b0fcb81727892b1b8427cd9222cde0` terminó correctamente con 5679 casos y 55 páginas y sólo acredita ese checkpoint anterior. El contraste conjunto conserva su resultado separado; el nuevo checkpoint requiere su propio CI una vez guardado y subido. La limpieza oficial posterior a todas las cohortes confirma cero temporales propias y las tres originales conservadas. La rama `e2e-ui-0a5b09cf` observada en un inventario intermedio era ajena a los recibos de este trabajo y se preservó; ya no figuraba en el inventario final, sin eliminarla desde esta tarea.

El sender de avisos, recuperación funcional auditada del grupo, productor público, mantenimiento protegido, fairness operativa, runs, purga y mediciones de infraestructura continúan dentro de las tareas originales. La ruta actual de códigos sigue siendo específica de verificación; este incremento no simula un código para enviar un aviso ni declara que el correo agrupado ya se despacha.
