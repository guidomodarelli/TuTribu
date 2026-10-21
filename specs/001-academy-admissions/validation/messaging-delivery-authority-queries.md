# Viajes a la base en el despacho del código de verificación

Optimización medida de la cadena de autoridad de la entrega de mensajería dentro de las transacciones de intento del despacho del código. Sigue al próximo paso 1 de [admission-applicant-flow-queries.md](admission-applicant-flow-queries.md) y usa el mismo protocolo. Las decisiones están en `docs/architecture/tenant-messaging.htm#worker-secret-authority-reuse`.

## Protocolo

- Suite: `tests/unit/modules/academy-admissions/infrastructure/admission-applicant-queries.test.ts`, con el preload `tests/support/admission-query-counter.mjs`.
- Build de producción (`next build` + `next start`) de cada revisión, con auth y keyrings sintéticos en memoria (los 6 propósitos).
- Cada corrida usa su propia rama Neon efímera, con el journal completo de migraciones, y cada ruta se calienta una vez sin registrarse (cache caliente).
- Muestras: 3 por flujo, salvo emitir y verificar código, que tienen 6. Se reporta la mediana; con una cantidad par, es el promedio de las dos muestras centrales, redondeado hacia abajo.
- El código sale por correo a través del transporte de test `tests/support/native-zavu-provider-transport.mjs`. No hay envíos reales.
- Desde esta máquina, cada viaje a Neon tarda unos 170 ms. La métrica principal es la cantidad de viajes secuenciales; los ms dependen de la red.

La línea base es `d4076eec` (#145 integrado) y reproduce las cifras finales de ese PR. Datos completos, con todas las muestras de cada corrida: [messaging-delivery-authority-queries.json](messaging-delivery-authority-queries.json).

## Atribución en la línea base

La traza `ADMISSION_QUERY_COUNTER_TRACE` de una muestra central de **emitir código** (276 sentencias, 17 transacciones) mostró que `authorizeMessagingSecret` corre seis veces por request, con diez sentencias cada vez: actor, origen de la entrega, tribu `FOR SHARE`, líderes activos, conexión, versión, entrega, intento, reserva de uso y sobre del secreto.

- Dos veces en la transacción de `PostgresVerificationDeliveryPreparation.prepare`: antes de leer el código protegido y después de abrirlo.
- Dos veces en la transacción de `PostgresCurrentMessagingProvider.read`: antes y después de leer el proveedor.
- Una vez en la segunda transacción de la preparación y una en la del `SecretStore`. Son transacciones aparte, así que no hay locks que reutilizar.

## Iteraciones

Cada iteración se construyó y midió por separado con el mismo protocolo. Cifras de emitir código por request (mediana): transacciones, sentencias y viajes secuenciales.

| # | Cambio | Emitir código |
|---|---|---|
| Base | `d4076eec` | 17 / 276 / 271 |
| 1 | `withReusedMessagingSecretAuthority` en la transacción de la preparación: la segunda comprobación es una sentencia | 17 / 267 / 262 |
| 2 | Lo mismo en `PostgresCurrentMessagingProvider.read` | 17 / 258 / 253 |

La traza de la iteración 2 muestra, en cada una de las 6 muestras, 2 comprobaciones reutilizadas y 4 completas.

## Antes y después (mediana por request)

| Flujo | Transacciones | Sentencias | Viajes secuenciales | ms | Delta de viajes |
|---|---|---|---|---|---|
| Emitir código de verificación | 17 → 17 | 276 → 258 | 271 → 253 | 48.495 → 45.835 | −6,6 % |
| Verificar código | 5 → 5 | 99 → 99 | 99 → 99 | 18.872 → 18.471 | 0 |
| Canjear invitación (envío con token) | 3 → 3 | 86 → 86 | 86 → 86 | 16.412 → 16.365 | 0 |
| Enviar solicitud | 3 → 3 | 76 → 76 | 76 → 76 | 14.797 → 14.821 | 0 |
| Página de entrada por invitación | 1 → 1 | 38 → 37 | 38 → 37 | 8.680 → 7.053 | ruido |
| Resumen de invitación (API) | 1 → 1 | 37 → 37 | 37 → 37 | 7.230 → 7.013 | 0 |
| Página de entrada pública | 1 → 1 | 18 → 19 | 18 → 19 | 3.063 → 4.145 | ruido |
| Solicitud propia (API) | 2 → 2 | 17 → 17 | 17 → 17 | 2.807 → 2.818 | 0 |
| Página de solicitud propia | 0 → 0 | 2 → 2 | 2 → 2 | 344 → 384 | 0 |

Una segunda corrida de la revisión final, con el presupuesto nuevo activo, dio emitir código 17 / 257 / 252 (44.688 ms) y los demás flujos dentro de una sentencia de las cifras de arriba. Los flujos sin cambio de código varían hasta una sentencia entre corridas (calentamiento del pool), como en las mediciones anteriores. Solo emitir código despacha un mensaje, así que es el único flujo afectado.

La cantidad de transacciones no cambia: los fences, el lease, la idempotencia, el orden de locks y el claim focal siguen igual.

## Garantías probadas con Postgres real

`tests/unit/modules/messaging/infrastructure/messaging-secret-authority-reuse.test.ts`:

- Fuera del alcance, cada comprobación sigue siendo completa (10 sentencias). Dentro, la repetida es una sentencia y devuelve los mismos hechos.
- Otro intento (otra versión del intento) y una comprobación con `lockResourcesForWrite` no reutilizan.
- Mientras la autoridad está retenida, otra transacción no puede actualizar la entrega, el intento, la conexión ni la membresía del líder (`55P03` con `lock_timeout`).
- Un cambio de actor (`app.current_user_id`) y la pérdida del liderazgo en la misma transacción se rechazan con `permission_denied`. Un lease vencido según `clock_timestamp()` se rechaza con `resource_unavailable`.
- En una entrega agrupada de avisos, el guard de grupo inyectado corre en cada comprobación y las dos son completas.

## Descartadas

- **Reutilizar entre transacciones.** La segunda transacción de la preparación y la del `SecretStore` existen para revalidar después de una espera fuera de la base (lectura de la credencial, criptografía). Reutilizar sus hechos rompería esa revalidación, así que no se probó.
- **Reutilizar comprobaciones humanas o con locks exclusivos.** Las humanas dependen de la sesión, que tiene su propio guard. Las que usan `lockResourcesForWrite` escriben después sobre las filas que bloquean, así que siempre corren completas.

## Presupuesto de regresión

`tests/support/constants/admission-applicant-queries.ts` baja emitir código a 17 transacciones, 260 sentencias y 255 viajes secuenciales: la muestra más alta (258 / 253) más dos. Los demás flujos no cambian.

## Próximos pasos

1. **Proyección de cuenta entre pasos del ledger** (sin cambio, ver [admission-applicant-flow-queries.md](admission-applicant-flow-queries.md)).
2. **Despacho del diagnóstico de conexión.** Usa los mismos owners con propósito de entrega, así que también debería ahorrar las dos comprobaciones repetidas por envío. No se midió acá: corresponde a la suite `messaging-connection-wizard-queries` y a su presupuesto, que sigue siendo un máximo válido.
3. **Comprobaciones humanas repetidas.** `PostgresCurrentMessagingProvider.read` también corre dos veces la cadena humana (`sensitive_leader`) cuando la pide el asistente de conexión. Reutilizarla exige revalidar además la sesión y su binding de identidad, así que queda para su propio PR con medición.
