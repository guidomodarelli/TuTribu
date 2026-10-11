# Resolución por pago de una pendiente personal

Evidencia final commiteada y subida en `e075928c`, sobre base `8b959584`, sin cambios de producción. T159 se cierra con todas sus cláusulas originales comprobadas: 157 completas/55 pendientes/212. T153/T156 y los gates conservan sus requisitos propios.

## Preparación y comportamiento real

El fixture opcional de lista crea un solicitante con una membresía silenciada antes de activar el marcador, luego usa la transición comercial real para registrar el snapshot anterior. No inventa una recuperación silenciada a partir de un historial NULL ni agrega privilegios. La preparación predeterminada sigue creando solicitantes sin membresía; su caso Native de canje/salida/pausa pasó después de la extensión.

`preparePersonalPaidMembership` usa emisión y canje reales, sesión/cuenta nativas y los casos de uso de presentación para producir una pendiente personal. La suscripción membership cancelada y sus recursos pertenecen a la misma tribu/cuenta; el único borde controlado devuelve el estado externo autorizado. Las mutaciones de proveedor fallan si alguien intenta invocarlas.

Los tres owners públicos de conciliación —precio, diagnóstico y webhook de miembro— recuperan la misma instancia silenciada preservando rol y fecha. El receipt pago vigente y la cancelación `external_resolution` se confirman juntos: decisión de sistema cancelada, una obligación/aviso y cero efectos de aprobación de admisión. Repetir el owner deja un solo receipt y cierre. Un webhook diferente con el mismo efecto devuelve `duplicate_webhook`, porque el contrato se deduplica por operación de negocio, no por `eventId`.

La invitación sigue canjeada para la misma solicitud/cuenta y el binding permanece idéntico. La salida real posterior revoca y archiva el fundamento pago consumido; el intento nuevo no obtiene membresía usando ese token y el replay antiguo sólo devuelve el resultado original. La política actual después del límite diario se acredita por separado mediante la preparación histórica coherente de `academy-membership-current-policy.test.ts`; no se atribuye esa evaluación al rechazo inmediato por cadencia de este caso nuevo.

## Rollback después del cierre efectivo

El collaborator propio llama al resolver real, observa la pendiente ya cancelada y la instancia muted dentro de la transacción original y provoca PostgreSQL `22012`. La causa SQL se conserva. Después del fallo, instancia, versión/fechas de request, canje, binding y los conteos de decisiones/receipts/avisos son exactamente los anteriores. El retry legítimo del owner confirma un solo receipt, decisión, obligación y aviso; no vuelve a emitir ni liberar el token.

## Evidencia ejecutada

- Price: un caso aprobado y dos excluidos por filtro, `codex-t159-personal-paid-first-native.json`.
- Diagnostics: un caso aprobado dentro de `codex-t159-personal-paid-other-owners-native.json`; el fallo del segundo procesamiento webhook se corrigió según su contrato y no se presenta como aprobado por esa corrida.
- Member/webhook corregido: un caso aprobado y dos excluidos, `codex-t159-personal-paid-webhook-fixed-native.json`.
- Rollback con staging real/causa SQL/retry: un aprobado sin omisiones, `codex-t159-personal-paid-rollback-native.json`.
- Compatibilidad de la preparación predeterminada: un aprobado sin omisiones, `codex-t159-historical-fixture-compatibility-native.json`.

Después de la review se reforzaron los resultados públicos: ambas llamadas de price y diagnostics, y el retry posterior al rollback, deben devolver `verified`/`verifiedCount:1`. Los tiempos de aceptación y actualización de suscripción se inicializan con reloj PostgreSQL actual, coherentes con la cuenta y el `created_at` recién creados; no se modifican después para facilitar el test. La ejecución final `codex-t159-paid-public-results-final-native.json` acredita los tres entrypoints sin filtros ni omisiones; `codex-t159-paid-rollback-final-native.json` acredita el rollback/retry con esos mismos bytes. Ambas sesiones terminan exit0, igual que la compatibilidad predeterminada. Los resultados anteriores son sólo diagnóstico/avance y no sustituyen estos receipts finales.

Se acreditan cuatro casos nuevos y una compatibilidad, con recursos propios cerrados. Typecheck de tests y lint pasan. El mismo reviewer cierra los cuatro tests/helpers sin hallazgos accionables, manifiesto `9423E847977C5842C1EC47839EEAED7388591230EC4805878131ABC838CC17B5`; el soporte de siete archivos tiene manifiesto `C0D0D09C66D7C2FA9A1AB14955DE3F9C9B66BB91B343F3AE6B462D235D8AE99B`. No se cambió schema, API, SDK ni reglas de producto; no corresponde una nueva entrada de changelog por esta ampliación de evidencia.

El reviewer contrastó cada cláusula original de T159 con las fuentes y evidencia existente de owner/moderación/salida, fundamento básico y política actual, además de los receipts pagos/canje/rollback finales. No identificó otra brecha propia de T159; el soporte final de siete archivos conserva el manifiesto `05826F7965CFA2D2E58FC47C77666783E0E4D3B70587CF1E520EC4AEF707C704`.

| Cláusula original de T159 | Evidencia propietaria |
|---|---|
| Eventos de miembros/moderación/salida | Owners reales, cancelación segura y revocación básica; `membership-owner-lifecycle-baseline.md` y Native de bloqueo, salida, CAS, recovery y liderazgo transferido. |
| Pago legítimo sin aprobación ficticia | Tres entrypoints actuales, resultados públicos `verified`/`processed`, decisión de sistema y cero efecto de admisión; rollback real tras staging. |
| Token consumido | Canje y binding conservados tras pago y salida; replay histórico no crea otra membresía. |
| Nueva entrada según política actual | `academy-membership-current-policy.test.ts` y receipt `codex-t156-current-policy-contract-native.json`, con historia coherente y límite diario realmente cumplido. |

Los cuatro manuales/índices registran SourceTrace a `e075928c` con cuatro diffs finales sin desvío. La QA final confirma 16 renders y 28 recorridos Chromium/WebKit a 1280/390, cero errores/desbordes, scripts preservados y los 46 frames de admisión más el frame de miembros intactos. Los helpers estáticos terminan exit0. Sus advertencias conservan el script de navegación previo ya validado, documento local sin URL publicada y ausencia de catálogo central de traducciones; no se cambia su contenido sólo para silenciarlas. T153/T156 mantienen sus matrices completas y gates; ningún resultado aquí acredita activación de producción, ensayo con un pagador externo, rollout o la totalidad de SC-019.
