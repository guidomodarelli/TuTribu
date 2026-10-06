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

T010, T011, T018, T019 y T029 continúan abiertos por sus dependencias y validación restante. La captura, el escritor de recencia, el catálogo autorizado, el comienzo/callback de OAuth, el adapter de cuenta, las rutas API y la página de reautenticación ya están conectados, según la evidencia de los últimos apartados. Faltan el acceso desde las acciones sensibles, la purga y la cobertura restante de lifecycle/restore. Las pruebas aisladas no completan por sí solas el recorrido ni sus gates.

Se conserva el resultado y las cookies del login existente. No se envían mensajes, no se leen secretos de mensajería y no se activa una capacidad externa. OG-01 requiere verificar los claims reales del cliente Google; los tokens sintéticos de prueba no acreditan ese gate. Los demás gates mantienen el estado de [operational-gates.md](operational-gates.md). `spec.md`, `technical-contract.md`, identificadores normativos y checklists permanecen íntegros.

## Preparación del decorador y contexto por request

Sobre la base `c70d5ee6ef522a02466cf902fb31cf0da1350b1a` se implementó `googleIdentityEvidencePlugin`, que conserva las referencias originales del proveedor y su resultado de login. Verifica el mismo token mediante el verificador existente y consume el perfil original una sola vez. Después del pin/verificación nativa deriva la evidencia desde el payload de ese token, independientemente del perfil mapeado. `AuthEvidenceContext` usa exclusivamente `AsyncLocalStorage.run/getStore`, almacena el resultado mínimo y no conserva token ni profile. Sin scope explícito no hay captura ni fallback global.

Los diez casos del plugin ejercen la API pública de Better Auth con su adapter de memoria publicado, sin mockear la biblioteca. Incluyen callback OAuth completo con state/PKCE y transporte propio, correo Gmail/Workspace/externo/señales ausentes, sign-ins concurrentes y login fuera de scope. La revisión reprodujo que un `mapProfileToUser` soportado mutaba email/email_verified/hd y confería autoridad Gmail desde un token externo; la corrección conserva el login mapeado pero deriva evidencia original insuficiente del token firmado. Las firmas/JWKS y tokens son sintéticos y el transporte deniega salidas reales. La regresión conjunta con los doce casos del verificador pasó 22 pruebas; lint y ambos chequeos de tipos pasaron.

El plugin se agrega a la configuración existente antes de `nextCookies`, y la ruta auth usa el wrapper por request. El hook comprueba `newSession`, sesión/usuario, correo firmado y cuenta/sujeto Google actualmente vinculados. Sólo registra un completion privado compatible; un mapper que cambie el correo conserva el login sin producir una captura persistible. `getOAuthState` aporta únicamente una referencia opaca de intento, nunca una autorización.

La composición persiste la captura mínima mediante el repositorio y guard existentes. Si las relaciones ya no coinciden o el almacenamiento adicional falla, conserva el login/cookies válidos y registra sólo código propio, tipo de fallo y correlación; no serializa token, profile, nonce o error SDK. El wrapper no cambia el resultado de una autenticación nativa fallida. Pasaron 30 casos de plugin/verificador/configuración/sesión. La revisión reprodujo que el matcher literal no coincidía con el template nativo `/callback/:id`; tras reconocer ese template y `params.id=google`, las pruebas OAuth atraviesan el wrapper y observan una persistencia efectiva.

El build local Turbopack quedó estancado en compile sin avance de CPU/diagnóstico y se cerró sólo su proceso propio con ownership verificado. Los intentos documentados de Webpack requirieron desactivar temporalmente flags de compiler y terminaron por incompatibilidades previas de selector global SCSS y export estrella de beez-ui; no validan el build normal. Se restauraron los bytes de `next.config.ts`, no se instalaron dependencias ni se modificó SDK/config persistente. Los tipos generados por ese intento se limpiaron dentro del workspace. Las dos corridas de CI del HEAD base `fa477edf` terminaron verdes; la CI del próximo commit debe verificar el comando normal con la configuración original.

