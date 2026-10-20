# Viajes a la base en los demás flujos de admisiones

Esta pasada mide y diagnostica: no cambia código de producto. Completa la línea base de [admission-leader-flow-queries.md](admission-leader-flow-queries.md) (Solicitudes, Reglas, Avisos, Países y cupos y Conexión, y los comandos de reglas) con los flujos que no la tenían. Cada optimización va en un PR propio.

## Protocolo

Cuatro suites nativas reutilizan el preload `tests/support/admission-query-counter.mjs` mediante el driver compartido `tests/support/admission-request-measurement.ts`:

| Suite | Fixture | Cubre |
|---|---|---|
| `tests/unit/modules/academy-admissions/infrastructure/admission-leader-workspace-queries.test.ts` | `prepareAdmissionBatch` (revisión manual activa, solicitudes pendientes sembradas y miembros bloqueados por pago antes del corte) | Páginas de Actividad, Lista, Importaciones, Invitaciones e Historial de solicitud. Decisiones individuales y por lote. Comandos de lista e importación. Invitaciones. Revisión de membresías bloqueadas por pago. Avisos y correo, preferencia propia, Países y cupos, y pausa de reglas. |
| `tests/unit/modules/academy-admissions/infrastructure/admission-applicant-queries.test.ts` | `prepareAdmissionContactVerification` (correo con verificación adicional y conexión preparada) más 6 solicitantes con sesión | Entrada pública, entrada por invitación y su resumen, emisión y verificación de código, envío, canje de invitación y solicitud propia (API y página). |
| `tests/unit/modules/messaging/infrastructure/messaging-connection-wizard-queries.test.ts` | `prepareAdmissionLeader` | Asistente de conexión: inicializar Países y cupos, crear, configurar, validar, emitir diagnóstico, verificarlo y activar. |
| `tests/unit/modules/messaging/infrastructure/admission-maintenance-queries.test.ts` | `prepareAdmissionContactVerification` con avisos por correo activos | `GET /api/maintenance/admission-messaging` por invocación, con una solicitud nueva antes de cada una y en vacío. |

Condiciones: build de producción (`next build` + `next start`) de `1acd4ead`, con auth y keyrings sintéticos en memoria. Cada suite corre en una rama Neon efímera propia, con el journal completo de migraciones. Cada ruta se calienta una vez sin registrarse (cache caliente). Se miden 3 muestras y se reporta la mediana. Desde esta máquina, cada viaje a Neon tarda unos 170 ms, así que la métrica principal es la cantidad de viajes secuenciales y los ms dependen de la red. El proveedor es el transporte de test `tests/support/native-zavu-provider-transport.mjs`: no hay envíos reales.

Datos completos, incluidas todas las muestras y las fases del mantenimiento: [admission-flow-queries.json](admission-flow-queries.json).

Excepciones al muestreo:

- **Inicializar Países y cupos:** una muestra, porque solo se inicializa una vez por tribu.
- **Diagnóstico de conexión:** emitir, verificar y activar tienen una muestra, porque el diagnóstico tiene un límite por líder. Crear, configurar y validar tienen tres muestras, en tres rondas, y la candidata se desconecta entre una ronda y otra.
- **Código de verificación:** emitir y verificar tienen 6 muestras (3 solicitudes comunes y 3 por invitación).

Como en la línea base anterior, los comandos dan cifras idénticas o a una sentencia de diferencia entre muestras. Una segunda corrida completa de las cuatro suites, en paralelo y con los presupuestos activos, pasó con transacciones idénticas y una diferencia máxima de 3 viajes secuenciales por flujo (páginas Lista e Importaciones).

## Línea base (mediana por request)

### Páginas y escrituras del líder

| Flujo | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Página Invitaciones | 24 | 239 | 229 | 41.336 |
| Confirmar importación de lista | 11 | 242 | 242 | 43.881 |
| Página Lista | 17 | 196 | 189 | 35.326 |
| Página Actividad | 26 | 163 | 153 | 26.792 |
| Guardar Países y cupos | 12 | 144 | 144 | 26.159 |
| Página Importaciones | 13 | 148 | 140 | 26.841 |
| Inicializar Países y cupos | 12 | 135 | 135 | 25.965 |
| Guardar avisos por correo | 7 | 133 | 133 | 24.794 |
| Editar entrada de lista | 7 | 112 | 112 | 20.113 |
| Renombrar invitación | 7 | 111 | 111 | 21.038 |
| Revocar invitación | 7 | 111 | 111 | 21.797 |
| Crear invitación | 7 | 109 | 109 | 20.909 |
| Crear entrada de lista | 7 | 108 | 108 | 19.504 |
| Vista previa de importación | 7 | 108 | 108 | 20.406 |
| Resolver membresía bloqueada por pago | 7 | 101 | 101 | 18.234 |
| Decisión por lote (2 solicitudes) | 5 | 79 | 79 | 16.000 |
| Pausar reglas | 7 | 77 | 77 | 14.904 |
| Decisión individual | 5 | 76 | 76 | 14.828 |
| Página Historial de solicitud | 11 | 67 | 57 | 10.182 |
| Leer membresías bloqueadas por pago | 7 | 53 | 53 | 9.512 |
| Guardar preferencia propia de avisos | 5 | 37 | 37 | 8.273 |

