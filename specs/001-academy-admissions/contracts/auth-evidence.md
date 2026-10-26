# Auth Evidence Contract

**Owner**: `auth`; adapters/plugins server-only. Mantiene Google/Better Auth existentes y su sesión; no agrega un login, recuperador global ni factor BYOK. [Research R-04](../research.md), [modelo A](../data-model.md).

## Captura verificable

`GoogleIdTokenEvidenceVerifier` delega al `verifyIdToken` del proveedor Google real de Better Auth `1.6.11`; el plugin conserva referencias originales y OAuth/state/PKCE. Antes de verificar, lectura mínima de header exige `alg=RS256`; la versión instalada toma algoritmo del header y no debe describirse como pin fijo propio. Un false no revela causa/JWKS: fallo propio seguro sin causa inventada. Si existe excepción real, solo servidor conserva su causa.

Después de verificación satisfactoria se consume el perfil del mismo token/callback y se deriva un contrato propio mínimo. Nada de schema completo del perfil upstream, `tokeninfo` productivo o confiar en `mapProfileToUser` de un JWT decodificado. Se comprueban cuenta/sujeto/email y se enlaza evidencia con el usuario/account correctos tras completar la sesión.

El plugin usa `AuthContext.socialProviders` y hooks con `newSession/getOAuthState`. La captura usa `AsyncLocalStorage` de `node:async_hooks`, dentro de auth: el wrapper del handler existente llama `run(store, callback)` y el proveedor/hooks leen `getStore()`. No usar `enterWith/disable`, una variable mutable del contexto global del plugin ni un fallback global si falta scope. Workers con `nodejs_compat` documenta run/getStore; la integración real Node/Workers se prueba posteriormente. Un plugin captura referencias estáticas, no una clave/usuario mutable. [AsyncLocalStorage en Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/).

## Puerto de application

`AuthenticatedAccountProvider` entrega snapshot interno: `userId`, correo actual normalizado del servidor, referencia de cuenta/sesión, evidencia propia clasificada y versión/fecha/invalidation. *Desde el 2026-10-19 no incluye evidencia de autenticación reciente.* No incluye token/JWT/claims raw/headers. `AuthenticatedMemberResult` sigue siendo presentación; permisos de tribu se resuelven desde membresía actual, no su rol en browser.

| Fuente | Uso permitido |
| --- | --- |
| Gmail con token verificado y señales exigidas | Evidencia base para contacto actual de la cuenta |
| Workspace verificado con hosted domain acreditado | Evidencia base, sin inventar hd desde formulario |
| Externo/claims insuficientes | Login válido cuando corresponda; contacto no acreditado para automático/nominativo OFF |
| Prueba local ON | Solo cuenta/tribu/contacto/propósito/época propios; siempre exigida aunque Google acredite correo |
| Contacto declarado/manual OFF común | Solicitud de cuenta autenticada, sin vínculo/etiqueta de verificado |

Cambiar correo/cuenta/sujeto o invalidación actual impide usar evidencia anterior. Capturas antiguas se conservan como historia mínima; no reutilizar token vencido para backfill ni introducir expiración de una hora a toda solicitud. Sin captura acreditada el resultado es insuficiente y no se llama al proveedor en cada render.

## Operaciones sensibles (decisión 2026-10-19)

Ninguna operación sensible pide volver a autenticarse con Google. Cada comando sensible de admisiones, mensajería o ciclo de vida de tribu se autoriza con:

1. Sesión activa de Better Auth, revalidada en el servidor (vigencia e invalidación), y rol/estado actuales del líder sobre la tribu y el recurso (o del guardián donde ese rol ya aplica). Los permisos se resuelven desde la membresía actual, nunca desde datos del browser.
2. Para operaciones con credenciales de mensajería, el vínculo de sesión Google (`global_session_identity_bindings`) creado al iniciar sesión. Si falta, la respuesta es `authentication_required`; no es una exigencia de recencia.
3. La confirmación explícita que la acción ya tiene en la UI (casilla o diálogo de consentimiento, motivo, etc.) y la operación sensible que declara (`sensitiveOperation`, tipada con `REAUTHENTICATION_OPERATION`/`ReauthenticationOperation`, que conservan su nombre porque se persisten en auditorías). Una acción que debe declararla y no lo hace recibe `invalid_input`.
4. El chequeo de origen (CSRF) de `src/modules/shared/infrastructure/http/has-allowed-request-origin.ts`, directo o mediante `hasAllowedAdmissionOrigin`, en cada ruta sensible: política, lista de habilitados, importación, invitaciones personales, mutaciones de admisión (incluido el reintento), ajustes de avisos por correo, todos los handlers de mensajería (conexiones, configuración, validación de credenciales, diagnóstico, activación, ciclo de vida, uso, recuperación de avisos) y ciclo de vida de tribu. La conciliación de entregas (`ReconcileMessageDeliveryUseCase`) no tiene ruta HTTP pública. El guard acepta pedidos sin cabecera `Origin` (clientes que no son navegador); la autenticación sigue siendo obligatoria aparte.

