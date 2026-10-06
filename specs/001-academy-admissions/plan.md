# Implementation Plan: Academy Admissions and Tenant Messaging

**Branch**: `feature/academy-admissions-spec` | **Feature**: `001-academy-admissions` | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: Contrato funcional completo, [technical-contract.md](technical-contract.md), [handoff.md](handoff.md), [traceability.md](traceability.md) y checklist del paquete. Selección efectiva: `.specify/feature.json`, independiente de la rama Git.

**Estado**: fases 0 y 1 de diseño completadas; revisión I1/U1 incorporada y tareas/trazabilidad sincronizadas en `7198047f126bcde6b0a5f0cdb60abf4191903e10`. Preparación T001–T006 completada; base de dominio en construcción con 96 casos ejecutados, ver [evidencia](validation/domain-baseline.md) y [gates](validation/operational-gates.md). Los escritores, rutas, migraciones y pruebas operativas de producto siguen pendientes; ninguna capacidad externa fue activada. El usuario autorizó commit y push de avances con `--no-verify` y confirmó la revisión humana completa.

## Summary

Controlar todas las altas/recuperaciones básicas gratuitas de academias con una política única de lista o revisión manual, manteniendo login global obligatorio y código adicional opcional. Implementar lista/CSV, invitaciones nominativas, solicitudes/decisiones, evidencia y avisos con todas las matrices/estados/límites existentes. Solo Zavu es conectable; credenciales por líder/tribu, transporte y seguridad global permanecen separados.

Módulos verticales `academy-admissions` y `messaging` con puertos propios, extensiones concretas de `auth/tribes/notifications/subscriptions`, SQL transaccional autoritativo y outbox Postgres. SDK oficial con defaults peligrosos desactivados, keyrings externos y crypto portable. No requiere una cola externa, nuevo login ni framework de plugins. La entrega funcional es única: prioridades ordenan trabajo, no permiten omitir requisitos.

[research.md](research.md) registra decisiones, alternativas, fuentes, inventario real y gates operativos; [data-model.md](data-model.md) fija relaciones, estados, constraints y conservación. Contratos y validación detallados están enlazados debajo.

## Technical Context

**Language/Version**: TypeScript 7; Next.js 16.3.4 App Router y React 19.3; Node `24.21.0` según `.nvmrc` y pnpm `12.6.0`, usados en la preparación y validación. Lockfile es autoridad de versiones.

**Primary Dependencies**: Better Auth 1.6.11/Drizzle adapter, Drizzle 0.45.2, pg 8.21 y pg-cloudflare 1.4, Zod 4, beez-ui 0.10, motion 12, libphonenumber-js 1.13.3, OpenNext Cloudflare 1.20.6. SDK oficial `@zavudev/sdk@0.57.0` incorporado con manifest/lockfile coordinados y age/frozen install respetados. Su instalación no acredita la integración productiva ni OG-03. Reutilizar verificador Google existente, sin agregar otra librería JWT por duplicación.

**Storage**: Neon Postgres shared schema; SQL versionado como fuente de policies/guards. Nuevos recursos de admisión/mensajería/auth y extensiones de membresía/notificaciones; crypto envelopes privados, keyrings/época externa en secretos del hosting. R2 es integración existente, no ledger de revocación ya provisto; alternativa no seleccionada.

**Testing**: Vitest 5/Testing Library, SDK/Better Auth/validators/beez-ui reales en sus contratos; transporte/puertos propios controlados. SQL real en rama efímera Neon con runtime y rol no-bypass; Playwright Chromium/WebKit 390/1280; ensayos Zavu por canal con consentimiento. Ninguna evidencia de ejecución de esos nuevos casos se presume.

**Target Platform**: Vercel activo/Hobby y Cloudflare Workers alternativo, con `nodejs_compat`, worker scheduled/OpenNext existentes. Dispatcher portable; Cloudflare requiere build/preview real en Linux o entorno compatible, no certificación de Windows ni un deploy supuesto.

**Project Type**: Aplicación web SSR/BFF y procesos de mantenimiento bounded, dentro del monolito hexagonal vigente. No backend separado ni broker contratado.

**Performance Goals**: 10.000 filas de lista, cien solicitantes concurrentes, confirmación p95 <3 s con exclusiones del spec; nueve de diez personas completan <2 min; avisos internos p95 <30 s y correo agrupado dentro del objetivo desde cierre de ventana. Medir infraestructura sana, warm-up/external delivery por separado; no garantías comerciales de Zavu.

