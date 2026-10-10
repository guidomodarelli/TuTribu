# Auth Evidence Contract

**Owner**: `auth`; adapters/plugins server-only. Mantiene Google/Better Auth existentes y su sesión; no agrega un login, recuperador global ni factor BYOK. [Research R-04](../research.md), [modelo A](../data-model.md).

## Captura verificable

`GoogleIdTokenEvidenceVerifier` delega al `verifyIdToken` del proveedor Google real de Better Auth `1.6.11`; el plugin conserva referencias originales y OAuth/state/PKCE. Antes de verificar, lectura mínima de header exige `alg=RS256`; la versión instalada toma algoritmo del header y no debe describirse como pin fijo propio. Un false no revela causa/JWKS: fallo propio seguro sin causa inventada. Si existe excepción real, solo servidor conserva su causa.

Después de verificación satisfactoria se consume el perfil del mismo token/callback y se deriva un contrato propio mínimo. Nada de schema completo del perfil upstream, `tokeninfo` productivo o confiar en `mapProfileToUser` de un JWT decodificado. Se comprueban cuenta/sujeto/email y se enlaza evidencia con el usuario/account correctos tras completar la sesión.

El plugin usa `AuthContext.socialProviders` y hooks con `newSession/getOAuthState`. La captura usa `AsyncLocalStorage` de `node:async_hooks`, dentro de auth: el wrapper del handler existente llama `run(store, callback)` y el proveedor/hooks leen `getStore()`. No usar `enterWith/disable`, una variable mutable del contexto global del plugin ni un fallback global si falta scope. Workers con `nodejs_compat` documenta run/getStore; la integración real Node/Workers se prueba posteriormente. Un plugin captura referencias estáticas, no una clave/usuario mutable. [AsyncLocalStorage en Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/).

## Puerto de application

`AuthenticatedAccountProvider` entrega snapshot interno: `userId`, correo actual normalizado del servidor, referencia de cuenta/sesión, evidencia propia clasificada, versión/fecha/invalidation y autenticación reciente cuando está acreditada. No incluye token/JWT/claims raw/headers. `AuthenticatedMemberResult` sigue siendo presentación; permisos de tribu se resuelven desde membresía actual, no su rol en browser.

| Fuente | Uso permitido |
| --- | --- |
| Gmail con token verificado y señales exigidas | Evidencia base para contacto actual de la cuenta |
| Workspace verificado con hosted domain acreditado | Evidencia base, sin inventar hd desde formulario |
| Externo/claims insuficientes | Login válido cuando corresponda; contacto no acreditado para automático/nominativo OFF |
| Prueba local ON | Solo cuenta/tribu/contacto/propósito/época propios; siempre exigida aunque Google acredite correo |
| Contacto declarado/manual OFF común | Solicitud de cuenta autenticada, sin vínculo/etiqueta de verificado |

Cambiar correo/cuenta/sujeto o invalidación actual impide usar evidencia anterior. Capturas antiguas se conservan como historia mínima; no reutilizar token vencido para backfill ni introducir expiración de una hora a toda solicitud. Sin captura acreditada el resultado es insuficiente y no se llama al proveedor en cada render.

## Autenticación reciente para operaciones sensibles

1. Crear intento propio bajo sesión/rol/recurso actuales, con UUID opaco, scope permitido, expiración y retorno same-origin.
2. En el comienzo de la autorización global, generar nonce controlado por servidor y fijar su hash/estado de intento. La URL original conserva state/PKCE; el decorador añade únicamente parámetros de claims/nonce de ese intento autorizado. `additionalData` del cliente solo identifica el intento y se vuelve a resolver.
3. Callback verifica el ID token. Si no se conserva nonce plaintext, comparar el nonce del token ya verificado con el hash esperado mediante el primitive seguro propio; no pasar un hash como nonce al SDK ni verificar contra un nonce del browser. Consumir el intento atómicamente, mismo sujeto/usuario y sesión efectiva.
4. Emitir `RecentAuthenticationEvidence` solamente cuando la recencia global esté acreditada; expires desde `authenticatedAt`, no desde callback ni session refresh. Cada operación vuelve a evaluar ventana de diez minutos, sesión vigente, líder activo/recurso y retirada antes de `SecretStore`.

`auth_time` firmado necesita preparación de Security Bundle del cliente Google. No se presume que el proyecto la tenga ni que un parámetro fuerce reautenticación. Missing/stale cierra con `reauthentication_required`. Consentimiento, selector de cuenta, `iat`, creación/updatedAt/renovación de sesión, diagnóstico Zavu y OTP local no sustituyen esa evidencia. [Security Bundle](https://developers.google.com/identity/siwg/security-bundle).

No se inventan `google.claims` ni `signIn.social({prompt,max_age})`: esas opciones no existen en la interfaz instalada. La pantalla de reautenticación evita el redirect inmediato del login convencional para una sesión ya presente, conserva intención/retorno y comunica estado real. Una cuenta distinta no obtiene autorización ni consume una invitación. Si se requiere un desafío forzable con autenticador global nuevo, hace falta una decisión adicional de alcance; no se implementa passkey por inferencia.

## Público y diagnóstico

DTO de intento: `intentId`, `state`, `safeMessage`, retorno/acción propia y `validUntil?`; sin sujeto Google, claims/nonce/token o cuenta objetivo ajena. El éxito del browser no es evidencia. Params/body propios se validan en boundary; el verificador hace comprobaciones criptográficas/protocolo, no revalidación general de payload proveedor.

Logs de callback: operación/code/correlation, nunca authorization code, token, raw URL, nonce o profile completo. Evidencia de cuenta y diagnóstico de mensajería no se exportan como atributos de seguridad global ni props de página.

## Casos de contrato

Firma/header/issuer/audience/exp/sub incorrectos; nonce cruzado/repetido; claims ausentes; Gmail/Workspace/external; correo cambiado; callback concurrente A/B; state/PKCE conservados; false del SDK sin causa inventada; sesión revocada o liderazgo perdido antes de comando; recencia límite exacta; intento expirado/cuenta distinta; perfil de browser marcado verified sin efecto; ON obligatorio/OFF sin código oculto; tokens/claims/secrets ausentes en salida. Ejecutar Better Auth/verificador reales y transporte/JWKS de prueba en borde propio, crypto real y persistencia de prueba; no mocks de biblioteca ni tests de texto de fuente.
