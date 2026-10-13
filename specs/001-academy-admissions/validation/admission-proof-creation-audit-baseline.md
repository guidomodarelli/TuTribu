# Creación auditada de prueba local

Avance de T169/T170 sobre `b2fefddf`. Conserva las 212 tareas originales y sus criterios de otros productores, actividad, métricas, retención y gates; no modifica marcadores de completitud.

## Responsabilidad del registro

`PostgresAdmissionContactVerificationOperations.verify` conoce el ledger original y la autoridad de la cuenta. Después de la comprobación local relee únicamente los campos propios necesarios de la prueba y registra `proof_created` mediante el constructor/puerto privados existentes en esa misma transacción. El escritor compartido de código conserva sus efectos y su contrato; la creación de evidencia de admisión pertenece al owner de la operación.

El audit conserva actor, tribu, prueba, operación, estado confirmado, desafío, época, canal y el reloj `verified_at` persistido. `resourceVersion` queda nulo porque la prueba no tiene un contador; `requestId` queda nulo antes de aplicarla. Regla y causa tienen ausencia explícita en la creación. No copia contacto, código, MAC, sobre, datos globales ni payload del proveedor. Las filas propias se consumen con su contrato, sin schema-validation adicional de backend.

El replay conserva un único registro; un código incorrecto conserva contabilidad y rechazo originales sin crear prueba ni registrar su creación. La cuota cero y una conexión suspendida conservan la comprobación local del contacto. El ledger mantiene autoridad final y rollback de todos los efectos, incluida la auditoría, si la sesión vence después del nuevo INSERT. Los resultados públicos, permisos, estados y límites conservan su contrato; no se agrega un recorrido visible ni se modifican los manuales ajenos al registro privado.

## Evidencia y cierre

- El rojo con PostgreSQL real terminó con un fallo por la ausencia del registro esperado y tres casos fuera del filtro, antes de modificar el owner; no se acredita como aprobado. Su rama propia quedó ausente y el piloto conservado.
- Tipos de producto/tests y lint aprobados. Veinte casos locales del contrato privado/legacy y quince de métricas públicas aprobados, sin omisiones, con dos reportes separados que conservan su alcance.
- La ejecución PostgreSQL final termina con salida cero y cinco aprobados, sin fallos ni omisiones. Incluye el original recuperable, errores de código, denegaciones previas y un trigger de la rama desechable que vence la sesión real después de escribir el audit. Se comprobó rollback de prueba, registro, consumo del código y sobre; conservó la entrega, contabilidad y pertenencias originales.
- Build real final aprobado en checkout propio sobre el checkpoint actual, con las tres fuentes finales copiadas/cotejadas y configuración sintética generada sólo en memoria. La copia conserva únicamente el template versionado `.env.example`, sin recibir el entorno privado del piloto. La página de arquitectura pasa cuatro vistas Chromium/WebKit a 390/1280: sin overflow ni errores, anchor único y enlace local existente. Las dos capturas móviles inspeccionadas conservan texto y código legibles.
- Los seis recibos propios corresponden a un rojo y cinco aprobados. La consulta administrativa posterior confirma ausencia de todos sus IDs y conserva la rama del piloto; cada recibo acredita nombre impredecible, parent y ausencia de default. El cierre se somete a revisión independiente del alcance exacto antes de commit y push.

## Alcance original restante

Los registros de desafío y diagnóstico, invalidación/vencimiento de pruebas, entregas, exposiciones autorizadas, pertenencias y otros cierres SQL conservan sus propios criterios. Este registro tampoco acredita readers/endpoints, agregados operativos, logger safe, pantallas por rol, retención general, entrega real de Zavu ni gates de despliegue/activación. T169/T170 permanecen abiertas.
