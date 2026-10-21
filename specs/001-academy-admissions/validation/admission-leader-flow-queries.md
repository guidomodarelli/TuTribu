# Viajes a la base en el flujo del líder

## Protocolo

`tests/unit/modules/academy-admissions/infrastructure/admission-leader-flow-queries.test.ts` levanta el build de producción (`next build` + `next start`) con `withAdmissionNextServer`, sobre una rama Neon efímera propia con el journal real de migraciones. La autenticación y los keyrings son sintéticos y se mantienen en memoria. El preload de test `tests/support/admission-query-counter.mjs` envuelve `pg.Client.prototype.query` y `pg.Pool.prototype.connect` y abre un `AsyncLocalStorage` por request HTTP. Por cada request reporta por IPC checkouts, transacciones (`BEGIN`), sentencias totales y la cadena más larga de sentencias que corrieron una después de otra (viajes secuenciales), sin texto SQL, parámetros, filas ni cabeceras. La traza opcional `ADMISSION_QUERY_COUNTER_TRACE` guarda solo la forma de cada sentencia, con placeholders, en un archivo local que no se versiona.

Cada página se calienta una vez sin registrarse. Después se miden tres muestras de cada página y lectura de API y se toma la mediana. Inicializar y activar tienen una muestra, porque el comando cambia de estado. Guardar tiene tres versiones consecutivas. La misma suite, con el mismo preload, midió la revisión `ccaa2038` sin cambios y la revisión optimizada, cada una con su propio build. La latencia de cada viaje desde esta máquina a Neon ronda los 170 ms, así que los milisegundos dependen de la red y la métrica principal es la cantidad de viajes secuenciales. Datos completos: [admission-leader-flow-queries.json](admission-leader-flow-queries.json).

## Antes y después (mediana por request)

| Request | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Inicializar reglas (POST /policy) | 7 → 7 | 113 → 80 (-29 %) | 113 → 80 (-29 %) | 20.077 → 16.231 (-19 %) |
| Guardar reglas (PUT /policy) | 7 → 7 | 113 → 79 (-30 %) | 113 → 79 (-30 %) | 20.327 → 14.688 (-28 %) |
| Solicitudes con guía | 59 → 54 | 534 → 431 (-19 %) | 160 → 135 (-16 %) | 26.658 → 22.939 (-14 %) |
| Reglas | 27 → 25 | 291 → 246 (-15 %) | 152 → 135 (-11 %) | 24.956 → 22.578 (-10 %) |
| Avisos | 13 → 13 | 110 → 87 (-21 %) | 88 → 77 (-13 %) | 15.395 → 14.203 (-8 %) |
| Países y cupos | 14 → 14 | 107 → 83 (-22 %) | 85 → 73 (-14 %) | 14.884 → 13.362 (-10 %) |
| Conexión de mensajería | 30 → 30 | 215 → 174 (-19 %) | 193 → 164 (-15 %) | 33.392 → 27.293 (-18 %) |
| Lectura de reglas (GET /policy) | 9 → 9 | 136 → 127 (-7 %) | 136 → 127 (-7 %) | 23.399 → 21.992 (-6 %) |
| Comprobación previa (GET /policy/preflight) | 7 → 7 | 67 → 60 (-10 %) | 67 → 60 (-10 %) | 11.967 → 10.649 (-11 %) |
| Activar (POST /policy/activate) | 7 → 7 | 261 → 118 (-55 %) | 261 → 118 (-55 %) | 44.725 → 21.130 (-53 %) |

## Atribución

Se aplicaron tres cambios juntos, porque cada build más la medición tarda unos 20 minutos. Cada efecto se atribuye con la traza por forma de sentencia, que es determinista:

1. **`BEGIN` y guard de inactividad en un viaje** (`runWithGuardedTransaction`): una sentencia menos por transacción. En Solicitudes son 59 menos y en cada escritura, 7.
2. **Memo por render de la sesión de Better Auth** (`getServerBetterAuthSession` con `memoizeForRequest`): las lecturas de sesión y usuario de Better Auth bajan de 20 a 2 en Solicitudes y de 10 a 2 en Reglas, Avisos, Países y cupos y Conexión. No aplica a route handlers.
3. **Memo por render de `slug → tribu`** (`ResolveAdmissionTribeUseCase` en `createQueryModule`): en Solicitudes, las transacciones de identidad pública bajan de 6 a 1, y en Reglas, de 3 a 1.
4. **Autoridad de líder reutilizada en comandos de reglas** (`withReusedAdmissionLeaderAuthority`): en la activación, las sentencias del guard bajan de 157 a 52 y las proyecciones de cuenta, de 39 a 9. En la transacción de efecto, el guard corría unas 14 veces con unos 10 viajes cada una; ahora la primera vez es completa y las demás usan una sola sentencia.

