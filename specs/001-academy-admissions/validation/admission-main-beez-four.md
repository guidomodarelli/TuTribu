# Integración de main y beez-ui 4

Se integró `origin/main` en el árbol de la feature mediante una fusión aditiva, conservando el historial publicado y los checkpoints de las mediciones. Los padres son `2137d6279722e3d32bc22dfb71c9495b88c8698f` y `623a81debf0dc05a613b962b6fe7f11b2cf4292b`. La resolución adopta beez-ui 4.0.1, sus tokens de Arc y los ajustes del loader y la campana. Conserva el SDK de Zavu fijado en 0.57.0 y las entradas de la feature en Unreleased.

El [recibo saneado](admission-main-beez-four.json) conserva versiones instaladas, huellas de los archivos relevantes y los resultados del árbol resuelto antes de registrar la fusión:

- Instalación con lockfile congelado, tipos de producto, tipos de pruebas y lint aprobados.
- Suite local completa: **6.187 casos aprobados, cero fallidos y 924 omitidos**, con 916 archivos informados. El entorno deshabilita los ensayos SQL optativos; las omisiones no acreditan sus gates.
- Cuatro recorridos administrativos reales en Chromium y WebKit, a 390 y 1280 px: teclado, respuesta perdida después del commit, recuperación tras recargar con fallo de listado y ausencia de efectos duplicados. Usan Better Auth, PostgreSQL y beez-ui reales en sus ramas propias. Cero casos fallidos, omitidos o inestables.
- Build real de Next 16.3.4 aprobado, con 56 páginas estáticas.

Las cohortes local y de navegador conservaron fuente y runner estables. Los cuatro casos de navegador no incluyen un lector del sistema operativo, por lo que T198/T208 siguen pendientes. Sus ramas se retiraron y el inventario independiente volvió a las tres anteriores antes de preparar el piloto nuevo autorizado. No hubo SQL productivo ni mensajes reales en estas validaciones.

## Capacidad de PostgreSQL

La [cohorte con 4 CU](admission-native-four-cu.json) conserva el mismo bundle de aplicación `76921bff9fa4cfd0b712074265f6ba78690c1600300b961e944c04d359c2e09b` que la medición anterior con 2 CU. Sólo cambia la capacidad de la base de su rama efímera; mantiene cien solicitantes, diez mil entradas, pool cien, los timeouts, las exclusiones y el umbral original.

Las cien operaciones terminaron con cincuenta ingresos/cincuenta pendientes y cero fallos de comandos. Stock y replay pasaron, sin entregas. El pool quedó en 300 adquisiciones/300 liberaciones, sin cola ni conexiones retenidas. La única aserción fallida sigue siendo la latencia: **p95 de 4.644,74 ms**, frente al objetivo estricto inferior a 3.000 ms. La sonda mínima dio 2,69 ms. Una cohorte por capacidad no demuestra una mejora causal; aumentar la capacidad no acreditó el objetivo.

Se retiraron función y rama propias. El inventario posterior conserva las tres ramas anteriores y el nuevo piloto persistente solicitado por el usuario, sin ramas temporales adicionales. T200/T209 y las catorce tareas pendientes conservan sus criterios.
