# Contraste de concurrencia física del pool

T200/T209 y el objetivo p95 inferior a tres segundos siguen pendientes. Las corridas anteriores se conservan: 2 CU/100 conexiones dio 6.372,48 ms y 8 CU/100 conexiones dio 5.341,00 ms. Los perfiles instrumentados se usan sólo para atribuir trabajo, no para cerrar el gate.

El contraste opt-in selecciona 25 conexiones de pool sobre el endpoint efímero de 8 CU, manteniendo cien solicitantes concurrentes, diez mil entradas, autorizaciones y los dos commits originales. Las cien llamadas comienzan en el mismo `Promise.all`; el cronómetro arranca antes de pedir su primera conexión y conserva todos los resultados, incluidas esperas y fallos. No se agrega una exclusión por cola ni se modifica el plazo de checkout.

`maximumConnections` pertenece al owner del pool real y conserva el default cien cuando se omite. El host de prueba sólo lo recibe del entorno server-side `ADMISSION_NODE_POOL_MAX`. Ningún body o parámetro HTTP puede seleccionar esa capacidad. Se conservan guard local/onConnect de treinta segundos, SSL, idle de cinco segundos, lifetime de sesenta y checkout de diez segundos. Se rechaza una capacidad inválida antes de leer la conexión.

Se validan capacidades inválidas con el constructor real y el logger existente, sin inspeccionar credenciales; el efecto de una capacidad válida se acredita con el workload Native real, no con una comparación estática de configuración. Los resultados y la limpieza de cada experimento se agregan antes de considerar validada una mejora. No se modifica la configuración productiva.
