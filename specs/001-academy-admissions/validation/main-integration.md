# Integración con main y controles actuales

La copia de integración se rebasa sobre `ba634fd9673059f0596662873eb16b3c83e81772`. Conserva la versión 1.8.1, el historial de versiones publicadas, la instalación pública de `beez-ui` 3.0.1 y las 187 migraciones con índices y nombres únicos. El workflow de calidad y los módulos de activación del ingreso de desarrollo coinciden con main.

Se adaptaron quince archivos que todavía importaban el paquete anterior, veinte selectores y noventa y tres botones de los recorridos nuevos. Los selectores usan la API pública con `label` y `options`; conservan valores, orden, callbacks, bloqueos, nombres accesibles y referencias de validación. Las opciones estáticas pertenecen al módulo de admisión, mensajería o notificaciones correspondiente. Los botones secundarios usan la variante actual de la biblioteca.

La composición de autenticación conserva juntos el ingreso de desarrollo, el adapter privado de base de datos, los diagnósticos sanitizados, los endpoints de tokens restringidos al servidor y el plugin de evidencia Google. La credencial de desarrollo continúa limitada a su identidad configurada y no acredita autenticación reciente de Google.

Validación ejecutada en esta copia:

- Instalación congelada con pnpm 12.6.0: correcta.
- Tipos de producto, tipos de tests y lint: correctos.
- Autenticación y formularios: 26 archivos, 371 tests correctos, incluidos los ocho casos del ingreso de desarrollo con Better Auth real.
- Evaluación del criterio de la cohorte: tres tests correctos, con umbral estricto, observaciones fallidas e identidades incompletas.
- Build real de Next.js 16.3.4: correcto, con configuración aislada equivalente a CI y sin acceder a una base de producción.

El ensayo con diez cuentas se registra por separado en `admission-entry-sample.md`. Esta validación no cierra los recorridos globales, las capturas y manuales pendientes de T217 ni el gate completo de T211. La regresión de eventos sin tecla del menú lateral actual se está verificando en un trabajo separado dentro de la misma integración.
