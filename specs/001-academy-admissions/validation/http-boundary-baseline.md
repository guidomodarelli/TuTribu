# Base de contratos HTTP y contextos privados

**Feature**: `001-academy-admissions`. **Base publicada**: `ae764e6f1e0b69e917371a7dd0abb0ee8ee7963f`.

## Alcance y evidencia ejecutada

T014 ejercita 51 casos con Request/Response, Zod, el SDK Zavu y sus errores reales. El transporte HTTP propio deniega cualquier salida no registrada. Los doubles de cuenta, liderazgo, recurso y SecretStore son puertos propios; no se reemplaza una librería de autenticación, persistencia o UI.

Los parsers reclaman cada parte de input antes de leerla y no la validan dos veces. La respuesta y el error pasan por sus schemas propios; las salidas contienen únicamente campos públicos y copy del catálogo español. Error/cause, rejected values, tokens, headers y payloads SDK no se serializan ni se registran en diagnósticos. Params/query, JSON inválido, DTO inutilizable, respuesta/props y consumidor de error tienen casos observables. Los headers privados usan no-store/no-referrer y correlación propia.

Los errores del SDK se clasifican por status antes de mensaje: 400/422 continúan siendo rechazo aunque el texto mencione timeout; HTTP 408 es timeout en consulta y unknown después de un marker de envío. Transporte/5xx/409 no correlacionado conservan posible despacho cuando el owner ya autorizó el intento. El normalizador no reintenta, no libera cupo ni registra una entrega por sí mismo. Un operation_unresolved sin metadata de operación ya registrada no fabrica un run: el boundary lo cierra como contrato inutilizable.

El resolver privado usa account/session/subject actuales, líder canónico y membresía activa, tribu/recurso/contribuyente, versión, entorno y época externa. Relee cuenta y liderazgo después de las esperas, y evalúa los diez minutos de recencia desde auth_time firmado. Los casos reproducidos antes de corregir incluyen sesión retirada, liderazgo perdido, conexión suspendida/desconectada y vencimiento de sesión inválido, todos antes de SecretStore. El Store concreto todavía debe revalidar bajo sus propios locks antes de descifrar.

Pasaron la suite de 51 casos, lint y ambos typechecks. La regresión previa de las otras ocho suites contiene 270 casos; se conserva su cobertura y se repite la base conjunta al publicar. La revisión nativa aceptó y verificó el hallazgo de HTTP 408, se reprodujeron los dos fallos y se corrigieron; el rerun terminó sin hallazgos accionables y con 21 hashes estables.

## Estado de tareas y límites

T014 queda cerrada como pruebas de contratos propios y puertos. T017, T028, T035, T044 y T045 siguen abiertos: hay definitions y primitivas preparadas, pero faltan sus dependencias y adapters/writers/rutas completos. Un contexto devuelto no autoriza para siempre; el writer y SecretStore deben volver a comprobar sus hechos vigentes. El contexto/credential result es privado y no puede pasar a props o JSON.

Los nuevos puertos de admisión separan snapshots, comandos y resultados confirmados. El writer declara replay antes de CAS y commit indivisible de decisión/pertenencia/canje/vínculo/auditoría/obligaciones; esa declaración no acredita la implementación SQL. La versión del commit histórico se distingue por nombre de una lectura vigente. No se implementa todavía un writer ni una nueva ruta, y los gates operativos permanecen pendientes.

`spec.md`, `technical-contract.md`, identificadores normativos y checklists conservan su contenido. Ver [operational-gates.md](operational-gates.md) y el owner [academy-admissions.htm](../../../docs/architecture/academy-admissions.htm).