En el bloque publicado sobre `fa477edf` todavía no se conectaba nonce/recencia a esos handlers; el último apartado documenta esa conexión posterior. Ninguna referencia opaca del browser ni un completion de login por sí solos autorizan una acción sensible. T029/T030 y sus dependencias permanecen pendientes; OG-01 no se acredita con esta integración.

## Repositorio privado de identidad vigente

El puerto `GlobalIdentityEvidenceRepository` y su adapter PostgreSQL guardan una captura mínima ya verificada sólo cuando actor actual, usuario, cuenta Google, sujeto, correo actual y sesión viva coinciden. Toman locks de usuario/cuenta/sesión, serializan por cuenta y comprueban el vencimiento de la sesión con reloj posterior a las esperas. Reemplazar la captura vigente conserva historia mínima invalidada; cada nueva fila tiene su propio id y version inicial 1. No guarda nonce, recencia ni otro token.

La lectura propia une captura y relaciones actuales, no llama a OAuth y no convierte el vencimiento histórico del token en una sesión de una hora. Un correo, sujeto, cuenta o sesión incompatibles dejan de exponer esa captura. Esta lectura no constituye un permiso durable ni acredita el lifecycle de invalidación permanente de T033.

Los cuatro casos SQL iniciales pasaron en PostgreSQL real de ramas Neon propias con cleanup: captura derivada del verificador Google real, cuentas/sesiones/claims cruzados, sesión vencida, dos capturas concurrentes con una sola vigente y cambio de correo/actor. Las credenciales/tokens/JWKS de prueba son sintéticos. El último apartado registra la posterior integración de `AuthenticatedAccountProvider`, la invalidación por correo y el retiro al desvincular una cuenta; T030/T033 conservan la cobertura restante de lifecycle/restore y sus dependencias.

## Escritor de nonce y recencia

`PostgresRecentAuthenticationRepository` crea la intención sólo para cuenta/sesión y líder canónico actuales, recurso propio y retorno autorizado por un colaborador obligatorio ligado a la misma transacción. No hay un authorizer permisivo por defecto. Emite nonce criptográfico de 256 bits una sola vez y guarda sólo SHA-256; el callback compara el nonce del token verificado con ese hash mediante `timingSafeEqual`.

Usuario, cuenta, ambas sesiones, tribu/líder e intención quedan bajo locks. El recurso y retorno se revalidan y el reloj PostgreSQL se consulta después de las esperas y crypto; las fechas de sesiones bloqueadas se comparan sin otra espera. Un callback legítimo consume la intención una vez incluso si `auth_time` es insuficiente. Emite recencia sólo desde ese tiempo firmado, con ventana menor a diez minutos, en el mismo commit que el consumo. `iat`, cookies nuevas y hora de callback no lo sustituyen.

Pasaron cuatro casos SQL completos con Google/verificador y PostgreSQL reales: consumo+emisión indivisibles y replay cerrado; nonce cruzado/liderazgo perdido sin consumo; dos callbacks con un ganador; `auth_time` ausente o viejo sin evidencia. La primera corrida pasó tres casos y perdió uno antes del SQL por timeout de renovación CLI; la repetición completa pasó cuatro en 82,75 segundos y verificó cleanup. No se modificó Neon CLI.

El avance sobre `22f6a4e7` conecta catálogo concreto, use cases y endpoints de creación/lectura, nonce en URL nativa y completion al escritor. La pantalla de reautenticación y el acceso desde flujos sensibles siguen pendientes. El código no fuerza autenticación Google ni acredita Security Bundle/Workers/OG-01.

## Cuenta actual, recursos y recorrido API

