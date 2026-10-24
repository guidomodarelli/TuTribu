# Teclado administrativo y recuperación del lote original

## Estado y alcance

T198 y T208 permanecen abiertas. Este avance cubre la selección administrativa mediante teclado, resultados mixtos y recuperación de una respuesta perdida en los cuatro proyectos reales. No acredita por sí solo toda la feature, un lector de pantalla de sistema operativo, SC-014 ni los ensayos externos.

El caso canónico nuevo es `tests/e2e/academy-admissions.spec.ts`. Reutiliza la bandeja y beez-ui reales, PostgreSQL en ramas propias, sesiones firmadas por Better Auth y un servidor Next de producción en loopback. No crea entregas ni modifica la verificación global del correo.

## Resultado ejecutado

Fuente: worktree `admission-final-ui-validation`, HEAD `7988e3a4ad2834a960a7e8539ac55783be8dd3ad` más nueve paths propios. Registro privado `.git/t198-keyboard-native-d3c03987/`.

| Proyecto | Viewport | Resultado | Duración del caso |
| --- | --- | --- | --- |
| `chromium-mobile` | 390 × 900 | Aprobado | 327.790 ms |
| `chromium-desktop` | 1280 × 900 | Aprobado | 328.020 ms |
| `webkit-mobile` | 390 × 900 | Aprobado | 331.225 ms |
| `webkit-desktop` | 1280 × 900 | Aprobado | 338.039 ms |

Resultado completo: cuatro esperados aprobados, cero fallidos, omitidos o flaky y cero errores globales. Los 3.626 inputs y los dos helpers conservaron sus hashes. La colección anterior de 28 casos en cinco archivos sólo acredita discovery; este Native ejecutó cuatro casos de un archivo, no los otros veinticuatro.

## Comprobaciones observadas en cada proyecto

- Tab y Shift+Tab reales recorren los controles; Space selecciona y Enter confirma. No se usa `focus()` programático ni se fabrican eventos DOM para simular el recorrido.
- El primer lote obtiene una aprobación y un conflicto después de una decisión concurrente real confirmada por otro request. Los resultados conservan sus nombres, conteos y estado accesible.
- El segundo POST confirma dos decisiones en el servidor antes de perder su respuesta. La UI conserva el estado incierto y permite consultar el original.
- Después de la recarga explícita se consulta exactamente una vez el resultado original. Un GET posterior de la lista devuelve 503 y el resultado confirmado permanece visible.
- Se mantienen exactamente dos POST, dos documentos —incluida la recarga deliberada— y ningún refresh RSC adicional. Consultar un resultado terminal no repite decisiones ni vuelve a consultar el original.
- Dos snapshots del árbol accesible comprueban el resumen y los nombres de los resultados. No contienen los valores privados proporcionados por el fixture; esto es evidencia semántica, no una sesión de NVDA, VoiceOver o TalkBack.
- PostgreSQL confirma tres membresías básicas activas, cuatro decisiones, cero entregas y cero cambios globales a `emailVerified`. No se admiten usuarios ni se aprueban selecciones mediante un stub.

## Revisión, integración y recursos

La revisión inicial encontró un P2 del oráculo RSC: se restablecía su base después de recuperar el original, absorbiendo un refresh adicional. Se eliminó ese restablecimiento y se compara la misma base antes y después de la recuperación. También se reutiliza `MESSAGING_CRYPTO.keyBytes` en el nuevo caso. El dictamen posterior conserva dieciocho inputs estables y cero hallazgos; los dos helpers privados tienen revisión separada de ocho inputs estables, sin hallazgos.

La extracción del fixture compartido conserva el recorrido anterior con puntero como modo por defecto. El modo teclado es explícito. El arreglo independiente del scratch del observer ya está guardado en `a1158f1c` y no se atribuye a estos ocho paths de integración.

El principal recibe exactamente los ocho archivos revisados y ejecutados, comprobados por SHA256, sobre `10143717`. Tipos de tests, lint focal y `git diff --check` pasan después de esa copia. La implementación privada de reconciliación guardada entre ambos checkpoints no se considera ejecutada por estos casos de interfaz.

Cada caso eliminó su rama propia. Al terminar se confirmó el inventario original de tres ramas mediante la API de Neon; el piloto previo, desarrollo y producción permanecen. No se borró por prefijo ni se conservaron servidores de esos casos.

La matriz de T198/T208 debe reconciliar este resultado con los Native públicos, invitaciones, mensajería y avisos anteriores, distinguiendo evidencia reutilizable de ejecuciones aún ausentes. El lector de sistema operativo y los participantes humanos conservan sus criterios pendientes. No cambia el inventario 196/16 ni las 71 temáticas aprobadas.
