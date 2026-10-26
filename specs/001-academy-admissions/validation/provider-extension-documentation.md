# Contrato documental de extensión de proveedores

## Alcance de T196

Revisión sobre el código guardado `f9482ca5d6ded62a859bec84821d14b2ccd824d1`.
Este trabajo modifica documentación y trazabilidad; no cambia aplicación,
dominio, infraestructura ejecutable, configuración desplegada, esquema o tests.
El único proveedor productivo sigue siendo Zavu.

| Criterio original | Documento propietario y contenido verificado |
| --- | --- |
| Extensión y factories | [Mensajería](../../../docs/architecture/tenant-messaging.htm#provider-extension): descriptor real, inspectores pequeños, capacidad opcional de plantillas, preparación y envío separados, composición allowlisted y ausencia de clientes/credenciales globales. |
| Contexto y autoridad | La misma guía identifica los contextos propios, el reader actual de proveedor, las comprobaciones independientes de SecretStore/preparación y la RPC fuera de locks. Los IDs del browser no sustituyen el contexto nativo. |
| Mapper y errores | Tipos externos sólo en infraestructura, proyección mínima propia, input/DTO propios separados de upstream, causa privada, status primero, rechazo sin fallback e incertidumbre posterior al marker. |
| Soporte real Zavu | SDK fijado, transporte explícito, cero retries internos, sender/canal/idempotencia originales, fallback deshabilitado y límites de plantilla/idioma/consulta propia. Su implementación no acredita recursos o entrega externos. |
| Evidencia propia y transporte | Tabla de catálogo/credencial, preparación, accepted/delivered, confirmación local y doble de correo. [Admisión](../../../docs/architecture/academy-admissions.htm#provider-substitution-contract) conserva identidad, reglas, prueba, CAS, replay y efectos de pertenencia en su owner. |
| Pasos futuros y testing | Seis pasos concretos para implementar y registrar un adaptador, reconciliar contratos propios actualmente limitados a Zavu, componer cada propósito, probar SDK/transporte y negocio reales, documentar y completar ensayos externos autorizados. |
| Doble frente a producción | El doble de `tests/support/messaging-email-provider.ts` queda expresamente limitado a pruebas. No aparece en el catálogo productivo ni acredita recepción o un proveedor disponible para el líder. |

La guía señala límites actuales que no deben esconderse por el nombre de un
puerto: el descriptor no registra automáticamente consulta de estado, webhooks o
avisos agrupados; `VerificationDeliveryPreparation` prepara OTP. El sender de
grupos conserva T185 y el criterio integral US12/SC-020 conserva T197.

El [manual del líder](../../../user-guides/tenant-messaging.html#provider-support)
explica proveedor disponible y significado de las pruebas sin ofrecer controles
futuros. La confirmación de una conexión no se presenta como prueba de admisión,
login o membresía. El menú y el índice detallado enlazan ese recorrido.

## Validación documental actual

- El helper canónico de source-trace comprobó primero que no había cambios en
  los paths documentados entre `377903c6` y `f9482ca5`, y registró los tres manuales
  e índices contra el código guardado actual.
- `check-manual.mjs` termina con cero errores en los dos documentos numerados.
  Sus dos advertencias corresponden a documentos locales sin URL publicada y
  a la ausencia de un catálogo central de traducciones. Las atribuciones de
  licencias conservadas son los únicos hosts adicionales permitidos.
- Chromium y WebKit, cada uno a 1280 y 390 px, pasan doce vistas de manuales,
  cuatro recorridos y ocho vistas de las dos guías de arquitectura: enlace
  directo, recarga, índice, regreso, navegación local entre manual y arquitectura,
  marcos completos y ausencia de desbordes, errores de JavaScript o requests externos.
- Se comprueban 184 enlaces de los manuales sin roturas. Las 32 capturas y sus
  scripts de representación se conservan; no se presentan como recapturadas.
- Los documentos y enlaces nuevos se contrastan con los contratos e implementaciones
  actuales. La revisión conjunta de cierre conserva su manifiesto y resultado propios.

El [CI exacto del estado publicado `f9482ca5`](https://github.com/guidomodarelli/TuTribu/actions/runs/38873704524)
terminó aprobado y su watcher fue consumido con exit cero: 533 archivos y 5625
casos aprobados, 288 archivos y 830 casos omitidos, build de 55/55 páginas.
Sirve como antecedente del código que se documenta; no acredita por anticipado
el futuro commit de esta documentación ni convierte omisiones en pruebas reales.
No se repiten suites de producto por este cambio exclusivamente documental.

## Límites del cierre

Se completa únicamente T196. Las 212 tareas originales, sus descripciones,
orden, 71 aprobaciones y gates se conservan. T197, SC-020 integral, T185, T211 y
los ensayos operativos/humanos siguen pendientes. La validación usa documentos
locales y no ejecuta envíos ni cambios de configuración de la aplicación.
La documentación nueva conserva su commit/push y CI propios.
