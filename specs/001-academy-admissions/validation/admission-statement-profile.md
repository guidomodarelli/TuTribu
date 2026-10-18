# Diagnóstico SQL de la carga de admisión

## Protocolo

El caso opt-in `tests/performance/academy-admissions-node-host.test.ts` conserva sus cien llamadas originales y el gate p95 inferior a tres segundos. En su rama propia instala la vista `pg_stat_statements`, ejecuta el mismo workload nativo y después consulta `neon inspect db outliers`, con proyecto, rama, base y rol explícitos. La URI queda en memoria del harness y no se envía como argumento al CLI. No se instala la extensión en producción ni en las tres ramas preexistentes.

Los contadores son acumulados desde el inicio del compute, incluyendo journal, seeding y warm-up; no equivalen al tiempo de una sola confirmación. El comportamiento de la extensión y su alcance se contrastaron con [Neon](https://neon.com/docs/extensions/pg_stat_statements) y [PostgreSQL](https://www.postgresql.org/docs/current/pgstatstatements.html). Se usa primero el inspector oficial y su selección de las veinticinco consultas con mayor tiempo total.

`inspectAdmissionDatabaseStatements` captura stdout exclusivamente en memoria. `projectAdmissionStatementProfile` conserva ranking, operación, nombres elegidos de una lista cerrada, llamadas, tiempo total, promedio calculado y proporción. Elimina el texto SQL, literales, identificadores no reconocidos y cualquier otro campo. Los errores del CLI pueden retener SQL en stdout; se convierten deliberadamente en un estado propio visible y diagnóstico seguro, sin propagar ese objeto al reporte de Vitest.

El resultado funcional se guarda antes de consultar el diagnóstico, de modo que un fallo del inspector no borra la carga original. El caso persiste y exige el estado del diagnóstico, comprueba efectos y replay, y conserva la aserción de latencia original. La función y rama propias se retiran en sus `finally`, también ante un p95 fallido.

## Validación inicial

Nueve casos de proyección numérica y privacidad pasaron, incluidas las correcciones de una consulta cuyo texto no es visible al rol, nombres sin prefijo y una proyección escalar de parámetro. Se conservan contadores y se seleccionan palabras de la lista cerrada; son pistas de nombres mencionados, no un análisis completo del árbol SQL. Los ocho casos del handler autenticado también pasaron, al igual que los tipos de tests y lint. Los registros rojos y verdes están en `.git/admission-statement-profile-red.json`, `.git/admission-statement-hidden-query-red.json`, `.git/admission-statement-unqualified-red.json`, `.git/admission-statement-scalar-red.json` y `.git/admission-statement-scalar-green.json`.

## Primera ejecución real

El [resultado de 0143bedd](admission-statement-profile-first.json) acredita el inspector nativo y sus veinticinco filas de números y referencias cerradas. El bundle desplegado conserva el SHA256 `0b801e8999b3b009e4201a6a9508d6c76df41c61a0a4360d4a11431e704ed8c9`, igual al workload anterior: el cambio corresponde al diagnóstico del harness. Las cien llamadas confirmaron cincuenta ingresos/cincuenta pendientes, cero fallos, 300 adquisiciones/liberaciones y cero entregas. El p95 de 7.171,98 ms mantiene el fallo estricto frente a tres segundos, después de comprobar efectos y replay.

Las tres filas de mayor tiempo quedaron sin pistas en el clasificador inicial; se conserva ese resultado antes de ampliar el reconocimiento de nombres sin prefijo. La fila de `read_admission_reviewer_context` tuvo 500 llamadas, 2.063,68 ms acumulados y 4,13 ms promedio. La proyección de cuenta tuvo 900 llamadas, 535,74 ms acumulados y 0,60 ms promedio. Estos contadores incluyen preparación y calentamiento y no permiten atribuir por sí solos el p95 a ninguna consulta. La segunda ejecución registra además el modo de tracking, planificación y versión de PostgreSQL para interpretar posibles contadores anidados.

La función y rama propias se eliminaron y una lectura independiente confirmó las tres ramas anteriores preservadas. Registros privados: `.git/admission-node-statements-measurement.json`, `.git/admission-node-statements-vitest.json` y `.git/admission-node-statements-cleanup.json`. Este trabajo no completa T200/T209 ni modifica las catorce tareas pendientes.

## Modo de tracking y cobertura de referencias

El [resultado de f49bfc2a](admission-statement-profile-refined.json) confirmó PostgreSQL 17.11, modo `top` y planificación sin tracking. Las funciones se observan por su invocación externa; este perfil no desglosa sus sentencias internas. Se conservaron el mismo bundle y los cien resultados correctos; el p95 fue 7.439,03 ms y siguió fallando el gate. El reconocimiento sin prefijo no bastó para atribuir las tres filas de mayor tiempo. El artefacto conserva esas ausencias, sin inventar un nombre o causalidad.

La siguiente ampliación de la lista cerrada se contrastó manualmente con los nombres SQL presentes en los 297 módulos del grafo empaquetado, incluidos creación y materialización de avisos. No cambia permisos ni permite identificadores arbitrarios. El campo `scalarProjection` distingue un `SELECT` de un solo parámetro de una invocación de función, sin devolver el parámetro ni el SQL. La consulta del inspector sigue ocurriendo después de medir la carga; ninguno de estos metadatos reduce el umbral o modifica el bundle de aplicación.
