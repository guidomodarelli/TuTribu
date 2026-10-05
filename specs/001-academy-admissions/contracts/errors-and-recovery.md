# Errors and Recovery Contract

**Estado**: diseño para implementación. Aplica a input → aplicación → adapter → HTTP → consumer/worker, con diagnóstico separado. [HTTP](http-api.md), [mensajería](messaging-provider.md), [modelo](../data-model.md).

## Contrato propio

Errores esperados se representan con códigos discriminados por dominio y metadata explícita; no imponer una jerarquía global de clases. Un wrapper que recibe excepción real conserva `cause` internamente; un booleano de verificador no permite inventar causa. Application/domain no dependen de HTTP status. Infraestructura normaliza `unknown` una vez por operación y el boundary final proyecta una respuesta nueva.

Error público: `code`, `message` de catálogo español, `requestId`, `fields?` con nombres allowlisted, `retryAt?` y `operation?` con progreso autorizado mínimo cuando realmente existe. Nunca `cause`, stack, SDK response/request, headers, cookie, token, ciphertext, código OTP, contacto ajeno, nota interna o metadata arbitraria.

| Código semántico | Status público inicial | Recuperación/efecto |
| --- | --- | --- |
| `invalid_input` | 400 | Corregir campos; ninguna aceptación ni envío |
| `authentication_required` | 401 | Login global y regreso seguro; no consumir invitación |
| `permission_denied` | 403 | Revalidar cuenta/rol; sin acceso cruzado ni retry de disponibilidad |
| `resource_unavailable`, `invitation_unavailable` | 404 o 403 genérico según recorrido | No identificar destinatario/cuenta ni distinguir recurso ajeno de ausente |
| `policy_conflict`, `request_conflict`, `idempotency_conflict` | 409 | Estado mínimo actual autorizado; nueva confirmación explícita, no reemplazar versión |
| `contact_evidence_required`, `additional_verification_required` | 409 | Paso de prueba pertinente; OFF no inicia código oculto |
| `contact_binding_conflict` | 409 | Recuperación de cuenta/ayuda segura; no reclamar contacto ni revelar owner |
| `challenge_expired`, `challenge_invalidated`, `proof_unavailable` | 409 | Pedir nuevo desafío solo por acción y cupos; no reset de pendientes |
| `verification_attempts_exceeded`, `usage_limit_reached` | 429 | Espera segura sin consumo ajeno; código vigente puede validarse cuando solo agotó envío |
| `verification_code_incorrect` | 422 | Fallo contado autoritativamente; no mensaje del proveedor |
| `reauthentication_required` | 401 | Recorrido global específico; claims ausentes/antiguos no se sustituyen por BYOK |
| `admissions_paused`, `admission_ineligible` | 403/409 según operación | Consulta/rechazo/cancelación compatibles; no pérdida de solicitud |
| `membership_recovery_required` | 409 | Snapshot desconocido/rol privilegiado requiere resolución de membresía autorizada; no estado inventado |
| `connection_incomplete`, `missing_capability`, `invalid_credentials` | 409 | Líder corrige conexión; solicitante recibe mensaje mínimo de capacidad no preparada |
| `upstream_rejected` | 409/422 por razón propia | Rechazo contractual/permiso/destino: corregir causa, sin retry por recuperación del servicio |
| `provider_rate_limited` | 429/503 según operación propia | `retryAt` acotado, presupuesto/vigencia; nunca asumir cuota monetaria |
| `transport_timeout`, `dependency_unavailable` | 503 para lectura/preflight sin mutación | Causas separadas, fallback seguro; consulta puede reintentarse con límite |
| `delivery_unknown` | Estado de entrega/operación durable, no éxito de recepción | Posible efecto externo; preservar identidad y cupo; no POST ciego |
| `operation_unresolved` | 202/409 con operación realmente registrada | Consultar ledger antes de mutar; no inventar un run ni afirmar ausencia de commit |
| `upstream_payload_unusable` | 502 | Mapper no puede consumir los campos necesarios; fallo controlado sin revalidación completa ni body raw |
| `public_contract_unusable`, `unexpected_failure` | 500 en boundary servidor | Fallo propio de DTO/invariante; log sanitizado/correlation y browser conserva último estado con feedback recuperable |