## Seguridad

`tests/unit/modules/academy-admissions/infrastructure/admission-leader-authority-reuse.test.ts` corre contra Postgres real y comprueba lo siguiente:

- Sin alcance, cada chequeo sigue completo.
- Con alcance, un chequeo repetido usa una sentencia y uno que requiere el lock exclusivo después de chequeos compartidos toma el camino completo.
- Otra transacción no puede cambiar el liderazgo mientras la autoridad está tomada: el trigger `lock_messaging_leadership_scope` espera el lock de la tribu y falla con `55P03` (`lock_timeout`).
- Una degradación del líder dentro de la misma transacción se detecta.
- Una sesión que vence entre chequeos se rechaza con `authentication_required`.

La proyección de cuenta no se memoiza: la revalidación posterior a la lectura de datos de cada caso de uso se mantiene.

## Segunda ronda: guard SQL consolidado

Misma suite, mismo preload y mismo protocolo. Línea base: la revisión `1acd4ead` (la primera ronda ya integrada). Después: `c60d163d`, con `public.authorize_admission_leader`. Cada revisión tuvo su propio `next build` y su propia rama Neon efímera. Datos completos en `consolidatedGuard` de [admission-leader-flow-queries.json](admission-leader-flow-queries.json).

| Request | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Inicializar reglas (POST /policy) | 7 → 7 | 80 → 62 (-22 %) | 80 → 62 (-22 %) | 15.860 → 13.308 (-16 %) |
| Guardar reglas (PUT /policy) | 7 → 7 | 79 → 61 (-23 %) | 79 → 61 (-23 %) | 14.858 → 12.349 (-17 %) |
| Solicitudes con guía | 54 → 54 | 431 → 317 (-26 %) | 136 → 78 (-43 %) | 22.960 → 13.486 (-41 %) |
| Reglas | 25 → 25 | 246 → 147 (-40 %) | 136 → 65 (-52 %) | 22.551 → 11.088 (-51 %) |
| Avisos | 13 → 13 | 87 → 73 (-16 %) | 77 → 63 (-18 %) | 14.083 → 11.797 (-16 %) |
| Países y cupos | 14 → 14 | 83 → 83 | 73 → 73 | 13.007 → 13.096 (+1 %) |
| Conexión de mensajería | 30 → 30 | 174 → 174 | 164 → 164 | 28.347 → 28.121 (-1 %) |
| Lectura de reglas (GET /policy) | 9 → 9 | 127 → 57 (-55 %) | 127 → 57 (-55 %) | 21.324 → 10.508 (-51 %) |
| Comprobación previa (GET /policy/preflight) | 7 → 7 | 60 → 46 (-23 %) | 60 → 46 (-23 %) | 10.945 → 8.578 (-22 %) |
| Activar (POST /policy/activate) | 7 → 7 | 118 → 100 (-15 %) | 118 → 100 (-15 %) | 20.798 → 18.007 (-13 %) |

Países y cupos y Conexión de mensajería no pasan por el guard del líder de admisiones, por eso no cambian: sus milisegundos quedan dentro del ruido.

### Atribución

El camino completo de `authorizeAdmissionLeader` hacía entre 7 y 9 sentencias secuenciales: actor, tribu `FOR SHARE`/`FOR UPDATE`, usuario, sesión, proyección de cuenta, `lock_admission_canonical_leader`, cuenta y vínculo de sesión (solo en mutaciones), otra proyección y el reloj. Ahora es una sola llamada a `public.authorize_admission_leader`. La traza por forma de sentencia lo confirma:

- **Solicitudes:** las sentencias del guard bajan de 190 a 78. Los 16 guards completos pasan a 16 llamadas a la función, y las proyecciones de cuenta, de 81 a 49: las 32 que hacía el guard ya no salen de la función.
- **Reglas:** de 134 a 36. **Lectura de reglas:** de 86 a 16. **Activar:** de 35 a 17, porque los guards repetidos ya se reutilizaban desde la primera ronda.

### Seguridad y paridad

`tests/unit/modules/academy-admissions/infrastructure/admission-leader-guard-parity.test.ts` corre contra Postgres real y fija dos contratos. Pasó igual con el guard secuencial (`1acd4ead`) y con la función, cada vez en su propia rama efímera:

- **Resultados**, para lecturas y para operaciones sensibles: líder vigente (`authorized`), otro actor (`permission_denied`), tribu inexistente (`resource_unavailable`), sesión ajena (`authentication_required`), sesión vencida (`authentication_required`), líder degradado a guardián (`permission_denied`), líder bloqueado (`permission_denied`), vínculo de sesión invalidado y cuenta sin Google (`authorized`), y alcance que no coincide con el contexto (`permission_denied`).
- **Orden de locks:** otra transacción retiene cada fila del guard. Mientras el guard espera esa fila, sondas `FOR UPDATE NOWAIT` comprueban que ya retiene todas las anteriores y ninguna de las siguientes: tribu, usuario, sesión y liderazgo canónico en lecturas, y además cuenta de Google y vínculo de sesión en operaciones sensibles. Al terminar retiene exactamente ese conjunto.

`admission-leader-authority-reuse.test.ts` sigue pasando. El camino completo ahora mide una sentencia, y una sonda `FOR SHARE NOWAIT` confirma que el paso a un chequeo exclusivo toma la tribu `FOR UPDATE`.

### Descartado: una sola ventana de sesión para Solicitudes

Se probó un caso de uso compuesto con una única proyección de cuenta inicial y una única revalidación final, posterior a todas las lecturas, en dos variantes. En la primera, la bandeja y las cinco áreas de la guía compartían la ventana. En la segunda, solo las áreas de la guía la compartían y la bandeja conservaba la suya y su streaming. Cada lectura seguía con su guard SQL. Comparado con el guard consolidado sin ventana compuesta (mediana de 3 muestras):

| Variante | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Sin ventana compuesta | 54 | 317 | 78 | 13.486 |
| Ventana para bandeja y guía | 48 | 293 | 79 | 14.207 |
| Ventana solo para la guía | 50 | 300 | 80 | 14.159 |

Antes del guard consolidado, la variante con bandeja y guía también empeoraba: de 136 a 142 viajes secuenciales y de 22.960 a 24.233 ms. Las dos variantes ahorran transacciones, pero ninguna baja los viajes secuenciales y la mediana sube unos 700 ms. La revalidación final tiene que esperar la lectura más larga del grupo y suma su transacción al final de esa cadena. La hipótesis, compatible con la traza pero no medida por cadena, es que esa lectura es la comprobación previa o la revisión de membresías, que antes no tenían revalidación final propia. La variante con bandeja, además, hace que la bandeja espere a la guía. Por eso no se integró.

## Tercera ronda: guards de mensajería

Mismo protocolo. Línea base: la revisión `d3cc82b7`. Después: `e3075403`, con dos cambios medidos uno por uno. Datos completos en `messagingGuards` de [admission-leader-flow-queries.json](admission-leader-flow-queries.json).

| Request | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Inicializar reglas (POST /policy) | 7 → 7 | 62 → 61 (-2 %) | 62 → 61 (-2 %) | 12.939 → 12.686 (-2 %) |
| Guardar reglas (PUT /policy) | 7 → 7 | 61 → 61 | 61 → 61 | 12.032 → 12.287 (+2 %) |
| Solicitudes con guía | 54 → 51 (-6 %) | 336 → 308 (-8 %) | 83 → 83 | 13.922 → 13.905 (+0 %) |
| Reglas | 25 → 25 | 166 → 166 | 83 → 83 | 14.186 → 14.140 (+0 %) |
| Avisos | 13 → 13 | 73 → 73 | 63 → 63 | 11.218 → 11.370 (+1 %) |
| Países y cupos | 14 → 12 (-14 %) | 83 → 55 (-34 %) | 73 → 45 (-38 %) | 13.386 → 8.507 (-36 %) |
| Conexión de mensajería | 30 → 22 (-27 %) | 175 → 98 (-44 %) | 165 → 88 (-47 %) | 29.396 → 15.254 (-48 %) |
| Lectura de reglas (GET /policy) | 9 → 9 | 75 → 75 | 75 → 75 | 13.622 → 13.451 (-1 %) |
| Comprobación previa (GET /policy/preflight) | 7 → 7 | 46 → 46 | 46 → 46 | 8.701 → 8.474 (-3 %) |
| Activar (POST /policy/activate) | 7 → 7 | 100 → 100 | 100 → 100 | 17.940 → 18.561 (+3 %) |

Solicitudes baja transacciones y sentencias porque su guía lee el resumen de mensajería. Su cadena más larga sigue siendo la de admisiones, así que los viajes no cambian. Las escrituras de reglas y la comprobación previa no pasan por estos guards: sus diferencias de milisegundos están dentro del ruido.

