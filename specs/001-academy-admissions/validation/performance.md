# Rendimiento de admisiones

T200 y T209 permanecen abiertas. La carga Native inicial no cumple el criterio de confirmación p95 inferior a tres segundos. No se cambió ese límite ni se excluyeron los fallos del cálculo.

La lectura agrupada de hechos se validó funcionalmente y se midió sobre `08ca022f`: cien resultados correctos, 50 ingresos/50 pendientes, pool 300/300 y p95 **6.327,19 ms**, todavía fallido. El [detalle de snapshots, locks y cohorte](admission-locked-facts.md) conserva el nuevo resultado y su alcance; reducir viajes no acredita por sí solo el objetivo.

El [diagnóstico de backends](admission-backend-observation.md) prepara observación externa de estados/esperas y metadatos de la conexión seleccionada, sin SQL ni credenciales. Su contrato con un lock real pasó; la cohorte observada mantiene los cien solicitantes y el gate original.

## Alcance y fuente

La ejecución usa Node 24.21.0, `pg` y PostgreSQL de Neon reales, con 10.000 entradas vigentes y 100 cuentas/sesiones sintéticas. Cincuenta contactos están habilitados; los otros cincuenta presentan una excepción. Invoca los comandos de aplicación y sus owners SQL; no mide la ruta HTTP completa, entrega externa, diez participantes humanos ni un scheduler operativo.

Fuente: worktree propio `admission-performance-validation`, HEAD `acf8240361b41768fea3d2e55b2fbe1212b51dc6` más cuatro paths iniciales del harness. Registro privado: `.git/admission-performance-native-b837aa5f/`. Los 3.636 inputs y los dos helpers conservaron sus hashes. El resultado original permanece fallido.

## Primera carga Native

| Dato | Resultado observado |
| --- | --- |
| Casos | Un aprobado y uno fallido; código de salida 1 |
| Preparación del dataset | 152.357,51 ms, fuera de la ventana medida |
| Warm-up de cuentas y conexiones | 104.436,30 ms, fuera de la ventana medida |
| Participantes simultáneos | 100 |
| Confirmaciones | Tres admitidos y dos pendientes |
| Fallos | 95, con códigos `unexpected_failure` y `operation_unresolved` |
| p95 de todas las llamadas originales | 112.706,06 ms; objetivo inferior a 3.000 ms |
| Pool | Máximo 10; pico de 90 esperas; 350 adquisiciones y 350 liberaciones |
| Estado final del pool | Cero esperas y cero conexiones retenidas |
| p95 de demora del event loop | 34,67 ms |
| Efectos SQL | 10.000 entradas, cinco solicitudes y tres miembros básicos |
| Mensajes reales | Cero |

Los fallos conservan su duración en el percentil. La ausencia de conexiones retenidas al final no acredita capacidad suficiente durante el pico. La saturación observada requiere diagnóstico; el primer registro no permite atribuir los fallos a una causa nativa concreta porque el harness no proyectaba `failure.cause`.

Las dos ramas de esa ejecución, `br-morning-voice-anzl1lfa` y `br-orange-art-anew77lp`, ya no estaban en el inventario administrativo posterior. Se conservaron las tres ramas originales; no se consultó SQL en producción.

## Abandono y corrección del diagnóstico

El segundo caso inicial abrió una transacción real con pool de una conexión y observó el guard configurado en 30.000 ms, una liberación por error y una consulta sana posterior. Sin comprobar la causa nativa, ese oráculo también podía aceptar otra desconexión. Por eso no se usa para certificar el guard de abandono.

El harness corregido exige SQLSTATE `25P03` en la liberación real, conserva las causas privadas de los resultados fallidos y sólo proyecta SQLSTATE y la observación específica de timeout de checkout de la versión instalada de `pg-pool`. No imprime mensajes, consultas, parámetros, credenciales ni contactos. Cinco tests focales aprobaron y dos casos SQL opt-in quedaron omitidos; pasaron tipos de tests, lint y `git diff --check`.

## Repetición diagnóstica terminada

La ejecución independiente `.git/admission-performance-native-d23f2c95/` terminó con código 1: un caso aprobado y uno fallido. Los 3.639 inputs y los dos helpers conservaron sus hashes. La preparación duró 149.531,32 ms y el warm-up 103.535,71 ms, ambos separados de la ventana medida.

La carga confirmó cinco admitidos y un pendiente; hubo 94 fallos, todos con la observación específica `poolCheckoutTimedOut=true`. El p95 de las cien llamadas originales fue 107.240,63 ms. El pool alcanzó 90 esperas con máximo diez conexiones; conservó 326 adquisiciones y 326 liberaciones, sin esperas ni conexiones retenidas al final. SQL confirmó 10.000 entradas, seis solicitudes, cinco miembros básicos y cero entregas. El p95 del event loop fue 34,77 ms.

Dos observaciones directas con `pg`, cada una en transacción de sólo lectura, una conexión adicional y sentencias limitadas a cinco segundos, comprobaron esperas sobre tuplas de `tribes` y sobre transaction IDs. La segunda encontró dos locks de tupla `AccessExclusiveLock` sin conceder y uno concedido. Sólo se leyeron conteos, estados y metadata de locks; no consultas activas completas, contactos ni credenciales. Estos observadores convierten la repetición en diagnóstico y no se presentan como parte de un benchmark puro aprobado. La rama estaba comprobada por ID, nombre, padre y condición no default; nunca se usó SQL productivo. Recibos privados: `.git/codex-performance-live-repro-inspection.json` y `.git/codex-performance-live-lock-inspection.json`.

