# Spec Kit Handoff: Academy Admissions and Tenant Messaging

**Fecha**: 2026-10-05. **Estado**: paquete de entrada completo para especificación y planificación de una primera implementación. No ejecuta cambios en el repositorio ni configura servicios externos.

## 1. Documentos y autoridad

| Archivo | Uso |
|---|---|
| `spec.md` | Contrato funcional: 12 historias, 71 escenarios de aceptación, 142 requisitos funcionales, 45 casos límite, matrices, estados y 21 criterios de éxito. |
| `technical-contract.md` | 27 restricciones técnicas y decisiones de integración: contexto por tribu, inyección de dependencias, Zavu, desafíos y custodia de secretos. Entrada de planificación, no código implementado. |
| `traceability.md` | Índice individual de requisitos y focos de validación para trasladar a plan, tareas, pruebas y documentación. No certifica pruebas ejecutadas. |
| `checklists/admission-review.md` | Revisión humana de claridad, consistencia, seguridad y operabilidad. Todas las casillas comienzan pendientes. |
| `handoff.md` | Uso del paquete, instrucciones al agente, límites de la revisión y fuentes externas. |

El comportamiento del producto lo determina `spec.md`. Las restricciones TC complementan ese comportamiento en el plano técnico y no permiten reducirlo. Este archivo explica cómo trabajar; no introduce otro contrato funcional paralelo. Si una restricción real del repositorio impide cumplir ambos, documentar la contradicción y su efecto antes de alterar el alcance. No usar una decisión técnica para convertir la verificación opcional en obligatoria o para habilitar contactos declarados como verificados.

La feature es una única entrega funcional con recorridos priorizados. Las prioridades no autorizan a omitir el resto del alcance. No presupone que existan tablas, conexiones, solicitudes o código de esta feature. Las tareas de schema que demande la aplicación actual son parte de su primera implementación, no un proceso de actualización de una versión ya desplegada de estos documentos.

Cuando Spec Kit cree la carpeta de feature, sus artefactos serán la fuente de trabajo. Los documentos de entrada son un snapshot: no mantener dos `spec.md` editados en paralelo. Conservar el contrato técnico y la trazabilidad como entradas/referencias del plan dentro de la feature efectiva.

## 2. Inicio en el repositorio

Copiar el contenido de este paquete en `spec-inputs/academy-admissions/`, relativo a la raíz local de TuTribu. No ubicarlo como documentación Markdown de producto bajo `docs/`; el repositorio establece otro formato para esa documentación. No sobrescribir una feature existente.

El manifiesto consultado del repositorio registra integración `codex`, scripts `ps`, separador `-` y versión registrada `1.0.13`. Esto no demuestra qué ejecutable está instalado en cada equipo. El agente debe inspeccionar la integración/skills reales antes de invocarlas. La notación prevista para esa integración es **`$speckit-specify` en el chat de Codex**, no una instrucción para PowerShell. En otras integraciones puede ser diferente. [R2, S11, S12]

La constitución y las plantillas ya forman parte del repositorio. No ejecutar una reinicialización forzada ni sustituir su constitución para incorporar la feature. El directorio efectivo y la selección de feature deben resolverlos los mecanismos instalados de Spec Kit, no una numeración inventada ni la suposición de que el nombre de rama es siempre suficiente. [R1, R2, S11]

### Mensaje inicial para el agente