**Constraints**: 142 FR, 71 escenarios, 45 EC, 21 SC, 24 decisiones y 27 TC íntegros. Código/tiempos/cupos/retención exactamente según spec. Secretos server-only, ningún bypass gratuito, contacto declarado sin autoridad, aislamiento por cuenta/tribu/propósito/época/versión. Timeout inicial externo 15 s, lease 90 s, dos envíos concurrentes/presupuesto 45 s son knobs técnicos medibles, no límites del proveedor.

**Scale/Scope**: Una feature y entrega completa: doce recorridos, tres canales previstos de código, solo correo de avisos, una conexión seleccionada y una candidata por tribu, lotes cincuenta, CSV 10.000/5 MiB. Scope por producto academia; legacy/pagos y derechos existentes se conservan, sin roles globales nuevos.

**Unknowns Resolved**: I1/U1 se concretan en R-15/R-16, con owner único de países y versiones/CAS/replay explícitos; no quedan decisiones técnicas abiertas en esta revisión. La ausencia de recursos/claims/rol medidos es un gate operativo explícito OG-01 a OG-06; no se transforma en éxito documental ni se omite un requisito.

## Constitution Check

Gates antes de investigación y reevaluados después del diseño, contra constitución 1.0.0, AGENTS y fuentes arquitectónicas propietarias. “Conforme en diseño” no significa implementación/pruebas aprobadas.

| Gate | Antes de fase 0 | Después de fase 1 / evidencia |
| --- | --- | --- |
| Hexagonal/inward/vertical slices | Obligatorio, viable en módulos existentes | Conforme: puertos/owners y composition root actual; sin features/server genéricos |
| Servidor primero/contratos propios | Estrategia vigente | Conforme: single primary loader, schemas propios/consumers, SDK y secretos solo infraestructura |
| Canon de payloads | Rule leída | Conforme: separación de input/DTO público/consumo upstream; sin schema completo proveedor/filas Postgres |
| Auth/tenancy/roles | Sesión no autoriza tribu ni evidencia | Conforme: capturas verificadas, preadmisión propia, rol/estado actual y fresh auth de acción sensible |
| RLS/autoridad de writer | Docs de academia indican bypass runtime | Conforme a fuente vigente: guardas explícitas/estructura y pruebas con ambos roles; no confiar solo en RLS |
| TDD/comportamiento | Casos se definen antes de code | Conforme: matriz individual/test files propuestos; no tests de texto, mocks de plataforma ni prueba ficticia |
| UI/español/a11y/mobile | DESIGN/primitivas/conventions vigentes | Conforme: presenters/containers, beez-ui, BEM, feedback, hydration/loading y ambos motores |
| Concurrencia/recuperación/observabilidad | Necesaria por canje/OTP/lotes | Conforme: unicidad/CAS/ledger, replay confirmado antes de CAS, versiones propias de recursos, país/versión de uso vigentes antes de marker, unknown/cupo conservados, logs mínimos |
| Documentación/CHANGELOG | Actualizar junto a comportamiento implementado | Conforme: owners previstos .htm/.html, índices/trazabilidad y Unreleased; artefactos tooling .md aquí |
| Versiones/entorno/publicación | Pins/lockfile y gates respetados | Conforme: no instalación/deploy/migración/commit en este trabajo; validación real antes de activar |

No hay una excepción arquitectónica nueva sin justificar. El bypass de RLS es condición heredada documentada y se trata explícitamente; no una garantía de policies ni autorización para relajar controles.

## Project Structure

### Documentation (this feature)

```text
specs/001-academy-admissions/
  spec.md
  technical-contract.md
  handoff.md
  traceability.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    http-api.md
    auth-evidence.md
    messaging-provider.md
    errors-and-recovery.md
    ui-flows.md
  checklists/
    requirements.md
    admission-review.md
```

`tasks.md` existente pertenece a la etapa de tareas: después de esta revisión debe regenerarse para incorporar países antes de diagnóstico y nuevas reglas de versión; no se reescribe durante planificación. Spec/TC normativos no se reescriben; la trazabilidad añade diseño/casos previstos, sin marcar ejecución. Checklist temática conserva sus pendientes.

### Source Code (repository root)

Layout propuesto para implementación; no archivos creados ahora:

