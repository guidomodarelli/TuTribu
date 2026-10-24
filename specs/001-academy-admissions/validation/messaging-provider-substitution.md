# Sustitución del transporte por puertos propios

Cierre exclusivo de T192 y T194 sobre `036280dccda452e2385ec8611202265a943e61bf`: **178 tareas completas y 34 pendientes**, sobre los mismos 212 IDs. Pasaron 74 casos distintos, incluidos tres SQL con ambos transportes en dos cohortes. No acredita SC-020 integral, T195–T197 ni los gates operativos.

## Contrato ejercido

La [historia US12](../spec.md) exige conservar decisiones de lista, canje y revisión al sustituir el transporte, ofrecer únicamente Zavu en producción y denegar proveedores o capacidades inexistentes. El cambio separa los inspectores de credencial, remitentes y plantillas. El descriptor común no exige métodos telefónicos; una factory adicional de plantillas sólo se usa cuando existen tanto el canal WhatsApp como esa implementación. La preparación privada de códigos pertenece a infraestructura de mensajería y conserva el intento original, fuera del namespace Zavu.

La [arquitectura propietaria](../../../docs/architecture/tenant-messaging.htm#provider-registry) documenta esos contratos. No se agrega un proveedor productivo, un selector futuro ni un contenedor de dependencias. Los casos de uso de admisión y sus reglas conservan su implementación.

## Casos y alcance de la evidencia

| Criterio | Recorrido comprobable | Estado actual |
| --- | --- | --- |
| US-12-AC-01 | Catálogo de la composición productiva real con Zavu como único descriptor; fronteras de creación/configuración existentes | Pruebas locales aprobadas; T195 conserva la proyección hacia la UI |
| US-12-AC-02 | Emisión, envío, verificación local, lista, canje personal, revisión y replay con dos transportes | Tres casos SQL aprobados, con ambos transportes, en dos cohortes de fuentes comunes idénticas |
| US-12-AC-03 | Inspector de correo funcional sin métodos de teléfono o plantillas; SMS/WhatsApp y plantillas ausentes denegados | Pruebas locales aprobadas; no acredita otra política o proveedor productivo |
| US-12-AC-04 | Identidad desconocida y capacidad ausente denegadas antes del SDK, sin fallback; API propia rechaza input no admitido | Familia local aprobada y evidencia previa de [registro/API](provider-registry-api.md); T197 integral permanece pendiente |

El archivo principal es `tests/unit/modules/academy-admissions/application/messaging-provider-substitution.test.ts`. Sus dos casos locales consultan operaciones propias de correo y la composición productiva. Sus tres casos Native comparan dos composiciones para lista, canje personal y revisión manual. Cada composición mantiene cuentas y recursos independientes y las mismas claves externas del entorno.

La composición Zavu usa el SDK real con un transporte HTTP propio cerrado. La alternativa es `tests/support/messaging-email-provider.ts`, un doble funcional exclusivamente de los puertos propios de inspección y envío. No se mockean SDK, PostgreSQL, validadores o reglas de negocio. Las conexiones persistidas siguen cumpliendo la restricción productiva de Zavu: el ensayo sustituye explícitamente el puerto de envío y no demuestra el onboarding de un segundo proveedor.

Los casos Native observan el código en la frontera de envío y lo verifican mediante el caso de uso real. No recuperan un envelope para inventar una recepción. Comparan solicitudes, pruebas aplicadas, membresías básicas, decisiones, canje personal, obligaciones internas e intentos aceptados persistidos. El replay debe preservar el original y no generar otro mensaje. Antes de verificar el código, la aceptación del transporte debe conservar cero pruebas y cero membresías.

## Ejecuciones actuales

- Familia local completa de siete archivos: **71 aprobadas, cero fallos y tres Native omitidas**, con Node 24.21.0 y fuentes estables. Incluye el registro, SDK de inspección/envío y fronteras HTTP de creación, recursos y configuración. Los 18 casos del registro son un subconjunto; no se suman nuevamente.
- Tipos de producto y de tests aprobados. Lint de los quince archivos TypeScript modificados aprobado.
- Build real de Next aprobado en el checkout aislado: **1801 archivos productivos idénticos**, overlay de 2067 archivos y 55 páginas. Los ajustes posteriores afectaron sólo fixtures/tests; no se atribuyen al overlay anterior. No se modifica el servidor de desarrollo compartido.
- Revisión consultiva del último ajuste y la prueba de cohortes: **cero hallazgos accionables**, con 18 rutas modificadas, cinco fuentes normativas, 19 contextos y 16 recibos estables. Confirma el oráculo y la preservación de lista/canje; el resultado focal y la limpieza se comprueban por separado después de esa revisión.

La segunda ejecución completa terminó con cuatro aprobados y un fallo: pasaron los dos locales y los casos SQL de lista y canje con ambos transportes. Revisión manual llegó a aprobar y comprobar la membresía, pero falló al comparar el nombre del evento de aviso. El contrato existente usa `pending_created`; el test esperaba `pending`, que es un estado de solicitud y no ese evento.

Sólo se corrige ese literal esperado en la rama exclusiva de revisión. Se conserva el mismo backend, los mismos fixtures y 2059 inputs comunes idénticos. La condición y la rama de lista/canje no cambian; tampoco el prefijo de los dos locales. La repetición focal del caso manual completo pasó con ambos transportes: **uno aprobado, cero fallos y cuatro fuera del filtro**. Esos cuatro no se suman como aprobados de la ejecución focal. La prueba de cohortes conserva los dos SQL aprobados de lista/canje y el SQL manual aprobado, sin presentar una única ejecución completa de cinco aprobados.

El total efectivo es **74 casos distintos**: 71 locales y tres SQL. Los dos locales del archivo mixto y los 18 del registro ya están incluidos en los 71. Cada SQL compara ambos transportes, por lo que existen seis recorridos concretos, no seis casos de prueba adicionales. El resultado focal y su sesión terminaron con cero; las fuentes permanecieron estables y la limpieza posterior fue comprobada.

## Fallos iniciales y correcciones

El contrato anterior rechazó el inspector de correo por carecer de `listTemplates` y `retrieveTemplate`. Se reprodujo el fallo de tipos antes de separar los puertos. Los casos nuevos del registro confirman que las plantillas Zavu siguen funcionando con el SDK real y que un descriptor sin su factory adicional devuelve el error propio de capacidad.

La primera ejecución Native completa terminó con **dos casos locales aprobados y los tres Native fallidos**, con fuentes estables. Lista y canje fallaron en emisión; el reporter JSON no conservó sus códigos concretos, por lo que no se atribuye un código no observado. La revisión manual llegó a emitir, enviar, verificar y presentar la pendiente, pero el test propuso una versión obsoleta: adjuntar la prueba ya incrementa la versión. El oráculo corregido usa `committedRequestVersion`, comprueba el siguiente incremento y conserva el replay.

Además, el fixture regeneraba los seis keyrings al cambiar de composición dentro de un mismo host/época. Esa preparación cambiaba la identidad global de consumo junto con el transporte. La protección existente de continuidad puede cerrar nuevas resoluciones cuando los eventos recientes pierden cobertura de claves retenidas. Ahora ambas composiciones usan el mismo `securityConfig`; no se cambia el presupuesto ni se dispensa esa protección. Lista y canje pasaron completos con ese ajuste. No se atribuye retrospectivamente un código que el primer reporte no conservó; se mantienen diagnósticos seguros de escenario, alternativa y código propio ante otro fallo.

## Recursos y límites

Tras terminar cada una de las dos ejecuciones completas y la repetición focal, el inventario oficial de Neon confirmó **cero ramas temporales propias y las tres originales preservadas**. Todos los productores terminaron y sus sesiones fueron consumidas. No se borra por prefijo ni se tocan recursos de terceros.

No hubo mensajes reales, migraciones productivas, cambios de OAuth ni ampliación del piloto autorizado. Se cierran únicamente T192/T194; T195 conserva la proyección del descriptor hacia los formularios existentes, T196 su documentación completa y T197 la validación integral. Las 212 tareas, las 71 aprobaciones temáticas y todos los criterios y gates mantienen su alcance original. El cierre documental conjunto y el CI pertenecen al nuevo checkpoint; no se les atribuye el control del commit anterior.
