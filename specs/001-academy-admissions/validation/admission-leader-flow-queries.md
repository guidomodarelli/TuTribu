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

## Próximos pasos

- Conexión de mensajería (164 viajes) y Países y cupos (73) no usan el guard de admisiones. Sus lecturas de mensajería tienen su propio guard secuencial y son ahora las páginas más lentas del flujo.
- En Solicitudes, identificar con una traza por cadena qué lectura es la más larga (hipótesis: la comprobación previa o la revisión de membresías) y reducir sus viajes propios, sin tocar la garantía de revocación.