La línea base `d3cc82b7` ya tenía unas 18 sentencias más que la segunda ronda en Reglas, en la lectura de reglas (`GET /policy`) y, por la guía, en Solicitudes. Las agregó `5473d9ad`, que hace que la lectura del líder evalúe la misma preparación que la activación para nombrar el requisito pendiente. Es un cambio de funcionalidad y no de rendimiento: los presupuestos de esas tres requests se ajustaron a ese valor.

### Atribución

1. **Guards de mensajería en SQL** (`6e035942`, migración `20261021120000_consolidate_messaging_leader_guards.sql`): `getCurrentLeadership` hacía 5 sentencias, el guard del lector de configuración otras 5 y `authorizeMessagingTribeManagement` entre 6 y 9. Ahora cada uno es una llamada: `read_messaging_leadership`, `authorize_messaging_configuration_reader` y `authorize_messaging_tribe_management`. En Conexión, las sentencias de guard bajan de 54 a 10 y los viajes, de 165 a 120. En Países y cupos, de 24 a 4 y de 73 a 53.
2. **Lectores guardados sin proyección previa** (`e3075403`): el liderazgo, la configuración y el catálogo de avisos abren su transacción con la identidad de la sesión (`readCurrentFeatureSessionContext`), porque su primera sentencia ya revalida actor, sesión vigente y liderazgo canónico en SQL. Cada uno ahorra una transacción completa (unos 4 viajes). En Conexión, las proyecciones de cuenta bajan de 19 a 11, las transacciones de 30 a 22 y los viajes de 120 a 88. En Países y cupos, 8 → 6, 14 → 12 y 53 → 45.

### Seguridad y paridad

`tests/unit/modules/messaging/infrastructure/messaging-leader-guard-parity.test.ts` corre contra Postgres real y pasó igual con los guards secuenciales (`d3cc82b7`) y con las funciones:

- **Liderazgo:** devuelve los hechos del líder y del guardián vigente. Devuelve `null` con otro actor, una tribu inexistente, una sesión ajena o vencida y un líder degradado o bloqueado.
- **Configuración:** `leader` y `guardian` según la audiencia. Un guardián que pide la audiencia de líder, otro actor, una tribu inexistente, un líder degradado o bloqueado dan `permission_denied`. Una sesión ajena o vencida da `authentication_required`.
- **Gestión de la tribu:** cubre lecturas y operaciones sensibles: uso, suspensión de conexión, credenciales y recuperación de un aviso inexistente. Cubre también un subject equivocado, un vínculo invalidado, un recurso cruzado y una sesión vencida.
- **Orden de locks**, con sondas `FOR UPDATE NOWAIT` mientras el guard espera cada fila:
  - Liderazgo: tribu, sesión y líder.
  - Configuración: sesión, tribu y líder.
  - Gestión: usuario, sesión, tribu y líder; en operaciones sensibles, también cuenta de Google y vínculo antes de la tribu.
  - Una sonda `FOR SHARE NOWAIT` confirma que las operaciones de conexión toman la tribu `FOR UPDATE`.

El arnés de orden de locks pasó a `tests/support/guard-lock-order.ts` y lo comparte con `admission-leader-guard-parity.test.ts`, que sigue pasando.

Quitar la proyección previa de los lectores guardados no debilita la detección de una sesión revocada o de un cambio de usuario. Cada caso de uso conserva su proyección inicial y su revalidación final, y la primera sentencia de cada transacción vuelve a comprobar en SQL el actor, la sesión vigente y el liderazgo. Las escrituras siguen con `executeActor`, que compara la cuenta de Google en las operaciones sensibles. El correo del contexto de request solo lo consumen las suscripciones, no estas lecturas.

## Cuarta ronda: proyección de cuenta en una sentencia

Mismo protocolo. Línea base: la revisión `106cae0c`. Después: esta rama, con la migración `20261021180000_project_authenticated_account.sql`. Datos completos en `standaloneAccountProjection` de [admission-leader-flow-queries.json](admission-leader-flow-queries.json).