```text
app/
  (admission)/admissions/[slug]/...
  (admission)/admissions/invitations/[token]/...
  (admission)/admissions/requests/[requestId]/...
  (platform)/[slug]/academia/admissions/...
  auth/reauthenticate/...
  api/tribes/[slug]/admissions/...
  api/tribes/[slug]/messaging/...
  api/auth/reauthentication/...
  api/maintenance/admission-messaging/route.ts
src/modules/
  academy-admissions/
    domain/{entities,policies,value-objects,repositories}/
    application/{commands,queries,results,use-cases}/
    infrastructure/{api,repositories,verification}/
    constants/
    setup.ts
  messaging/
    domain/{entities,repositories,value-objects}/
    application/{commands,queries,results,use-cases}/
    infrastructure/{api,zavu,encryption,repositories,config}/
    constants/
    setup.ts
  auth/                # evidence, Google decorator, recent auth, scoped capture
  tribes/              # basic membership writer/provenance/moderation snapshot
  notifications/       # own admission events/visibility and contextual refresh
  subscriptions/       # product/source-safe reconciliations and open-join guards
  shared/infrastructure/database/  # existing schema/pool/request transactions
  setup.ts             # existing cross-module composition root
components/academy-admissions/<component>/{index.tsx,styles.module.scss}
hooks/                 # route/container-owned queries, abort and contextual polling
lib/                   # explicitly named browser adapters, no business rules
config/cloudflare-scheduled-maintenance.ts
cloudflare/worker.ts
wrangler.jsonc
vercel.json
.github/workflows/      # authorized operational driver, no silent skips
database/migrations/   # future SQL versioned, not generated or applied here
tests/unit/modules/{academy-admissions,messaging,auth}/...
tests/unit/pages/...
tests/unit/components/...
tests/e2e/...
```

**Structure Decision**: Nuevos slices por negocio y reuse de infraestructura compartida real. Drizzle refleja las tablas en el schema existente sin crear ciclos de reexports; SQL/policies son versionados. Composición propia por módulo y fachada actual entre módulos; los entrypoints solo wiring y use cases. Presenters no llaman adapters. No reestructurar módulos ajenos para introducir un contenedor/jerarquía de errors genéricos.

## Flujos de datos y transacciones

```mermaid
flowchart LR
  A[Cuenta y recurso autorizados] --> B[Input propio validado]
  B --> C[Reglas de admisión]
  C --> D[Writer atómico y procedencia]
  D --> E[Estado y avisos internos]
  D --> F[Outbox durable]
  F --> G[Contexto, cupo y marker de intento]
  G --> H[Zavu fuera de transacción]
  H --> I[CAS del mismo intento y resultado seguro]
```

- Identidad global estable/evidencia capturada por auth; roles desde fila actual de membresía. Contacto local tiene prueba scoped y nunca identidad global. Interoperación mediante puertos/results propios, sin SDK/HTTP/db en domain.
- GET/preview/login no mutan admisión. Server-first no llama Zavu en cada render ni refresca todo por cada escritura; SDK solo tras acción o dispatcher autorizado.
- Snapshot de hechos bajo locks y reloj autoritativo → policy pure → commit de solicitud/decisión/vínculo/canje/membresía/eventos. Orden de locks común, unicidad/CAS y op ledger. Actor/moderación/epochs/versiones no se verifican solo antes de esperar.
- Conexión/recursos/crypto tienen contexto completo; `send_authorized_at` y presupuesto durables antes de RPC. Lease no autoriza duplicación externa; desconocido conserva identidad/cupo y se consulta sin POST ciego.

## Diseño integrado por responsabilidad

### Admisión, evidencia y estados

Política, lista, excepcionalidad, nominativas y cambios de época siguen cada fila del spec. Tipo de contacto fijado, predeterminados manual/OFF/cerrado, prueba local ON aun Google, evidencia base OFF, manual común sin mensajería y estados terminales independientes de membership. Prueba aplicada no caduca por las visitas/días de revisión, pero se recomprueba por nueva época/compromiso. Rejection/cancel/expiry no libera token; presentación pendiente no crea acceso.

Auth decora/verifica el proveedor instalado y captura mediante AsyncLocalStorage run/getStore, con nonce/intención/recencia para operaciones sensibles. Correo externo o ausencia de hd/autoridad conserva login normal y evidencia insuficiente; falta/antigüedad de auth_time cierra solo la operación sensible, sin abortar login global. No creer `emailVerified`/iat/sesión nueva ni agregar un autenticador global por inferencia. [auth-evidence.md](contracts/auth-evidence.md) concreta ese contrato.

