# Auditoría del alcance HTTP completo de T140

Código guardado en `7379adda`, sobre T139 completada en `dfbfbcf1`. Se contrasta el criterio original de T140 sin modificar su alcance ni atribuirle la UI de T141, el despacho de T185 o las comprobaciones externas pendientes.

| Criterio | Implementación y evidencia |
| --- | --- |
| Suspender y desconectar con autoridad sensible actual | Las rutas y handlers de lifecycle usan sesión, líder canónico y recencia específica de conexión. El Native HTTP87458 pasó con Next/Better Auth/PostgreSQL reales: rechazo sin recencia, suspensión, desconexión y consulta original después de invalidar la evidencia reciente. No se modifica ese recorrido en T140. |
| Motivo, contexto, versión y operación | Suspensión acepta únicamente las causas propias; desconexión deriva las dependencias del estado actual. Recuperación exige causa explícita de sustitución, consentimiento, UUID y versiones de entrega/conexión. Los schemas reales rechazan flags de autoridad del browser antes de abrir servicios. |
| Dependencias coherentes y FR-050–FR-052 | T137 conserva retiro ordinario condicionado, suspensión urgente local y compromiso de pruebas afectadas sin expulsar miembros. T139 conserva el aviso original, su plazo, identidad, consumos y procedencia; no redirige OTP ni permite otro envío a ciegas. El POST de T140 compone esos owners sin añadir overrides. |
| Resultado mínimo y estado acreditado | POST retorna únicamente el resultado propio validado, o 202 para una operación realmente registrada. Comprueba UUID, original, sustituta y versión original; mantiene separado el CAS de lifecycle de la versión fija de envío. El conflicto previsto se publica como `delivery_conflict/409`; fallos técnicos conservan copy seguro y causa privada. |
| Recuperar respuesta perdida | GET dedicado consulta actor/tribu/namespace/UUID originales, revalida sesión y liderazgo actuales y retorna `no-store`. No exige otra recencia ni carga claves, crea claims o llama al proveedor. Ausencia real produce 404; operaciones o DTO ajenos se rechazan. |
| Sin secretos ni cambio de pagador | La respuesta no contiene intent, destinatario, MAC, lease o credenciales. Native actual confirma una sola entrega hija y auditoría, consumos sin incremento y cero peticiones al proveedor durante la fase HTTP. Suspensión/desconexión conservan su evidencia previa de configuración independiente sin cambios. |

La regresión ampliada pasa 60 casos locales, sin omitidos. El scope adicional del mapper de errores/usage pasa 43 casos y omite 13 SQL por entorno; no se acredita esa suite SQL completa. Tipos de producto y tests, lint y build vigentes pasan. Native12995 termina verde: un caso/cero omitidos en 529106,3606 ms, con eliminación de la rama aislada antes de su terminal. El descarte de la respuesta es deliberado; no representa un corte TCP real. Se preserva el rojo previo por build sin rutas nuevas en el baseline.

Revisión final de 27 blobs staged: cero hallazgos accionables y manifiesto estable `56FBCD81638C3EDDF8A4F9B388720BC3DA4C2FC443C3A896F9A8117CFBE2BF28`. La revisión no sustituye las ejecuciones de tests.

Los manuales registran `7379adda` como fuente y describen la recuperación como proceso interno sin pantalla. Se conservan sus capturas previas. Validación: 12 renders y 28 comprobaciones de navegación en Chromium/WebKit a 1280/390 px, arquitectura con cuatro renders, 148 enlaces sin roturas y `check-manual` sin errores. Los avisos de URL compartida y catálogo de traducciones corresponden a documentación local en español; no se inventa una publicación. Las fuentes externas de tipografía se bloquean durante la QA y se usan respaldos locales.

Se cierra únicamente T140 una vez registrada la QA final de la trazabilidad. El inventario conserva 212 IDs: 148 completadas y 64 pendientes. T141/T142/T143, sender, OAuth externo y gates operativos mantienen sus propios criterios y estado.
