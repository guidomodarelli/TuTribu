<!--
Sync Impact Report — material temporal de revisión; retirar antes de hacer commit.
Cambio de versión: plantilla sin ratificar → 1.0.0.
Motivo: primera adopción formal de las reglas ya vigentes en el repositorio.
Principios definidos:
- PRINCIPLE_1_NAME → I. Arquitectura hexagonal por módulos.
- PRINCIPLE_2_NAME → II. Datos desde el servidor y contratos propios.
- PRINCIPLE_3_NAME → III. Seguridad y aislamiento por tribu.
- PRINCIPLE_4_NAME → IV. TDD y pruebas de comportamiento.
- PRINCIPLE_5_NAME → V. Interfaz accesible y consistente en español.
- Añadidos: VI. Concurrencia, resiliencia y observabilidad;
  VII. Documentación junto con el cambio; VIII. Mantenimiento por responsabilidad.
Secciones concretadas: Restricciones técnicas; Flujo de trabajo y validación; Governance.
Secciones eliminadas: ninguna regla ratificada; se retiran los ejemplos de la plantilla.
Pendientes de contenido: ninguno.
Templates y comandos: sin cambios; consultan esta constitución durante su ejecución.
-->

# TuTribu Constitution

## Core Principles

### I. Arquitectura hexagonal por módulos

El código de negocio nuevo o modificado DEBE vivir en
`src/modules/<feature>/{domain,application,infrastructure}` y organizarse por funcionalidad.
Las dependencias DEBEN apuntar hacia adentro: `domain` permanece puro; `application`
orquesta casos de uso mediante puertos de dominio; `infrastructure` implementa adaptadores.
Ni `domain` ni `application` pueden depender de `infrastructure`, del framework o de `lib`.

Los entrypoints de `app` DEBEN consumir casos de uso y limitar sus imports de
`infrastructure` a composición, wiring del framework y ejecución de adaptadores del servidor.
NO DEBEN importar implementaciones de repositorios ni alojar reglas de negocio. La composición
DEBE pertenecer al módulo, incluida su entrada `setup.ts` cuando corresponda.

NO DEBE introducirse `src/server` ni código de negocio nuevo en `src/features`. Al modificar
un entrypoint que aún importe `src/features`, DEBE migrarse ese recorrido a `src/modules`
en el mismo trabajo. Los componentes presentacionales DEBEN recibir datos y callbacks;
la sesión, las requests y la orquestación compleja pertenecen a containers o hooks propios.

Estas fronteras permiten probar los casos de uso y cambiar adaptadores sin reescribir
el dominio. Fuentes: [AGENTS.md](../../AGENTS.md) y
[backend-separation.htm](../../docs/architecture/backend-separation.htm).

### II. Datos desde el servidor y contratos propios

La carga inicial DEBE priorizar Server Components y entrypoints de App Router, con una
entrada principal de datos por recorrido cuando sea posible. `"use client"` DEBE reservarse
para estado, APIs del navegador e interacciones que lo necesiten.

Los DTOs de proveedores DEBEN permanecer en `infrastructure`, junto con sus mappers.
La UI DEBE consumir resultados propios de `application` o props derivadas de ellos.
El flujo DEBE conservar la conversión de DTO externo a entidad o value object, caso de uso,
resultado de aplicación y view model, sin exponer contratos del proveedor a componentes.

La validación de payloads DEBE aplicar la regla canónica
`~/.agents/rules/payload-validation-boundaries.md`. Esta constitución NO redefine ese contrato.
Su aplicación local y ubicación de schemas se consultan en
[payload-validation-boundaries.htm](../../docs/conventions/payload-validation-boundaries.htm).

El fetching del cliente DEBE responder a una interacción o necesidad posterior al render,
y permanecer detrás de adapters propios. Las mutaciones DEBEN devolver el resultado mínimo
para actualizar la UI incrementalmente. Un refresh completo DEBE tener una justificación
por invalidación amplia, datos no reconstruibles, seguridad o sincronización crítica;
los tests DEBEN comprobar su ausencia o documentar esa excepción.

