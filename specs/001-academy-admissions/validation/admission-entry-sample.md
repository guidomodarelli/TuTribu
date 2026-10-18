# Ensayo automatizado de ingreso con diez cuentas

**Estado: preparado, sin ejecutar.** T207 y SC-014 siguen pendientes. El usuario eligió diez cuentas ficticias en lugar del ensayo con personas. Se mantienen el ID SC-014 y el objetivo de nueve resultados bajo dos minutos; el método actual mide el recorrido funcional y no certifica usabilidad humana. Las menciones históricas al ensayo humano corresponden al criterio anterior.

## Preparación

- Integrar primero los cambios de `origin/main` y comprobar el acceso de desarrollo con correo y contraseña. Ese acceso está limitado a `next dev`, una flag explícita y la identidad configurada; el registro público sigue cerrado y el método queda deshabilitado fuera de desarrollo.
- Crear diez cuentas ficticias independientes mediante el mecanismo de desarrollo y el adapter real de Better Auth, en una copia propia aislada. Preparar sesiones reales por identidad, sin sustituir el SDK ni las cookies por mocks. Conservar la restricción del método configurado al organizar los perfiles de prueba.
- Usar alias y direcciones sintéticas del dominio reservado `.test`. Mantener contraseñas, tokens y cookies únicamente en el entorno privado del ensayo y en memoria del ejecutor; no incluirlos en código, reportes, capturas o este documento.
- Resolver las dependencias de T207 y registrar commit, navegador, tamaño, política y estado de sesión inicial. La preparación de cuentas/sesiones ocurre antes de la medición, como parte de la condición de cuentas preparadas.
- Elegir inicialmente solicitud común con revisión manual y comprobación adicional desactivada. Una confirmación visible de solicitud pendiente satisface la presentación; no necesita aprobación del revisor dentro del cronómetro. Esto no valida invitaciones nominativas, identidad Google ni entrega ON.
- Conservar las guardas de sesión, cuenta, tribu, rol y recencia. El login de desarrollo no acredita una autenticación reciente de Google ni habilita por sí solo operaciones sensibles. Si un caso necesita datos de identidad simulados, identificarlos como fixtures del entorno aislado; no registrarlos como verificación externa real.

## Medición y resultado

1. Abrir el enlace con la sesión preparada de cada cuenta. Iniciar el tiempo en esa navegación e incluir carga, lectura de estado, validación, escritura, recuperaciones y confirmación visible.
2. Completar el formulario por controles accesibles reales. Detener al ver el resultado confirmado de solicitud presentada o ingreso; una escritura iniciada o respuesta incierta no acredita finalización.
3. Registrar duración bruta y únicamente una espera externa de entrega comprobada. Duración evaluada = bruta − espera externa. Exactamente 120.000 ms no cumple «menos de dos minutos».
4. Conservar las diez observaciones, también errores y timeouts. No descartar cuentas fallidas para alcanzar nueve éxitos. Si el entorno se invalida, guardar la cohorte fallida antes de repetirla.
5. Acreditar SC-014 sólo con al menos nueve finalizaciones bajo el umbral y diez identidades/sesiones independientes comprobadas. Registrar efectos e idempotencia sin duplicados y sin mensajes reales en este ensayo inicial.
6. Ejecutar la cobertura de navegadores y accesibilidad técnica pertinente. Los resultados no reemplazan las verificaciones con lector real de SC-018, ni los gates de Google, canales y hosting.

## Registro pendiente

Las filas son posiciones de la cohorte, no cuentas ya creadas. No completar tiempos ni resultados antes de observarlos.

| Cuenta | Creación/sesión real | Navegador/tamaño | Bruta ms | Espera externa ms | Evaluada ms | Resultado confirmado | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | — | — | — | — | — | — | Pendiente |
| A02 | — | — | — | — | — | — | Pendiente |
| A03 | — | — | — | — | — | — | Pendiente |
| A04 | — | — | — | — | — | — | Pendiente |
| A05 | — | — | — | — | — | — | Pendiente |
| A06 | — | — | — | — | — | — | Pendiente |
| A07 | — | — | — | — | — | — | Pendiente |
| A08 | — | — | — | — | — | — | Pendiente |
| A09 | — | — | — | — | — | — | Pendiente |
| A10 | — | — | — | — | — | — | Pendiente |

## Cierre

Guardar evidencia sanitizada del login, resultado visible y efectos, con configuración, commit y entorno. Conservar el historial de las corridas y las limitaciones. No declarar personas participantes, tiempos de uso humano, autenticación Google ni entrega externa a partir de estas cuentas ficticias.
