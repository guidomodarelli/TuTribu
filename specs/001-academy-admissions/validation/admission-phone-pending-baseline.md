# Prueba telefónica aplicada a una solicitud pendiente

Incremento de cobertura de T096/T101 sobre `a9519393f120f880dfada1ae9baedba02abf2536`. Mantiene 97/212 tareas completas y 115 pendientes.

El arnés ejerce SMS y WhatsApp mediante `PostgresAdmissionContactVerificationOperations`, identidad/sesión reales, PostgreSQL y criptografía. La solicitud ya existe desde el día anterior y carece de contacto. El código se solicita para esa misma pending y sólo se recupera dentro de la memoria privada del test; no se llama a un proveedor externo.

Después de comprobar el código, la prueba se aplica una vez. El replay conserva el resultado original y la versión 2. Las consultas comprueban las fechas originales de presentación/vencimiento, contacto telefónico fijo, binding de la cuenta, un evento `proof_attached` sin teléfono en su metadata y prueba aplicada a esa pending. Una propuesta posterior para otro teléfono se rechaza con `contact_binding_conflict` sin aumentar ningún efecto. No se crea membresía ni se cambia `emailVerified` o el número de sesiones.

Tipos-tests y oxlint focal pasan. La ejecución `RUN_ADMISSION_SQL_TESTS=1 pnpm exec vitest run tests/unit/modules/academy-admissions/infrastructure/admission-phone-pending-proof.test.ts --reporter verbose` cerró con 2/2 casos verdes, sin skips, en 298,25 s: SMS 148,105 s y WhatsApp 148,436 s. Ambos workflows terminaron después de confirmar la eliminación de sus ramas temporales propias.

La revisión aislada read-only cerró sin hallazgos accionables. Su target de un archivo conservó el hash del manifiesto `BF1416E6D36E3D837E96208F247A2F4BAD65A69B4C66F9F64672CCD3E5A4DA31` y 1/1 hashes de archivo coincidentes.

Este incremento no cambia comportamiento productivo. No sustituye el recorrido de adjunción en navegador, pruebas de conflictos con otra cuenta, recuperación autorizada de binding ni todos los AC de US5 por fuente/canal. No acredita ensayos ON externos ni gates operativos.