| Request | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Inicializar reglas (POST /policy) | 7 → 4 (-43 %) | 61 → 52 (-15 %) | 61 → 52 (-15 %) | 12.407 → 10.522 (-15 %) |
| Guardar reglas (PUT /policy) | 7 → 4 (-43 %) | 61 → 52 (-15 %) | 61 → 52 (-15 %) | 12.115 → 10.468 (-14 %) |
| Solicitudes con guía | 51 → 23 (-55 %) | 309 → 224 (-28 %) | 83 → 65 (-22 %) | 13.721 → 10.987 (-20 %) |
| Reglas | 25 → 13 (-48 %) | 166 → 130 (-22 %) | 83 → 65 (-22 %) | 13.646 → 10.845 (-21 %) |
| Avisos | 13 → 7 (-46 %) | 73 → 55 (-25 %) | 63 → 45 (-29 %) | 11.344 → 8.351 (-26 %) |
| Países y cupos | 12 → 6 (-50 %) | 55 → 34 (-38 %) | 45 → 26 (-42 %) | 8.586 → 4.404 (-49 %) |
| Conexión de mensajería | 22 → 11 (-50 %) | 98 → 65 (-34 %) | 88 → 55 (-38 %) | 15.828 → 10.007 (-37 %) |
| Lectura de reglas (GET /policy) | 9 → 5 (-44 %) | 75 → 63 (-16 %) | 75 → 63 (-16 %) | 13.505 → 11.425 (-15 %) |
| Comprobación previa (GET /policy/preflight) | 7 → 4 (-43 %) | 46 → 37 (-20 %) | 46 → 37 (-20 %) | 8.845 → 7.133 (-19 %) |
| Activar (POST /policy/activate) | 7 → 4 (-43 %) | 100 → 92 (-8 %) | 100 → 92 (-8 %) | 18.828 → 18.149 (-4 %) |

### Atribución

Cada proyección de cuenta corría en su propia transacción guardada solo para fijar `app.current_user_id` antes de un único `SELECT`. Eran 4 viajes: `BEGIN` con el guard de inactividad, el contexto, la proyección y `COMMIT`. Ahora `public.read_authenticated_account` contiene esa misma proyección, es `SECURITY INVOKER` (las mismas políticas RLS) y corre sola sobre el pool con `withStandaloneStatement`. En ese modo fija el actor para la transacción implícita de la sentencia y lo restaura antes de devolver. La traza lo confirma: en Conexión, las 11 transacciones de proyección (44 sentencias) pasan a 11 sentencias sueltas, de 98 a 65 sentencias, y en Países y cupos, sus 6 transacciones de proyección pasan a 6 sentencias sueltas (de 55 a 34 sentencias). Como todos los casos de uso proyectan la cuenta al principio y al final, el cambio baja todas las páginas y escrituras medidas. Activar baja poco porque su costo está en la transacción de efecto.

### Seguridad y paridad

`tests/unit/modules/auth/infrastructure/authenticated-account-projection-parity.test.ts` corre contra Postgres real y pasó igual con la proyección en transacción (`106cae0c`) y con la función. Proyecta por el camino del pool y dentro de la transacción del actor, y en los dos da el mismo resultado:

- Sesión vinculada con y sin evidencia de identidad.
- Vínculo de sesión invalidado.
- Una o dos cuentas de Google sin vínculo.
- Sesión vencida, sesión ajena y otra cuenta.

Además comprueba que dentro de la transacción de otro actor, o de una sin actor, no se proyecta nada, y que la conexión del pool no conserva actor después de la proyección.

La detección de una sesión revocada o de un cambio de usuario no cambia: cada caso de uso sigue proyectando la cuenta al principio y al final, y cada proyección se hace sobre la base en el momento en que corre.

## Quinta ronda: Activar

Mismo protocolo. Línea base: la revisión `72b01991`, medida como «después» de la cuarta ronda sobre el mismo código. Después: esta rama. Datos completos en `activationInventory` de [admission-leader-flow-queries.json](admission-leader-flow-queries.json).

| Request | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Inicializar reglas (POST /policy) | 4 → 4 | 52 → 52 | 52 → 52 | 10.522 → 10.558 (+0 %) |
| Guardar reglas (PUT /policy) | 4 → 4 | 52 → 52 | 52 → 52 | 10.468 → 10.612 (+1 %) |
| Solicitudes con guía | 23 → 23 | 224 → 214 (-4 %) | 65 → 60 (-8 %) | 10.987 → 10.269 (-7 %) |
| Reglas | 13 → 13 | 130 → 120 (-8 %) | 65 → 60 (-8 %) | 10.845 → 10.363 (-4 %) |
| Avisos | 7 → 7 | 55 → 55 | 45 → 45 | 8.351 → 8.189 (-2 %) |
| Países y cupos | 6 → 6 | 34 → 34 | 26 → 26 | 4.404 → 4.310 (-2 %) |
| Conexión de mensajería | 11 → 11 | 65 → 65 | 55 → 55 | 10.007 → 10.054 (+0 %) |
| Lectura de reglas (GET /policy) | 5 → 5 | 63 → 58 (-8 %) | 63 → 58 (-8 %) | 11.425 → 10.703 (-6 %) |
| Comprobación previa (GET /policy/preflight) | 4 → 4 | 37 → 32 (-14 %) | 37 → 32 (-14 %) | 7.133 → 6.349 (-11 %) |
| Activar (POST /policy/activate) | 4 → 4 | 92 → 81 (-12 %) | 92 → 81 (-12 %) | 18.149 → 16.400 (-10 %) |