### Asistente de conexión

| Flujo | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Validar credencial | 23 | 447 | 447 | 81.099 |
| Configurar canal y remitente | 19 | 433 | 433 | 76.613 |
| Emitir diagnóstico | 18 | 406 | 401 | 70.545 |
| Activar | 7 | 354 | 354 | 64.627 |
| Verificar diagnóstico | 7 | 216 | 216 | 38.732 |
| Crear conexión | 12 | 163 | 163 | 28.121 |
| Inicializar Países y cupos | 12 | 134 | 134 | 23.917 |

### Solicitante

| Flujo | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Emitir código de verificación | 23 | 452 | 447 | 77.005 |
| Verificar código | 10 | 189 | 189 | 32.980 |
| Canjear invitación (envío con token) | 4 | 89 | 89 | 16.990 |
| Enviar solicitud | 4 | 79 | 79 | 15.017 |
| Página de entrada por invitación | 6 | 54 | 54 | 11.916 |
| Resumen de invitación (API) | 6 | 54 | 54 | 11.859 |
| Página de entrada pública | 6 | 34 | 34 | 6.499 |
| Solicitud propia (API) | 5 | 26 | 26 | 4.258 |
| Página de solicitud propia | 0 | 2 | 2 | 340 |

La página de solicitud propia no consulta datos en el servidor: los carga la API de solicitud propia desde el cliente.

### Trabajo de fondo (por invocación)

| Flujo | Transacciones | Sentencias | Viajes secuenciales | ms |
|---|---|---|---|---|
| Mantenimiento en vacío | 23 | 184 | 184 | 30.458 |
| Mantenimiento con una solicitud nueva | 22 | 173 | 173 | 28.999 |

En las 6 invocaciones, el productor de avisos (`prepare_notifications`) terminó en `deferred` sin preparar grupos, y el outbox (`dispatch_outbox`) no tuvo entregas que reclamar. Con unos 170 ms por viaje, cada invocación tarda unos 29 s, y la fase de avisos se pospone por el plazo de la corrida. La medición cubre el costo fijo de cada fase, pero no el de preparar y enviar un aviso real. Medirlo requiere latencia de producción o un escenario con grupos ya listos (ver hallazgo 6).

## Atribución

La traza `ADMISSION_QUERY_COUNTER_TRACE` clasifica cada sentencia de la muestra central. Cada sentencia cae en una de cuatro clases:

- **Sobrecosto:** `BEGIN` con el guard de inactividad, `set_config` de contexto y `COMMIT`.
- **Autoridad:** actor, sesión, usuario, cuenta, vínculo de identidad, locks de tribu y de líder, y proyección de cuenta.
- **Secreto:** conexión, versión, sobre del secreto y vigencia de claves de mensajería.
- **Trabajo:** el efecto propio del flujo.

| Flujo | Sentencias | Sobrecosto | Autoridad | Secreto | Trabajo |
|---|---|---|---|---|---|
| Emitir código de verificación | 452 | 76 | 239 | 30 | 107 |
| Validar credencial | 447 | 78 | 259 | 82 | 28 |
| Configurar canal y remitente | 433 | 63 | 285 | 64 | 21 |
| Emitir diagnóstico | 406 | 59 | 199 | 73 | 75 |
| Activar conexión | 354 | 25 | 252 | 59 | 18 |
| Confirmar importación de lista | 242 | 38 | 148 | 14 | 42 |
| Página Invitaciones | 239 | 78 | 147 | 0 | 14 |
| Verificar diagnóstico | 216 | 24 | 126 | 41 | 25 |
| Página Lista | 195 | 57 | 122 | 0 | 16 |
| Verificar código | 190 | 33 | 118 | 7 | 32 |
| Mantenimiento | 178 | 66 | 5 | 1 | 106 |
| Página Actividad | 163 | 81 | 74 | 0 | 8 |
| Guardar Países y cupos | 144 | 38 | 90 | 6 | 10 |
| Página Importaciones | 147 | 44 | 92 | 0 | 11 |
| Comandos de lista e invitaciones (cada uno) | 108–112 | 23 | 67–70 | 6 | 11–13 |
| Resolver membresía bloqueada por pago | 101 | 23 | 66 | 6 | 6 |
| Decisión individual o por lote | 76–80 | 17–18 | 25–28 | 6 | 28 |