El caso de abandono reforzado pasó: setting real de 30.000 ms, liberación con SQLSTATE `25P03`, recuperación en 32.996,59 ms y consulta sana posterior. Las dos adquisiciones tuvieron sus liberaciones, con cero esperas y cero conexiones retenidas al final. El código nativo distingue ese guard de una desconexión genérica; la primera ejecución conserva su oráculo anterior y no se reinterpreta retrospectivamente.

La revisión confirmó contención por tribu y muchas consultas de autoridad secuenciales. La mejora requiere reducir trabajo conservando locks, frescura y barreras; aumentar timeouts o el pool no acredita el objetivo. El cambio posterior de la constante de carga sólo fija las 10.000 entradas en su owner de rendimiento, independientes del límite CSV, conservando el mismo valor efectivo; no se le atribuye una ejecución Native nueva.

T200 y T209 siguen pendientes. Esta evidencia no reemplaza el primer resultado fallido ni acredita SC-013, SC-015 o SC-021 completos. La muestra SC-021 de 1.000/800/200 y las mediciones de visibilidad y agrupación conservan sus propios casos y criterios.

## Red y preparación de la ejecución independiente

La sonda `.git/admission-network-probe-c23a6dd7/` usó una rama propia y sólo `SELECT 1`, sin leer filas de la aplicación. En PostgreSQL 17.11 y región `aws-us-east-1`, veinte consultas después del warm-up dieron mediana de 163,92 ms y p95 de 166,04 ms desde esta computadora. La transacción fue de sólo lectura y la ausencia posterior de la rama quedó confirmada. Esta medida identifica el costo local de un viaje, sin atribuir a la red todos los fallos de las cargas anteriores ni certificar un host operativo.

