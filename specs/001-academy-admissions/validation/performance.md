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