```text
$speckit-specify

Creá una única feature academy-admissions para TuTribu usando:
- spec-inputs/academy-admissions/spec.md como contrato funcional completo;
- spec-inputs/academy-admissions/technical-contract.md como restricciones
  que debe preservar la planificación;
- spec-inputs/academy-admissions/traceability.md y la checklist del paquete
  como insumos de revisión;
- spec-inputs/academy-admissions/handoff.md como guía y fuentes.

Es una primera implementación. Generá una especificación autónoma, no una
lista de diferencias ni una actualización de una feature supuestamente existente.

Leé AGENTS.md, la constitución y la plantilla activa del repositorio.
No reinicialices Spec Kit, no reemplaces la constitución y no adivines
la numeración de carpeta. Resolvé y comunicá la feature efectiva con los
mecanismos instalados, sin sobrescribir otra feature.

Preservá las 12 historias y sus 71 escenarios, D-01 a D-24, FR-001 a FR-142,
EC-01 a EC-45, SC-001 a SC-021 y las matrices, estados y límites completos.
Conservá TC-001 a TC-027 como restricciones de planificación sin convertir
el spec funcional en un plan de código. Si debés reorganizar identificadores,
mantené una equivalencia individual y verificable.

El login global sigue siendo obligatorio. La verificación adicional es
opcional por tribu; sus credenciales pertenecen al líder y no pueden usarse
para recuperar, iniciar sesión o verificar identidades globales.
Implementación de proveedor prevista: únicamente Zavu, con contratos propios
para extensibilidad. No agregues Twilio, Resend ni fallback a claves globales.

No transformes una API key validada en un canal probado, ni una entrega en
una prueba de contacto. No reduzcas las reglas de lista, invitaciones,
aprobación, seguridad, notificaciones o compatibilidad comercial.

Generá solo los artefactos de especificación y su checklist de calidad.
No implementes código, no ejecutes migraciones, no envíes mensajes reales,
no actives configuraciones, no hagas commit ni push.

Informá la carpeta efectiva, el resultado de revisión documental y cualquier
contradicción real con el repositorio. No certifiques pruebas de producto.
```

## 3. Secuencia de trabajo

Ejecutar y revisar cada etapa por separado. La especificación describe qué resultado se necesita; el plan elige cómo implementarlo; las tareas y la verificación deben conservar esa trazabilidad. Las invocaciones dependen de las skills disponibles en el entorno. [S11, S12]

| Etapa | Resultado esperado |
|---|---|
| `$speckit-specify` | Feature registrada, spec íntegra y revisión de requisitos. |
| `$speckit-clarify` | Resolver únicamente contradicciones materiales que aparezcan contra el código o capacidades reales; no reabrir por rutina decisiones ya cerradas. |
| `$speckit-plan` | Diseño técnico, investigación, contratos, datos y límites transaccionales con las restricciones TC. |
| `$speckit-checklist` | Evaluar calidad de requisitos y preparación; no declarar una implementación probada. |
| `$speckit-tasks` | Tareas individualmente trazables, dependencias, pruebas primero y documentación. |
| `$speckit-analyze` | Consistencia entre especificación, plan y tareas antes de codificar. |
| `$speckit-implement` | Implementación solo después de revisar el plan/tareas y con las autorizaciones correspondientes. |
| `$speckit-converge`, si está disponible | Contrastar artefactos y resultado alcanzable, resolver huecos y volver a verificar. |

No introducir o actualizar tooling automáticamente porque una invocación no esté disponible. Diagnosticar la instalación primero. Crear artefactos no autoriza a desplegar, contratar un servicio, introducir secretos reales ni generar consumo externo.

### Mensaje de planificación

```text
$speckit-plan

Planificá la feature activa academy-admissions conforme a su spec.md completo
y a TC-001 a TC-027 de technical-contract.md.

Leé las reglas del repositorio y la arquitectura relevante. Usá las versiones,
helpers de base, composición, autenticación y sistema visual vigentes. No
reemplacés el login ni introduzcas otro sistema global de usuarios.

Inventariá todas las rutas gratuitas de creación/recuperación de membresía
básica en academia, incluidas funciones SQL, entrypoints, invitaciones
históricas y operaciones administrativas. Separá las vías pagas legítimas.
Respetá bloqueos de conducta, restricciones comerciales recuperables,
miembros activos/silenciados y permisos de contenido independientes.

Diseñá admisión, verificación local y mensajería con puertos propios y DI
explícita por contexto validado. Zavu es el único adaptador productivo.
No uses una clave mutable global, fallback a credenciales de plataforma,
DTOs Zavu en dominio ni callbacks globales de Better Auth con claves del líder.

Definí almacenamiento de secretos, cifrado/gestor, rotación, retiro,
versionado, pruebas por canal, transferencia de liderazgo y cuotas. Protegé
preadmisión antes de existir membership, sin otorgar permisos falsos para
sortear RLS. Verificá el rol efectivo de base de datos.

Comprobá contratos actuales de Zavu: credenciales, remitentes explícitos,
paginación, campos por canal, plantillas, sandbox, idempotencia y errores.
No inventes capabilities ni scopes; no serialices respuestas de recursos
con secretos hacia UI. No aprovisiones cuentas, DNS, números o plantillas.

Diseñá desafíos seguros por cuenta/tribu/contacto/propósito/época/versión,
pruebas no globales, cambios OFF/ON, solicitudes pendientes, canje atómico,
cuotas concurrentes y outbox idempotente. Definí tratamiento de resultado de
envío desconocido sin prometer exactamente una entrega ni gasto exacto.

Extendé traceability.md: cada FR, escenario, EC, SC y TC debe mapearse a
implementación, pruebas y documentación. Incluí pruebas reales contra
Postgres, contratos de adaptador, UI accesible y procedimientos de ensayo
Zavu por canal. Los ensayos con consumo quedan pendientes hasta tener
credenciales/recursos autorizados; no se sustituyen por un mock productivo.

Documentá activación segura en el producto existente, rollback cerrado,
retención, manuales y CHANGELOG según las reglas del repositorio.
No diseñes una migración desde tablas inventadas de esta feature.

Generá los artefactos propios de planificación de la integración instalada;
las tareas definitivas se generarán en la etapa de tareas.
No implementes, no ejecutes migraciones, no envíes mensajes, no guardes claves
reales en artefactos y no hagas commit ni push.
```