El catálogo final vive en constantes/copy del owner, reutilizando convenciones de HTTP/logger existentes. La tabla es mapping propio por operación, no copia automática de status upstream. Razones específicas del proveedor se conservan solo dentro del adapter y se traducen según audience.

## Clasificación del adapter

Primero transporte/status/discriminador mínimo reconocido; después razón propia y fallback seguro. No usar `error.message` como contrato. `400/422` con palabra timeout sigue siendo rechazo. `401/403` del proveedor no concede/deniega auth local por sí solo: indica credencial/acceso/capacidad a corregir. `402`/falta de saldo se muestra solo con detalle autorizado al líder. Rate limit y timeout son distintos.

Un payload que el mapper no puede consumir produce fallo controlado, sin schema completo de respuesta del proveedor ni body raw. Los schemas de inputs y DTOs públicos propios siguen la regla canónica; no hay una segunda allowlist completa del upstream. Un estado desconocido de mensaje se mapea a transporte incierto y nunca a contacto verificado.

Logs: operación/etapa/código/HTTP status seguro, request/trace id, IDs internos mínimos y conteos agregables. Sanitizar la causa antes del logger; apagar cuerpos HTTP y SDK debug en operaciones sensibles. Métricas registran outcomes de negocio, no una serie por excepción, contacto o rethrow.

## Inicio, progreso y resultado

- Input/auth rechazado antes de aceptar: no operation/run inventado, `accepted=0`; corregir causa.
- Intención/claim persistido y outcome todavía no confirmado: identidad estable y estado indeterminado; consultar/reanudar esa operación.
- DB-only decisión/lote: efecto de negocio y resultado final atómicos. Error esperado por fila puede producir mixed confirmado; una caída de transacción no acredita filas parcialmente confirmadas. Commit perdido se reconcilia con ledger.
- CSV chunked: filas confirmadas permanecen; failure posterior conserva resultado y rows pendientes. Retry solo unidades elegibles no confirmadas, revalidando versiones/datos.
- Lote final con todo rechazado: terminal `all_rejected`, no partial ni disponibilidad. Mixed distingue éxitos y conflictos; el usuario revisa lo restante, sin repetir éxitos.
- Estado terminal no continúa polling ilimitado porque contiene fallos. Operaciones indeterminadas tienen consulta acotada y acción manual; deadline no prueba que la mutación no existió.

## Entrega externa y cancelación

`send_authorized_at/in_flight` se persiste antes de RPC. Si muere/vence lease después, se conserva posible envío. Solo evidencia propia de que nunca salió permite liberar/reclamar como no despachado. Lease y idempotency key locales no prueban dedupe externo.

Sin ventana/scope/payload de deduplicación verificados, `unknown` no se rePOSTea. `messages.retrieve` solo con ID propio. Un `409` necesita correlación del mismo intento y huella; no basta aceptar cualquier conflicto. Resend del usuario crea otro desafío/código y consume cuota; el anterior se invalida. Recuperación de notificaciones con otra conexión de la misma tribu exige acción/auditoría y no promete exactamente una entrega externa.

Abort intencional de lectura/polling: limpiar controller/listeners/timers, no toast ni setState stale. Abort del browser durante escritura: conservar operation id y reconciliar al regresar, sin afirmar rollback. El emisor durable usa su deadline/lease y revalida los permisos; no depende de que la pestaña siga abierta. Suspensión/pausa detiene nuevos despachos, no retira un mensaje ya aceptado.

## UX y pruebas exigidas

Feedback español persistente por campo/acción más toast cuando corresponde; distinguir pendiente, conflicto, error, progreso parcial e incierto. No borrar rows/resultado aceptado al mostrar error ni cerrar el formulario silenciosamente. Limpiar feedback obsoleto al corregir y separar error de consulta de fallo de escritura.

Casos: unknown throw/string/null; status sobre mensaje; DTO público inválido/extra secreto; 4xx con texto timeout; todos/algunos/cero outcomes; respuesta perdida tras commit; CSV con bloque fallido; cuotas y última reserva concurrentes; abort sin toast; nonce/tribu/propósito cruzados; resultado SDK incierto y 409 no correlacionable; rol perdido; lease vencida antes/después del marker; logs/DTO sin secretos o nota interna. Usar validadores/SDK reales y dobles solo en puertos/transporte propios, sin tests de texto interno de archivos.
