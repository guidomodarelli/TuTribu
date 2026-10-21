# Viajes a la base en el asistente de conexión de mensajería

Medición del efecto de `withReusedMessagingSecretAuthority` sobre el asistente de conexión. Primero mide el cambio de [messaging-delivery-authority-queries.md](messaging-delivery-authority-queries.md) (#148) sobre el despacho del diagnóstico de conexión. Después mide la extensión a las comprobaciones humanas (`sensitive_leader`) que `PostgresCurrentMessagingProvider.read` repite para los inspectores del asistente. Las decisiones están en `docs/architecture/tenant-messaging.htm#worker-secret-authority-reuse`.

## Protocolo

- Suite: `tests/unit/modules/messaging/infrastructure/messaging-connection-wizard-queries.test.ts`, con el preload `tests/support/admission-query-counter.mjs` y el transporte de test `tests/support/native-zavu-provider-transport.mjs`. No hay tráfico real al proveedor.
- Build de producción (`next build` + `next start`) de cada revisión, con auth y keyrings sintéticos en memoria (los 6 propósitos).
- Cada corrida usa su propia rama Neon efímera, con el journal completo de migraciones. Las rutas del asistente se calientan una vez sin registrarse (cache caliente).
- Muestras: 3 por paso para crear, configurar y validar; 1 para iniciar la política de uso, emitir y verificar el diagnóstico y activar, porque el diagnóstico tiene límite por líder y solo la última ronda lo emite. Se reporta la mediana.
- Desde esta máquina, cada viaje a Neon tarda unos 170 ms. La métrica principal es la cantidad de viajes secuenciales; los ms dependen de la red.

Datos completos, con todas las muestras de cada corrida: [messaging-wizard-authority-queries.json](messaging-wizard-authority-queries.json).

## Atribución

- **Emitir el diagnóstico** despacha el mensaje con los mismos owners que el código de admisión. Con #148, la preparación y `PostgresCurrentMessagingProvider.read` reutilizan su segunda comprobación de entrega.
- **Configurar** y **validar** abren un inspector del proveedor con la sesión del líder. Cada inspector llama una vez a `PostgresCurrentMessagingProvider.read`, que corre la cadena humana completa dos veces en la misma transacción: actor, usuario, cuenta de Google, sesión, binding de identidad, tribu, líderes, conexión, versión y sobre. Son diez sentencias cada vez. Ahora la segunda es una sola sentencia.

## Iteraciones

Cifras por request (mediana): transacciones, sentencias y viajes secuenciales.

| # | Revisión | Configurar | Validar | Emitir diagnóstico |
|---|---|---|---|---|
| Base | `d4076eec` (#145 integrado) | 10 / 326 / 326 | 12 / 389 / 389 | 15 / 385 / 380 |
| 1 | `306e133b` (#148, reutilización de entregas) | 10 / 326 / 326 | 12 / 389 / 389 | 15 / 367 / 362 |
| 2 | Este cambio (reutilización humana) | 10 / 316 / 316 | 12 / 379 / 379 | 15 / 368 / 363 |

La columna «sentencias» es `queries` del contador (incluye `BEGIN` y `COMMIT`), que es la que limita el presupuesto.

## Antes y después (mediana por request, base contra este cambio)

| Paso | Transacciones | Sentencias | Viajes secuenciales | ms | Delta de viajes |
|---|---|---|---|---|---|
| Iniciar la política de uso | 5 → 5 | 55 → 55 | 55 → 55 | 11.065 → 11.197 | 0 |
| Crear la conexión | 5 → 5 | 60 → 60 | 60 → 60 | 11.913 → 12.015 | 0 |
| Configurar canales | 10 → 10 | 326 → 316 | 326 → 316 | 59.682 → 56.210 | −3,1 % |
| Validar la conexión | 12 → 12 | 389 → 379 | 389 → 379 | 71.768 → 70.702 | −2,6 % |
| Emitir el diagnóstico | 15 → 15 | 385 → 368 | 380 → 363 | 66.520 → 63.951 | −4,5 % |
| Verificar el diagnóstico | 4 → 4 | 195 → 195 | 195 → 195 | 35.182 → 35.931 | 0 |
| Activar la conexión | 4 → 4 | 281 → 280 | 281 → 280 | 49.722 → 49.398 | ruido |

Una segunda corrida de la revisión final, con el presupuesto nuevo activo, dio exactamente las mismas cantidades (configurar 316, validar 379, emitir 368 / 363, activar 280). Emitir el diagnóstico queda una sentencia por encima de la iteración 1 en las dos corridas y activar una por debajo de la base. Esas diferencias de una sentencia aparecen también entre muestras del mismo paso (configurar dio 315 y 316 en la misma corrida) y vienen del calentamiento del pool, como en las mediciones anteriores. Ninguno de esos dos pasos corre una comprobación humana repetida.

La cantidad de transacciones no cambia en ningún paso: los fences, el lease, la idempotencia y el orden de locks siguen igual.

## Garantías probadas con Postgres real

`tests/unit/modules/messaging/infrastructure/messaging-secret-authority-reuse.test.ts`, caso humano (con el fixture `tests/support/messaging-human-secret-authority-fixture.ts`):

- Fuera del alcance, cada comprobación humana sigue siendo completa (10 sentencias). Dentro, la repetida es una sentencia y devuelve los mismos hechos.
- `PostgresCurrentMessagingProvider.read` con contexto humano hace 13 sentencias (antes 22) y devuelve el proveedor guardado.
- Otra sesión y una comprobación con `lockResourcesForWrite` no reutilizan.
- Mientras la autoridad está retenida, otra transacción no puede actualizar la sesión, el binding de identidad, la conexión ni la membresía del líder (`55P03` con `lock_timeout`).
- Un cambio de actor (`app.current_user_id`) y la pérdida del liderazgo en la misma transacción se rechazan con `permission_denied`.
- Un binding invalidado en la misma transacción y una sesión vencida según `clock_timestamp()` se rechazan con `authentication_required`.

Los dos casos de entrega de #148 siguen pasando sin cambios en la misma suite.

## Descartadas

- **Reutilizar entre transacciones.** El `SecretStore` y la segunda transacción de la preparación revalidan después de una espera fuera de la base (credencial, criptografía, llamada al proveedor). Reutilizar sus hechos rompería esa revalidación, así que no se probó.
- **Omitir la revalidación del binding.** Sus filas están bloqueadas `FOR SHARE` y nadie más puede invalidarlo, pero la misma transacción sí. Volver a leerlo cuesta una subconsulta dentro de la misma sentencia, sin viajes extra.

## Presupuesto de regresión

`tests/support/constants/messaging-connection-wizard-queries.ts` venía de la línea base de `1acd4ead` y tenía mucho margen (configurar 436, validar 449, emitir 408 / 403). Ahora cada paso queda en las transacciones medidas y en la muestra más alta de sentencias y viajes más dos:

| Paso | Antes | Ahora |
|---|---|---|
| Iniciar la política de uso | 12 / 136 / 136 | 5 / 57 / 57 |
| Crear la conexión | 12 / 166 / 166 | 5 / 62 / 62 |
| Configurar canales | 19 / 436 / 436 | 10 / 318 / 318 |
| Validar la conexión | 23 / 449 / 449 | 12 / 381 / 381 |
| Emitir el diagnóstico | 18 / 408 / 403 | 15 / 370 / 365 |
| Verificar el diagnóstico | 7 / 218 / 218 | 4 / 197 / 197 |
| Activar la conexión | 7 / 356 / 356 | 4 / 282 / 282 |

## Próximos pasos

1. **Configurar y validar siguen siendo los pasos más caros** (316 y 379 viajes). La reutilización solo quitó la comprobación repetida del inspector. El resto viene de las transacciones del ledger de operaciones y del `SecretStore`; una traza `ADMISSION_QUERY_COUNTER_TRACE` de esos pasos diría dónde está el próximo ahorro.
2. **Proyección de cuenta entre pasos del ledger** (sin cambio, ver [admission-applicant-flow-queries.md](admission-applicant-flow-queries.md)).
