# Cohorte de admisión entre cuatro funciones Node

## Primera ejecución completa

El [recibo de la cohorte original](admission-distributed-node-first.json), sobre `e6bd6a31cd2e6f696f9ce3d7f876801275a2cb8e`, conserva cien confirmaciones y diez mil entradas en una única academia y base efímeras. Se desplegaron cuatro funciones Node 24.16.0 con el mismo bundle `911c9644…`, pool máximo veinticinco por función y PostgreSQL fijo en 2 CU en `aws-us-east-1`. No se modificaron la capacidad productiva, los límites de admisión o sus exclusiones.

La configuración sintética original se importó desde el entorno de cada host; sus valores no se pusieron en argumentos ni archivos de configuración con material literal. La preparación sembró una sola cohorte, repartió sus cien actores sin duplicarlos y calentó cada host. Una barrera SQL propia liberó el trabajo después de que los cuatro estuvieran preparados.

El **p95 global fue 4.137,50 ms**, calculado a partir de las cien duraciones originales, frente al umbral estricto inferior a 3.000 ms. No se usó el percentil de percentiles parciales ni se descartaron llamadas. El resultado de latencia sigue fallido.

## Concurrencia y efectos

Cada host registró un ancla del reloj de PostgreSQL dentro del intervalo monotónico de su consulta. Las observaciones conservan los límites inferiores y superiores derivados de esa incertidumbre. El inicio superior más tardío fue anterior al final inferior más temprano: las cien solicitudes se solaparon al menos **3.494,56 ms**, con el mayor intervalo de anclaje de **40,98 ms**. Esta comprobación usa los intervalos completos; no suma cuatro picos locales que pudieran haber sucedido en momentos diferentes.

Se confirmaron cincuenta ingresos, cincuenta pendientes, cien solicitudes, cincuenta miembros y cero entregas. Hubo 300 adquisiciones y 300 liberaciones, sin errores o checkouts retenidos en ningún host. El replay de los cuatro comandos originales devolvió sus resultados persistidos y el stock independiente siguió en cien. El esquema de coordinación pertenece sólo a `native_test_support`, tiene RLS y permisos privados, y su SQL versionado queda identificado por hash.

La comprobación de archivos propios no encontró el bearer ni el JSON de keyrings. Se retiraron las cuatro funciones y su rama; el inventario independiente conservó las cuatro ramas persistentes previas. Los inputs permanecieron estables durante el ensayo. No hubo mensajes reales ni cierre de gates.

## Continuación

Una cohorte no atribuye por sí sola una causa ni justifica cambiar los defaults del producto. El siguiente contraste conserva el bundle, los cuatro hosts, la misma cohorte, pool, barrera, cómputo global y criterios; cambia únicamente la base efímera a 4 CU. Su resultado debe registrarse por separado. T200/T209 y el rendimiento de avisos siguen pendientes.

## Contraste completo con 4 CU

El [segundo recibo](admission-distributed-node-four-cu.json) conserva exactamente el mismo bundle y diseño de cohorte: cuatro funciones Node 24.16.0, pool veinticinco por función, diez mil entradas y cien confirmaciones originales en una sola academia. Se generó un dataset independiente del mismo diseño y cambió sólo la capacidad seleccionada de la base efímera a 4 CU, con mínimo y máximo comprobados por metadata.

El p95 de las cien duraciones fue **2.198,40 ms**, inferior a 3.000 ms. Hubo cincuenta ingresos/cincuenta pendientes y cero fallos de comandos, con cien solicitudes, cincuenta miembros, cero entregas y stock/replay correctos. Las cien llamadas se solaparon al menos **1.575,44 ms**, incluyendo la incertidumbre de anclaje; el mayor intervalo de reloj fue **24,32 ms**. El pool agregado terminó 300/300, sin errores o conexiones retenidas en ninguno de los cuatro hosts.

La medición acredita el valor de p95 de esta cohorte y configuración Node aislada. Aquel recibo no conservó los tiempos separados de preparación y calentamiento; ese requisito de SC-013 necesitó la repetición instrumentada siguiente. No acredita las latencias de bandeja/avisos, la aceptación de correo agrupado, restauración, otros targets o una configuración productiva. Una cohorte por capacidad no establece por sí sola una mejora causal. Los límites del producto no cambiaron, y T200/T209 conservan sus requisitos de SC-015 y los demás cierres pendientes.

