# Better Auth + Neon Postgres

## Stack vigente

* **Next.js** con App Router
* **Better Auth** para login, sesion y Google OAuth
* **Neon Postgres** como base de datos hospedada
* **Drizzle ORM** + `pg` para acceso desde la app
* **RLS simple** con contexto `app.current_user_*`
* **Arquitectura hexagonal pragmatica**

Reglas operativas:

* no usar proveedores de autenticacion legacy
* no usar SDKs de auth ajenos al stack vigente
* no usar SDKs propietarios de base de datos en runtime de auth o data access

---

# Decision final

Para este proyecto:

* **Better Auth** resuelve autenticacion
* **Google OAuth** es el provider inicial
* **Neon** queda como Postgres hospedado
* **Drizzle** es la capa tipada de persistencia
* **RLS** protege ownership, membership y tenant scope
* **`community`** sigue siendo el tenant canonico

La identidad estable del usuario sale de `public."user".id`.

La pertenencia, el rol y el alcance multi-tenant no salen de la sesion por si solos: se resuelven con `community_members`, `community_id` y RLS.

---

# Reparto de responsabilidades

## Better Auth

Lo usaria para:

* login
* sesion
* Google OAuth
* cookies de sesion
* tablas `user`, `session`, `account`, `verification`

## Drizzle + `pg`

Lo usaria para:

* repositorios del dominio
* queries SQL tipadas
* transacciones
* contexto request-scoped para RLS

## Neon

Lo dejo solo como:

* Postgres hospedado
* connection pooling para runtime cuando aplique
* SQL migrations versionadas
* operacion de base y entorno

---

# Contexto de autorizacion

La app abre cada request protegido seteando:

* `app.current_user_id`
* `app.current_user_email`

RLS consume ese contexto y decide acceso a filas. La app sigue resolviendo:

* workflows
* validaciones de negocio
* mensajes de error
* UX

---

# Estructura recomendada

```text
app/
  api/
    auth/
      [...all]/
database/
  migrations/
src/
  modules/
    auth/
      application/
      domain/
      infrastructure/
        better-auth/
        repositories/
    communities/
      application/
      domain/
      infrastructure/
        repositories/
    shared/
      infrastructure/
        database/
          server-database-client.ts
          schema.ts
```

---

# Reglas de migracion

* cualquier cambio estructural sale con migration SQL en `database/migrations`
* `DATABASE_URL` es el contrato de runtime; en Neon debe usar conexion directa para mantener el runtime warm y evitar PgBouncer/serverless pooling por defecto
* `DATABASE_MIGRATION_URL` es opcional y debe apuntar a una conexion directa cuando el tooling lo requiera
* `community_members` sigue siendo la fuente de verdad de permisos por tribu
* ninguna ruta nueva debe depender de rutas OAuth custom fuera de `/api/auth/[...all]`