La regresión completa del checkpoint previo pasó: lint, tipos de producto y tests, suites y build real de Next, con los 3.639 inputs y el helper conservados. Registro privado `.git/admission-performance-quality-d38f3872/`. El commit integrado `eaeda2287efba215fc14b655538b0d7d0d5fdb58` también tiene CI completo aprobado en [el run 39045728599](https://github.com/guidomodarelli/TuTribu/actions/runs/39045728599). Esta regresión no convierte su carga Native fallida en aprobada.

El harness agrega las veinte consultas mínimas al warm-up, conserva las cien llamadas simultáneas y sus límites, permite dos nonces externos para reconciliar recursos tras un fallo de CI y produce sólo un reporte sanitizado. Once pruebas focales pasan, con dos SQL opt-in omitidas; pasaron tipos y lint. El workflow exige una capacidad efímera limitada al proyecto y el SHA exacto antes de usarla; su propietario revoca esa capacidad y verifica la limpieza al terminar. La preparación se revisó separadamente de la ejecución siguiente.

## Carga Native en GitHub Actions

El [run 39048734681](https://github.com/guidomodarelli/TuTribu/actions/runs/39048734681), sobre `47ecb74d8403230e67784436e68b8a64adc1061f`, ejecutó los dos casos con Node, `pg` y Neon reales. El caso de carga falló y el de abandono pasó; no hubo pasos Native omitidos. Artefacto público saneado `admission-native-performance`, copia privada `.git/admission-native-ci-ac4b523c/artifact/admission-native-performance.json`. El reporte conserva ese SHA, exit 1 y ausencia de truncamiento.

Con las mismas 10.000 entradas y 100 llamadas concurrentes hubo 11 admisiones, 0 pendientes y 89 fallos de adquisición del pool. El p95 de confirmación fue 75.853,26 ms frente al objetivo estricto inferior a 3.000 ms. Las veinte consultas mínimas dieron p95 de 72,66 ms; preparación y warm-up separados duraron 63.629,28 ms y 43.033,54 ms. El event loop dio p95 de 20,97 ms. El pool mantuvo máximo 10 y pico de 90 esperas, con 391 adquisiciones y 391 liberaciones, cero esperas y cero conexiones retenidas al final. Los efectos confirmados fueron 10.000 entradas, 11 solicitudes, 11 membresías básicas y cero entregas.

El abandono observó el guard real de 30.000 ms, SQLSTATE `25P03`, recuperación en 31.212,58 ms y consulta sana posterior. Sus dos adquisiciones tuvieron sus liberaciones, con cero esperas y cero conexiones retenidas al final.

El owner externo comprobó el estado terminal del run, vinculó el job y el paso realmente ejecutado al SHA, registró `not_passed` y terminó con exit 1. Confirmó la revocación de su key limitada al proyecto, la eliminación de su secreto y tres variables temporales, y la ausencia de las dos ramas previstas, preservando los tres recursos originales. No hubo errores de limpieza y el helper mantuvo su hash. Registro privado `.git/admission-native-ci-ac4b523c/owner.json`; once contratos previos del owner ejercieron respuestas perdidas y preservación de configuración concurrente sin credenciales ni operaciones reales.

La reproducción remota conserva el fallo de rendimiento y reduce el costo de red observado frente al host local, sin acreditar infraestructura sana ni atribuir toda la demora a la red. T200/T209 y SC-013/SC-015 siguen pendientes; se debe reducir el trabajo bajo contención y comprobar la carga en un target con latencia adecuada, conservando todas las barreras y los criterios. SC-021 conserva su [muestra persistida aprobada sobre `1cb26717`](allowlist-persisted-sample-baseline.md), con 1.000 comandos y 800 admisiones/200 pendientes: esta carga de 100 no la reejecuta ni sustituye la evaluación de vigencia de esa evidencia histórica.

## Diagnóstico secuencial y reutilización de autoridad actual

Dos ejecuciones locales con Node 24.21.0, `pg` y Neon reales prepararon 10.000 entradas y cien cuentas sintéticas, y midieron solamente dos presentaciones secuenciales: una habilitada y una excepción manual. La referencia usa `6404061497f91597d34fdacf166be46445a03415`; la repetición conserva esa base con el cambio propio de `PostgresAdmissionAuthorizationReader` y sus regresiones. El [reporte saneado](authorization-reader-profile.json) guarda ambos resultados y las huellas de los tres inputs modificados de código/tests, comprobadas sin cambios hasta el cierre.

| Presentación | Antes | Después |
| --- | ---: | ---: |
| Contacto habilitado, admitido | 20.978,21 ms | 18.855,12 ms |
| Excepción manual, pendiente | 20.774,94 ms | 18.354,72 ms |

La lectura de actor conserva la comprobación previa de identidad y reutiliza `read_admission_reviewer_context` también para acciones del solicitante. Reduce de cinco a dos los viajes por lectura, con los mismos locks compartidos y el reloj final dentro de la función existente. Sus consultas secuenciales `VOLATILE` conservan snapshots actuales después de esperar; no se reemplazan por una única foto anterior a un lock. No se modificaron migraciones, grants, límites, pool, leases ni timeouts de producto.

Las siete pruebas SQL pasaron sin omisiones. Incluyen un rol real sin bypass RLS, solicitante sin membresía, actor o sesión incorrectos, ausencia de sesión/scope, recursos de otra tribu, revocación y conexión retirada. Tres casos prueban esperas nativas con `pg_blocking_pids`: membresía insertada después de comenzar la consulta, rol/estado actualizado mientras espera y sesión que vence durante la espera del miembro. También pasaron los 113 casos de elegibilidad, los tipos de producto y tests, el lint completo y el build real de Next.js 16.3.4.

Las preparaciones duraron 171.556,90 y 176.605,29 ms, separadas de la medición. Cada ejecución dejó 135 adquisiciones y 135 liberaciones, cero esperas y una conexión ociosa de una total antes de cerrar el pool. El harness confirmó la eliminación de sus ramas; el inventario posterior conserva las tres originales. No hubo envíos reales. `pg_stat_statements` no estaba instalado; el diagnóstico predefinido se intentó sin éxito y no se instaló ninguna extensión ni se exportaron errores crudos. Registros privados: `.git/admission-current-profile-6c52eb67/` y `.git/admission-current-profile-36003612/`.

Estas dos observaciones muestran una reducción inicial de unos dos segundos y conservan el resultado admitido/pendiente. No calculan un p95 ni ejecutan la carga simultánea de cien cuentas, la ruta HTTP, la muestra SC-021 o un scheduler. T200/T209 y el objetivo estricto inferior a tres segundos permanecen pendientes. El barrido de acceso a base mantiene el único checkout de producto en `runWithGuardedTransaction`, con guard local y liberación idempotente; la consulta de sesión excluye timeouts de checkout de sus reintentos y la reconciliación de cobertura conserva su ventana de frescura.

## Comparación agrupada de material HMAC

La repetición siguiente conserva la preparación de 10.000 entradas y cien cuentas, y las dos llamadas secuenciales. Usa `675a8541cef41592dcef51b02f93213956f5f15e` como base con tres inputs propios de producto y un test nuevo; sus cuatro huellas se conservaron desde antes de iniciar hasta el cierre. El [reporte saneado](mac-material-profile.json) conserva la referencia anterior y el resultado siguiente, con `fullLoadAcceptance=false`.

| Presentación | Antes de agrupar | Después |
| --- | ---: | ---: |
| Contacto habilitado, admitido | 18.855,12 ms | 17.735,76 ms |
| Excepción manual, pendiente | 18.354,72 ms | 17.528,15 ms |

`ADMISSION_OPERATION_MAC_KEY_PURPOSES` conserva los dos propósitos originales. El helper agrupado consulta autoridad antes de tocar claves y compara en una llamada todas las pruebas activas y retenidas, usando la misma función nativa que comprueba contexto e inmutabilidad. El ledger reduce de cuatro a dos los viajes por comprobación de material y mantiene sus comprobaciones finales de autoridad, material y reloj. La llamada individual delega en ese mismo helper. No se agregan inscripciones ordinarias, caché de permisos/claves, migraciones, grants ni cambios de límites o pool.

Pasaron cuatro casos SQL reales sin omisiones, sobre el journal completo de migraciones. El caso nuevo comprueba ambos propósitos, claves activas y retenidas, falta de clave activa, conjunto vacío, recovery lock e identidad ausente o inexistente antes de abrir el keyring. Utiliza un rol nativo sin bypass RLS; rechaza una clave retenida sin inscripción y exige reconciliación privada explícita antes de aceptarla. Los tres casos previos conservan identidad/consumo, el ledger original y la recuperación histórica cuando cambia material bajo el mismo id. También pasaron tipos de producto y tests, lint completo y build real de Next.js 16.3.4.

La preparación duró 182.894,40 ms fuera de la ventana medida. Hubo 135 adquisiciones y 135 liberaciones, sin errores de liberación, esperas ni conexiones retenidas; el pool ya tenía cero conexiones al muestrear su estado final. Se confirmó la eliminación de las ramas propias y el inventario posterior conserva las tres originales. No hubo envíos reales ni instalación de extensiones. Registro privado: `.git/admission-current-profile-95c86a4a/` y `.git/admission-mac-material-vitest.json`.

El commit anterior `675a8541` tiene su [quality gate completo aprobado](https://github.com/guidomodarelli/TuTribu/actions/runs/39095440955). Esa aprobación corresponde al commit indicado; la modificación agrupada conserva sus validaciones propias y requiere su nuevo CI. Las dos observaciones finales rondan 17,5–17,7 segundos frente a los 20,8–21,0 iniciales. Siguen por encima del objetivo y no acreditan carga simultánea, p95, HTTP, SC-021 ni un scheduler. T200 y T209 permanecen abiertas.

## Carga después de coordinar por solicitante

La [regresión de concurrencia](admission-submission-concurrency.md) permite confirmar otra persona mientras los efectos de la primera siguen antes de COMMIT, y conserva un único ingreso frente a cuatro operaciones simultáneas de una misma persona. La coordinación mantiene el fence compartido de tribu y serializa el beneficiario propio; las acciones administrativas conservan el exclusivo. La [evidencia de carga saneada](admission-submission-scope-performance.json) corresponde a `1e929c419df66207f3acc9554c652eab16e8e3fd` más los seis inputs de producto con sus huellas, sin modificar el pool de diez conexiones ni el criterio.

La carga real de cien cuentas sobre diez mil entradas falló: nueve admisiones y una pendiente, con noventa fallos específicos de checkout del pool. El p95 de las cien llamadas originales, incluidos esos fallos, fue 66.807,05 ms frente al objetivo inferior a 3.000 ms. El pool alcanzó noventa esperas con máximo diez, conservó 407 adquisiciones y 407 liberaciones y terminó sin esperas ni conexiones retenidas. SQL confirmó diez solicitudes, nueve miembros básicos y cero entregas. El p95 del event loop fue 34,28 ms. No se excluyen los fallos ni se eleva el límite para aceptar el resultado.

La preparación duró 170.882,93 ms y el warm-up 106.598,44 ms, separados de la ventana medida. Veinte consultas mínimas dieron p95 de 165,34 ms. Una sonda `pg` de sólo lectura, limitada a cinco segundos por sentencia y comprobada contra la rama propia, observó `max_connections=901`, cuatro conexiones reservadas a superusuario, cero reservas adicionales, `rolconnlimit=-1` y `max_locks_per_transaction=64`. Terminó antes del límite más temprano posible de la medición, calculado con el inicio de Vitest y los tiempos reales de preparación/warm-up. No leyó filas de aplicación ni usó SQL productivo; la capacidad declarada no sustituye la medición de throughput.

El caso independiente de abandono pasó: guard original de 30.000 ms, SQLSTATE `25P03`, recuperación en 32.936,55 ms y consulta sana posterior. Sus dos adquisiciones tuvieron sus liberaciones, sin conexiones retenidas. Ambos casos ejecutaron PostgreSQL real y finalizaron; el fallo de carga se conserva. Registros privados: `.git/admission-submission-scope-performance-vitest.json`, `.git/admission-submission-scope-performance.log` y `.git/admission-submission-capacity-probe.json`.

La siguiente corrección debe atender la capacidad del pool y volver a medir el workload completo. Esta ejecución no acredita T200/T209, SC-013/SC-015/SC-021, la ruta HTTP ni un scheduler. No hubo envíos reales.

## Repetición con capacidad para cien operaciones

La [validación de capacidad](admission-pool-capacity.md) y su [reporte saneado](admission-pool-capacity.json) conservan la repetición real sobre `6d89c40d` más el cambio de máximo del factory a cien. Completó cincuenta admisiones y cincuenta pendientes sobre diez mil entradas, sin fallos ni timeouts de checkout. Hubo 500 adquisiciones y 500 liberaciones, cero espera máxima y ninguna conexión retenida al finalizar. SQL confirmó cien solicitudes, cincuenta miembros básicos y cero entregas.

El p95 de las cien llamadas originales fue 18.954,82 ms: el caso sigue fallido por el límite inferior a 3.000 ms. Preparación de 154.655,27 ms y warm-up de 104.454,14 ms permanecen separados; la sonda mínima dio p95 de 169,47 ms y el event loop 29,52 ms. El guard original de abandono pasó con SQLSTATE `25P03`, recuperación en 32.995,21 ms y liberaciones completas. El checkout principal recibió exactamente los bytes probados y sus documentos, conservando la base y las huellas. T200/T209 y los gates operativos permanecen pendientes; no se rebaja el objetivo ni se presenta esta distribución correcta como aprobación de latencia.

## Runner remoto con pool cien

El [run 39100094760](https://github.com/guidomodarelli/TuTribu/actions/runs/39100094760) ejecutó ambos casos sobre `59c1a9bc013013921a52f0949e6a951e86cea28d` con Node y PostgreSQL reales; el paso nativo no se omitió. El [artefacto saneado](admission-pool-remote-node.json) conserva exit 1 y salida completa. La carga confirmó cincuenta admitidos y cincuenta pendientes, cero fallos y cero timeouts de checkout. SQL confirmó cien solicitudes, cincuenta miembros básicos y cero entregas. El pool máximo cien conservó 500 adquisiciones y 500 liberaciones, sin esperas ni conexiones retenidas, y el p95 del event loop fue 21,36 ms.

El p95 de las cien llamadas fue 6.714,96 ms frente al objetivo estricto inferior a 3.000 ms. Veinte consultas mínimas dieron p95 de 56,50 ms; preparación y warm-up separados duraron 50.703,47 y 33.767,79 ms. La mejora frente al host local conserva la evidencia de latencia pendiente; no prueba por sí sola que toda la demora sea de red.

El abandono pasó con guard de 30.000 ms, SQLSTATE `25P03`, recuperación en 30.951,65 ms y consulta sana posterior; sus adquisiciones y liberaciones quedaron equilibradas. El owner vinculó job/paso/resultado al SHA, registró `not_passed`, revocó la key temporal limitada al proyecto, eliminó su secreto y tres variables y confirmó ausentes sus dos ramas, conservando las tres originales. No hubo errores de cleanup ni cambios del helper. Registros privados: `.git/admission-native-ci-a1cecdc9/owner.json` y su artefacto. Los once contratos del owner pasaron antes de operar, sin credenciales reales. T200/T209 y los gates independientes permanecen pendientes.

## Identidad nativa y transacciones de confirmación

La [validación de transacciones de sesión](admission-session-transactions.md) reproduce cinco adquisiciones del pool real por solicitud y verifica su reducción a tres, manteniendo la lectura inicial de cuenta y las comprobaciones SQL actuales dentro de claim y efecto. El cambio de usuario/sesión y la revocación entre commits siguen impidiendo efectos. Esta reducción no acredita el p95 de la cohorte completa ni cierra T200/T209.

La [carga completa sobre a4540ec1](admission-session-colocated-node.json), en el mismo Node cercano con 2 CU verificadas, confirmó 50 ingresos/50 pendientes, cero fallos y 300 adquisiciones/liberaciones, sin esperas ni fugas. Su p95 de 7.165,90 ms conserva el fallo frente a 3.000 ms; la sonda mínima fue 3,44 ms. El diagnóstico distinguió cien transacciones de cuenta y doscientas de comando, cuyos p95 fueron 452,15 y 5.197,70 ms. La función y rama propias fueron eliminadas y las tres ramas anteriores quedaron preservadas.

El [protocolo de diagnóstico SQL](admission-statement-profile.md) agrega el inspector nativo en la rama efímera, con salida numérica saneada y sin conservar el texto de las consultas. Sus estadísticas acumuladas incluyen preparación y warm-up; no sustituyen el p95 del workload ni acreditan por sí solas su causa.

La [atribución sobre 8094e9ef](admission-statement-profile-attributed.json) identificó materialización/obligación de avisos, autoridad y elegibilidad propia entre las filas de mayor costo, manteniendo el mismo bundle y el fallo p95 de 7.013,18 ms. La [consolidación de los guards](admission-authority-query-batching.md) conserva el rechazo antes de locks para un actor incorrecto y las comprobaciones SQL actuales de usuario/sesión, con menos consultas redundantes. Su validación funcional no reemplaza la siguiente medición completa.

La [medición completa de dd551953](admission-authority-colocated-node.json) mantuvo los 50 ingresos/50 pendientes sin fallos, con 300 adquisiciones/liberaciones equilibradas y las proyecciones completas de cuenta reducidas de 900 a 400. El p95 fue 6.187,21 ms frente al mismo umbral de 3.000 ms: el caso sigue fallando esa aserción. La sonda mínima dio 2,53 ms y los p95 de transacciones de cuenta/comando fueron 340,72/4.742,73 ms. No se cambiaron el protocolo ni sus exclusiones, y la limpieza confirmó las tres ramas anteriores preservadas. T200/T209 y las catorce tareas abiertas mantienen sus criterios.

La [coordinación de obligación y avisos](admission-notification-stage.md) conserva los efectos y destinatarios actuales en una llamada SQL, con audiencia de dominio, ACL originales y snapshots nuevos después de esperas. Se acredita por separado su comportamiento funcional, rollback y replay de migración; requiere otra carga completa antes de atribuirle una mejora del p95.

La [carga de c30e78fc](admission-notification-stage-load.json) conservó los cien resultados correctos y el pool equilibrado, pero su p95 de 6.372,48 ms no pasó ni mejoró la corrida anterior. El runtime diagnóstico informó dos procesadores disponibles y cuota cgroup desconocida; no se infiere una cuota específica. El ensayo siguiente selecciona sólo capacidad de un endpoint efímero, manteniendo el default de 2 CU para el caso ordinario, el protocolo y el gate estricto.

El [contraste de 7e8918bd con 8 CU](admission-notification-eight-cu.json), verificadas por API, dio p95 de 5.341,00 ms y mantuvo los cien resultados correctos, pool 300/300 y cero entregas. Conserva el fallo frente a 3.000 ms. La utilización del event loop pasó de 0,315 a 0,692 y el proceso registró 4.388,08 ms de CPU user+system dentro de 5.435,35 ms de ventana; no se interpreta ese acumulado como tiempo de una sola solicitud. La rama/función experimentales se retiraron y la configuración productiva quedó igual. El siguiente diagnóstico debe atribuir el costo del cliente, manteniendo el criterio completo.

El [muestreo de CPU opt-in](admission-cpu-profile.md) permite atribuir el trabajo del mismo runtime durante calentamiento y carga. Publica únicamente una proyección numérica y símbolos de código, conserva el diagnóstico de indisponibilidad y exige una medición sin profiler para cerrar posteriormente el objetivo de latencia.

El [perfil aislado de la cohorte](admission-cpu-profile-scoped.json) conserva el p95 instrumentado fallido de 5.507,38 ms y actividad de microtareas, protocolo y GC. El [contraste de capacidad por owner](admission-pool-owner-capacity.md) limita sólo las conexiones físicas, conserva los cien solicitantes simultáneos y cuenta toda la espera dentro del p95. La aceptación y los demás gates mantienen sus criterios originales.

El [resultado 8 CU/pool25](admission-pool-owner-capacity.json) completó los cien resultados correctos y 300 adquisiciones/liberaciones, con pico de cola 75 y p95 de 7.354,86 ms. No mejoró 8 CU/pool100 y se descarta como default; cien continúa siendo el máximo habitual. La primera ejecución falló en el control plane antes de crear rama y se conserva separada. Se retiraron los recursos propios del ensayo completo y las tres ramas anteriores quedaron preservadas. La cuota del runtime y la causa única de la latencia no se declaran probadas.

La [muestra de mil contactos SC-021](admission-thousand-contact-sample.md) se ejecuta como validación funcional separada, mediante los mismos seeders y casos de uso reales. Exige evidencia preparada vigente, 800 ingresos/200 revisiones y stock contrastado después de un replay; no modifica ni acredita el criterio de cien concurrentes/p95<3 s.

La [regresión Native de fc074d9a](admission-thousand-contact-sample.json) aprobó los 1.000 comandos, 800 ingresos/200 pendientes y cero fallos, con 3.000 checkouts/liberaciones y stock/replay contrastados por SQL. Reacredita SC-021 sobre el código actual junto a la evidencia previa de T120. No se marca T200/T209 completa: p95<3 s, visibilidad y los demás criterios conservan sus gates.

El [modo ordinario posterior](admission-default-after-sample.json), con el mismo bundle de runtime y muestra deshabilitada, conservó 100 participantes y 50 ingresos/50 pendientes sin errores ni fugas. Volvió a fallar únicamente el p95 de 6.333,38 ms frente a 3.000 ms; el protocolo y sus exclusiones no cambian. Se retiraron sus recursos propios y se verificaron las tres ramas anteriores.

## Repetición remota después de consolidar consultas

El [run 39111434595](https://github.com/guidomodarelli/TuTribu/actions/runs/39111434595) ejecutó el paso Native completo sobre `36ff21fa49a9994dff761b48b7e4e7a994fc1832`, con Node 24.21.0 y las cien llamadas originales. El [artefacto saneado](admission-remote-after-batching.json) conserva cincuenta ingresos/cincuenta pendientes, cero fallos y cero timeouts, diez mil entradas, cien solicitudes, cincuenta miembros básicos y cero entregas. El pool máximo cien quedó en 300 adquisiciones/300 liberaciones, sin esperas ni conexiones retenidas.

El p95 de 7.357,40 ms volvió a fallar frente al límite estricto inferior a 3.000 ms; no mejora la ejecución remota anterior. La sonda mínima dio p95 de 69,83 ms y el event loop 21,05 ms. Preparación de 54.618,31 ms y warm-up de 35.855,39 ms permanecen fuera de la ventana medida. La comparación no permite atribuir una causa única ni sustituye el ensayo cercano anterior. El abandono pasó con guard de 30.000 ms, recuperación en 31.095,91 ms, consulta sana y liberaciones equilibradas.

El owner confirmó el resultado fallido y retiró su secreto, tres variables y dos ramas, conservando las tres originales. Su primer intento de revocación de key falló; una reconciliación posterior comprobó id/nombre exactos, revocó únicamente esa key y volvió a verificar su ausencia y el inventario de tres ramas. El helper no cambió mientras operaba. Registros privados: `.git/admission-native-ci-cfefaae0/owner.json`, `cleanup-reconciliation.json` y el artefacto del run. No se oculta el fallo de limpieza inicial ni se marca T200/T209 completa; las catorce tareas pendientes conservan su alcance.

La [proyección con cuenta bloqueada](admission-account-lock-projection.md) agrupa el lock de usuario y la autoridad nativa en una consulta, manteniendo el orden previo y la evaluación actual después de las esperas. Doce comportamientos SQL distintos aprobaron privilegios invoker, clock, membresía concurrente, recencia sensible, sesión y replay; se conservan los dos fallos iniciales del fixture y su ajuste mínimo. La regresión funcional, tipos, lint y build no sustituyen la siguiente medición completa de cien solicitantes ni cierran T200/T209.

La [carga completa de bc6aa492](admission-account-lock-colocated-node.json) conservó las cien llamadas, 50 ingresos/50 pendientes, cero fallos, 300 adquisiciones/liberaciones y stock/replay correctos sobre 2 CU. Su p95 de 6.066,30 ms volvió a fallar el límite de 3.000 ms, con sonda mínima de 2,50 ms y p95 de transacciones de comando de 4.499,74 ms. El nuevo perfil conserva 500 consultas agrupadas de cuenta/actor; CPU, espera y estadísticas acumuladas requieren atribución adicional y no permiten declarar una causa única. Fuente y helper quedaron estables y se retiraron función/rama propias, preservando las tres anteriores. Las catorce tareas pendientes conservan su alcance; no se repite la carga sin un cambio o diagnóstico que justifique otra ejecución.

El [observador de esperas de consultas](admission-database-observation.md) añade un diagnóstico numérico opt-in durante la misma cohorte. Delega cada llamada a la transacción real, calcula la unión de intervalos y separa cuenta/comando, incluyendo expresamente bookends y otros tiempos no observados en su residual. Sus treinta contratos locales, tipos, lint y compilación del entrypoint pasaron; la ejecución Native se detalla a continuación y conserva el criterio completo de T200/T209.

La [observación Native de 32ce5765](admission-database-observation-node.json) confirmó 6.300 llamadas del cliente en 200 transacciones de comando, p95 de espera observada de 4.406,80 ms y cero llamadas pendientes. Cien transacciones de cuenta ejecutaron cien llamadas. Conservó 100 resultados correctos y pool 300/300, con p95 total instrumentado fallido de 6.232,55 ms. El [modo ordinario del mismo bundle](admission-database-observation-default.json) comprobó ausencia del diagnóstico y los mismos resultados/stock/replay, con p95 fallido de 5.945,30 ms. Ambos owners retiraron sus recursos y preservaron las tres ramas anteriores. El próximo cambio debe justificar una reducción de viajes seriales; no se atribuyen CPU de PostgreSQL o crypto a estas duraciones, ni se suman sus percentiles. T200/T209 permanecen pendientes.

La [observación de backends sobre 24c3ae31](admission-backend-observation.md#cohorte-observada-sobre-24c3ae31) conservó cien resultados correctos y pool 300/300, con p95 fallido de 6.044,76 ms. El host eligió el binding directo; trece muestras externas identificaron hasta cien backends propios y predominaron estados del cliente, sin observar la clase `Lock`. Son muestras puntuales y relojes distintos; no prueban ausencia de esperas breves ni una causa única. Se retiraron sus recursos y se preservaron las tres ramas anteriores. El [reporte saneado](admission-backend-observation-node.json) conserva el fallo, la ventana, la conexión efectiva y todas las muestras; T200/T209 siguen pendientes.

La [agrupación del vínculo base](admission-base-binding-transport.md) conserva las lecturas y escrituras ordenadas dentro de dos funciones invoker/volatile, sin omitir comprobaciones de claves o sesión. La referencia Native observó ocho llamadas del cliente y la nueva ruta cumple el máximo de cinco. Tres casos SQL completos acreditan persistencia, CAS/rollback, privilegios, borrado concurrente y aprobación/replay; 117 casos de dominio, tipos, lint y build también pasaron. La medición completa posterior conserva su tarea y umbral originales; esta reducción parcial no cierra T200/T209.

Las [dos invocaciones de eeac7135](admission-base-binding-node.json), con idéntico bundle, completaron los cien resultados y pool 300/300. El modo ordinario falló con p95 de 9.255,57 ms; la observación posterior de backends también falló, con 5.398,40 ms. Sus once muestras registraron hasta cien backends propios, predominio de `ClientRead` y un pico puntual de cuarenta esperas `LWLock/LockManager`. La variación de las duraciones SQL requiere atribución adicional; la corrida instrumentada no reemplaza la aceptación ordinaria ni demuestra mejora causal. Se retiraron los recursos propios y se preservaron las tres ramas originales. T200/T209 siguen pendientes.

El [inventario de locks de 3c7c25a0](admission-backend-observation.md#inventario-durante-la-cohorte-de-3c7c25a0), con ese mismo bundle de aplicación, conservó los cien resultados correctos y pool 300/300. El p95 instrumentado de 5.528,54 ms sigue fallando. Una muestra contó 12.014 locks de relación, 10.414 en la tabla principal y hasta cien relaciones distintas por backend; no se confunden modos con tablas ni ausencia de solicitudes pendientes con ausencia de esperas internas. Las ocho muestras orientan el diagnóstico de la huella de relaciones, sin acreditar causalidad ni sustituir la aceptación ordinaria. Se retiraron los recursos propios y se verificaron las tres ramas anteriores.

La [lectura agrupada de ámbito y actor](admission-submission-actor-context.md) reduce de dos a un viaje el fence y la proyección de cuenta/sesión, conservando el control independiente de actor del ledger y los snapshots actuales después de esperas. Seis casos Native seleccionados pasaron equivalencia, namespace, pertenencia concurrente, expiración, privilegios, fences propios/administrativos, rollback, sesiones y aprobación/replay; diez casos de autorización quedaron fuera del filtro. Tipos, lint y build también pasaron. La siguiente cohorte conserva las cien llamadas y el mismo criterio de aceptación; T200/T209 permanecen pendientes.

La [cohorte ordinaria de ab59ae0e](admission-submission-actor-node.json) conservó los cien resultados correctos, 50 ingresos/50 pendientes, stock/replay y pool 300/300, sin errores ni fugas. Su p95 de 5.063,22 ms volvió a fallar el umbral inferior a 3.000 ms. La sonda mínima dio 2,26 ms y el p95 de transacciones de comando 3.699,87 ms; los diagnósticos no acreditan una causa única ni se suman como latencia individual. Fuente y runner quedaron estables y se retiraron sus recursos, conservando las tres ramas anteriores. T200/T209 y las catorce tareas abiertas mantienen sus criterios.

El [guard nativo y la proyección agrupados](admission-ledger-native-authorization.md) conservan la comparación de identidad antes de los locks y el callback de permiso, con cinco sentencias menos por presentación exitosa. Cuatro casos Native distintos son aplicables en dos cohortes documentadas: efectos/replay/stock, rechazo ante tribu bloqueada sin lectura privada, sesiones e ingreso automático. Se retienen los dos errores iniciales de las pruebas y su repetición corregida; tipos, lint y build pasaron. La siguiente cohorte completa mantiene el criterio de p95 y las tareas T200/T209 abiertas.

La [cohorte ordinaria de def0f9fd](admission-ledger-native-node.json) mantuvo los cien resultados correctos y pool 300/300, con stock/replay sin duplicados ni entregas. El p95 de 4.971,42 ms sigue fallando el mismo umbral inferior a 3.000 ms; la sonda mínima dio 2,75 ms. No hubo cambios de participantes, capacidad, timeouts o exclusiones. Fuente y runner quedaron estables, se retiraron los recursos propios y se verificaron las tres ramas originales. T200/T209 permanecen pendientes.

La [comparación con 4 CU](admission-main-beez-four.md#capacidad-de-postgresql) conservó el mismo bundle de aplicación, cien resultados correctos y pool 300/300, sin fallos de comandos, cola o entregas. Cambió únicamente la capacidad de la base efímera. El p95 de 4.644,74 ms sigue superando el umbral estricto inferior a 3.000 ms. Una cohorte por capacidad no acredita una mejora causal. Se retiraron función y rama propias; el inventario posterior conserva las tres ramas anteriores y el piloto persistente nuevo autorizado, sin temporales adicionales. T200/T209 siguen pendientes.

## Planes y capacidad de conexiones

La [comparación técnica sobre ac590b83](admission-plan-cache-and-pool-node.json) conserva el mismo bundle anterior, Node 24.16.0, conexión directa y 2 CU. Cada cohorte mantiene diez mil entradas, cien llamadas concurrentes, cincuenta ingresos/cincuenta pendientes, cero fallos de comandos y cero entregas. Stock y replay pasaron. Preparación y warm-up siguen fuera de la ventana original, sin nuevas exclusiones.

La primera configuró `plan_cache_mode=force_generic_plan` sólo en su base efímera. Un CHECK del registro privado del ensayo exige ese valor al entrar o permanecer en `running`: el host real lo superó antes de la carga. Los planes genéricos reutilizan planificación y conservan la evaluación de las consultas, según la [documentación de PostgreSQL 17](https://www.postgresql.org/docs/17/runtime-config-query.html#GUC-PLAN-CACHE-MODE). El p95 fue **5.311,06 ms** con pool cien, 300 adquisiciones/300 liberaciones y cero espera de checkout observada. No alcanzó el umbral.

La segunda usó el modo normal y el ajuste existente `ADMISSION_NODE_POOL_MAX=20`. Conservó cien llamadas en vuelo y midió también la espera: pico de ochenta checkouts pendientes, 300 adquisiciones/300 liberaciones, sin errores ni conexiones retenidas al final. El p95 fue **8.132,25 ms**; las cien llamadas originales siguen incluidas. Tampoco alcanzó el objetivo estricto inferior a 3.000 ms.

Una cohorte por configuración no acredita causalidad. Ningún ajuste se adopta en el producto. Se retiraron ambas funciones y ramas propias; el inventario independiente conserva las tres ramas anteriores y el piloto persistente autorizado. T200/T209 permanecen pendientes.

La [sonda real de variables externas de Node](admission-node-environment-preflight.md) comprobó la ruta de configuración necesaria para preparar varios procesos propios con material sintético común fuera de PostgreSQL. Sólo mide entrega de un canario al entorno y el cierre de acceso anónimo, con retirada confirmada; no ejecutó la carga, no obtuvo un p95 nuevo y no acredita capacidad distribuida. La siguiente carga debe conservar una sola cohorte de cien, sin reemplazar su percentil por percentiles parciales ni sumar picos de concurrencia que no se solapen.

El [contrato nativo del fixture compartido](admission-shared-host-fixture.md) comprobó después dos casos SQL: una importación independiente de la configuración externa conserva los resultados y otra configuración ajena cierra sin efectos. La proyección de todas las observaciones originales permite preparar un percentil global y contrastar el solapamiento; no lo acredita todavía. El caso pequeño de cuatro participantes/veinte entradas sólo valida ese soporte y no reemplaza la carga de cien/diez mil.

La [primera cohorte de cuatro hosts Node](admission-distributed-performance.md) ejecutó después las cien confirmaciones sobre diez mil entradas, con solapamiento comprobado por intervalos de reloj y los resultados cincuenta/cincuenta esperados. Stock, replay y pool 300/300 pasaron; cero entregas y retirada completa. Su p95 global **4.137,50 ms** sigue fallando el umbral inferior a 3.000 ms. No se cambian límites o defaults por esa observación; el contraste con 4 CU se registra por separado.

El [contraste de la misma aplicación distribuida con 4 CU](admission-distributed-performance.md#contraste-completo-con-4-cu) pasó el p95 global de confirmación: **2.198,40 ms** sobre las cien duraciones originales y diez mil entradas, con el mismo bundle. Solapamiento de las cien llamadas, efectos cincuenta/cincuenta, stock, replay y pool 300/300 se comprobaron sin errores ni entregas. Se retiraron los recursos y se conservaron las cuatro ramas persistentes. Esta cohorte acredita ese criterio en la configuración Node aislada; disponibilidad/avisos/agrupación y los demás alcances de T200/T209 siguen pendientes. No se cambió producción ni se cerró un gate por este resultado.

La [repetición instrumentada](admission-distributed-performance.md#repetición-con-preparación-y-calentamiento-medidos) completó el registro de las etapas excluidas que no figuraban en el primer recibo de 4 CU: preparación, fixture/migraciones, despliegue, preflight HTTP, importación de claves, calentamiento, barrera y salud de red. Su p95 fue **2.164,53 ms**, con cien llamadas solapadas y los mismos efectos, replay y pool correctos; retirada completa y cero mensajes. SC-013 queda medido en esa configuración Node aislada. Faltan integrar el arnés temporal al comando versionado y completar SC-015 y los otros requisitos de T200/T209.