La navegación DEBE respetar los boundaries de `Suspense` del segmento activo: cada segmento
de página DEBE contar con `loading.tsx`; los layouts NO DEBEN leer `params` en el servidor.
La hidratación DEBE mantener el HTML del servidor y el primer render del cliente coherentes.
La referencia concreta del framework es la documentación instalada en
`node_modules/next/dist/docs/`, según [AGENTS.md](../../AGENTS.md).

### III. Seguridad y aislamiento por tribu

Better Auth DEBE resolver identidad y sesión; los roles y estados por tribu DEBEN resolverse
a partir de `tribe_members`. Una sesión, una cookie o la visibilidad de un botón NO DEBEN
reemplazar la autorización efectiva del servidor y de la base.

El tenant canónico DEBE ser `tribe`, con shared schema, alcance mediante `tribe_id` y
ownership donde corresponda. Cada lectura y escritura DEBE preservar ese aislamiento.
RLS DEBE cubrir acceso estructural por ownership, membership y roles simples; las reglas
complejas DEBEN permanecer en `application` y `domain`, con los mecanismos de escritura
atómica definidos en [rls-simple.htm](../../docs/architecture/rls-simple.htm).

Los secretos, cookies de sesión y tokens DEBEN permanecer en variables de entorno o
almacenamiento seguro del servidor. NO DEBEN aparecer en código, fixtures, documentación,
logs, props serializadas ni assets públicos. Los errores expuestos DEBEN ser seguros y
estar en español; los diagnósticos técnicos pertenecen a logs internos sanitizados.

Fuentes: [multi-tenancy.htm](../../docs/architecture/multi-tenancy.htm),
[roles-and-permissions.htm](../../docs/architecture/roles-and-permissions.htm) y
[AGENTS.md](../../AGENTS.md).

### IV. TDD y pruebas de comportamiento

Toda funcionalidad, corrección de bug o cambio arquitectónico DEBE seguir
`testing → code → refactor → green`: primero una prueba mínima que reproduzca el comportamiento
esperado o el fallo, después la implementación y finalmente el refactor con las pruebas en verde.
Todo cambio de funcionalidad DEBE incorporar o actualizar sus pruebas en el mismo trabajo.

Las pruebas DEBEN ubicarse en el nivel responsable: reglas puras en `domain`, casos de uso
con dobles de puertos en `application`, integración de adapters y persistencia en
`infrastructure`, render e interacción con React Testing Library y E2E para recorridos críticos.
Los archivos de tests NO DEBEN colocarse dentro de `app`.

Los tests DEBEN ejercer comportamiento observable o contratos públicos reales. NO DEBEN
comparar texto interno de archivos fuente, SQL, estilos o configuración, ni limitarse a
imports, compilación, snapshots estáticos o llamadas que el propio mock ya determinó.
El SQL DEBE validarse ejecutándolo contra Postgres; build y configuración del framework
DEBEN verificarse con sus herramientas reales.

Las bibliotecas internas, de plataforma, UI y validación DEBEN usarse realmente. Los dobles
DEBEN colocarse en bordes propios del proyecto. Un mock de esas dependencias solo se permite
por instrucción explícita del usuario o imposibilidad técnica justificada y documentada.
Los mocks existentes que protejan timers, listeners o efectos globales DEBEN conservarse
hasta contar con una protección equivalente validada.

Fuentes: [AGENTS.md](../../AGENTS.md) y
[shared-ui-library.htm](../../docs/architecture/shared-ui-library.htm).

### V. Interfaz accesible y consistente en español

La UI DEBE seguir [DESIGN.md](../../DESIGN.md): jerarquía clara, controles semánticos,
contenido legible, feedback visible y layouts que funcionen en móvil y escritorio.
Los textos visibles y la comunicación con el usuario DEBEN estar en español;
los identificadores técnicos DEBEN permanecer en inglés.

`beez-ui` DEBE ser la única biblioteca compartida de componentes. Los componentes originales,
tokens, tema y fuentes compartidas pertenecen a esa biblioteca. NO DEBEN incorporarse copias
en `components/ui`, tarballs locales ni componentes shadcn mediante el CLI en esta aplicación.
Los componentes propios DEBEN usar
`components/<scope>/<component>/{index.tsx,styles.module.scss}`.

