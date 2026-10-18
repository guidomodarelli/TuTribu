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

La medición acredita el criterio de confirmación de esta cohorte y configuración Node aislada. No acredita las latencias de bandeja/avisos, la aceptación de correo agrupado, restauración, otros targets o una configuración productiva. Una cohorte por capacidad no establece por sí sola una mejora causal. Los límites del producto no cambiaron, y T200/T209 conservan sus requisitos de SC-015 y los demás cierres pendientes.

Se eliminaron las cuatro funciones y su rama y se verificaron de nuevo las cuatro ramas persistentes anteriores. Los inputs permanecieron estables y el escaneo propio no encontró bearer o JSON de keyrings en sus archivos. No hubo mensajes reales ni cierre de gates operativos.
