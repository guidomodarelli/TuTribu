# Esperas de consultas durante la cohorte nativa

La carga sin instrumentación sobre `bc6aa492` confirmó cien resultados correctos y p95 de 6.066,30 ms. CPU, event loop y estadísticas acumuladas no distinguen las esperas del driver del resto de la transacción. Este diagnóstico opt-in conserva el protocolo de cien concurrentes y el gate inferior a tres segundos; no acredita por sí solo la aceptación de rendimiento.

`ADMISSION_NODE_OBSERVE_DATABASE=1` se selecciona exclusivamente en el entorno del host efímero. El body no configura el diagnóstico. El despliegue sólo reenvía el flag explícito; el modo ordinario no publica `databaseObservations`. El warm-up, la preparación, la consulta de stock y el replay conservan su separación de la cohorte medida.

El executor propio entrega una vista del mismo `RequestDatabase`. Cada `execute` delega los argumentos y el resultado a la transacción nativa original; el observador no inspecciona ni conserva SQL, parámetros, filas, contactos ni errores del driver. Se mantiene el mismo rol, contexto, pool, SQL, criptografía y los commits de claim/efecto. La captura sólo se activa durante las cien llamadas originales. El observador propaga el resultado o rechazo original.

Cada transacción contabiliza llamadas y la unión de los intervalos esperados. Dos llamadas superpuestas no duplican tiempo. El snapshot incluye intervalos todavía pendientes y no altera capturas posteriores. La duración completa parte de antes del checkout y termina después del commit/rollback; el tiempo fuera de las llamadas observadas incluye checkout, BEGIN/contexto/COMMIT del executor, CPU, criptografía, planificación y demás esperas. No se lo llama tiempo exclusivo de crypto ni se identifica la espera del driver con CPU de PostgreSQL.

Se publican resúmenes separados de las cien transacciones de cuenta y las doscientas de comando: conteos, pendientes al finalizar y percentiles de duración, espera observada, tiempo restante y llamadas por transacción. Cada percentil se calcula desde sus propias observaciones; no se suman percentiles de componentes ni de transacciones concurrentes. El DTO es cerrado, numérico, finito y admite ausencia del diagnóstico para resultados históricos.

## Validación inicial

Los treinta casos locales aprobados, sin fallos ni omitidos, incluyen el reloj real de Node, ventanas secuenciales, superpuestas y anidadas, rechazo original, una espera incompleta y la frontera del DTO, además de los contratos anteriores del handler/profiler. No hay mocks de plataforma, driver ni UI. Tipos de tests y lint pasaron. El entrypoint real de Node compiló con 634 inputs y bundle `e5fd96d6d56a12b267a4e82093f167a31f9d003676e056d8371489b1490d80ab`; registros privados `.git/admission-database-observation-local.json`, `-types.log`, `-lint.log` y `-build/receipt.json`.

La prueba Native exige los mismos cien resultados, stock, replay y pool equilibrado. Cuando el flag está activo contrasta los resúmenes con las transacciones realmente registradas, observaciones no vacías y cero sentencias pendientes; con el flag ausente exige ausencia del campo. El p95 conserva su aserción original incluso en el diagnóstico. La ejecución externa y su limpieza se registran por separado; T200/T209 continúan pendientes.