Los estilos de producto DEBEN usar SCSS Modules y BEM. NO DEBEN añadirse utilidades Tailwind
ni compilación Tailwind en el consumidor. La navegación interna DEBE usar el `Link` compartido
de `@/components/navigation/link`; las notificaciones DEBEN usar `toast` y `Toaster` de
`beez-ui`. El tema DEBE conservar un único propietario mediante el provider compartido.

Las interacciones críticas DEBEN mostrar sus estados de validación, carga, éxito y error
de forma accesible. Las animaciones DEBEN seguir los tokens y primitivas aprobadas y respetar
`prefers-reduced-motion`. Las cards solo se permiten cuando el usuario las solicita o pide
mantener una card existente. Los cambios de UI DEBEN verificarse en Chromium y WebKit,
incluidos viewports móviles, según [AGENTS.md](../../AGENTS.md).

Fuente del contrato compartido:
[shared-ui-library.htm](../../docs/architecture/shared-ui-library.htm).

### VI. Concurrencia, resiliencia y observabilidad

Cada flujo DEBE asumir concurrencia, reintentos y resultados fuera de orden. El servidor
DEBE proteger las mutaciones críticas mediante transacciones, idempotencia, constraints,
control de versión u otro mecanismo adecuado. El orden de acciones del navegador NO DEBE
ser la garantía de consistencia del estado compartido.

Los efectos asíncronos DEBEN cancelar o invalidar trabajo al cambiar dependencias o desmontarse,
y evitar que respuestas obsoletas sobrescriban estado vigente. Los errores DEBEN clasificarse,
producir feedback seguro y conservar su causa cuando se envuelvan; ningún `catch` puede
silenciar un fallo sin una responsabilidad y un fallback deliberados.

Los flujos relevantes del servidor DEBEN emitir logs estructurados con operación,
identificadores de correlación y metadata segura. Las rutas DEBEN aplicar el contrato vigente
de `x-request-id` y `x-trace-id`. Los reintentos DEBEN ser acotados y preservar efectos seguros.

Los checkouts y transacciones de Postgres DEBEN seguir los helpers y guards compartidos
que recuperan recursos ante abandono del render. NO DEBEN reintentarse timeouts de adquisición
causados por saturación del pool. Las lecturas frecuentes NO DEBEN multiplicar requests al
proveedor y escrituras de reconciliación sin una ventana de frescura documentada.
Los cambios en estas áreas DEBEN revisar también las ocurrencias equivalentes de la aplicación.

Estas reglas evitan duplicaciones, estado corrupto y agotamiento de recursos.
Fuente: [concurrency-observability-performance.htm](../../docs/conventions/concurrency-observability-performance.htm)
y [AGENTS.md](../../AGENTS.md).

### VII. Documentación junto con el cambio

Toda modificación de comportamiento, arquitectura, convenciones o recorridos DEBE actualizar
su documentación correspondiente en el mismo trabajo. Las decisiones arquitectónicas
pertenecen a `docs/architecture/`, las convenciones a `docs/conventions/` y las instrucciones
de producto a `docs/user-manual/`. Esos documentos DEBEN ser `.htm` y seguir
[docs/DESIGN.md](../../docs/DESIGN.md).

Los manuales internos DEBEN permanecer en archivos temáticos `.html` de `user-guides/`.
Al cambiar un recorrido, permisos, validaciones, límites o recuperación DEBEN actualizarse
su manual y los índices relacionados según
[user-guides/AGENTS.md](../../user-guides/AGENTS.md). Los documentos de control y artefactos
Markdown de Spec Kit DEBEN conservarse fuera de `docs/`, en sus rutas de tooling.

Los cambios con efecto para miembros o creadores DEBEN actualizar
[CHANGELOG.md](../../CHANGELOG.md) exclusivamente dentro de `[Unreleased]`, en español y
según las categorías vigentes. Tests, refactors internos y tooling sin efecto de producto
no requieren una entrada. Las fechas y versiones de release las genera `pnpm create-version`.

