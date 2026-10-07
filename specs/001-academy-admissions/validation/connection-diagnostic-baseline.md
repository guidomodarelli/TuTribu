# Confirmación local de diagnóstico de conexión

**Feature**: `001-academy-admissions`. **Base verificada**: `dc9479db759481455349aef936573967b2b14a0a`, branch `feature/academy-admissions-spec`. Avance parcial de T089 y de las primitivas compartidas de T038/T041; envío, activación, factories públicas y endpoints permanecen pendientes.

## Responsabilidades y límites

`VerifyConnectionDiagnosticUseCase` resuelve el contexto actual de la acción sensible antes de entregar el intento explícito al puerto propio `ConnectionDiagnosticOperations`. Application no importa infraestructura ni respuestas del proveedor. El adapter `PostgresConnectionDiagnosticOperations` fija actor/tribu/tipo e intent protegido en el ledger real y recupera su resultado antes de consumir otra vez un código.

`authorizeConnectionDiagnostic` reutiliza la autorización SQL de cuenta/sesión/binding/recencia/líder canónico/recurso, sin leer ciphertext o descifrar la credencial. Exige la operación y conexión exactas, ámbito externo vigente y reloj tras las esperas. `PostgresConnectionDiagnosticRepository` comparte el mismo presupuesto de fallos y validador HMAC que admisión. Un código correcto actualiza sólo su diagnóstico y la capacidad del canal/versión/sender/template originales; no cambia verificación global, pertenencia, otras capacidades o estado de conexión.

La comprobación local conserva su independencia de disponibilidad del proveedor, países actuales y cuota para otro envío. Si el canal ahora está `unavailable`, se registra la comprobación recibida y se conserva esa indisponibilidad; no se promete que quedó habilitado. Sandbox y una prueba local no habilitan producción. La activación requiere su propia decisión sobre recurso/capacidad/recencia de prueba y entorno.

El resultado propio estricto contiene únicamente outcome, id de diagnóstico, versión, canal, fecha ISO y estado de capacidad, o un código cerrado de denegación. El ledger no guarda código, contacto, credencial, ciphertext o contexto privado en ese resultado. Un replay conserva el snapshot del commit original y no pisa el estado actual del recurso. Los cuatro errores locales nuevos pasan por catálogo español y mapping HTTP del owner.

## Evidencia inicial y correcciones

Tras extraer los fixtures reales de emisión a `tests/support/contact-verification-issuance-fixture.ts`, pasaron trece SQL sin skips en 731,88 segundos: ocho de emisión/regresión y cinco de diagnóstico. Estos últimos cubrieron confirmación exacta/canal independiente/replay histórico, cinco fallos/dedupe, cruces de identidad/acción/recurso y guardian/sesión vencida, rollback completo después del consumo local y dos verificadores de SMS con país retirado/canal indisponible. Son fixtures sintéticos de autoridad persistida; no acreditan un nuevo login Google ni un envío externo.

La revisión nativa encontró un P2: diagnóstico se bloqueaba antes de desafío mientras un resend de otro canal hacía el orden inverso. Las barreras de puertos propios, con PostgreSQL y crypto reales, reprodujeron rechazo con causa `40P01` en 63,86 segundos. Se alineó el orden capacidad → presupuesto de cuenta → desafío → diagnóstico y se releen todos los campos pertinentes después de obtener sus locks. No se mockeó pg, Web Crypto ni un SDK.

Otra regresión reprodujo una denegación al reutilizar la misma clave pública para issue/resend, dos tipos de operación cuyo namespace es distinto. Los eventos privados y la clave de entrega ahora usan el UUID global del ledger; el cliente conserva su identidad pública y el namespace actor/tribu/tipo. El primer caso de emisión comprueba dos namespaces, dos claves de entrega y su asociación con los registros originales del ledger. La verificación de diagnóstico usa ese mismo UUID privado para contabilizar fallos.

La suite final ampliada pasó catorce SQL sin skips en 743,30 segundos: seis de diagnóstico y ocho de emisión. Incluye el cruce SMS/WhatsApp con ambos resultados confirmados, cero fallos inventados, sustitución actual y capacidad SMS sin preparar; también issue/resend con la misma clave pública, namespaces separados y dos entregas ligadas a UUIDs privados distintos. Cada rama propia se eliminó y su ausencia se comprobó antes de publicar verde. Pasaron sesenta casos de DTO/HTTP (seis nuevos y cincuenta y cuatro existentes), incluidos rechazo de campos privados, timestamp propio, estado indisponible conservado, copy español/status de los cuatro errores y ausencia de cause en respuesta. Lint, tipos de producto/tests y diff check pasaron después de las correcciones. La revisión nativa final confirmó el cierre del P2 y la separación de identidades, sin hallazgos accionables y con quince hashes estables.

El build normal pasó con Node 24.21.0 y Next 16.3.4, compilación de 18,7 segundos, typecheck y cuarenta páginas estáticas; todas las conexiones SQL del build apuntaron a loopback y sus credenciales fueron sintéticas. Los dos documentos .htm pasaron ocho variantes de Chromium/WebKit a 390/1280, sin overflow ni enlaces locales rotos. El primer helper de QA dejó Node abierto después de cerrar los browsers; se verificó su identidad/árbol y ausencia de hijos browser antes de terminar únicamente ese proceso propio. La repetición confirmó ambos cierres de browser y finalizó con exit 0 en 2,76 segundos.

## Alcance pendiente

T089 sigue abierta: el comienzo explícito de envío y dispatcher, activación y las factories/endpoints/UI no se certifican por este bloque. T038/T041 y los gates Node/Workers/hosting/proveedor conservan su alcance. Todas las migraciones y datos sintéticos se aplican sólo a ramas Neon efímeras propias; su limpieza debe verificarse antes de registrar cada SQL como verde.

No se cambió un recorrido disponible de UI ni se publicaron manuales. Las decisiones pertenecen a [tenant-messaging.htm](../../../docs/architecture/tenant-messaging.htm) y [academy-admissions.htm](../../../docs/architecture/academy-admissions.htm). Los artefactos normativos y checklists conservan sus ítems.
