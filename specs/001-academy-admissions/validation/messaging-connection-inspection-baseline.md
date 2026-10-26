# Inspección de credenciales y recursos de mensajería

Estado: avance de T075/T083, sin cierre de tareas ni acreditación de OG-03. Código local sobre HEAD `dc9479db759481455349aef936573967b2b14a0a`, sin commit, push ni despliegue.

El puerto de dominio `MessagingConnectionInspector` separa los hechos privados de credencial de las selecciones mínimas de sender y plantilla. El adapter usa el SDK instalado `@zavudev/sdk@0.57.0`, sus métodos reales y un transporte propio que no tiene fallback de red. Se consultaron también sus fuentes oficiales fijadas en `ecd7329a08a03f7751afe319a5d5f170af1f48a9`.

La primera ejecución de la suite fue roja por ausencia del adapter: no se ejecutaron casos de comportamiento y no se atribuye esa salida a un bug reproducido del producto. Tras implementarlo, doce casos pasaron en 975 ms. La ampliación con fallo de continuación, causa privada, timeout y cancelación pasó junto con la regresión del sender: veinticuatro casos en dos suites, 1,03 segundos, handle5372dc, salida 0.

Cobertura de inspección: `isTestMode` de me frente a prefijos contradictorios; todas las páginas de sender/template incluyendo una página vacía intermedia; capabilities explícitas sin inferirlas de teléfono/correo; filtrado de canales ajenos; separación de categoría/aprobación/idioma de plantilla; lista denegada y detalle manual real; identidad de detalle cruzada; cursor repetido; credencial vacía; HTTP 401/403/402/429/503 sin retries ni interpretación de mensajes; dos credenciales intercaladas frente a headers globales; cancelación y timeout; descarte de lista parcial y conservación de la causa original privada. No se envían mensajes ni se consumen recursos externos.

`pnpm exec tsc --noEmit`, `pnpm run typecheck:tests` y `pnpm run lint` terminaron con salida 0. La revisión aislada read-only del target está en curso. Los mappers hacen narrowing mínimo de los campos consumidos; no validan schemas de respuestas del proveedor. Las referencias de proyecto/equipo/clave son privadas; los resultados del adapter no son DTOs públicos de HTTP.

Falta la composición con autoridad actual, SecretStore y presupuesto de credencial, persistencia de estados por versión, páginas propias con sus DTOs guardados, validación de compatibilidad exacta sender/template mediante diagnóstico, asistente y pruebas de hosting Node/Workers. La inspección de preparación no concede activación. T074/T075/T081–T086/T089–T094 y OG-01/02/03 mantienen su alcance original.

### Modelo de conexión y activación de candidata

Se agregan modelos puros independientes para lifecycle, versión efectiva y diagnóstico local. Quince casos de comportamiento cubren defaults draft/candidate sin selección, credencial todavía no validada, correo con países vacíos, diagnóstico no verificado, actor/tribu/conexión/sender cruzados, ventana inclusiva de veinticuatro horas y futuro, sandbox, liderazgo/versión/época/restore, países telefónicos guardados y restricciones actuales, template/idioma/version exactos, no-op, cambio efectivo y suspensión con slot retenido. La edición no reutiliza el envelope de otra versión: requiere una referencia nueva con AAD/FK propios y deja sin prueba la nueva configuración.

La primera ejecución fue roja por módulos ausentes, sin comportamiento ejecutado. La migración del contrato de hechos a `MessagingCountryPolicy` produjo un rojo observable en el caso telefónico, handle8f9e10: el assessment antiguo todavía leía el array anterior. Se actualizó el modelo para consumir el snapshot único, comprobar tribu y restricciones comprobadas. La regresión final pasó treinta y nueve casos en tres suites (dominio, inspector y sender), 1,68 segundos, handlef19515. `pnpm run typecheck`, `typecheck:tests` y lint terminaron con salida 0.

La arquitectura actualizada tuvo cuatro renders aprobados: Chromium/WebKit a 390/1280 px, catorce enlaces resueltos, sin errores de JavaScript ni overflow, handle01c90d. La revisión de ambos grupos continúa. Los modelos nuevos todavía no están compuestos en un writer de conexión; no se marca T081 por su sola existencia ni se afirma diagnóstico, activación o hosting operativos.

### Correcciones de revisión

El primer review detectó un P2 de narrowing: referencias numéricas de apiKey/project/team podían atravesar el puerto privado como strings. Tres regresiones con el SDK real reprodujeron el fallo (handle291a48). El fix comprueba únicamente que esos tres campos consumidos sean strings no vacíos, sin schema de proveedor. El rerun read-only del mismo reviewer terminó sin hallazgos; los hashes inicial/final de source y test coinciden: `43D5C84DD6732DCCEFB99E641A3F06CCE4ABCE2696DC548301926FAB80C2058B` y `17210D355C989CD58CB453979699C40EBC6402D61801136C3BAED9ABB91174E2`.

El review del dominio detectó otro P2: una fecha inválida de validación podía superar la comparación de futuro. La regresión cb61a1 confirmó `allowed:true` frente a `credential_not_validated`. El guard consume el timestamp y exige `Number.isFinite`. La ejecución final de dominio/inspector/sender pasó 43 casos en tres suites, 1,64 segundos (de6263), sin librerías mockeadas. Types, typecheck de tests y lint pasaron (650f51). El rerun del dominio está en curso; no se atribuye el hash anterior al fix.

El rerun final del mismo reviewer cerró el P2 del dominio sin hallazgos accionables. Inspección, modelos y sus correcciones quedan revisados; continúan pendientes la composición de producto y las tareas de conexión completas. La auditoría conjunta de dominio y documentación/configuración verificó diecisiete archivos con hashes inicial/final iguales, manifest `FD44DEC581D112CBDCFDA25D0B83E4DC1F96831FE589A4609EAC18D2D6E2D1A5`. No se sustituye con ese manifest la evidencia de un writer o endpoint todavía no implementado.