Las diferencias entre entornos local y productivo deben documentarse, no ocultarse detrás de un test que solo ejercita un doble.

## 4. Alcance de la revisión del repositorio

Se consultaron el manifiesto de integración y la constitución para esta preparación, además de la documentación y el flujo básico de admisión examinados en el contexto del proyecto. No se descargó ni auditó exhaustivamente todo el código, no se ejecutaron tests de la aplicación y no se inspeccionó producción. El agente debe releer los archivos sobre el commit que vaya a implementar.

| Área y referencia local | Qué debe comprobar el plan |
|---|---|
| `.specify/integration.json` | Invocaciones, scripts e integración realmente instalados; no inferir del manifiesto una CLI local disponible. |
| `.specify/templates/spec-template.md` y `.specify/memory/constitution.md` | Estructura activa, reglas de módulos, identidad, pruebas, documentación y formatos. |
| `AGENTS.md` y `DESIGN.md` | Convenciones y contratos reales de UI/composición; versiones del repositorio, no versiones recordadas. |
| `docs/architecture/multi-tenancy.htm`, `roles-and-permissions.htm`, `rls-simple.htm` | Autorización por tribu, roles activos y frontera de funciones privilegiadas. |
| `src/modules/tribes/infrastructure/repositories/postgres-tribe-academy-admission-repository.ts` | Punto actual de alta básica y recuperación comercial; no equiparar todo estado `blocked` a conducta. |
| `join-tribe-academy-admission-use-case.ts`, `join-tribe-free-use-case.ts`, `manage-tribe-invitations-use-cases.ts` dentro de `src/modules/tribes/application/use-cases/` | Implementaciones, consumidores y rutas alcanzables, incluidas entradas que no pasan por la pantalla principal. |
| Módulos `auth`, `tribes`, `notifications`, `product-access`, `member-verifications` y `subscriptions` | Reutilizar propietarios/contratos sin confundir un nombre de módulo con integración OTP o mensajería ya operativa. |
| `database/migrations/`, `docs/` y `user-guides/` | Schema versionado, políticas actuales, manuales y navegación que la implementación necesita mantener. |

Ningún documento de este paquete certifica que el modelo global ya guarde todas las señales necesarias de Google, que existan conectores Zavu o que un canal esté habilitado. Esas dependencias deben resolverse de verdad antes de exponer la capacidad.

## 5. Orden de implementación sugerido

Desarrollar recorridos completos: admisión manual con check apagado, aislamiento y avisos internos; política y evidencia base/lista; conexión Zavu/custodia de secretos y desafíos locales; invitaciones y excepciones; cambios de política y ciclo de conexiones; importación, correo, lotes y operación. Incluir concurrencia y seguridad desde cada recorrido, no como endurecimiento al final.

Cada capacidad externa permanece apagada hasta que su configuración y prueba sean reales. El recorrido manual sin proveedor debe poder funcionar y probarse independientemente; no depende de que el líder contrate mensajería. El contrato de extensibilidad se prueba con un doble en el borde propio sin exhibirlo como otro proveedor de producción.

