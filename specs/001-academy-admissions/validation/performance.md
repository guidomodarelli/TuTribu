# Rendimiento de admisiones

T200 y T209 permanecen abiertas. La carga Native inicial no cumple el criterio de confirmación p95 inferior a tres segundos. No se cambió ese límite ni se excluyeron los fallos del cálculo.

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