Las especificaciones, planes y tareas DEBEN conservar trazabilidad entre resultado esperado,
implementación, pruebas y documentación. NO DEBE darse por completado un recorrido que aún
no tenga implementación alcanzable o cuya documentación relevante esté obsoleta.
Fuente: [AGENTS.md](../../AGENTS.md).

### VIII. Mantenimiento por responsabilidad

Cada módulo DEBE tener una responsabilidad clara, nombres completos y coherentes y
acoplamiento dirigido por sus puertos. Los cambios DEBEN eliminar duplicación relevante y
justificar las nuevas abstracciones; la extracción por organización nominal no basta.
Los identificadores DEBEN ser autoexplicativos; los nombres de una letra solo se admiten
para contadores de loops o contextos matemáticos convencionales. La intención no obvia
DEBE documentarse mediante JSDoc o TSDoc cuando corresponda.

Los literales con significado funcional DEBEN nombrarse o configurarse según su owner
y reutilización real: constantes locales para un único archivo, `constants/` del módulo
para reutilización del módulo y `src/constants/` para reutilización entre módulos.
La configuración DEBE reservarse para valores de entorno, integración o deployment.
Antes de crear una constante DEBE buscarse un equivalente existente.

Las decisiones de naming, extracción y ubicación DEBEN seguir
[constants.htm](../../docs/conventions/constants.htm) y [AGENTS.md](../../AGENTS.md),
sin crear agrupaciones genéricas de valores no relacionados.

## Restricciones técnicas

- El framework DEBE ser Next.js App Router con React y TypeScript. Next.js sirve como UI y BFF;
  separar un backend DEBE responder a una decisión documentada en
  [backend-separation.htm](../../docs/architecture/backend-separation.htm).
- El runtime y package manager DEBEN respetar `.nvmrc`, `packageManager` y `engines` de
  [package.json](../../package.json). La base vigente es Node.js 24, pnpm 12.6.0,
  TypeScript 7, Next.js 16 y React 19. Sus pins y lockfile DEBEN actualizarse coordinadamente.
- Las dependencias DEBEN instalarse con `pnpm install --frozen-lockfile`.
  `package.json` y `pnpm-lock.yaml` DEBEN permanecer sincronizados. `beez-ui` se consume
  desde npm mediante rango caret y lockfile, según su contrato arquitectónico.
- La identidad DEBE usar Better Auth y Google OAuth; la base principal DEBE ser Neon Postgres,
  accedida mediante adapters de infraestructura y el contexto de request aprobado.
- Los cambios de schema, relaciones, índices, constraints, funciones o policies DEBEN incluir
  SQL versionado en `database/migrations/`. Las migraciones son la fuente de verdad de RLS.
- Las integraciones DEBEN mantener sus SDKs, DTOs, credenciales y errores de transporte
  dentro de infraestructura. Los contratos públicos pertenecen a la aplicación.
- Los detalles de viewport, movimiento y navegación DEBEN consultarse en
  [viewport-units.htm](../../docs/conventions/viewport-units.htm),
  [motion.htm](../../docs/conventions/motion.htm) y
  [navigation-links.htm](../../docs/conventions/navigation-links.htm).

## Flujo de trabajo y validación

1. Antes de analizar o modificar código, DEBEN consultarse `AGENTS.md`, la regla canónica de
   payloads y los documentos arquitectónicos del área. Antes de UI, DEBE leerse `DESIGN.md`;
   antes de escribir código de Next.js, DEBE consultarse su documentación instalada.
   El contexto de MCP `memory` DEBE recuperarse cuando la integración esté disponible;
   si no lo está, DEBE informarse el bloqueo y usarse evidencia versionada.
2. La especificación DEBE definir comportamiento observable, permisos, límites, errores y
   compatibilidad. El plan y las tareas DEBEN reutilizar la arquitectura vigente e incluir
   explícitamente los tests requeridos por TDD y las actualizaciones documentales pertinentes.
   Las ambigüedades y contradicciones DEBEN resolverse antes de implementar.
