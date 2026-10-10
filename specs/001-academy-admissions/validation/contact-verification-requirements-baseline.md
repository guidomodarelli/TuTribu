# Auditoría de requisitos de comprobación local

Incremento de T095 sobre `b79c331d`. Se conservan 112 tareas completadas y 100 pendientes de 212. Esta preparación no cierra T095 ni los recorridos/gates de verificación restantes.

## Nuevas regresiones comprobadas

- `admission-verification-scope-isolation.test.ts`: un caso PostgreSQL/crypto nativo verde en 117,56 s. Un código genuino se rechaza a través de otra cuenta, otra tribu y otro desafío, antes de crear operaciones o alterar contadores. Su propietario todavía puede usarlo después. Queda una prueba local, sin nueva sesión, captura global o verificación del correo global.
- `admission-verification-dispatch-pipeline.test.ts`: ampliación nativa verde en 113,61 s. Conserva el pipeline con SQL, cuenta, preparación y SDK reales, y transporte HTTP cerrado. La aceptación del proveedor deja desafío issued, cero fallos, verified_at NULL, cero proofs/membresías, emailVerified false, la sesión original y ninguna captura global. Se conserva el replay sin otro POST y el trabajo ajeno de la cola.
- Cuatro suites focales de orquestación, dominio, lista y boundary de errores: 58 casos verdes. Tipos de tests y lint verdes.
- Revisión aislada de las tres regresiones, incluida la protección de borrado indicada abajo: cero hallazgos accionables; HEAD `b79c331d`, tres hashes estables, manifiesto `048748198253BB225906B33021EE47528D3131522E21BD571247AB09136323CD`. No se ejecutaron pruebas desde el reviewer.

La auditoría completa de los siete AC, límites de cuenta/contacto, ventanas UTC, propósito diagnóstico, ON/Gmail y OFF requiere sus fuentes y resultados correspondientes. Las corridas pendientes no se acreditan por haber sido iniciadas.

## Eliminación de tribu: requisito aún pendiente

El intento nativo de eliminar una tribu con admisión aprobada reprodujo `23503` en `admission_binding_tribe_fkey`. La eliminación de cuenta ya implementada no cubre este caso. La minimización de tribu debe conciliar identidad mínima, auditoría, pertenencia, parada de entregas y contadores de abuso; no basta cambiar esa FK a CASCADE.

`allowlist-binding-tribe-deletion.test.ts` pasa un caso nativo en 67,66 s y comprueba la protección actual: el rechazo revierte el borrado completo y conserva propietario/contacto/referencia, configuración de lista, miembro admitido, solicitudes, operaciones y auditoría, además de las cuentas globales independientes. Su verde acredita el rollback protector, no una eliminación implementada. T111/T171 siguen abiertas y el objetivo final conserva la eliminación con minimización explícita requerida por la spec.

Estos cambios son pruebas/evidencia, sin modificar comportamiento de producto, esquema, permisos, UI, manuales o changelog. No se repite el build de producto sin un cambio que lo justifique.
