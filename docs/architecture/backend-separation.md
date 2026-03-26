# Backend propio separado

Este archivo cubre **unicamente** cuando y como pasaria de `Next.js + Supabase` a un **backend propio separado**.

---

# Cuando lo sumaria

Recien cuando aparezcan 2 o 3 de estos sintomas:

* tus `Route Handlers` empiezan a crecer demasiado
* necesitas procesos async largos
* queres desacoplar frontend y backend
* necesitas varios clientes consumiendo la misma API
* queres una capa de dominio mas estricta
* tenes webhooks, colas o jobs recurrentes
* necesitas aislar mejor limites de despliegue y escalado

La guia de **Backend for Frontend** de Next.js encuadra este patron como valido para exponer endpoints HTTP, acceder a fuentes de datos y ejecutar side effects. Eso hace razonable empezar con Next.js como BFF, pero no obliga a quedarte ahi para siempre. ([Next.js][1])

---

# Como haria la migracion

## Objetivo

Mover parte de la logica server desde Next.js a un servicio dedicado **sin romper el frontend** ni reescribir las reglas de negocio.

## Estrategia

### 1. Mantener estable el dominio desde el dia uno

La logica de negocio no deberia vivir en `page.tsx`, componentes ni handlers grandes. Deberia vivir en:

* `src/modules/<feature>/domain`
* `src/modules/<feature>/application`

Eso permite que el mismo caso de uso sea invocado primero desde Next.js y mas adelante desde un backend dedicado.

### 2. Tratar Next.js como primer BFF

En la fase inicial:

* `route.ts` y `Server Actions` reciben requests
* resuelven autenticacion y contexto
* llaman casos de uso
* devuelven resultados simples a la UI

### 3. Extraer primero los casos mas tensos

No migraria todo junto. Sacaria primero:

* procesos async largos
* integraciones externas complejas
* jobs programados
* flujos con reintentos o idempotencia
* endpoints usados por mas de un cliente

### 4. Dejar Next.js como consumidor del nuevo backend

Cuando exista el backend separado:

* la UI sigue en Next.js
* algunos handlers desaparecen
* otros quedan como capa BFF delgada
* los casos complejos pasan al backend dedicado

### 5. Migrar por feature, no por capa tecnica

El orden mas sano suele ser:

1. comunidad
2. progreso
3. billing o integraciones
4. procesos asincronos

No moveria "todo application" o "todo infrastructure" de una sola vez.

## Secuencia tecnica de corte

1. mover un caso de uso complejo a un servicio dedicado
2. exponer ese caso por HTTP o mensajeria en el backend nuevo
3. cambiar el adapter de infraestructura en Next.js para consumir ese backend
4. dejar el contrato estable y medir errores, latencia y reintentos
5. repetir el proceso feature por feature

Si ya mantuviste la separacion `domain -> application -> infrastructure`, el corte es incremental y no exige rehacer la UI.

---

# Arquitectura por fases

## Fase 1

**Next.js + Supabase**

* UI en App Router
* mutaciones simples con `Server Actions`
* endpoints puntuales con `Route Handlers`
* auth y base relacional en Supabase

## Fase 2

**Next.js + Supabase + workers o jobs**

* sacas tareas largas del request/response
* mantenes Next.js como entrada principal
* empezas a aislar procesos operativos

## Fase 3

**Next.js + backend dedicado + Supabase**

* Next.js queda como frontend y BFF liviano
* el backend dedicado absorbe casos complejos
* varios clientes ya pueden consumir la misma API

[1]: https://nextjs.org/docs/app/guides/backend-for-frontend "How to use Next.js as a backend for your frontend | Next.js"
