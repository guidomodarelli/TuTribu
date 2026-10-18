# Diagnóstico SQL de la carga de admisión

## Protocolo

El caso opt-in `tests/performance/academy-admissions-node-host.test.ts` conserva sus cien llamadas originales y el gate p95 inferior a tres segundos. En su rama propia instala la vista `pg_stat_statements`, ejecuta el mismo workload nativo y después consulta `neon inspect db outliers`, con proyecto, rama, base y rol explícitos. La URI queda en memoria del harness y no se envía como argumento al CLI. No se instala la extensión en producción ni en las tres ramas preexistentes.

Los contadores son acumulados desde el inicio del compute, incluyendo journal, seeding y warm-up; no equivalen al tiempo de una sola confirmación. El comportamiento de la extensión y su alcance se contrastaron con [Neon](https://neon.com/docs/extensions/pg_stat_statements) y [PostgreSQL](https://www.postgresql.org/docs/current/pgstatstatements.html). Se usa primero el inspector oficial y su selección de las veinticinco consultas con mayor tiempo total.

`inspectAdmissionDatabaseStatements` captura stdout exclusivamente en memoria. `projectAdmissionStatementProfile` conserva ranking, operación, nombres elegidos de una lista cerrada, llamadas, tiempo total, promedio calculado y proporción. Elimina el texto SQL, literales, identificadores no reconocidos y cualquier otro campo. Los errores del CLI pueden retener SQL en stdout; se convierten deliberadamente en un estado propio visible y diagnóstico seguro, sin propagar ese objeto al reporte de Vitest.

El resultado funcional se guarda antes de consultar el diagnóstico, de modo que un fallo del inspector no borra la carga original. El caso persiste y exige el estado del diagnóstico, comprueba efectos y replay, y conserva la aserción de latencia original. La función y rama propias se retiran en sus `finally`, también ante un p95 fallido.

## Validación inicial

Siete casos de proyección numérica y privacidad pasaron, incluida la corrección de una consulta cuyo texto no es visible al rol: conserva contadores y usa operación desconocida sin inventar una referencia. Los ocho casos del handler autenticado también pasaron, al igual que los tipos de tests y lint. Los registros rojos y verdes están en `.git/admission-statement-profile-red.json`, `.git/admission-statement-hidden-query-red.json` y `.git/admission-statement-and-host-green.json`.

La ejecución real y su diagnóstico se registran por separado antes de considerar acreditado el inspector. Este trabajo no completa T200/T209 ni modifica las catorce tareas pendientes.
