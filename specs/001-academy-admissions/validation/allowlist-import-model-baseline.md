# Modelo e input de importación CSV

La base de T114 separa el parser de input en infraestructura, el modelo puro de preview/filas/selección/outcomes y la proyección de DTO propio en aplicación. No crea entradas, vínculos, membresías, operaciones SQL ni mensajes. Los writers, ledger de bloques/filas, rutas, reporte y pantalla conservan sus tareas de integración.

El parser consume UTF-8 lossless con BOM inicial, encabezados exactos `identity,display_name`, LF/CRLF, coma, campos entre comillas, comillas escapadas y registros multilínea. Impone por separado diez mil registros y cinco MiB. El formato global inválido, NUL y encoding no utilizable cierran todo el archivo. Conserva errores de contacto/nombre como datos por fila; las cadenas HTML o fórmula permanecen inertes.

El modelo fija líder/tribu/tipo/versión de política, huella/clave privadas, versión uno y vencimiento/purga máxima a veinticuatro horas. Los duplicados se referencian al primer registro válido; un registro inválido anterior no impide una propuesta posterior válida. No selecciona filas al crear una vista previa. La selección requiere filas válidas pendientes y contexto/versiones actuales, preserva resultados existentes y no vuelve a seleccionar los confirmados. Los outcomes del owner conservan su versión original; una contradicción no pisa progreso, y processing persiste mientras alguna fila seleccionada no tiene resultado. El modelo no acredita por sí solo un commit real ni una purga ejecutada.

El DTO propio permite mostrar nombres ingresados inválidos junto con su error, dentro del presupuesto global, sin seleccionarlos. Omite actor, tribu interna, política privada, keyId/fingerprint y binding. Los conteos coinciden con los outcomes registrados, y la versión original de una entrada permanece distinta de la versión del import.

## Validación ejecutada

- Parser: 14 casos verdes, incluidos BOM/acentos/comillas/newlines, alias, vacíos por fila, header/columnas/comillas inválidas, diez mil filas exactas y exceso, cinco MiB exactos/exceso, tamaño multibyte, UTF-8 inválido, surrogate no emparejado y NUL.
- Dominio: 15 casos verdes de normalización/errores/duplicados, teléfono inequívoco, scope/plazos, selección, CAS, conservación de resultados, resume sólo pendiente, replay sin efecto y rechazo atómico de contradicción.
- DTO: 2 casos verdes con datos inválidos visibles, campos privados ausentes, selección de filas inválidas rechazada, conteos y versión original.
- Regresión final: 63 pruebas verdes y un caso SQL existente no seleccionado en cinco suites, 4,84 s. Los 31 casos nuevos se ejecutaron, sin skips. El skip no acredita una validación SQL de importación.
- `pnpm run ci` final verde: lint y tipos de producto/tests, 422 suites/4.380 casos verdes (105 suites/419 casos no seleccionados), compilación 12,9 s, tipos de build 2,4 s y 47 páginas. El build anterior al fix de copia también fue verde (22,9 s/5,1 s), sin atribuirlo al target final. Los gates no seleccionados conservan su alcance pendiente.
- Arquitectura `.htm` actualizada y renderizada en Chromium/WebKit a 1280/390 px: cuatro renders, cero desbordes y errores JS. No cambió ningún flujo operable, por lo que no se modifican manuales ni changelog ajenos.

## Rojos y revisión

Las pruebas del parser, modelo y proyección se observaron rojas antes de implementar sus comportamientos. Después se reprodujeron dos gaps reales (NUL y reloj anterior a creación) y se corrigieron. Una prueba con Buffer nativo detectó que `.slice()` compartía la huella mutable; `Uint8Array.from` la aísla y el caso terminó verde. No se alteraron expectativas para ocultar esos fallos.

Review de código en lectura sin hallazgos adicionales sobre el manifiesto `3B63696F393546EBD2582B688618545B5203732AE48C62E4325C6A071DEF5347`: diez de doce hashes permanecieron iguales y se verificó el cambio declarado del modelo/test de Buffer. Se requiere verificar el target final de código/documentación antes del commit.

El formato de comillas usa [RFC 4180](https://www.rfc-editor.org/info/rfc4180/); UTF-8 obligatorio, encabezados y límites son del spec de TuTribu. La retención modelada no sustituye el worker pendiente. No se dan por completos T108/T115/T116/T118, la importación disponible en la app ni todo US3.