### Países y versiones de recursos (revisión I1/U1)

`messaging` posee `MessagingUsagePolicy.allowedCountries=[]` y su versión positiva inicial `1`; admisión usa el puerto propio `MessagingUsagePolicyReader` y recibe hechos actuales, sin otra lista persistida ni dependencias outward. Lectura/inicio/configuración de uso se habilitan sin conexión/AdmissionPolicy. El asistente inicializa defaults por acción explícita y guarda países antes del primer diagnóstico SMS/WhatsApp de US6, no solo en la gestión de consumo de US11. Todo envío telefónico de admisión/diagnóstico/alternativa revalida país actual y restricciones comprobadas antes de reserva/marker, con versión efectiva auditada; correo y manual/teléfono/OFF común siguen sus reglas.

`AllowlistEntry`, `PersonalInvitation` y `MessagingUsagePolicy` exponen `version` positiva en lecturas. Cambios efectivos CAS incrementan una vez; no-op vigente/replay no incrementan. Una operación nueva con expectedVersion vieja da `409` sin escritura, mientras replay confirmado del mismo intent se resuelve antes del CAS y conserva versión histórica del commit, separada de consulta actual. La versión de uso no modifica épocas/conexión ni consumo; quitar país suprime trabajo no autorizado y conserva códigos vigentes/intentos iniciados conforme al modelo. [R-15/R-16](research.md), [países](data-model.md#country-policy), [versionado](data-model.md#resource-versioning).

### Cierre de caminos antiguos y fundamento básico

Inventario R-02 cubre API/action/SQL/invitación vieja, checkout abierto, webhook y ambos reconciliadores. Runtime bypass exige writer autoritativo más guarda estructural de fuente/versión/consumo; rules complejas permanecen en app/domain. Marcador de control separado de policy en la tribu; borrar policy/flag no vuelve a writer abierto.

Owner tribes captura `commercial_recovery_status` antes de ocultar active/muted, sin inventar un histórico NULL. Recuperación gratis solo tribemate/comercial/snapshot acreditado; privilegios/leader canónico no se degradan/reactivan por ese ingreso. Fundamento básico vigente persiste separado de suscripción vieja: cobrar/cancelar esa fuente no lo elimina. Remoción/conducta/salida sí prevalecen; nueva entrada exige decisión nueva. Preflight y resolución autorizada de históricos son gate antes de activar recuperación automática, sin anunciar una UI que hoy no existe.

### Proveedor, secretos y durabilidad

SDK0.57 versionado, me/resources typed, sender/canal explícitos/false-fallback, maxRetries0/log off y control de headers/host. Credencial autenticada, capacidad preparada y canal probado son estados distintos por versión. No aprovisionar recursos ni seleccionar otra cuenta global. Keyrings/AAD/época externa cubren credencial, OTP y huellas con continuidad de cuota. Restore global cerrado y reconexión explícita; una tombstone del mismo snapshot no basta.

Ventana de dedup Zavu no publicada: gate y comportamiento conservador unknown/no rePOST, no un TTL inventado. Consulta por ID propio, callbacks opcionales autenticados solo cambian transporte. El scope y resultados están en [messaging-provider.md](contracts/messaging-provider.md) y [errors-and-recovery.md](contracts/errors-and-recovery.md).

### Notificaciones, bulk, import y UI

Avisos internos atómicos y predicado por solicitud propia, sin acceso comunitario falso. Correo independiente/capacidad probada, preferencias actuales, agrupación/catch-up sin historial retroactivo ni nota interna. Polling focal de lista/bandeja cada 15 s y actualización inmediata propia, una entrada de fetching/cancelación/equality; otros contextos conservan política previa.

Lote50 DB-only con outcomes por fila confirmados y ledger; commit indeterminado se consulta. CSV preview sin efectos/revalida selección, conserva rows/partial outcomes y resume solo pendientes. UI con estados/feedback/a11y/roles y form secreto efímero; todas las variantes en [ui-flows.md](contracts/ui-flows.md). No exponer términos SDK/HMAC/job en los pasos del solicitante.

## Estrategia de implementación y validación

La siguiente fase transforma este diseño en tareas dependency-ordered con tests antes de code; los grupos aquí no son una lista T001 ni una autorización de implementar.

1. Fijar baseline de contratos/rutas/datos/roles; preflight histórico y gates externos. Definir casos mínimos de autoridad, crypto y writer antes de adaptarlos.
2. Infraestructura/DDL versionada, campos de moderación/fundamento/control, pruebas reales del SQL y ports/domain de admisión/auth/mensajería. Rollout todavía cerrado.
3. Casos de configuración/evidencia/solicitud/lista/import/nominativa/decisión y puertos de notification/outbox; migrar todos los writers antiguos/pagos necesarios, probar rollback y carreras.
4. Política de uso consultable/inicializable sin conexión, selección y guardado de países antes de diagnóstico telefónico; SDK/capacidades/diagnósticos/rotación/dispatcher y consumers/clientes de resultados propios. No se marca canal como probado con dobles ni se habilita retry ambiguo por arquitectura solamente.
5. Entry points SSR/containers/presenters, alertas/preferencias/copy/móvil y ambos motores; integración y regresiones de Membership/Academy/course/legacy.
6. Ensayos autorizados y medición SC, documentos/manuales/CHANGELOG, activación explícita por tribu solo después del inventario completo. Las prioridades no autorizan entregar scope parcial como feature completa.

V-01 a V-12 de [quickstart.md](quickstart.md) y las tablas individuales de [traceability.md](traceability.md) asignan FR/AC/EC/SC/TC a contratos/tests/doc futuros. No tests de textos de fuente, snapshots estáticos o mocks de bibliotecas internas. SQL se ejecuta; SDK/validators/UI se ejercen realmente en bordes propios.

## Activación, operación y recuperación

- OG-01 evidencia/recencia global; OG-02 keyrings/epoch/restore; OG-03 cada canal/version/producción; OG-04 dedup comprobada para retries ambiguos; OG-05 driver y latencia; OG-06 SQL/roles/inventario/históricos.
- Un gate ausente no se oculta con éxito o proveedor fake. Manual OFF y avisos internos funcionan en su configuración válida; capacidades dependientes se cierran selectivamente.
- Activar requiere actor/impacto/versión e inventario. Rollback después de activar cierra nuevas altas/recuperaciones, mantiene miembros y obliga estado/política válidos para reabrir. Restore usa recovery lock/época externa y ensayo antes de habilitar.
- Métricas/outcomes: admisiones/revisiones/proofs/attempts/transporte/old pending/consumo, queue age/leases/unknown y last successful driver. Metadata segura y límites por owner; no series por PII/ID/throw.
- Documentación de implementación: .htm en architecture/conventions/user-manual; manuales temáticos .html e índices con source-trace; CHANGELOG Unreleased para usuarios. Conservar contratos actuales de release/hosting, sin desplegar en planificación.

## Complexity Tracking

No nuevas violaciones de constitución. Complejidad necesaria: dos slices cohesivos, evidencia global/scoped, registros transaccionales/outbox y campos de fuente/moderación/control. Cada uno cierra un requisito/invariante concreto; no sistema general de jobs/plugins, broker o backend nuevo. Bypass RLS y limitación del scheduler son condiciones existentes explicitadas, no excusas para un gate verde sin pruebas.

## Estado de cierre del diseño

Investigación/resoluciones y modelo/interfaces/guía completados; R-15/R-16 incorporan las decisiones aprobadas para I1/U1. Speckit selecciona esta carpeta mediante feature.json; hooks before/after_plan no están registrados. El siguiente comando es `$speckit-tasks`: sincronizar tareas/IDs/dependencias/trazabilidad con la configuración temprana de países y versiones/CAS/replay, conservando todos los IDs normativos y gates/casos pendientes. Esta entrega no acredita funcionamiento de la feature ni recursos externos preparados.

Validación registrada en la planificación original: cuerpo normativo y TC sin cambios; 142 FR, 71 AC, 45 EC, 21 SC, 24 D y 27 TC presentes individualmente en trazabilidad; tablas Markdown y 655 enlaces relativos comprobados. El checker instalado reconoce research/data-model/contracts/quickstart. `pnpm run lint` y `pnpm run typecheck` pasaron. No se ejecutaron tests nuevos, SQL, ensayos de proveedor ni UI de esta feature; sus archivos todavía son propuestos. MCP memory no disponible; contexto versionado y fuentes públicas documentadas. Todo quedó local, sin commit/push.

La revisión I1/U1 preserva el resto del diseño y los artefactos normativos. La validación actual comprueba cambios acotados, enlaces/tablas y conservación; los casos nuevos de país/versionado de quickstart siguen previstos, sin ejecución de producto. `tasks.md`/`traceability.md` y checklists se conservan sin modificar en este comando para su siguiente etapa.