La migración 950 y su reflejo auth-owned agregan un vínculo privado sesión/cuenta/sujeto/correo emitido sólo por el completion verificado. La captura y el vínculo comparten el commit. El provider obtiene usuario/sesión desde Better Auth real sin refresh y proyecta una sola consulta SQL de cuenta, evidencia y recencia actuales; no devuelve role, token, profile, nonce o credenciales. Cuando hay otra cuenta Google vinculada conserva la de esa sesión. Sin vínculo antiguo sólo resuelve una cuenta única, sin fabricar una captura; la ambigüedad queda insuficiente.

Cambiar el correo normalizado invalida captura/vínculo/recencia de forma durable; cambiarlo de vuelta no reactiva la evidencia. Las guardas SQL impiden editar el origen o borrar una invalidación. La revisión detectó que borrar la cuenta por cascade también borraba el binding, haciendo que una sesión viva pareciera antigua y seleccionara otra cuenta vinculada. Se reprodujo en SQL real: tras unlink A, el provider devolvía B. La corrección archiva `account_id` como NULL, retira el binding y conserva el sujeto/correo/usuario de origen; esa sesión queda insuficiente sin fallback ni rebind. El getter se compone en auth y el root de módulos; sus hechos no sustituyen la autoridad final del writer o SecretStore.

El catálogo enumera acciones sensibles y selecciona sólo tablas/recursos de su owner: tribu, conexión, lista, importación propia, invitación y solicitud. Rechaza acción desconocida, recurso ajeno/missing/retirado y retorno que no sea el landing real de esa tribu. Una preview de importación se resuelve mediante su `actor_user_id`; el primer caso SQL reprodujo 42703 por una columna equivocada y la corrección pasó todas las ramas reales.

POST `/api/auth/reauthentication/intents` valida body propio una vez, exige confirmación y deriva toda identidad del servidor. GET por UUID valida params una vez y lee sólo intención propia con cuenta/sesión/liderazgo/recurso vigentes, sin consumir ni emitir. Los DTOs públicos se validan, usan no-store/no-referrer y sólo incluyen id/state/outcome/copy/return/validUntil; no hay hash, sujeto, cuenta, rol o secreto. `consumed` sin recencia se muestra como `reauthentication_required`, nunca como éxito.

El plugin resuelve el id opaco desde el state nativo, lo autoriza contra cuenta/recurso/intención actuales y agrega nonce y la petición documentada `claims.id_token.auth_time.essential`. Conserva state/PKCE y opciones de login. Sin scope, id válido o autorización cierra ese comienzo; el login ordinario no cambia. Tras callback, identidad/vínculo y consumo/emisión de recencia se componen con el mismo guard y transacción, sin RPC ni nuevo checkout dentro de sus locks.

Pasaron 78 pruebas en ocho suites de SDK/OAuth/políticas/use cases/API/configuración/módulos. Tras corregir el retiro por unlink, la revalidación completa pasó catorce casos SQL en 243,23 segundos: ocho de provider/captura y seis de nonce/catálogo/co-commit, incluyendo lector real de intención, rol sin bypass e intento rechazado de revertir invalidación. Todos usan ramas propias, firmas/JWKS sintéticos y cleanup comprobado; ningún canal ni cliente Google real queda acreditado. Lint y ambos typechecks pasaron; la revisión nativa finalizó con cero hallazgos accionables, 38 hashes estables y todos sus comandos terminados.

El apartado siguiente registra el frontend de reautenticación posterior. La entrada desde las acciones sensibles, los casos restantes de lifecycle/restore y las pruebas Node/Workers/claims operativas siguen pendientes. Se conservan las 212 tareas, IDs, contrato y checklists. Las dos corridas CI de `58837e13` finalizaron verdes con el build normal.

## Pantalla global de confirmación

Sobre `58837e13` se crea `/auth/reauthenticate?intentId=…` con page, loading propio y content que resuelve query/sesión bajo Suspense. El boundary valida query antes de componer auth, llama directamente al lector application y valida props públicas mínimas. Una sesión existente no dispara el redirect del login convencional. El error OAuth se reduce a una presencia booleana; ni su texto ni su descripción llegan al HTML.

