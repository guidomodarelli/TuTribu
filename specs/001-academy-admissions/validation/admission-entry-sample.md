# Ensayo automatizado de ingreso con diez cuentas

**Estado: ejecutado y aprobado para SC-014/T207.** Diez de diez cuentas completaron el recorrido; el criterio exige nueve. El usuario eligió diez cuentas ficticias en lugar del ensayo con personas. Se mantienen el ID SC-014 y el objetivo de nueve resultados bajo dos minutos; el método actual mide el recorrido funcional y no certifica usabilidad humana. Las menciones históricas al ensayo humano corresponden al criterio anterior.

## Preparación

- Integrar primero los cambios de `origin/main` y comprobar el acceso de desarrollo con correo y contraseña. Ese acceso está limitado a `next dev`, una flag explícita y la identidad configurada; el registro público sigue cerrado y el método queda deshabilitado fuera de desarrollo.
- Crear diez cuentas ficticias independientes mediante el mecanismo de desarrollo y el adapter real de Better Auth, en una copia propia aislada. Preparar sesiones reales por identidad, sin sustituir el SDK ni las cookies por mocks. Conservar la restricción del método configurado al organizar los perfiles de prueba.
- El arnés ejecuta el handler HTTP real de Better Auth en loopback con una identidad configurada por instancia de desarrollo. El navegador recibe sus cookies por HTTP y el build real de Next confirma cada sesión. La configuración de la aplicación productiva conserva deshabilitado el método de contraseña.
- Usar alias y direcciones sintéticas del dominio reservado `.test`. Mantener contraseñas, tokens y cookies únicamente en el entorno privado del ensayo y en memoria del ejecutor; no incluirlos en código, reportes, capturas o este documento.
- Resolver las dependencias de T207 y registrar commit, navegador, tamaño, política y estado de sesión inicial. La preparación de cuentas/sesiones ocurre antes de la medición, como parte de la condición de cuentas preparadas.
- Elegir inicialmente solicitud común con revisión manual y comprobación adicional desactivada. Una confirmación visible de solicitud pendiente satisface la presentación; no necesita aprobación del revisor dentro del cronómetro. Esto no valida invitaciones nominativas, identidad Google ni entrega ON.
- Conservar las guardas de sesión, cuenta, tribu, rol y recencia. El login de desarrollo no acredita una autenticación reciente de Google ni habilita por sí solo operaciones sensibles. Si un caso necesita datos de identidad simulados, identificarlos como fixtures del entorno aislado; no registrarlos como verificación externa real.

## Medición y resultado

El escenario ejecutable vive en `tests/e2e/admission-entry-sample.spec.ts`, con `playwright.admission-entry-sample.config.ts`. El protocolo de preparación se documenta también en `docs/conventions/dev-sign-in.htm`. El reporte JSON se adjunta al resultado de Playwright y omite credenciales e identificadores de cuentas.

1. Abrir el enlace con la sesión preparada de cada cuenta. Iniciar el tiempo en esa navegación e incluir carga, lectura de estado, validación, escritura, recuperaciones y confirmación visible.
2. Completar el formulario por controles accesibles reales. Detener al ver el resultado confirmado de solicitud presentada o ingreso; una escritura iniciada o respuesta incierta no acredita finalización.
3. Registrar duración bruta y únicamente una espera externa de entrega comprobada. Duración evaluada = bruta − espera externa. Exactamente 120.000 ms no cumple «menos de dos minutos».
4. Conservar las diez observaciones, también errores y timeouts. No descartar cuentas fallidas para alcanzar nueve éxitos. Si el entorno se invalida, guardar la cohorte fallida antes de repetirla.
5. Acreditar SC-014 sólo con al menos nueve finalizaciones bajo el umbral y diez identidades/sesiones independientes comprobadas. Registrar efectos e idempotencia sin duplicados y sin mensajes reales en este ensayo inicial.
6. Ejecutar la cobertura de navegadores y accesibilidad técnica pertinente. Los resultados no reemplazan las verificaciones con lector real de SC-018, ni los gates de Google, canales y hosting.

## Resultados observados

Se ejecutó el build real en una rama propia de Neon con cinco cuentas por motor, diez identidades y diez sesiones independientes. Los tiempos incluyen navegación, estado, validación, escritura y confirmación visible. No hubo espera externa de entrega. El contenido de las 1.953 fuentes de producto medidas coincide con el checkpoint `dc93557f2339eb057edb8931ed8b5c0a179b99e7`, guardado después del ensayo; el reporte conserva esa procedencia y su hash.

| Cuenta | Creación/sesión real | Navegador/tamaño | Bruta ms | Espera externa ms | Evaluada ms | Resultado confirmado | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | Better Auth; sesión confirmada | chromium / 390 | 39214 | 0 | 39214 | Solicitud pendiente | Aprobado |
| A02 | Better Auth; sesión confirmada | chromium / 1280 | 35850 | 0 | 35850 | Solicitud pendiente | Aprobado |
| A03 | Better Auth; sesión confirmada | chromium / 390 | 33099 | 0 | 33099 | Solicitud pendiente | Aprobado |
| A04 | Better Auth; sesión confirmada | chromium / 1280 | 35106 | 0 | 35106 | Solicitud pendiente | Aprobado |
| A05 | Better Auth; sesión confirmada | chromium / 390 | 34241 | 0 | 34241 | Solicitud pendiente | Aprobado |
| A06 | Better Auth; sesión confirmada | webkit / 390 | 33531 | 0 | 33531 | Solicitud pendiente | Aprobado |
| A07 | Better Auth; sesión confirmada | webkit / 1280 | 37222 | 0 | 37222 | Solicitud pendiente | Aprobado |
| A08 | Better Auth; sesión confirmada | webkit / 390 | 33941 | 0 | 33941 | Solicitud pendiente | Aprobado |
| A09 | Better Auth; sesión confirmada | webkit / 1280 | 34716 | 0 | 34716 | Solicitud pendiente | Aprobado |
| A10 | Better Auth; sesión confirmada | webkit / 390 | 37997 | 0 | 37997 | Solicitud pendiente | Aprobado |

## Cierre

El [reporte sanitizado](admission-entry-sample-summary.json) conserva las diez observaciones. PostgreSQL confirmó diez cuentas con credencial, diez sesiones y diez solicitudes; cada replay devolvió el original, sin solicitudes adicionales. Hubo cero cuentas Google, membresías y entregas externas. La consulta final de Neon confirmó sólo las tres ramas protegidas originales.

El primer intento se detuvo antes de crear la cohorte: PostgreSQL rechazó con `23514` dos instantes de activación distintos. Se corrigió exclusivamente el dato del arnés para reutilizar un mismo instante, conservando el trigger. Esa ejecución fallida y su limpieza quedan registradas por separado. T198/T208, SC-018 y los gates externos conservan sus pendientes.

Guardar evidencia sanitizada del login, resultado visible y efectos, con configuración, commit y entorno. Conservar el historial de las corridas y las limitaciones. No declarar personas participantes, tiempos de uso humano, autenticación Google ni entrega externa a partir de estas cuentas ficticias.
