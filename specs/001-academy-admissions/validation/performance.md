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
