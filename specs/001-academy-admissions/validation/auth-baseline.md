# Base de evidencia global de autenticación

**Feature**: `001-academy-admissions`. **Base publicada**: `7f766c5a98385efeb19192ed5cd58f033f018abe`.

## Alcance implementado

Se incorporaron contratos privados mínimos para captura global, intento de reautenticación y evidencia reciente. El verificador de infraestructura exige `RS256`, usa los métodos originales del proveedor Google de Better Auth y consume los datos firmados del mismo ID token. Clasifica Gmail, Workspace y evidencia insuficiente sin usar otro JWT, un perfil del browser ni una marca de correo verificado como sustituto criptográfico.

La política de callback comprueba estado `authorizing`, versión positiva, nonce, intento sin consumir, plazo y scope bajo sesión/liderazgo actuales para proponer su consumo atómico. La política de una operación sensible comprueba la evidencia ya emitida y su propia ventana de diez minutos desde `auth_time`. Son fases distintas: un intento consumido no invalida evidencia vigente; tampoco se permite reutilizar el callback. La verificación o renovación de sesión no acredita autenticación reciente.

La migración versionada de identidad crea tres tablas privadas y las relaciones compuestas con cuenta/usuario/sujeto/sesión/tribu. La captura vigente es única por cuenta/proveedor. La intención pasa de `created` a `authorizing` con hash de nonce y de allí a `consumed` mediante CAS; los cambios efectivos incrementan una versión y los no-op la conservan. Emitir evidencia requiere una intención consumida. Su origen, scope y ventana son inmutables; la invalidación no se puede deshacer. Drizzle refleja FKs, checks y nombres del SQL; los triggers y RLS siguen definidos por la migración.

## Evidencia ejecutada

Pasaron los casos de `google-identity-evidence.test.ts` y `recent-authentication.test.ts`, con Better Auth y Web Crypto reales, claves RSA efímeras y un transporte JWKS propio que deniega cualquier salida no preparada. La recencia agrega seis casos de estados o versiones que no pueden consumir un callback. No se mockea el SDK o la librería de autenticación.

Se comprobaron firma, algoritmo, issuer, audience, expiración, claims ausentes, Gmail/Workspace/correo externo y callbacks A/B independientes. La recencia cubre el límite exacto, fecha futura o inválida, evidencia invalidada/vencida, scopes cruzados, sesión retirada, pérdida de liderazgo y el recorrido callback consumido → evidencia vigente → operación sensible. Se reprodujo primero el fallo de esa última secuencia y luego se separaron las políticas.

Las suites SQL aplican el artefacto real exclusivamente en ramas Neon efímeras propias, con fixtures sintéticos y cleanup. Verifican relaciones cruzadas, defaults/CHECK, unicidad, intención consumida antes de evidencia, dos consumidores CAS con un único ganador, imposibilidad de extender o reasignar evidencia y RLS para cuenta propia/ajena con rol sin bypass. Se reprodujeron primero los fallos de emisión prematura y ventana editable. La prueba del baseline sin migración reprodujo `42P01`.

Pasaron `pnpm lint`, `pnpm typecheck` y `pnpm typecheck:tests`. La revisión nativa del bloque detectó y corrigió emisión prematura, evidencia editable y restricciones ausentes en Drizzle.

## Pendientes y límites

T010, T011, T018, T019 y T029 continúan abiertos: faltan conectar la captura al handler productivo y a la sesión/cuenta correctas, completar la integración de repositorios y el escritor que consume y emite recencia en la misma transacción, adapter de cuenta, rutas/interfaz de reautenticación y purga. Las restricciones de almacenamiento ya tienen validación SQL aislada; no habilitan por sí solas el recorrido ni completan las dependencias de esas tareas.

No se cambia el login existente, no se envían mensajes, no se leen secretos de mensajería y no se activa una capacidad externa. OG-01 requiere verificar los claims reales del cliente Google; los tokens sintéticos de prueba no acreditan ese gate. Los demás gates mantienen el estado de [operational-gates.md](operational-gates.md). `spec.md`, `technical-contract.md`, identificadores normativos y checklists permanecen íntegros.

## Preparación del decorador y contexto por request

Sobre la base `c70d5ee6ef522a02466cf902fb31cf0da1350b1a` se implementó `googleIdentityEvidencePlugin`, que conserva las referencias originales del proveedor y su resultado de login. Verifica el mismo token mediante el verificador existente y consume el perfil original una sola vez. Después del pin/verificación nativa deriva la evidencia desde el payload de ese token, independientemente del perfil mapeado. `AuthEvidenceContext` usa exclusivamente `AsyncLocalStorage.run/getStore`, almacena el resultado mínimo y no conserva token ni profile. Sin scope explícito no hay captura ni fallback global.

Los diez casos del plugin ejercen la API pública de Better Auth con su adapter de memoria publicado, sin mockear la biblioteca. Incluyen callback OAuth completo con state/PKCE y transporte propio, correo Gmail/Workspace/externo/señales ausentes, sign-ins concurrentes y login fuera de scope. La revisión reprodujo que un `mapProfileToUser` soportado mutaba email/email_verified/hd y confería autoridad Gmail desde un token externo; la corrección conserva el login mapeado pero deriva evidencia original insuficiente del token firmado. Las firmas/JWKS y tokens son sintéticos y el transporte deniega salidas reales. La regresión conjunta con los doce casos del verificador pasó 22 pruebas; lint y ambos chequeos de tipos pasaron.

El plugin todavía no se agrega a la configuración productiva ni se envuelve la ruta existente. La captura transitoria no acredita usuario/account/session, no persiste evidencia, no consume una intención ni autoriza reautenticación. La integración debe comprobar el `newSession` y el estado OAuth acreditado, revalidar las relaciones bajo locks y comparar el nonce firmado con el hash del intento antes de emitir recencia. T029/T030 y sus dependencias permanecen pendientes; OG-01 no se acredita con esta preparación.

## Repositorio privado de identidad vigente

El puerto `GlobalIdentityEvidenceRepository` y su adapter PostgreSQL guardan una captura mínima ya verificada sólo cuando actor actual, usuario, cuenta Google, sujeto, correo actual y sesión viva coinciden. Toman locks de usuario/cuenta/sesión, serializan por cuenta y comprueban el vencimiento de la sesión con reloj posterior a las esperas. Reemplazar la captura vigente conserva historia mínima invalidada; cada nueva fila tiene su propio id y version inicial 1. No guarda nonce, recencia ni otro token.

La lectura propia une captura y relaciones actuales, no llama a OAuth y no convierte el vencimiento histórico del token en una sesión de una hora. Un correo, sujeto, cuenta o sesión incompatibles dejan de exponer esa captura. Esta lectura no constituye un permiso durable ni acredita el lifecycle de invalidación permanente de T033.

Los cuatro casos SQL pasaron en PostgreSQL real de ramas Neon propias con cleanup: captura derivada del verificador Google real, cuentas/sesiones/claims cruzados, sesión vencida, dos capturas concurrentes con una sola vigente y cambio de correo/actor. Las credenciales/tokens/JWKS de prueba son sintéticos. El repositorio todavía no se conecta al hook ni a `AuthenticatedAccountProvider`, y no emite recencia ni consume nonce/intención. T030/T033 conservan esos pendientes y sus dependencias.
