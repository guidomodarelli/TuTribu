# Prueba local en la presentación común inicial

El código está guardado/subido en dbb67c62127937fb7677371ff0801c457056d3f5; el remoto coincide. Este incremento de T101 mantiene 97/212 tareas completas y 115 pendientes. El perfil común/manual admite prueba local; el cutover completo continúa cerrado por sources y modos faltantes.

PostgresAdmissionSubmissionProofReader proyecta la prueba propia, su contacto/origen, recurso y vínculo sin tomar locks mutables tempranos que necesiten upgrade. El ledger y la autoridad de cuenta/política/tribu conservan su owner. La presentación inserta una pendiente transitoria y aplica la prueba mediante el colaborador atómico existente bajo submit_admission explícito. La adjunción posterior mantiene attach_admission_proof como default; ningún otro namespace puede autorizarla.

El commit confirma solicitud, prueba, vínculo, auditoría, aviso y snapshot juntos, o revierte todo. El resultado refleja la pendiente con evidencia local; no crea membresía, sender/RPC ni identidad global. Se comprueban cuenta, contacto, época, recurso, versión y tiempo. Las referencias de operación/prueba se canonicalizan en el schema HTTP antes del fingerprint; tokens opacos y otros comandos conservan sus contratos.

| Ensayo | Resultado |
| --- | --- |
| 41534 | TDD SQL rojo en 120,89 s al esperar la presentación con prueba disponible; el writer todavía conservaba el perfil manual/OFF. |
| 41430 | Timeout administrativo antes de crear rama; no hubo recurso pendiente de limpiar. |
| 55604 | SQL verde en 132,32 s con cleanup: una pending, una prueba applied, un vínculo y replay sin duplicación; cero miembros. |
| 19165 | Dos SQL focales verdes en 139,47 s con cleanup: respuesta perdida después de COMMIT recuperada y compatibilidad de primera adjunción con el namespace default. Los otros cuatro casos no se atribuyen a esta selección. |
| 19403 | SQL manual/OFF por teléfono verde en 44,25 s con cleanup, sin contacto, vínculo ni sender. Los otros catorce casos no se atribuyen a esta selección. |
| Local final | 81 casos en seis suites verdes en 3,44 s, incluyendo la regresión HTTP de UUID canónicos y el guard de cutover completo. |
| 73766 | Build Next 16.3.4 verde: compilación 27,2 s, TypeScript 6,0 s y 46 páginas. |
| Tipos/lint | Producto/tests verdes, lint focal sin advertencias y diff-check limpio; aviso preexistente de CRLF en el test de mutations. |
| Arquitectura | Cuatro renders finales Chromium/WebKit1280/390 sin overflow/pageerrors. |

Tras acreditar el nuevo flujo se actualizó la expectativa de capacidad del runtime. ReadAdmissionRuntimeUseCase sigue rechazando el perfil instalado: no alcanza tener común/manual/verificación para afirmar todos los sources y modos. La revisión Codex independiente de once archivos terminó sin hallazgos; hash inicial/final FBC958511537C686F70B5E920A18FFD25AD6C5D4DACAEDD5340634F06979DFE8 y once archivos intactos.

Arquitectura, CHANGELOG y nota de disponibilidad acompañan el comportamiento. Source-trace de los tres manuales apunta al commit real dbb67c62, con scopes 20/18/18. 22306 final pasó doce renders de esos documentos en ambos motores y anchos; comprobó el commit en DOM y la navegación entre ambos índices y el manual. Check-manual conservó cero errores y las dos advertencias locales conocidas (sin URL publicada ni catálogo de traducciones). La revisión documental de tres archivos cerró sin hallazgos: 9FB3E8CCF37564D2AE0CFEBF438B5F2A4D0034DEF37CCDD4A2E91192FD075327 estable y tres hashes intactos.

La UI, los demás sources, la recuperación comercial y la revisión de evidencia aplicada mantienen su integración pendiente. No se publicaron ni desplegaron capacidades y no hubo mensajes externos o pagador real.