### Atribución

En Activar, 68 de las 92 sentencias caen en la transacción de efecto. Esa transacción evalúa la preparación dos veces: antes de escribir y, con `assertCurrentPreparation`, después de escribir, para validar el estado final, incluido el marcador recién escrito. La segunda evaluación se mantiene. Dentro de cada evaluación, el inventario de activación (`PostgresAdmissionActivationRepository.read`) leía el marcador y cinco consultas de catálogo una por una: triggers, RLS forzada, constraints validadas, funciones del dueño y la política de ingreso. Ninguna toma locks. Ahora son una sola sentencia, ubicada entre las dos lecturas que bloquean (configuración de la academia y membresías), así que el orden de locks no cambia. Son 5 sentencias menos por evaluación: 10 en Activar y 5 en Reglas, en la lectura de reglas, en la comprobación previa y, por la guía, en Solicitudes.

### Seguridad y paridad

`tests/unit/modules/academy-admissions/infrastructure/admission-activation-inventory-parity.test.ts` corre contra Postgres real y pasó igual con las consultas separadas (`72b01991`) y con la sentencia única. Fija el inventario en el estado base. También comprueba que se cierra con cada cambio que inspecciona, aplicado dentro de una transacción revertida:

- Trigger de almacenamiento o de ingreso deshabilitado.
- Política de ingreso borrada.
- RLS no forzada.
- `search_path` de una función del dueño reseteado.
- `EXECUTE` público sobre una función que no lo admite.
- Evaluador deshabilitado.

### Descartado

- **La lectura del actor en el ledger** (`select public.current_app_user_id()` antes de cada autorización, 3 por Activar) se mantiene. Es la comprobación independiente del ledger genérico de operaciones, que no puede asumir que cada callback de autorización compare el actor.
- **La verificación de claves MAC** son dos sentencias (contexto vigente y pruebas) que no se unen, porque la segunda invoca una función de aserción que no debe correr si la primera falla.

## Sexta ronda: revalidaciones de autoridad en Activar

Mismo protocolo. Línea base: la revisión `b6fce34b`, medida como «después» de la quinta ronda sobre el mismo código. Después: esta rama. Datos completos en `consecutiveReusedChecks` de [admission-leader-flow-queries.json](admission-leader-flow-queries.json).

| Request | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Inicializar reglas (POST /policy) | 4 → 4 | 52 → 52 | 52 → 52 | 10.558 → 10.424 (-1 %) |
| Guardar reglas (PUT /policy) | 4 → 4 | 52 → 52 | 52 → 52 | 10.612 → 10.261 (-3 %) |
| Solicitudes con guía | 23 → 23 | 214 → 214 | 60 → 60 | 10.269 → 10.251 (+0 %) |
| Reglas | 13 → 13 | 120 → 120 | 60 → 60 | 10.363 → 9.967 (-4 %) |
| Avisos | 7 → 7 | 55 → 55 | 45 → 45 | 8.189 → 8.758 (+7 %) |
| Países y cupos | 6 → 6 | 34 → 34 | 26 → 26 | 4.310 → 4.298 (+0 %) |
| Conexión de mensajería | 11 → 11 | 65 → 65 | 55 → 55 | 10.054 → 10.083 (+0 %) |
| Lectura de reglas (GET /policy) | 5 → 5 | 58 → 58 | 58 → 58 | 10.703 → 10.902 (+2 %) |
| Comprobación previa (GET /policy/preflight) | 4 → 4 | 32 → 32 | 32 → 32 | 6.349 → 6.420 (+1 %) |
| Activar (POST /policy/activate) | 4 → 4 | 81 → 74 (-9 %) | 81 → 74 (-9 %) | 16.400 → 14.784 (-10 %) |

Solo cambia Activar: es la única request medida cuya transacción abre el alcance de autoridad reutilizada (`withReusedAdmissionLeaderAuthority`) y evalúa la preparación. Las demás diferencias de milisegundos están dentro del ruido.

### Atribución

