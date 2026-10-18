# Capacidad del pool y carga completa

T200 y T209 siguen abiertas. El workload completó sus cien operaciones y sus efectos esperados, pero el p95 de 18.954,82 ms conserva el fallo del objetivo estricto inferior a 3.000 ms.

## Cambio y procedencia

El checkout aislado `admission-pool-capacity` parte de `6d89c40d8c4dc1bd58dd3d19b7e1bb9418c528e9`. Cambia el máximo de `createPostgresPool` de diez a cien, conservando checkout de diez segundos, idle de cinco segundos, lifetime de sesenta segundos y guard de abandono de treinta segundos. Los límites de solicitudes, verificación, cadencia, consumo y leases no se modifican.

El [reporte saneado](admission-pool-capacity.json) conserva el SHA base, las huellas de los dos inputs probados, el exit 1 y ambos casos sin truncamiento. Las huellas permanecieron iguales hasta finalizar. El código, el test y sus documentos se copiaron al checkout principal byte a byte después de comprobar que éste conservaba la base esperada. No se reemplazaron cambios ajenos.

El proceso nativo recibió únicamente el entorno permitido y datos sintéticos de selección de rol/base: la URI productiva configurada no se pasó al hijo. El harness obtuvo la conexión de cada rama propia y ejecutó el journal real. No hubo envíos ni SQL productivo.

## Resultado observado

| Dato | Pool diez, coordinación por persona | Pool cien, misma coordinación |
| --- | ---: | ---: |
| Operaciones simultáneas | 100 | 100 |
| Entradas vigentes | 10.000 | 10.000 |
| Admitidos / pendientes | 9 / 1 | 50 / 50 |
| Fallos de checkout | 90 | 0 |
| p95 de todas las llamadas originales | 66.807,05 ms | 18.954,82 ms |
| Pico de espera por pool | 90 | 0 |
| Adquisiciones / liberaciones | 407 / 407 | 500 / 500 |
| Esperas / conexiones retenidas al finalizar | 0 / 0 | 0 / 0 |

SQL confirmó cien solicitudes, cincuenta miembros básicos y cero entregas. La preparación duró 154.655,27 ms y el warm-up 104.454,14 ms, separados de la ventana medida. Veinte consultas mínimas dieron p95 de 169,47 ms; el p95 del event loop fue 29,52 ms. El caso falla exactamente por latencia, después de aprobar distribución, efectos y limpieza; no se excluyen errores ni se cambia el umbral.

El abandono independiente pasó con guard real de 30.000 ms, SQLSTATE `25P03`, consulta sana posterior y recuperación en 32.995,21 ms. Sus dos adquisiciones tuvieron sus liberaciones y no quedaron conexiones retenidas.

## Comprobaciones y alcance

Pasaron las cuatro pruebas del factory con `pg.Pool` y el logger del proyecto reales. No abren conexiones: observan sus opciones y eventos públicos, y aíslan únicamente el protocolo `query` del callback para forzar un error del guard. Se eliminaron los mocks de módulos internos y del SDK; la prueba nativa anterior usa conexiones y SQL reales. También pasaron tipos de producto, tipos de tests y lint en el checkout aislado.

El barrido conserva el único checkout de producto en `runWithGuardedTransaction`; request, mantenimiento, Better Auth, refresco de perfil y backfill usan el factory común. Se conservan guard local, liberación idempotente, protección de `onConnect`, exclusión del timeout de checkout del retry de sesión y throttle de reconciliación. La [sonda de capacidad previa](admission-submission-scope-performance.json) observó 901 conexiones y rol sin límite adicional en su rama propia; ese número no certifica por sí solo capacidad operativa de otro host.

Registro privado: `.git/admission-pool-capacity-native-fcb12ede/`. El resultado no certifica HTTP, Google/Zavu reales, Workers, scheduler ni SC-021. Queda reducir o reubicar el costo de los viajes a base y volver a medir antes de cerrar el objetivo de latencia.
