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

## Próximos pasos

- Solicitudes sigue con 54 transacciones: cada loader de la guía (reglas, avisos, mensajería, membresías y comprobación previa) hace su proyección inicial, su lectura guardada y su revalidación final por separado. Un loader compuesto que comparta la entrada y conserve una sola revalidación final reduciría más, pero cambia el contrato de los casos de uso de página y requiere revisar su garantía de revocación.
- Las lecturas de API (`GET /policy` y `/policy/preflight`) tienen un guard por transacción y no se benefician de la reutilización. Consolidar el guard completo en una función SQL con el mismo orden de locks requiere una migración validada en una rama efímera.
