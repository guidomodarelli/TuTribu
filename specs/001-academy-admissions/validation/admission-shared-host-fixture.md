# Configuración externa común para el arnés de carga

El [contrato SQL nativo](admission-shared-host-fixture-native.json) pasó dos casos reales sin omisiones: una preparación y una ejecución importaron por separado la misma configuración externa sintética y conservaron dos ingresos, dos pendientes, cuatro solicitudes, dos miembros y cero entregas sobre veinte entradas. Las cuatro observaciones individuales incluyeron duración y desplazamiento monotónicos, sin causa privada ni token de sesión. El pool terminó equilibrado, sin espera o checkout retenido.

El segundo caso conservó el mismo entorno y época, pero usó otros keyrings. Las cuatro operaciones cerraron sin solicitudes, miembros o entregas. Este caso acredita el rechazo de esa configuración ajena; no sustituye toda la matriz de rotación y restauración.

La reproducción anterior falló en ambos casos: la preparación ignoraba la configuración y las dimensiones explícitas, por lo que usaba sus cien participantes y diez mil entradas originales y generaba claves nuevas. Se conserva el rojo de esa cohorte. El soporte actualizado acepta la configuración original para hosts propios y una forma de fixture explícita; los consumidores que no pasan esos argumentos conservan los defaults anteriores. El importador real continúa generando claves independientes y no extractables por propósito, con material fuera de SQL.

La observación individual se proyecta después de cerrar la medición y antes de leer los efectos finales. No elimina fallos ni modifica el cálculo del p95. Su desplazamiento respecto del inicio monotónico permite preparar el contraste de concurrencia entre hosts, sin presentar percentiles parciales como el percentil global.

Los tipos de pruebas y lint pasaron. Las ramas de ambos casos se retiraron y el inventario independiente confirmó las cuatro ramas persistentes anteriores. Los hashes de los cinco inputs identifican el código del resultado posterior a la implementación. No se instalaron keyrings en el hosting real por esta prueba, no se ejecutaron cien solicitantes entre varios hosts y no se midió un p95 nuevo de aceptación. T200/T209 y OG-02 siguen pendientes.