No usar las 142 FR como una lista de 142 cambios desconectados: agrupar tareas por recorrido, preservando trazabilidad individual. Las decisiones de implementación que no están fijadas incluyen la tecnología concreta de custodia de secretos, ubicación exacta de módulos, estrategia transaccional y scheduler compatible con el despliegue; deben justificarse en el plan, no inventarse como requisitos funcionales.

## 6. Fuentes y hechos externos

Fuentes oficiales consultadas el **5 de octubre de 2026**. Las reglas de tiempos, cuotas, prueba local, incompatibilidades de configuración, suspensión al transferir liderazgo y permisos son decisiones de esta propuesta, no límites impuestos por estos proveedores. Las URLs se incluyen como referencias transportables. El plan debe volver a comprobar contratos de SDK/API cuando implemente.

| Ref. | Fuente | Uso y límites |
|---|---|---|
| S1 | Zavu Authentication: `https://docs.zavu.dev/authentication` | API keys, claves de prueba, remitente explícito e idempotencia. No se ejecutaron llamadas autenticadas ni se comprobaron planes. |
| S2 | Zavu Email Setup: `https://docs.zavu.dev/guides/email/setup` | Preparación de dominio y remitente de correo. Verificar un remitente no prueba el buzón del solicitante. |
| S3 | Zavu WhatsApp OTP: `https://docs.zavu.dev/guides/whatsapp/templates/otp` | Requisitos de canal/plantilla y código proporcionado por la aplicación. No prueba pertenencia a grupos. |
| S4 | Google ID token verification: `https://developers.google.com/identity/gsi/web/guides/verify-google-id-token` | Validación de tokens y autoridad sobre Gmail/Workspace frente a correos externos. |
| S5 | OWASP Forgot Password Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html` | Principios de tokens seguros, plazos, intentos y uso único. No es un protocolo de admisión ni prescribe todas las decisiones criptográficas de este paquete. |
| S6 | OWASP Secrets Management: `https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html` | Custodia, acceso, rotación y ciclo de vida de secretos. No certifica la infraestructura de TuTribu. |
| S7 | AWS Transactional Outbox: `https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html` | Consistencia entre cambios y eventos; consumidores idempotentes. No implica contratar AWS ni garantiza entrega externa exactamente una vez. |
| S8 | Zavu List Senders: `https://docs.zavu.dev/api-reference/list-senders` | Enumeración paginada y datos de remitentes. El ejemplo incluye campos sensibles: el adaptador debe seleccionar una salida segura. |
| S9 | Zavu Webhook Security: `https://docs.zavu.dev/guides/receiving-messages/security` | Verificación de firma/tiempo cuando se usan eventos. Un webhook no es requisito del formulario mínimo del líder. |
| S10 | Zavu Smart Routing: `https://docs.zavu.dev/guides/sending-messages/smart-routing` | Enrutamiento del proveedor frente al canal explícito requerido. No se habilita fallback opaco para la verificación. |
| S11 | Spec Kit Quickstart: `https://github.github.io/spec-kit/quickstart.html` | Separación de especificación, plan y ejecución; selección de feature y etapas. |
| S12 | Spec Kit Integrations: `https://github.github.io/spec-kit/reference/integrations.html` | Notación según integración; inspeccionar la instalada. |
| S13 | OWASP Multi-Tenant Security: `https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html` | Aislamiento de requests, cachés, trabajos y recursos por tenant. |
| R1 | TuTribu `.specify/memory/constitution.md`, blob observado `33210890e06387d458900969e009ece4ea369f12` | Sección de principios consultada; hexagonal, contratos, aislamiento y TDD. |
| R2 | TuTribu `.specify/integration.json`, blob observado `010e29456327c38b31aafd68599bcecf8d0ad3a3` | Configuración de Codex observada, no verificación del ejecutable local. |

Repositorio de referencia: `https://github.com/guidomodarelli/TuTribu`. Todas las rutas de código son relativas a su raíz y se deben comprobar al planificar. No se incluyen claves, tokens, identificadores de cuentas reales de mensajería ni datos de integrantes.