En los flujos más caros, entre el 70 % y el 94 % de las sentencias son autoridad y sobrecosto de transacción, no trabajo del flujo.

## Hallazgos priorizados por viajes secuenciales

1. **Asistente de conexión: autoridad del secreto repetida por transacción y dentro de ella** (validar 447, configurar 433, diagnóstico 401, activar 354). Cada transacción repite la cadena de identidad del líder. La cadena incluye el correo del usuario, la cuenta, el vencimiento de la sesión, el vínculo de identidad, los líderes activos, la conexión, la versión y el sobre del secreto. Validar la repite 22 veces en 23 transacciones. Activar usa solo 7 transacciones, pero hace 252 sentencias de autoridad, porque `PostgresMessagingConnectionActivation.authorize` corre varias veces dentro de la misma transacción de efecto. Propuesta: un alcance de autoridad de mensajería reutilizado dentro de cada transacción, análogo a `withReusedAdmissionLeaderAuthority`, y menos transacciones por paso. Ahorro estimado: más de 200 viajes en cada paso.
2. **Solicitante: emitir código** (447 viajes, 23 transacciones). La proyección de identidad del solicitante (`account_user`) corre 36 veces, el actor 52, `clock_timestamp` 45 y el lock de tribu 37. El request incluye el despacho del correo (claim, lease, intento y reserva), con 6 lecturas de la entrega. Verificar código repite el mismo patrón (189 viajes en 10 transacciones). Propuesta: reutilizar la autoridad del solicitante dentro del request y juntar las transacciones de emisión y despacho donde el contrato de idempotencia lo permita.
3. **Comandos del líder fuera de reglas** (cada comando de lista, invitación, avisos por correo, membresías y pausa: 101 a 133 viajes en 7 transacciones; confirmar importación: 242 en 11). Cada transacción repite el guard completo del líder (`lock_admission_canonical_leader`, cuenta y vínculo). `withReusedAdmissionLeaderAuthority` hoy solo cubre los comandos de reglas. Propuesta: extenderlo a estos comandos. En reglas, esa reutilización bajó la activación de 261 a 118 viajes.
4. **Páginas del líder con muchas transacciones chicas** (Invitaciones 229 en 24 transacciones, Lista 189 en 17, Actividad 153 en 26, Importaciones 140 en 13). Actividad gasta 81 de sus 163 sentencias en sobrecosto de transacción, y en Invitaciones la proyección de cuenta corre 49 veces. Es el mismo patrón que el loader compuesto de Solicitudes que trabaja otra sesión: conviene aplicar ese diseño a estas páginas cuando quede integrado, sin duplicarlo antes.
5. **Países y cupos** (inicializar 135 y guardar 144, con 12 transacciones cada uno, el doble que un comando de reglas). Propuesta: revisar por qué el comando abre 12 transacciones y aplicarle la reutilización del hallazgo 3.
6. **Mantenimiento** (173 a 184 viajes en 22 a 23 transacciones por invocación, con o sin trabajo). La fila de progreso (`admission_messaging_maintenance_progress`) se lee 32 veces por invocación, y 66 sentencias son sobrecosto de transacción. Propuesta: leer el progreso una vez por fase y agrupar las escrituras de progreso. Además, falta medir el productor y el despacho con trabajo real, con latencia de producción o con un fixture de grupos listos.

La consolidación SQL del guard que trabaja otra sesión reduce la columna de autoridad de todos estos flujos. Hay que medir de nuevo con estas suites después de integrarla, antes de abrir los PRs de los hallazgos 1 a 5.

## Presupuesto de regresión

Cada suite falla si la mediana de un flujo supera su presupuesto o si mide un flujo sin presupuesto. El presupuesto vive en `tests/support/constants/` (`admission-leader-workspace-queries.ts`, `admission-applicant-queries.ts`, `messaging-connection-wizard-queries.ts` y `admission-maintenance-queries.ts`). Para cada flujo:

- **Transacciones:** la muestra más alta.
- **Sentencias y viajes secuenciales:** la muestra más alta, más dos.

Una optimización baja el presupuesto de su flujo en el mismo PR.
