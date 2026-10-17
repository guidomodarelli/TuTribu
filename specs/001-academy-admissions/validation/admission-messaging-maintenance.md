# Composición privada del mantenimiento de admisión

## Alcance del incremento

Continuación de T186 sobre `55a8ae00080445c24b2b480c64cfbb1667982a31`. Se mantienen las 212 identidades, descripciones, dependencias y gates originales: 181 completas y 31 pendientes, con 71 aprobaciones temáticas. T185 y T186 siguen abiertas.

Se componen siete owners reales: expiración, retención de admisión, retención de mensajería, recordatorio lógico único, preparación de grupos completos, dispatcher y reconciliación. La ruta privada valida bearer e input antes de importar la raíz, devuelve un DTO propio seguro y conserva los avances por fase. No activa horarios, despliegues, migraciones productivas o envíos reales.

## Decisiones verificables

- Una ventana total de 45 segundos y una adquisición nativa de 90 segundos con rotación de primera fase. No son la vigencia del marker del outbox.
- Un único registro privado por base, con versiones, reloj nativo, RLS forzada y último éxito confirmado; la nueva época no hereda salud de la anterior.
- El recordatorio interno no requiere claves ni se repite en la preparación de grupos.
- Nuevos claims, markers y preparaciones pasan por el gate original. El recibo y la observación de un intento ya iniciado conservan su executor original.
- No hay RPC bajo locks ni una espera SQL nueva entre la preparación final del recurso y el envío.
- Los contadores tienen unidades independientes. Ausencia de configuración, observación perdida y trabajo no iniciado son estados explícitos; no se reemplazan por cero exitoso.
- La edad de cola lee sólo la primera fila mediante un índice parcial. La salud desconocida conserva nulos y no afirma una cola vacía.

## Validación acumulada y límites

La cohorte local inicial pasó 38 casos en cuatro archivos. La clasificación de una preparación parcialmente confirmada y otra sin configuración se reprodujo en rojo (6 pasados, 1 fallido): conservaba sus contadores pero mostraba un fallo genérico. El mapper distingue ahora la falta de configuración y los siete casos de esa suite pasan.

La revisión encontró dos P2 y un P3: pérdida de contadores tardíos cuando fallaba su observación, dependencia innecesaria de claves para reconciliar leases y un resultado ocupado que no contrastaba el vencimiento nativo. Ambos P2 se reprodujeron en rojo (18 pasados, 2 fallidos). La corrección conserva los contadores antes de esperar su registro, marca esa observación como no disponible y compone la reconciliación directamente con el owner SQL y sus guards. Sólo el estado todavía en curso contrasta también su deadline; un original ya completado conserva su resultado histórico.

Tras esas correcciones pasan 47 casos locales en cinco archivos, más 35 regresiones de cuatro archivos de owners existentes. Pasan los tipos del producto y de tests, el lint y el build real de Next.js, que genera 56 páginas y reconoce la nueva ruta. La segunda revisión no encuentra hallazgos accionables: coinciden 33 fuentes, ocho documentos normativos y tres recibos al inicio y al final. Esa revisión de código no certifica PostgreSQL ni los gates operativos.

La primera cohorte PostgreSQL completa tuvo dos assertions fallidas, con fuentes estables. La segunda pasó el caso completo de almacenamiento, aislamiento, replay, reloj, rotación, cambio de ámbito y evidencia tardía. Sus otros dos casos permanecieron fallidos: el fixture exclusivo de recordatorios carecía de la política necesaria para expirar y PostgreSQL devolvió `23502`; el ensayo que esperaba completar todas las fases y despachar en la primera ventana alcanzó el límite real antes del RPC. Se conservan ambas cohortes sin convertirlas en éxito.

El fixture revisado reproduce directamente el error PostgreSQL `23502` de la columna `policy_version` y después añade una política actual, sin reescribir snapshots o fechas. El caso SDK prepara cinco turnos anteriores incompletos mediante el owner real para comenzar por despacho y cierra el deadline nativo durante el transporte controlado. Exige una sola aceptación original, locks libres y conservación del último éxito anterior. El caso de progreso espera los plazos nativos originales para distinguir un resultado completado histórico de una ejecución todavía ocupada.

La cohorte corregida completa pasa tres casos en tres archivos, sin filtros, omisiones o fallos, con 2144 inputs actuales estables. Confirma el almacenamiento y RLS nativos; una expiración, dos recordatorios únicos y reconciliación sin claves mediante los owners reales y el DTO HTTP; y una única aceptación del SDK real después de cerrar la ventana nativa, conservando intento y reserva. No había locks de entrega o mantenimiento retenidos durante el transporte controlado. La observación del original ocupado informa el deadline actual, mientras el replay completado mantiene su éxito histórico. Los tres originales de Neon quedan conservados y no quedan ramas temporales del ensayo.

El CI del checkpoint anterior pasó 5785 casos y compiló 55 páginas. Ese CI valida el checkpoint guardado anterior; no acredita este incremento local. Ninguna prueba local o transporte controlado certifica recepción externa, scheduler, hosting, rendimiento operativo o los restantes criterios de T185/T186.