3. La implementación DEBE seguir el ciclo TDD y verificar cada cambio significativo contra
   el objetivo. Las decisiones relevantes de diseño DEBEN quedar justificadas brevemente.
4. Antes de cerrar, DEBEN ejecutarse las pruebas relevantes al cambio, `pnpm run lint` y
   `pnpm run typecheck`; `pnpm run typecheck:tests` DEBE ejecutarse cuando se modifiquen tests.
   Los tests DEBEN pasar. Si una validación no puede ejecutarse, el reporte DEBE indicar
   el bloqueo concreto y qué comportamiento queda sin verificar, sin declarar que pasó.
5. Los cambios de persistencia DEBEN validarse contra el SQL real en una rama efímera de Neon,
   con fixtures mínimos y cleanup de la rama propia. Esa validación cuenta con autorización
   permanente del usuario en el proyecto TuTribu; aplicarla a una base por defecto o producción
   mediante `pnpm run db:migrate` requiere una solicitud explícita del usuario.
   Los errores de base proporcionados por el usuario DEBEN investigarse directamente con `pg`
   según [AGENTS.md](../../AGENTS.md), sin imprimir secretos ni datos sensibles.
6. Las verificaciones manuales locales DEBEN reutilizar el servidor activo de `portless`
   o iniciarlo con `pnpm run dev`, y usar `https://dev-tutribu.app`. `pnpm run dev:next`
   se reserva para el entorno automatizado documentado. La UI DEBE verificarse en Chromium
   y WebKit, escritorio y móvil; cualquier motor no ejercitado DEBE reportarse con su bloqueo.
7. El gate completo `pnpm run ci` DEBE mantenerse en Husky `pre-push` para ramas distintas
   de `main`, sobre el `HEAD` limpio que se publica y con instalación congelada. NO DEBE
   eludirse un fallo real con `--no-verify`, desactivar lint ni duplicar el gate completo
   en hooks de agentes. El build de deployment NO reemplaza el gate; no se requiere un
   gate de GitHub Actions. Las condiciones exactas se rigen por
   [repository-quality-gate.htm](../../docs/conventions/repository-quality-gate.htm).

## Governance

Esta constitución resume reglas adoptadas; no sustituye sus fuentes ni introduce permisos
para publicar, desplegar, migrar producción o ejecutar trabajo fuera del alcance solicitado.
Las instrucciones explícitas del usuario DEBEN prevalecer. El contrato de validación de
payloads DEBE regirse por su rule canónica. En decisiones arquitectónicas,
`docs/architecture/` DEBE prevalecer sobre `AGENTS.md` y esta síntesis; `AGENTS.md` DEBE
alinearse con esa fuente en el trabajo que cambie la decisión. Los detalles de convenciones,
diseño y pins DEBEN resolverse en sus documentos y configuración propietarios.

Toda enmienda DEBE identificar el motivo, los principios afectados, su fuente y su impacto
sobre las especificaciones activas. Antes de finalizarla DEBE comprobarse la coherencia
con las reglas vigentes y documentarse cualquier cambio real de arquitectura en su fuente.
Los templates y comandos consultan la constitución durante la ejecución; este flujo solo
modifica `.specify/memory/constitution.md`.

La versión DEBE seguir semver: MAJOR para remover o redefinir principios de forma incompatible,
MINOR para añadir principios o ampliar materialmente obligaciones y PATCH para aclaraciones
sin cambio semántico. La fecha de ratificación DEBE conservarse tras la adopción inicial;
`Last Amended` DEBE cambiar únicamente cuando cambie el contenido de gobierno.

La revisión de especificaciones, planes, tareas y código DEBE comprobar estas reglas y
registrar incumplimientos con evidencia y responsabilidad. Las excepciones existentes
DEBEN conservar su alcance y justificación; un checklist marcado NO reemplaza tests,
validación real ni autorización. El `Sync Impact Report` es material temporal de revisión
que DEBE retirarse antes de commitear la constitución.

**Version**: 1.0.0 | **Ratified**: 2026-10-04 | **Last Amended**: 2026-10-04