En la transacción de efecto de Activar, cada lector de la preparación revalida la autoridad antes y después de sus lecturas: el inventario de activación, los cupos de mensajería y la preparación del canal de verificación. Por eso el chequeo final de un lector y el inicial del siguiente quedaban seguidos, sin ninguna sentencia en medio. La traza de la línea base tenía 15 revalidaciones reutilizadas: 4 pares consecutivos y 4 lecturas sueltas del reloj (`admissionDatabaseNow`) justo después de una de ellas. Ahora, dentro del alcance, una revalidación idéntica a la anterior se da por cumplida si en la conexión no corrió ninguna sentencia desde entonces y llega dentro de 500 ms (`ADMISSION_LEADER_AUTHORITY_REUSE.consecutiveWindowMs`), contados desde que se envió la consulta de esa revalidación. El reloj pedido en esas condiciones es el que esa revalidación ya tomó. Activar baja de 81 a 74 sentencias.

### Seguridad

Si no corrió ninguna sentencia en la conexión, la transacción no esperó ningún lock ni cambió nada. Las filas que la autoridad bloqueó siguen bloqueadas, así que lo único que puede cambiar es el reloj. Por eso la ventana acota cuánto puede adelantarse la comprobación de vencimiento de la sesión. Se cuenta desde que se envió la consulta y no desde que llegó la respuesta, así que también acota la edad de la muestra del reloj cuando la respuesta se demora: cualquier pausa o demora mayor vuelve a ejecutar la revalidación. La ventana cubre un viaje de ida y vuelta, unos 170 ms desde la máquina de medición. Las sentencias se cuentan sobre el cliente `pg` de la transacción mientras el alcance está abierto, así que cuenta cualquier API que las envíe, y el contador se retira al cerrarse el alcance.

`admission-leader-authority-reuse.test.ts` corre contra Postgres real y agrega estos casos:

- Una revalidación idéntica y consecutiva, y el reloj que le sigue, no agregan sentencias.
- Con una sentencia en medio, o tras una pausa mayor que la ventana, la revalidación se repite.
- Si la respuesta de la revalidación anterior llegó demorada más allá de la ventana (porque esperó un lock), la siguiente se repite.
- El cliente vuelve a su `query` original al cerrarse el alcance.

Los casos que ya tenía siguen pasando: segundo líder bloqueado por el lock de la tribu, degradación en la misma transacción y sesión vencida tras una pausa. La suite nativa de persistencia de reglas pasa salvo el caso preexistente de cutover storage, que falla igual sin este cambio.

## Séptima ronda: lecturas repetidas de la preparación

Mismo protocolo. Línea base: la revisión `a0cbdc1d` (la sexta ronda ya integrada). Se aplicaron cuatro cambios, uno por iteración, con su propio `next build` y su propia rama Neon efímera. Datos completos, con cada iteración, en `lockedReadJoins` de [admission-leader-flow-queries.json](admission-leader-flow-queries.json).

| Request | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Inicializar reglas (POST /policy) | 4 → 4 | 52 → 51 (-2 %) | 52 → 51 (-2 %) | 10.686 → 10.494 (-2 %) |
| Guardar reglas (PUT /policy) | 4 → 4 | 52 → 51 (-2 %) | 52 → 51 (-2 %) | 10.554 → 10.514 (0 %) |
| Solicitudes con guía | 23 → 23 | 213 → 207 (-3 %) | 61 → 55 (-10 %) | 10.381 → 9.932 (-4 %) |
| Reglas | 13 → 13 | 120 → 114 (-5 %) | 60 → 55 (-8 %) | 10.275 → 9.778 (-5 %) |
| Avisos | 7 → 7 | 55 → 55 | 45 → 45 | 8.439 → 8.214 (-3 %) |
| Países y cupos | 6 → 6 | 34 → 34 | 26 → 26 | 4.185 → 4.270 (+2 %) |
| Conexión de mensajería | 11 → 11 | 65 → 65 | 55 → 55 | 9.757 → 9.852 (+1 %) |
| Lectura de reglas (GET /policy) | 5 → 5 | 58 → 53 (-9 %) | 58 → 53 (-9 %) | 10.357 → 9.958 (-4 %) |
| Comprobación previa (GET /policy/preflight) | 4 → 4 | 32 → 31 (-3 %) | 32 → 31 (-3 %) | 6.154 → 6.322 (+3 %) |
| Activar (POST /policy/activate) | 4 → 4 | 74 → 67 (-9 %) | 74 → 67 (-9 %) | 14.100 → 13.255 (-6 %) |