El container usa un puerto propio y el SDK Better Auth real, sin perfil/nonce/claims del browser. Inicia OAuth sólo al confirmar; el resultado `started` deja la pantalla pendiente. Una respuesta perdida de inicio bloquea otro comienzo hasta una lectura segura. GET actualiza el estado sin route refresh; la restauración con `pageshow.persisted` revalida y el cleanup aborta las requests e ignora resultados tardíos. Una lectura que pierde sesión/recurso retira la continuación. Estados consumed sin recencia y expired piden una nueva intención desde la tribu, sin repetir la intención consumida ni crear otra automáticamente.

Pasaron 33 casos en tres suites de UI/SSR/cliente, con React, beez-ui, SDK y Zod reales; sólo se sustituyen puertos/transporte propios. Incluyen primera hidratación idéntica, no auto-OAuth, bloqueo de repetición, resultado browser insuficiente, GET seguro, error y cleanup, recuperación de un comienzo ambiguo y retiro de resultado confirmado al perder contexto. Una regresión conjunta previa pasó 81 casos en siete suites, incluidas API/use cases y los dos archivos de tests reportados por el usuario.

La primera validación de navegador no pudo iniciar Next: las junctions de dependencias resolvían fuera del root. Se relinkeó con `pnpm install --force --frozen-lockfile --offline --ignore-scripts`; no cambió package.json, lockfile, configuración Next ni AGENTS.md. La primera repetición pasó ocho E2E en 49 segundos, y la versión final volvió a pasar ocho en 30,2 segundos, sobre la ruta Next real con Chromium/WebKit en escritorio/móvil, para input inválido y sesión ausente, sin desbordes ni error de página. Esa evidencia no acredita un OAuth real, claims operativos, E2E autenticado completo ni entrada desde gestión; T032 y sus dependencias siguen abiertos.

La revisión reprodujo un P2 de confirmación visible conservada después de validUntil. El guard propio de la página exige estado consumed y plazo para mostrar verified; tras hidratar, un timer acotado retira la confirmación y consulta el GET. Consultar sigue disponible durante una confirmación vigente. El lector estable no se cancela al cambiar el snapshot y un resultado tardío con plazo vencido queda required, sin loop ni otro OAuth. Las regresiones del límite exacto y lectura tardía pasaron. La revisión nativa finalizó con cero hallazgos accionables, 16 hashes estables y todos sus comandos terminados.

El build normal `pnpm run build` pasó después del fix, con config original, React Compiler/Turbopack y credenciales sintéticas sólo del proceso; DATABASE_URL apuntó a loopback inaccesible para impedir SQL productivo. Compiló en 25,7 segundos, completó tipos y las 40 páginas estáticas e incluyó `/auth/reauthenticate` con prerender parcial. Lint y ambos typechecks pasaron.

## Cobertura completa de tokens y autoridad de T010

Sobre `1974e760`, cuatro casos adicionales firman sub ausente, null, vacío y numérico. El verificador nativo real de Google/Better Auth con JWKS sintético conserva insufficient sin evidencia, causa inventada o token expuesto. La suite de dieciséis casos cubre además RS256/signature/issuer/audience/exp, Gmail, Workspace, externo, hd ausente y callbacks A/B intercalados.

La ejecución conjunta pasó 143 pruebas sin skips: dieciséis de token, dieciséis de integración OAuth/plugin y 111 de elegibilidad. El callback real sintético conserva login/state/PKCE aunque no aporte autoridad de contacto. La evidencia de cuenta/correo cambiados se obtiene tanto de esas políticas actuales como de los ocho casos SQL de provider/captura registrados arriba; no se hace backfill desde emailVerified. Lint y ambos typechecks pasaron. La revisión nativa cerró sin hallazgos accionables, con dos hashes estables y todos sus comandos finalizados. T010 está completada como tarea de pruebas; los claims/clientes Google reales y OG-01 permanecen sin acreditar.