Cada operación vuelve a evaluar sesión vigente, líder activo/recurso y retirada antes de `SecretStore`. Perfil del browser, cookie renovada, diagnóstico Zavu y OTP local no conceden autoridad. El plugin de Google solo verifica el ID token y captura la identidad base al iniciar sesión (OG-01).

`reauthentication_required` se conserva en uniones, esquemas y mapas HTTP solo por compatibilidad (aparece en CHECK de auditoría de migraciones); ningún servidor lo emite. Su texto visible es "Tu sesión cambió. Recargá la página e intentá de nuevo." y, si la UI lo recibe de un servidor viejo, lo muestra como error genérico conservando el original.

**Riesgo aceptado**: una sesión robada del líder podría operar secretos y acciones sensibles (guardar o rotar la clave de Zavu, activar canales, borrar la tribu) sin otra barrera que la confirmación explícita de la UI. La mitigación queda en la vigencia e invalidación de la sesión, la cookie httpOnly/secure, el chequeo de origen (CSRF), el bloqueo por líder canónico y la auditoría.

### Antecedente retirado (decisión 2026-10-18)

*Retirado el 2026-10-19.* El contrato anterior exigía, para cada operación sensible, un intento propio con nonce controlado por el servidor, una respuesta OAuth nueva de Google ligada a ese intento (`iat` dentro del intento, ventana de diez minutos) y la emisión de `RecentAuthenticationEvidence`; a su vez había sustituido una regla previa basada en `auth_time` reciente. Se retiraron la página `/auth/reauthenticate`, la API `/api/auth/reauthentication/intents`, el DTO de intento y todo el flujo de intents/nonce. Las tablas `recent_authentication_evidence` y `global_reauthentication_intents` quedan sin uso hasta su borrado en una fase posterior (sin migración en esta fase).

No se inventan `google.claims` ni `signIn.social({prompt,max_age})`: esas opciones no existen en la interfaz instalada. Una cuenta distinta no obtiene autorización ni consume una invitación. No se añade un autenticador propio ni un factor BYOK.

## Público y diagnóstico

El éxito del browser no es evidencia. Params/body propios se validan en boundary; el verificador hace comprobaciones criptográficas/protocolo, no revalidación general de payload proveedor. *Retirado el 2026-10-19: el DTO público de intento (`intentId`, `state`, `safeMessage`, `validUntil?`) dejó de existir junto con la API de intents.*

Logs de callback: operación/code/correlation, nunca authorization code, token, raw URL o profile completo. Evidencia de cuenta y diagnóstico de mensajería no se exportan como atributos de seguridad global ni props de página.

## Casos de contrato

Firma/header/issuer/audience/exp/sub incorrectos; claims ausentes; Gmail/Workspace/external; correo cambiado; callback concurrente A/B; state/PKCE conservados; false del SDK sin causa inventada; sesión revocada o liderazgo perdido antes de comando; vínculo de sesión Google ausente (`authentication_required`); origen no permitido; acción sensible sin `sensitiveOperation` (`invalid_input`); cuenta distinta; perfil de browser marcado verified sin efecto; ON obligatorio/OFF sin código oculto; tokens/claims/secrets ausentes en salida. Ejecutar Better Auth/verificador reales y transporte/JWKS de prueba en borde propio, crypto real y persistencia de prueba; no mocks de biblioteca ni tests de texto de fuente.

Los casos de claims ausentes siguen aplicando a identidad/contacto y a los campos requeridos de firma, sujeto, emisión y expiración del ID token verificado al iniciar sesión. *Retirado el 2026-10-19: los casos propios de la confirmación sensible con Google (token anterior al intento, replay del intento, ventana de diez minutos) dejaron de aplicar.*
