# Persistencia de configuración de lista

Incremento de T109/T112 sobre `a44886e93c4b0f48db3cf71ef3036f1baa47e38d`. Mantiene 97/212 tareas completas y 115 pendientes.

`PostgresAllowlistRepository` integra los comandos con el ledger nativo, autorización actual, tipo de contacto seleccionado, HMAC privado, unicidad, CAS y auditoría. La creación nueva usa versión uno; duplicados no se reactivan ni editan. Un cambio efectivo incrementa una vez y un no-op vigente conserva la versión. Replay confirmado precede al CAS. El savepoint conserva un rechazo conocido en la operación original sin efectos de entrada/auditoría; una respuesta de commit perdida se recupera con lectura del mismo intent. Los DTOs mínimos no exponen contacto, propietario o fingerprint.

El control de liderazgo/sesión/recencia se extrajo a `authorizeAdmissionLeader`; la política conserva un wrapper con su scope original. La recencia de lista se liga al id de tribu al crear y al id de entrada al editar. No se confía en un rol del contexto ni se realizan requests al proveedor bajo locks.

## Evidencia ejecutada

- SQL de lista sobre la migración final: 2/2 verdes, sin skips, en 185,19 s; creación/replay/duplicados/no-op/versiones 116,883 s y dos escritores competidores 66,726 s. Verifica alias preservado, versión dos, dos auditorías, cero vínculos y cero nuevas membresías. Se simula únicamente la pérdida de respuesta después del COMMIT real. La ronda anterior sin la nueva primitiva también pasó en 182,50 s.
- SQL de política sobre la migración final: 2 casos seleccionados verdes en 140,59 s; los otros once se filtraron. Conserva ausencia/defaults/replay/CAS y rechaza propósito incorrecto, sesión expirada y liderazgo revocado sobre original confirmado. La ronda previa de la extracción pasó en 134,18 s.
- Regresión local: 141/141 verdes en cuatro suites, sin skips, en 2,08 s. Contratos de mutación/versiones: 28 verdes y un caso SQL no seleccionado en 1,33 s.
- Validación conjunta final: 169 verdes en seis suites, con un caso SQL no seleccionado, en 15,23 s. La página de arquitectura se comprobó en Chromium/WebKit a 390/1280 px, con cero desbordamiento/errores JS.
- Tipos de producto/tests y lint focal pasan. Build Next final real: compilación 23,2 s, TypeScript 2,9 s y 46 páginas generadas. La ronda anterior pasó en 31,9/6,2 s.

Los workflows SQL exitosos terminaron después de eliminar sus ramas propias. Se reutiliza el checkout seguro y sus guards de pool; no se añade `pool.connect`, retry de adquisición o RPC sobre render a este writer. El barrido de ocurrencias sigue apuntando al helper compartido con listener de error, release único y timeout de transacción; las ocurrencias de composición delegan en ese helper.

## Rol sin bypass y alcance pendiente

El ensayo non-bypass final pasó 1/1 en 57,15 s (55,392 s el caso), con cleanup. Comprueba metadata no-bypass/no-superuser, ENABLE/FORCE RLS reales, ausencia de permiso UPDATE sobre membresías y bloqueo RLS `42501` al intentar escribir ledger/configuración. El backend propietario crea y recupera la entrada; después de perder liderazgo rechaza el contexto antiguo.

Las ejecuciones de diagnóstico identificaron permisos de lectura faltantes del arnés sobre `tribe_invitations` y `global_identity_evidence`, y un caso real de SELECT FOR SHARE que ocultaba la propia membresía bajo las políticas de UPDATE. La nueva migración `20261009043000_lock_admission_canonical_leader.sql` añade la primitiva estructural, sin abrir DML a roles de request. Un diagnóstico observó una fila con SELECT simple y cero al intentar share/key-share; la comprobación final respeta la decisión canónica owner-writer y no exige éxito de un comando desde el rol de request.

La revisión inicial de nueve archivos cerró sin hallazgos sobre el manifiesto `283A4ED0159F0AB80024FD7AF08155FAFECC399874A67EEAE4BEA0EB333A0097`. Tras el hallazgo SQL, la revisión Codex read-only se repitió sobre doce archivos congelados, incluido el caso de rol y la migración: manifiesto `3F800EC7F41822804466CB980BA060292342C7043EA8591A7ADA521FD010F899`. Terminó con cero hallazgos accionables y 12/12 hashes estables; no hubo fallback o diagnósticos materiales. Los cinco casos SQL finales cerraron con cleanup completo.

Faltan lectores/filtros/paginación, integración de rutas/DTO/composición, interfaz, CSV y admisión automática. La función estructural se versiona en la migración indicada y sólo se ejecuta en ramas temporales propias durante este trabajo; no se migra producción. No hay flujo nuevo disponible para usuarios; no cambia manuales o CHANGELOG. No se cierran T109/T112 ni gates por estas pruebas parciales.
