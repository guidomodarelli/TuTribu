# Viajes a la base en el flujo del solicitante

Optimización medida del flujo del solicitante: entrada pública, entrada y resumen por invitación, emisión y verificación del código, envío, canje de invitación personal y solicitud propia. Sigue al hallazgo 2 de [admission-flow-queries.md](admission-flow-queries.md) y usa el mismo protocolo. Las decisiones están en `docs/architecture/academy-admissions.htm#applicant-flow-round-trips`.

## Protocolo

- Suite: `tests/unit/modules/academy-admissions/infrastructure/admission-applicant-queries.test.ts`, con el preload `tests/support/admission-query-counter.mjs`.
- Build de producción (`next build` + `next start`) de cada revisión, con auth y keyrings sintéticos en memoria.
- Cada corrida usa su propia rama Neon efímera, con el journal completo de migraciones, y cada ruta se calienta una vez sin registrarse (cache caliente).
- Muestras: 3 por flujo, salvo emitir y verificar código, que tienen 6 (3 solicitudes comunes y 3 por invitación). Se reporta la mediana. Con una cantidad par, es el promedio de las dos muestras centrales, redondeado hacia abajo.
- El código sale por correo a través del transporte de test `tests/support/native-zavu-provider-transport.mjs`. No hay envíos reales.
- Desde esta máquina, cada viaje a Neon tarda unos 170 ms. La métrica principal es la cantidad de viajes secuenciales; los ms dependen de la red.

La línea base es `72b01991`, con el guard SQL del líder (#139), los guards de mensajería (#140) y la proyección de cuenta en una sentencia (#142) ya integrados. Por eso las cifras de partida son menores que las de `1acd4ead` en `admission-flow-queries.md`. Datos completos, con todas las muestras de cada corrida: [admission-applicant-flow-queries.json](admission-applicant-flow-queries.json).

## Atribución en la línea base

La traza `ADMISSION_QUERY_COUNTER_TRACE` de la muestra central de **emitir código** (434 sentencias, 17 transacciones) mostró:

- El guard del solicitante: actor, `tribes FOR SHARE`, `user FOR SHARE`, `session FOR SHARE`, `read_authenticated_account` y `clock_timestamp()`. Son seis viajes por llamada y corría 30 veces: 180 sentencias.
  - 17 llamadas ocurrían en la transacción de efecto (229 sentencias).
  - El owner que lo repite es `PostgresAdmissionContactVerificationOperations.authorize`. Lo invocan `issuanceScope` y `policy()`, y también `ownsScope`, que corre en cada callback de autoridad del emisor (`PostgresContactVerificationIssuer.isAuthorized`) y de los presupuestos de contacto y de request, después de cada espera y de cada paso criptográfico.
  - `ownsScope` autorizaba y después llamaba a `policy()`, que volvía a autorizar: dos guards completos seguidos por callback.
- La política del solicitante: ajustes `FOR SHARE`, política `FOR SHARE` y marcador de la tribu. Son tres viajes por `policy()`, 11 veces: 33 sentencias.
- Una tercera copia del guard, `PostgresAdmissionVerificationDispatchContext.authorize`, que corría dos veces en la transacción que resuelve el despacho.
- El resto es trabajo propio y el despacho de mensajería: claim, lease, intento y reserva, y la cadena de autoridad de la entrega repetida dentro de cada transacción de intento.

Verificar código repetía el mismo patrón, con 174 sentencias en 5 transacciones.

## Iteraciones

Cada iteración se construyó y midió por separado con el mismo protocolo. Cifras por request (mediana): transacciones, sentencias y viajes secuenciales.

| # | Cambio | Emitir código | Verificar código |
|---|---|---|---|
| Base | `72b01991` | 17 / 434 / 429 | 5 / 174 / 174 |
| 1 | Autoridad del solicitante reutilizada dentro de cada transacción (`withReusedAdmissionApplicantAuthority`), sin registrar chequeos hechos dentro del savepoint de emisión | 17 / 313 / 308 | 5 / 114 / 114 |
| 2 | Un solo chequeo antes de la política (`ownsScope`, `issuanceScope`, `challengeScope`) y reutilización en el contexto de despacho | 17 / 298 / 293 | 5 / 109 / 109 |
| 3 | Ajustes, política y marcador en una sentencia (`readLockedAdmissionPolicyGate`) | 17 / 276 / 271 | 5 / 99 / 99 |

## Antes y después (mediana por request)

| Flujo | Transacciones | Sentencias | Viajes secuenciales | ms | Delta de viajes |
|---|---|---|---|---|---|
| Emitir código de verificación | 17 → 17 | 434 → 276 | 429 → 271 | 72.888 → 47.824 | −36,8 % |
| Verificar código | 5 → 5 | 174 → 99 | 174 → 99 | 31.001 → 18.113 | −43,1 % |
| Canjear invitación (envío con token) | 3 → 3 | 86 → 86 | 86 → 86 | 16.160 → 16.158 | 0 |
| Enviar solicitud | 3 → 3 | 76 → 76 | 76 → 76 | 14.778 → 14.525 | 0 |
| Página de entrada por invitación | 1 → 1 | 37 → 37 | 37 → 37 | 7.079 → 7.225 | 0 |
| Resumen de invitación (API) | 1 → 1 | 37 → 37 | 37 → 37 | 7.108 → 6.972 | 0 |
| Página de entrada pública | 1 → 1 | 18 → 18 | 18 → 18 | 3.053 → 2.935 | 0 |
| Solicitud propia (API) | 2 → 2 | 17 → 17 | 17 → 17 | 2.699 → 2.806 | 0 |
| Página de solicitud propia | 0 → 0 | 2 → 2 | 2 → 2 | 337 → 342 | 0 |

Una segunda corrida de la revisión final, con los presupuestos nuevos activos, dio las mismas transacciones, sentencias y viajes secuenciales en todos los flujos. Los flujos sin cambios de código quedan dentro del ruido: hasta una sentencia de diferencia entre corridas, y en ms la diferencia viene de la red. Enviar y canjear ya usaban la autoridad consolidada del envío (`read_locked_admission_submission_actor`), así que el guard repetido no los afectaba. La cantidad de transacciones no cambia en ningún flujo: los fences del ledger, el claim previo al efecto, el lease y la idempotencia siguen igual.

## Descartadas

- **Juntar transacciones de la emisión.** Las transacciones previas al efecto son la lectura del ledger, el preflight sin claim y el claim. Cada una cumple un rol en el contrato de idempotencia y recuperación: una denegación no deja claim, y el claim queda confirmado antes del efecto. Juntarlas cambiaría ese contrato, así que no se probó.
- **Saltear el chequeo de actor del emisor.** `PostgresContactVerificationIssuer.isAuthorized` y los presupuestos de mensajería consultan el actor antes del callback de autoridad. Esos owners también los usa el diagnóstico de conexión de mensajería, así que se mantienen.

## Presupuesto de regresión

`tests/support/constants/admission-applicant-queries.ts` baja a la medición final. Para cada flujo, toma la muestra más alta en transacciones, y la muestra más alta más dos en sentencias y viajes secuenciales. También quedan alineados a `72b01991` los flujos que bajaron con #139, #140 y #142 sin ajustar su presupuesto.

## Próximos pasos

1. **Cadena de autoridad de la entrega de mensajería en el despacho del código.** Resuelto: ver [messaging-delivery-authority-queries.md](messaging-delivery-authority-queries.md).
2. **Proyección de cuenta entre pasos del ledger.** Hoy corre fuera de transacción, entre lectura, preflight, claim y efecto. Por la restricción de no memoizarla entre llamadas, queda como está.
