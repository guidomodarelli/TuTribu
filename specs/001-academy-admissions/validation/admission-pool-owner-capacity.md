# Contraste de concurrencia física del pool

T200/T209 y el objetivo p95 inferior a tres segundos siguen pendientes. Las corridas anteriores se conservan: 2 CU/100 conexiones dio 6.372,48 ms y 8 CU/100 conexiones dio 5.341,00 ms. Los perfiles instrumentados se usan sólo para atribuir trabajo, no para cerrar el gate.

El contraste opt-in selecciona 25 conexiones de pool sobre el endpoint efímero de 8 CU, manteniendo cien solicitantes concurrentes, diez mil entradas, autorizaciones y los dos commits originales. Las cien llamadas comienzan en el mismo `Promise.all`; el cronómetro arranca antes de pedir su primera conexión y conserva todos los resultados, incluidas esperas y fallos. No se agrega una exclusión por cola ni se modifica el plazo de checkout.

`maximumConnections` pertenece al owner del pool real y conserva el default cien cuando se omite. El host de prueba sólo lo recibe del entorno server-side `ADMISSION_NODE_POOL_MAX`. Ningún body o parámetro HTTP puede seleccionar esa capacidad. Se conservan guard local/onConnect de treinta segundos, SSL, idle de cinco segundos, lifetime de sesenta y checkout de diez segundos. Se rechaza una capacidad inválida antes de leer la conexión.

Se validan capacidades inválidas con el constructor real y el logger existente, sin inspeccionar credenciales; el efecto de una capacidad válida se acredita con el workload Native real, no con una comparación estática de configuración. Los resultados y la limpieza de cada experimento se agregan antes de considerar validada una mejora. No se modifica la configuración productiva.

## Resultado de la comparación

El [ensayo de 631f40a1](admission-pool-owner-capacity.json) verificó 8 CU y pool máximo 25, con pico de cien llamadas de aplicación. Completó 50 ingresos/50 pendientes, cero fallos, diez mil entradas, cien solicitudes, cincuenta miembros básicos y cero entregas. Las 300 adquisiciones/liberaciones quedaron equilibradas; hubo hasta 75 esperas de conexión, pero ninguna quedó esperando o retenida al terminar.

El p95 fue **7.354,86 ms y no cumplió** el objetivo estricto inferior a tres segundos. La espera quedó incluida: los p95 de transacciones de cuenta/comando fueron 366,73/5.492,65 ms, y los de ingresos/pendientes, 4.868,43/7.374,35 ms. Preparación y calentamiento separados duraron 2.721,10 y 1.707,55 ms; la sonda mínima dio 2,31 ms y el event loop, 100,66 ms. Este candidato es menos favorable que 8 CU/pool100, que registró 5.341,00 ms; no se adopta como default.

La primera ejecución de este contraste terminó antes de crear rama o producir mediciones, durante el GET de metadata del proyecto. Se conserva en `.git/admission-node-pool25-vitest.json`. Una comprobación independiente confirmó de nuevo el proyecto TuTribu y el ensayo posterior ejecutó el recorrido completo, sin reemplazar esa observación fallida. La función y rama del segundo ensayo se retiraron y una lectura independiente confirmó las tres ramas preexistentes. No se reinició ningún proceso por mero vencimiento de observación.

Pasaron 22 casos locales del factory real y de la proyección/handler, ambos tipos, lint y el build real. El override valida su entrada antes de leer la conexión; los consumidores existentes conservan máximo cien y los mismos guards. Registros privados: `.git/admission-pool-owner-final-unit.json`, `.git/admission-pool-owner-types.log`, `.git/admission-pool-owner-final-types.log`, `.git/admission-pool-owner-build.log`, `.git/admission-node-pool25-after-measurement.json`, `.git/admission-node-pool25-after-vitest.json` y `.git/admission-node-pool25-after-cleanup.json`. T200/T209 y las catorce tareas pendientes conservan sus requisitos.
