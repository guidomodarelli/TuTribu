# Base de gestión de lista

Incremento de T107/T111/T112 sobre `4bc30d7bbf41e63f3844124a25c502409c9ba345`. Mantiene 97/212 tareas completas y 115 pendientes.

Se añadieron `AllowlistEntry`, la proyección separada `AdmissionContactBinding`, el value object de nombre, puertos propios de consulta/comando y `ManageAllowlistUseCases`. La entidad conserva alias y contacto canónico, inicia en versión uno, limita el nombre y propone cambios efectivos/no-op/conflicto sin modificar identidad o procedencia. El vínculo de cuenta no forma parte de esa configuración. La procedencia CSV requiere su referencia de importación server-side.

Los casos de uso emplean `ResolveAdmissionContextUseCase`: lectura sólo por líder actual sin recencia de mutación; creación con propósito firmado exacto; edición ligada a su entrada y versión observada. Normalizan contacto/nombre antes del writer y entregan sólo filtros declarados al lector. Un test rojo detectó que el spread inicial arrastraba campos de confirmación a una consulta; la corrección construye esos filtros explícitamente.

La ejecución de las dos suites nuevas y las regresiones de `admission-context`/`admission-eligibility` cerró con 141/141 casos verdes en cuatro suites, sin skips, en 3,04 s. Tipos de producto/tests y oxlint focal pasan. Se usa el resolver real y sólo dobles de puertos de almacenamiento propios; no se mockean plataforma, UI, validators ni SDK. No hay afirmación de ejecución SQL porque este incremento todavía no agrega persistencia.

La arquitectura documenta el alcance actual. Su render se verificó en Chromium/WebKit a 390/1280 px, con encabezado nuevo visible y cero desbordamiento/errores JS. No agrega un recorrido de aplicación, por lo que no altera manuales de flujos ni CHANGELOG. Faltan el writer/readers SQL, esquema público/handlers/composición, lista SSR/UI, importación y admisión automática; las pruebas de CAS/uniqueness/replay con PostgreSQL real continúan pendientes. No se cierran T107/T111/T112 ni gates por disponer de tipos o puertos.

La revisión Codex aislada read-only cerró con cero hallazgos accionables y 7/7 hashes estables: manifiesto `2B377DBF5811DF212E3192065ED6E883719DC2EF57A80EDD1A81BC0CEF7816D9`. No hubo fallback de proveedor ni diagnósticos materiales. El reviewer no ejecutó pruebas ni acreditó la integración pendiente.
