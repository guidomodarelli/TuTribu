# Auditoría propia de política y aplicación de pruebas

Avance de T167/T169/T170 sobre `6c1b6630`. Conserva las 212 tareas y no cierra ninguna de esas tareas, T166, T171 ni un gate operativo por acreditar sólo estos productores.

## Responsabilidades y cobertura efectiva

- `AdmissionAuditEvent` representa eventos privados de los cuatro comandos de política implementados y de la aplicación local de pruebas. Su scope conserva actor, tribu, recurso, operación original, versión, regla y fecha autoritativa. Los constructores seleccionan sus campos sin copiar el comando; no validan filas de PostgreSQL ni respuestas de proveedores.
- `AdmissionAuditRepository` aporta el puerto de escritura. `PostgresAdmissionAuditRepository` usa la transacción ya autorizada y bloqueada del owner; el ledger y el efecto conservan el commit original. Las consultas de métricas y sus dimensiones cerradas permanecen independientes de las referencias privadas de auditoría.
- Política conserva su metadata vacía y el motivo interno de pausa. Aplicación local conserva únicamente `proofId` y `previousRequestVersion`, con el mismo instante autoritativo de aplicación. No incorpora contacto, código, credencial ni sobre al evento.
- Los escritores reales de política y pruebas consumen los constructores y el adapter. No hay cambios de tablas, constraints, permisos o recorridos de interfaz en este avance; las migraciones existentes siguen siendo la autoridad de storage y del vínculo a la operación.

## Validación

- Baseline previo: el nuevo test de comportamiento no pudo resolver el módulo de eventos ausente; una suite falló antes de implementar el contrato. No se acredita una ejecución de sus cuatro casos en ese estado.
- Pruebas locales: 19 aprobadas, cero fallidas y cero excluidas; cuatro casos de selección de campos, procedencia y reloj, junto con los quince casos vigentes del contrato público de métricas.
- PostgreSQL real: cinco casos seleccionados aprobados, cero fallidos. Cubren el actor y ledger originales después de perder el commit reply, replay sin duplicados, creación/edición y CAS, activación de política, rechazo por sesión/recencia/rol y aplicación local de prueba con el mismo reloj. Los quince casos excluidos por filtro o flag no se acreditan en este run. Las cinco ramas propias se retiraron con confirmación; el piloto permanece.
- HTTP real con Next y Better Auth: un caso seleccionado aprobado, cero fallidos; inicialización, edición y pausa, recuperación de resultado original, rechazo de autoridad falsa y pérdida de recencia/liderazgo. Los otros dieciocho casos del archivo quedaron fuera de este run. La copia efímera se retiró con confirmación. No se usa este fixture como evidencia de un login real de Google ni de entrega de Zavu.
- Types de producto, types de tests y lint: aprobados. Build real aprobado en el checkout aislado con las ocho fuentes finales cotejadas y configuración temporal generada sólo en memoria; el primer intento había fallado por entorno Better Auth ausente, sin atribuirlo al código. No se ejecutó un build en el checkout que mantiene el piloto.
- Documento de arquitectura: cuatro renders Chromium/WebKit a 390 y 1280, sin desbordamiento ni errores JavaScript. La nueva ancla es única y el enlace al registro existe.

## Trabajo restante

Completar auditoría de cambios de conexión, uso, permisos, lista, invitaciones, decisiones, entregas y exposiciones autorizadas; readers/endpoints con autoridad actual y aislamiento; persistencia/agregación de métricas y surfaces por rol. La minimización de solicitudes terminales a 180 días y auditoría a 365 conserva sus requisitos y dependencias. Este registro no sustituye la matriz completa de T166 ni la validación de US11.
