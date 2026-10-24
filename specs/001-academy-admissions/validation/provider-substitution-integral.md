# Validación integral de proveedores: US12 y SC-020

## Alcance y fuentes actuales

Validación de T197 sobre `a167f4de2bea6686a65f919cece7841b12d6cd97`, con
adiciones de pruebas y evidencia, sin cambios ejecutables de producto, SDK,
dependencias, configuración desplegada, esquema o reglas de admisión. Se
conservan las 212 tareas originales y sus gates.

La [guía de extensión](../../../docs/architecture/tenant-messaging.htm#provider-extension)
de T196 describe factories/contexto/mapper/errores y distingue Zavu productivo,
el doble de correo y la preparación OTP. Esta auditoría completa los cuatro AC
de US12 y SC-020 en el borde propio; no acredita entrega externa ni otro
proveedor productivo.

## Matriz completa de aceptación

| Criterio | Evidencia observable actual | Resultado y límite |
| --- | --- | --- |
| US-12-AC-01 | Registro productivo con Zavu único; DTO propio estricto, canales y campos del formulario. La familia local actual incluye loader, controller y controles reales de beez-ui. Los cuatro recorridos Native de T195 cubren Chromium/WebKit a 390/1280; sus 2070 inputs relevantes mantienen sus bytes actuales. Configuración y dependencias tampoco cambiaron desde el código que se compiló. | Sólo Zavu se conecta y la UI ofrece capacidades implementadas. La proyección no prueba recursos externos preparados o recepción. Se reutilizan los cuatro recorridos equivalentes, sin presentarlos como una nueva ejecución. |
| US-12-AC-02 | Lista, canje personal y aprobación manual recorren emisión, dispatch, verificación local, prueba, presentación/resolución y replay con Zavu/SDK real/transporte cerrado y el sender alternativo propio. PostgreSQL compara solicitudes, pruebas consumidas, decisiones, membresías, invitación y obligaciones de aviso persistidas. | Tres casos SQL y seis recorridos de negocio con resultados equivalentes. El SDK acepta transporte propio; el doble no importa sus DTOs ni decide la admisión. |
| US-12-AC-03 | El descriptor alternativo implementa credencial/remitentes y correo sin métodos telefónicos o de plantilla vacíos; el registro/factory rechaza capacidades ausentes. Dos regresiones del dominio bloquean verificación SMS/WhatsApp sin capacidad preparada. Un caso SQL nuevo usa los readers reales de uso/readiness y la regla real de activación sobre una conexión seleccionada con sólo correo preparado. | Correo queda preparado; SMS/WhatsApp no habilitan verificación incluso con cuota y países válidos. El identificador SMS presente en la versión no inventa una capacidad. Se conserva teléfono manual con verificación OFF, que no utiliza un proveedor telefónico. |
| US-12-AC-04 | Next, Better Auth, PostgreSQL y SDK reales: creación con proveedor desconocido devuelve 409/missing_capability antes de cualquier efecto, incluso cuando ya existe una candidata. El campo providerId está prohibido al configurar y devuelve 400/invalid_input. `pg` directo observa SQLSTATE 23514 de la constraint de proveedor; siempre hace rollback. La creación/configuración válida Zavu funciona. Registro y sender propios deniegan identidad/canal desconocidos antes de construir un adaptador alternativo. | No hay fallback o credencial/candidata por defecto: cero efectos en rechazos, una candidata y dos versiones/operaciones tras las dos acciones válidas, un GET de detalle real del SDK y cero entregas. No se retira una constraint para simular un estado productivo imposible. |
| SC-020 | Conjunto de los cuatro criterios anteriores, contratos propios y lint de fronteras vigente. | El transporte alternativo conserva las reglas y efectos de admisión; Zavu sigue siendo único en producción y unknown/capacidad ausente cierran. Las operaciones externas conservan sus gates propios. |

## Ejecuciones y contabilidad

- Familia local completa: **160 aprobados**, cero fallos y tres SQL omitidos,
  en doce archivos completos, sin filtro y con fuentes estables. Los SQL
  omitidos tienen ejecuciones reales independientes, no se convierten en éxitos
  por esta omisión.
- Sustitución de negocio: informe completo **4 aprobados / 1 fallo**. Los dos
  locales ya están en los 160; personal y revisión pasan con ambos transportes.
  Lista falló al consultar metadatos del proyecto mediante Neon CLI, antes del
  cuerpo de negocio. La repetición del caso original completo de lista pasa
  **1 aprobado / 0 fallos / 4 fuera del filtro**, también con ambos transportes.
  Son **tres SQL distintos en dos cohortes**, con **2062 inputs comunes
  idénticos**, incluido todo el archivo de prueba. No hubo cambio de código,
  timeout, presupuesto o expectativa; no se afirma un informe único 5/0.
- HTTP real: **1 aprobado**, cero fallos u omitidos, con los rechazos, la
  constraint y las dos acciones válidas descritas arriba. El primer intento
  conserva un fallo de readiness del servidor sin ejecutar esas operaciones;
  la repetición usa el perfil Node explícito de la compilación. No se atribuye
  un código HTTP o fallo SQL a esa observación de arranque.
- Readiness/activación de correo: **1 aprobado** con SQL real, cuota y países
  del owner, reloj posterior a las esperas y regla de activación real. El
  preflight usa un puerto propio con la precondición preparada para aislar la
  capacidad. Se evalúan propuestas, no una activación persistida o un cutover:
  al terminar hay cero políticas y cero entregas en esa tribu.
- UI equivalente: cuatro recorridos Native aprobados previamente con inputs
  relevantes idénticos. Se reutilizan como evidencia actual del mismo producto.

El conjunto tiene **169 casos aprobados distintos aplicables al estado actual**:
165 ejecutados en este avance y cuatro UI reutilizados. Se deduplican los dos
locales repetidos por el informe Native. Cinco filas parametrizadas de creación
comparten título pero prueban campos distintos; su identidad conserva la
ocurrencia dentro del archivo. No se cuentan fallos, exclusiones o repeticiones
como casos adicionales.

## Calidad, custodia y límites

Se ejecutaron `pnpm run lint` sobre el repositorio y `pnpm run typecheck:tests`
con Node 24.21.0: ambos terminan con exit cero. El lint vigente mantiene las
restricciones de imports de `src/features`, copias de UI y roots de composición;
el código de aplicación/dominio conserva contratos propios. Las pruebas no
mockean SDKs, UI, validadores o plataforma: los dobles y transportes se limitan
a puertos propios. No se usan tests de texto de fuentes o SQL como oráculos.

El [CI exacto de la base `a167f4de`](https://github.com/guidomodarelli/TuTribu/actions/runs/38876135304)
terminó aprobado y fue consumido: 533 archivos / 5625 casos aprobados,
288 archivos / 830 casos omitidos, tipos/lint y build de 55/55 páginas. Producto,
dependencias y configuración no cambiaron, por lo que se conserva esa
compilación; este antecedente no acredita por anticipado las pruebas nuevas
ni el futuro commit de cierre, que requiere su CI propio.

Después de todos los productores SQL/HTTP, la auditoría oficial de Neon
acredita cero ramas temporales propias y las tres originales conservadas.
No hubo mensajes reales, cambios de hosting o contacto con participantes.
La revisión conjunta de las pruebas, matriz, fuentes y cierre conserva su
manifiesto propio. T185, T211, el scheduler, hosting Node/Workers operativo,
OAuth real, recursos/recepción/idempotencia externos, usabilidad humana y
rollout mantienen sus tareas y gates. Sólo T197 y los cuatro AC/SC-020 de su
alcance se completan; el objetivo completo permanece abierto.
