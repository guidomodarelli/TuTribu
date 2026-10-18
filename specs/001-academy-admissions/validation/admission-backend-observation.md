# Esperas de backends durante la invocación Native

T200/T209 siguen pendientes. La última cohorte sin observación terminó con cien resultados correctos y p95 de 6.327,19 ms. Este diagnóstico busca distinguir capacidad de backends y esperas; conserva el objetivo inferior a 3.000 ms.

## Alcance

`ADMISSION_NODE_OBSERVE_BACKENDS=1` activa un sampler únicamente en el controlador del ensayo. Usa una conexión independiente del proceso Node medido para consultar `pg_stat_activity` en la rama propia. Cada muestra agrupa sólo backends marcados con el `application_name` de la invocación y conserva cantidades por estado, clase y evento de espera. Cuenta además otros clientes de esa rama; no los atribuye a la carga.

La consulta no selecciona texto SQL, usuarios, direcciones, PID, credenciales ni valores de parámetros. El identificador de aplicación sirve sólo al filtro y no se devuelve. Las muestras y los errores SQLSTATE están acotados; `stop()` espera la consulta actual antes de retornar. Un fallo del observador queda registrado y no sustituye el resultado original del workload.

El sampler cubre la invocación completa, incluida preparación y warm-up. El host adjunta una ventana de pared del tramo medido para interpretar las muestras, cuyo timestamp proviene de PostgreSQL. Son relojes distintos; el p95 sigue calculándose exclusivamente con el reloj monotónico de cada llamada original. La observación agrega carga de control y no se usa como prueba de mejora de latencia respecto del ensayo sin sampler.

## Conexión efectiva del host

El resultado informa qué binding seleccionó (`DATABASE_URL_UNPOOLED` o `DATABASE_URL`) y si su hostname contiene el marcador `-pooler`. No publica el URI, hostname ni credenciales. La ausencia del marcador no demuestra por sí sola la topología de un endpoint intermediario. Los campos nuevos son opcionales al leer resultados históricos y obligatorios en el ensayo Native actual.

## Verificación inicial

La prueba `tests/unit/support/admission-backend-observation.native.test.ts` usó `pg`, transacciones y locks advisory reales en una rama propia. Un cliente ajeno no apareció en la cuenta del workload. Con dos clientes propios identificó un backend activo esperando el lock y otro idle dentro de una transacción. El sampler devolvió muestras sin errores, se drenó y observó cero backends propios después de los rollbacks.

El [resumen saneado](admission-backend-observation-contracts.json) conserva ese contrato. Pasaron también quince casos locales de handler y observación de awaits, tipos de tests y lint. La compilación real del host Node conservó 635 inputs. La siguiente cohorte debe registrar las muestras, la conexión efectiva, los cien resultados, stock, replay y pool; la aceptación p95 conserva su aserción original.

## Cohorte observada sobre `24c3ae31`

La invocación Native terminó con estado durable `completed` y el test terminó con exit 1: su única aserción fallida fue el p95 de **6.044,76 ms** frente al objetivo estricto inferior a 3.000 ms. El [resultado saneado](admission-backend-observation-node.json) conserva Node 24.16.0, 2 CU en `aws-us-east-1`, la huella del bundle y los cien originales. Hubo cincuenta ingresos/cincuenta pendientes, cero fallos de comandos, diez mil entradas, cien solicitudes, cincuenta miembros básicos y cero entregas. Stock, replay y los controles del observador pasaron antes de la aserción de latencia. El pool quedó en 300 adquisiciones y 300 liberaciones, sin liberaciones por error, cola ni conexiones retenidas al final.

El host seleccionó `DATABASE_URL_UNPOOLED` y no encontró `-pooler` en su hostname. El observador registró trece muestras sin errores y hasta cien backends propios. Seis timestamps de PostgreSQL cayeron dentro de la ventana de pared informada por Node; los dos relojes no se sincronizan por este protocolo. Esas seis muestras contaron cien backends propios cada una, principalmente `idle in transaction` o `idle`, con `Client/ClientRead`. Hubo también actividad sin evento, `LWLock` y `Extension/Neon/RelExists`. Ninguna de las trece muestras observó la clase `Lock`; esto no demuestra ausencia de esperas breves entre muestras. Los otros tres o cuatro clientes de la rama se contaron aparte.

La consulta mínima dio p95 de 2,96 ms; preparación y warm-up, excluidos de las cien duraciones, duraron 2.975,60 y 3.884,97 ms. El proceso registró 2.048,58 ms de CPU user y 441,27 ms de system, con utilización del event loop 0,384. Estos acumulados no equivalen a latencia individual ni permiten atribuir toda la demora a una dependencia. El siguiente ajuste debe reducir viajes seriales preservando las comprobaciones actuales; esta observación no acredita una mejora respecto de otra corrida.

El checkpoint y el runner conservaron sus huellas durante el ensayo. La retirada de función y rama propias no falló; el inventario independiente posterior confirmó únicamente las tres ramas anteriores, sin ramas nuevas residuales. No hubo SQL productivo ni mensajes reales. T200/T209 y las catorce tareas pendientes conservan sus criterios.

## Inventario de locks opt-in

`ADMISSION_NODE_OBSERVE_LOCKS=1` activa el sampler con un inventario adicional de `pg_locks`. El modo ordinario y la observación de backends sin ese flag conservan su consulta anterior, sin leer esa vista. El inventario une internamente PID y marcador exacto del workload, pero devuelve sólo cantidades: locks de relación con `fastpath=true` o en la tabla principal, máximo de relaciones distintas por backend, backends con relaciones, solicitudes de lock sin conceder, tipos y modos de relación. No publica PID, OID, nombres de relaciones, claves advisory ni texto de consultas.

El intervalo mínimo entre consultas del modo nuevo es 500 ms más la duración de su SQL; el sampler continúa fuera del Node medido y conserva su límite y drenaje. Los [campos de `pg_locks` en PostgreSQL 17](https://www.postgresql.org/docs/17/view-pg-locks.html) distinguen fast path y tabla principal. La vista no ofrece una fotografía global perfectamente simultánea y su lectura toma locks internos del gestor: puede afectar el rendimiento observado. Se conserva como diagnóstico, sin sustituir la aceptación ordinaria ni inferir una causa única. `LWLock/LockManager` describe una espera para gestionar locks; no equivale por sí sola a una fila bloqueada por otro solicitante. Ver [los eventos nativos](https://www.postgresql.org/docs/17/monitoring-stats.html).

La prueba ampliada pasó con `pg` real en una rama propia: un cliente ajeno con una tabla temporal no apareció en el inventario; un cliente propio sostuvo un lock de relación en la tabla principal y otro un lock fast path. La espera advisory preparada se contó una vez, conservando los estados nativos anteriores y sólo los dos clientes propios. El modo sin inventario omitió `locks`; después de los rollbacks se observaron cero backends y cero locks propios. El [resumen saneado](admission-lock-inventory-native.json) conserva fuente y runner estables, un caso Native completo aprobado, tipos y lint. El inventario independiente posterior confirmó las tres ramas anteriores. La próxima cohorte debe medir el crecimiento de locks en las cien solicitudes antes de proponer otro ajuste.
