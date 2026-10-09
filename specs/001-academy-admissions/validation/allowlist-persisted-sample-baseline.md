# Muestra persistida de mil contactos

Se ejecuta SC-021 contra el writer real sobre `1cb26717`, sin reemplazar la persistencia por propuestas puras. La muestra contiene mil identidades sintéticas nativas distintas, ochocientos contactos en la lista y doscientos ausentes, evidencia base válida, política abierta en modo lista y excepciones permitidas.

El batch se limita a insertar el fixture de cuentas/sesiones/capturas/lista. Cada presentación usa `SubmitAdmissionUseCase`, `PostgresAuthenticatedAccountProvider` y el writer actual, conservando commit de claim y commit de efecto por separado. Cuatro workers acotados comparten la misma tribu; sus locks reales serializan los efectos. No se cambian leases, guards, límites productivos ni se repiten automáticamente comandos fallidos. Las sesiones del fixture duran seis horas para permitir el ensayo prolongado; eso no modifica la política de sesiones del producto.

El test tiene flag explícito `RUN_ADMISSION_SAMPLE_TESTS=1`, timeout propio de cinco horas y emite sólo contadores cada cincuenta resultados. Al final exige 800 requests approved, 200 pending, 800 memberships básicas, 800 decisiones system/automatic con la versión de habilitación usada, mil vínculos y lista intacta en enabled/version1. Los avisos deben corresponder a 800 approved y 200 pending_created; el ingreso automático no fabrica avisos de revisión.

## Estado y evidencia

- Tipos de tests y lint focal verdes; 122 casos locales de matriz/alias/países/versión/propuestas en tres suites verdes, 1,94 s.
- La ejecución nativa permanece activa en su handle original. Una inspección metadata-only de su rama propia confirmó mil capturas y ochocientas entradas sembradas, once presentaciones/operaciones realmente completadas y contención normal de la tribu. No se imprimen cookies, tokens, conexión, correo, código de verificación ni payloads privados.
- La muestra no se considera aprobada hasta que los mil comandos terminen y se verifiquen todos los conteos SQL. No se reduce el alcance por su duración ni se reinicia al quedar quieta la observación.
- Reutilización separada: un caso PostgreSQL verde en 132,30 s después de cancelación y retry de líder con recencia exacta. Conserva el primer binding/id/fecha, la entrada enabled/version1 y la solicitud anterior cancelled. Una primera corrida de typecheck detectó pérdida de narrowing en un callback; se guarda el requestId ya confirmado antes del callback y los tipos vuelven a pasar.
- El primer contador del ensayo largo confirmó cincuenta admisiones completas y cero fallos. La revisión read-only del test no encontró hallazgos y mantuvo su hash `2E5E138B223D34545D54F805E31A34E7B5819183B249789BED6878547B5D1938`; esa revisión no sustituye la ejecución terminal de SC-021.
- La observación posterior confirmó 150 presentaciones completas, 150 admisiones y cero fallos; todavía no se ha llegado al grupo de doscientas excepciones y no se afirma el resultado final.

T107 y T120 siguen abiertas mientras falte evidencia final de la muestra y sus demás criterios. El runtime general conserva las fuentes personal/legacy y los gates pendientes. Todos los datos pertenecen a ramas efímeras propias; no se migran producción ni se envían mensajes reales.
