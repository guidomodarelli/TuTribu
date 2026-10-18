# Compilación del target Workers

Esta validación de T201/T211 prepara el artefacto real de OpenNext sin desplegarlo, instalar credenciales de producción ni habilitar drivers. No acredita T203/OG-02, el control externo de secretos o la restauración en Workers. La [prueba de claves y restauración](keyrings-and-restore.md) conserva esos criterios.

## Preflight local

Sobre `32ce5765717095fe7f0e4c0501caaaa28a6b3c18` se exportó únicamente el contenido tracked de Git a un directorio privado, con secretos sintéticos y una conexión inválida. No se copiaron `.env` ignorados. La fuente se identifica por el archivo Git SHA256 `07e7bdc75f87b6aed9a8221ab564a07a57735b2d6bc8e5399a07b74d8677530a`.

OpenNext 1.20.6 reconoció Next 16.3.4 y advirtió su compatibilidad incompleta con Windows. La llamada real de compilación falló al iniciar `pnpm build`: el gestor intentó preparar dependencias en la junction compartida y rechazó `workspace hoist directory is not a real directory`. El fallo pertenece a esa preparación; no se presenta como una incompatibilidad demostrada del código ni como compilación aprobada. Registro privado `.git/admission-workers-build-WQiM4j/`, con helper estable y cero despliegues.

## Comprobación Linux

`.github/workflows/admission-workers-build.yml` usa Ubuntu, Node de `.nvmrc`, pnpm del proyecto y la instalación frozen del setup ya existente. Genera credenciales sintéticas por proceso y conserva recovery bloqueado y mantenimiento deshabilitado. No recibe secretos de la aplicación ni capacidad de Cloudflare; el único comando del target es `pnpm run build:cloudflare`.

El job conserva un recibo cerrado con SHA, versiones, resultado y presencia/tamaño de `.open-next/worker.js`. El éxito exige el comando real y el archivo producido; no se usa el flag que omite la comprobación de versión. No se sube el bundle ni configuración privada. El primer push registra y ejecuta el workflow; las siguientes verificaciones pueden despacharse expresamente sobre el ref deseado. La ejecución y su alcance se registrarán al terminar.