Se eliminaron las cuatro funciones y su rama y se verificaron de nuevo las cuatro ramas persistentes anteriores. Los inputs permanecieron estables y el escaneo propio no encontró bearer o JSON de keyrings en sus archivos. No hubo mensajes reales ni cierre de gates operativos.

## Repetición con preparación y calentamiento medidos

El [recibo instrumentado completo](admission-distributed-node-timed.json) usa la misma configuración de cuatro funciones y 4 CU y conserva las cien confirmaciones originales sobre diez mil entradas. Su bundle `628c6aff…` añade los campos de observación de etapas previas; no modifica las reglas de admisión. El p95 global fue **2.164,53 ms**, con cincuenta ingresos/cincuenta pendientes, cero fallos, stock/replay y pool 300/300 correctos. El solapamiento comprobado de las cien llamadas fue al menos **1.532,43 ms**.

Se registraron aparte **10,12 s** de preparación del controlador/rama, **137,91 s** de fixture y migraciones, **15,51 s** de despliegue/metadata y **5,39 s** de preflight HTTP de los hosts. El último incluye red e inicialización observadas desde el controlador; no es una estimación del tiempo puro del proceso. Cada host registró además importación de configuración de **1,72–1,77 ms**, calentamiento de **1.261,81–1.379,43 ms** y barrera de **540,02–971,20 ms**. Las veinte consultas de salud por host tuvieron p95 de **2,95–5,40 ms**. Ninguna de esas etapas se ocultó dentro del percentil ni se usó para descartar una confirmación original.

El escaneo posterior comprobó el bearer, el JSON completo y cada una de las seis claves base64 en los argumentos y archivos del directorio propio, sin encontrarlos. Se retiraron funciones/rama, se conservaron las cuatro ramas persistentes y los inputs permanecieron estables.

Esta cohorte acredita la medición de SC-013 en la configuración Node aislada, con sus etapas excluidas registradas. Se obtuvo con el arnés temporal previo a la integración versionada siguiente. SC-015 y los demás alcances de T200/T209 siguen pendientes; ningún gate operativo o configuración productiva se modifica por este resultado.

## Integración del comando versionado

`tests/performance/academy-admissions-distributed-node-host.test.ts` y `tests/support/run-admission-distributed-performance.ts` incorporan el escenario completo al repositorio. El nuevo host reutiliza el boundary autenticado canónico y conserva las mediciones únicamente en las filas privadas de la rama propia. El coordinador lee esas filas como resultados SQL tipados, valida sólo los DTO HTTP y compara los samples persistidos antes/después del replay. Los comandos de preparación y retiro se limitan al hijo original y a cuatro slugs nuevos; ninguna respuesta incierta provoca un rePOST automático.

Las pruebas de cálculo cubren percentil global, fallos incluidos, ausencia de solapamiento global, actores duplicados, host faltante y límites de reloj contradictorios. El nuevo caso de reloj falló antes de reforzar la comprobación y después pasó. Junto a los contratos reales del handler pasaron catorce tests; el caso Native quedó omitido sin los dos opt-in. Tipos y lint pasaron. Estos resultados locales acreditan los contratos, no una nueva medición externa. La ejecución Native del comando versionado debe conservar su propio commit, bundle, observaciones, etapas excluidas y cleanup.

El [manual de testing](../../../docs/conventions/admission-testing.htm#distributed-node-performance) contiene el comando y sus requisitos. SC-015, Workers y los demás alcances de T200/T209 mantienen sus criterios y estado pendiente.

El [primer intento Native del comando](admission-distributed-canonical-preflight.json), sobre `e95d1555ca79b1a93d8fc0b4547bba249dba35e0`, creó la cohorte y desplegó los cuatro hosts. Se detuvo en el primer preflight autenticado: el coordinador esperaba incorrectamente HTTP 200, aunque el handler canónico responde HTTP 202 para un original preparado. La petición anónima previa devolvió 401. No se inició la carga ni se obtuvo una nueva medición de p95; el caso Vitest quedó fallido, sin omisiones.

Se retiraron las cuatro funciones y la rama, cuya ausencia e inventario persistente se comprobaron de forma independiente. El intento no alcanzó el escaneo privado final y no se le atribuye esa comprobación. Se corrigió la aserción al contrato HTTP existente, sin alterar el handler ni los umbrales, y la verificación de inputs/material privado pasó al `finally` para ejecutarse también cuando falla el preflight o la carga. Los catorce contratos locales vuelven a pasar. La nueva ejecución conserva un recibo independiente.