Países y cupos y Avisos no pasan por el código que cambió; sus diferencias de milisegundos están dentro del ruido. En las iteraciones 2 y 3, la mediana de Países y cupos llegó a 37 sentencias, porque en dos de sus tres muestras el pool abrió conexiones nuevas: las 3 sentencias de más son `set_config(..., false)` del `onConnect` del pool, según la traza. La línea base ya tenía una muestra así (37 sentencias, 5.383 ms). Activar tiene una sola muestra por ejecución, así que sus milisegundos son ruidosos. La métrica principal sigue siendo la cantidad de viajes, que es determinista.

### Atribución

Cada transacción de comando de reglas bloquea los ajustes de la academia (`tribe_academy_settings ... for share`) antes de leer la política. Después, la preparación volvía a leer esa fila, bloqueada, dos veces por evaluación: en el lector de preparación y en el inventario. En las dos, la lectura estaba al lado de una lectura sin lock. Las tres primeras iteraciones unen cada lectura bloqueada con su vecina sin lock. La cuarta saca la lectura repetida: el puerto de preflight devuelve los ajustes y el marcador que el inventario ya leyó, y su sentencia de catálogo agrega `control_activated`. La fila bloqueada sale de una subconsulta con su propio `FOR SHARE` o `FOR UPDATE`, unida con `left join` a una fila ancla, así que si falta la fila igual se obtiene el resto.

| # | Cambio | Activar | Otras requests |
|---|---|---|---|
| 1 | `PostgresAdmissionPolicyPreparationReader`: ajustes y marcador en una sentencia | 74 → 72 | Reglas, Solicitudes y GET /policy: -1 |
| 2 | `PostgresAdmissionActivationRepository.read`: ajustes dentro de la sentencia de marcador y catálogo, antes del lock de membresías | 72 → 70 | Reglas, Solicitudes, GET /policy y la comprobación previa: -1 |
| 3 | `readAdmissionPolicyWithControlMarker`: política, con su mismo lock, y marcador en una sentencia, en los comandos de reglas y en la lectura de reglas | 70 → 69 | Inicializar, guardar: -1. GET /policy, Reglas y Solicitudes: -2 |
| 4 | `AdmissionActivationPreflightReader.readPreparation`: el inventario devuelve el resultado junto con los ajustes y el marcador que ya leyó, y el lector de preparación deja de leerlos | 69 → 67 | Reglas, Solicitudes y GET /policy: -1 |

### Seguridad y paridad

No cambia el orden en que se adquieren los locks. Ninguna sentencia nueva junta dos lecturas que bloquean, porque Postgres no garantiza en qué orden las ejecuta. Las relecturas de los ajustes reafirman un lock que la transacción ya tiene. Las revalidaciones de autoridad antes y después de cada lector siguen igual, y no hay memo entre sentencias ni entre requests.

- `admission-policy-preparation-parity.test.ts` (nueva) y `admission-activation-inventory-parity.test.ts` (ampliada) pasaron igual con las lecturas separadas (`a0cbdc1d`) y con las unidas. La de preparación pasa por el inventario real con una política guardada, así que también pasó igual antes y después del cambio de puerto. Fijan los hechos que devuelve cada lector y el resultado del cutover con el evaluador deshabilitado, con el modo `legacy`, sin la fila de ajustes y, en el lector de preparación, con el marcador escrito, que deja el cutover inconsistente. También comprueban que, después de leer, otra transacción no puede tomar la fila de ajustes con `FOR UPDATE NOWAIT`.
- Los tests cuyo preflight se verifica aparte usan `createTenantRowsPreflight`: fuerza el resultado del cutover y lee de la base los ajustes y el marcador, así sus hechos siguen siendo reales.
- `admission-policy-marker-read-parity.test.ts` (nueva) compara la lectura unida con las dos funciones separadas que se siguen usando en otros flujos. Cubre política ausente o guardada, consulta o comando y marcador escrito. Además fija el lock que queda sobre la política: un comando bloquea `FOR SHARE NOWAIT` y `FOR UPDATE NOWAIT`, y la consulta bloquea solo `FOR UPDATE NOWAIT`.

### Descartado

- **Unir la lectura de ajustes de `academy()` con la de la política.** Son dos lecturas que bloquean: una sentencia no garantiza que los ajustes se bloqueen antes que la política.
- **Unir las dos lecturas de `messaging_usage_policies`** (cupos y preparación del canal). Entre ellas queda la revalidación de autoridad posterior de un lector, que es también la previa del siguiente, y las revalidaciones se mantienen.

## Próximos pasos

- Activar (67 viajes): el resto de su costo está en la propia preparación (dos evaluaciones, por diseño, con sus revalidaciones de autoridad), en la verificación de claves MAC (tres veces) y en el ledger de operaciones.
