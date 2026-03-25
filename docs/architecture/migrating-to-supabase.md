# Arquitectura final recomendada

## Stack

* **Next.js** con App Router
* **Supabase Auth** para login, sesion y Google OAuth
* **Supabase Postgres** para datos principales
* **RLS basica** para ownership y acceso por usuario
* **Arquitectura hexagonal liviana**, no extrema

Supabase hoy documenta bien el flujo con Next.js App Router y SSR con sesion en cookies, ademas de Google OAuth y Auth como producto principal. ([Supabase][1], [Supabase][7])

---

# Decision final

Para este proyecto, la recomendacion final es:

* **Next.js** como app full-stack liviana
* **Supabase Auth** como solucion de autenticacion
* **Google OAuth** a traves de Supabase
* **Supabase Postgres** como base principal
* **RLS simple** para permisos basicos
* **Hexagonal pragmatica** con adapters
* **Nada de NextAuth/Auth.js**
* **Nada de sobreingenieria**

La idea es ganar velocidad al principio sin meter toda la app directo sobre el SDK ni llevar toda la logica de negocio a SQL o a policies. ([Supabase][3], [Next.js][8])

En esta etapa, Next.js no queda como frontend puro: App Router, `Route Handlers` y mutaciones server-side cubren bien una capa BFF liviana dentro del mismo proyecto. ([Next.js][9], [Next.js][10])

---

# Que dejaria en Supabase

## Si

* **Autenticacion**
* **Login con Google**
* **Manejo de sesion**
* **Base de datos**
* **RLS** para reglas simples por usuario

## Entidades iniciales

* `profiles`
* `courses`
* `course_members`
* `posts`
* `comments`
* `events`

Supabase Auth soporta social login, incluido Google, y la integracion oficial con Next.js App Router y SSR ya esta documentada. Ademas, Auth usa el esquema `auth` dentro de Postgres y se integra naturalmente con el resto de la base. ([Supabase][1], [Supabase][2], [Supabase][6])

## No

* **Logica de negocio compleja**
* **Toda la autorizacion de negocio dentro de SQL**
* **Toda la app llamando directo al SDK de Supabase**
* **Toda la logica sensible dentro de componentes o del browser**

Supabase es Postgres mas servicios alrededor. Cuanto mas metas logica critica en detalles especificos de plataforma, mayor va a ser el acople operativo. ([Supabase][3])

---

# Nivel de hexagonalidad recomendado

## Mi sugerencia: **hexagonal pragmatica**

No haria una hexagonal academica total. Haria una arquitectura modular, con limites claros, pero sin volver ceremonial cada CRUD chico.

```text
app/
  (routes, pages, server actions, route handlers)

src/
  modules/
    auth/
      domain/
      application/
      infrastructure/

    posts/
      domain/
      application/
      infrastructure/

    comments/
      domain/
      application/
      infrastructure/

    courses/
      domain/
      application/
      infrastructure/

    events/
      domain/
      application/
      infrastructure/

    shared/
      domain/
      application/
      infrastructure/

      supabase/
        browser-client.ts
        server-client.ts
        middleware.ts
```

La guia oficial de Supabase para Next.js y SSR separa explicitamente clientes para browser y server, junto con middleware para refrescar sesion por cookies. Esa division encaja bien con una arquitectura modular en Next.js. ([Supabase][1], [Supabase][7])

---

# Que abstraeria

## 1. `AuthPort`

```ts
interface AuthPort {
  getCurrentUser(): Promise<User | null>
  signInWithGoogle(): Promise<void>
  signOut(): Promise<void>
}
```

## 2. `PostRepository`

```ts
interface PostRepository {
  create(input: CreatePostInput): Promise<Post>
  findById(id: string): Promise<Post | null>
  listByCourse(courseId: string): Promise<Post[]>
}
```

## 3. `CommentRepository`

```ts
interface CommentRepository {
  add(input: AddCommentInput): Promise<Comment>
  listByPost(postId: string): Promise<Comment[]>
}
```

La razon arquitectonica es simple: Supabase expone Auth, APIs y RLS alrededor de Postgres. Encapsularlo como adapters reduce el acople de la app al SDK y deja las reglas importantes en `application` y `domain`. ([Supabase][3])

## Que no abstraeria de mas

No perderia tiempo en abstraer:

* cada query de lectura menor
* cada helper chico del SDK
* cada detalle de paginacion simple
* cada suscripcion realtime decorativa

La documentacion de Supabase esta optimizada para productividad rapida en CRUD y SSR. Conviene aprovechar eso sin convertir todo en una capa ceremonial. ([Supabase][5])

---

# Como quedaria la auth final

## Flujo

1. Usuario toca **Continuar con Google**
2. Se ejecuta `supabase.auth.signInWithOAuth({ provider: "google" })`
3. Google autentica
4. Supabase emite la sesion
5. Next.js consume la sesion en server y browser
6. Los casos de uso consultan al `AuthPort`
7. RLS protege acceso a filas segun el usuario

Supabase documenta el flujo de Google OAuth y el quickstart especifico para Next.js App Router. Tambien documenta SSR con cookies para que el servidor pueda leer la sesion. ([Supabase][1], [Supabase][2], [Supabase][7])

---

# RLS: como usarla sin pasarte

## Si usaria RLS para

* un usuario ve su perfil
* un alumno ve sus inscripciones
* un autor edita su propio post
* un comentario pertenece a cierto usuario
* acceso por membresia o curso cuando la regla es simple

## No la usaria para

* workflows complejos
* reglas de negocio cambiantes
* logica de visibilidad muy dinamica
* permisos compuestos dificiles de testear

RLS es una herramienta fuerte en Postgres, pero cuanto mas metas logica de producto dentro de policies, mas dificil se vuelve mantenerla y migrarla. ([Supabase][3], [Supabase][4])

---

# Modelo de datos inicial

## Tablas

* `profiles`
* `courses`
* `course_members`
* `posts`
* `comments`
* `events`

## Relacion con auth

* `auth.users` queda manejada por Supabase Auth
* `profiles.id = auth.users.id`

Supabase documenta que Auth almacena usuarios en el esquema `auth` y que la identidad de la aplicacion se conecta con tus propias entidades mediante claves foraneas o procesos equivalentes, cuidando seguridad y RLS. ([Supabase][6])

---

# Middleware y clientes

## Tendrias 3 piezas

* **browser client**
* **server client**
* **middleware** para refrescar sesion cuando haga falta

La guia oficial de SSR de Supabase explica justamente ese patron para frameworks SSR, incluyendo Next.js: mover la sesion a cookies y ajustar el cliente segun el entorno. ([Supabase][7])

---

# Que evitaria para no quedar muy atado

## Evita esto

* usar Supabase directo desde todos los componentes
* policies gigantes
* Edge Functions para toda la logica
* mezclar dominio con SQL, RLS o SDK

## Hace esto

* Supabase detras de adapters
* dominio limpio
* reglas de negocio en casos de uso
* RLS simple
* Next.js como capa server liviana con App Router

Supabase sigue siendo open source y basado en Postgres, asi que esta estrategia conserva bastante salida futura si un dia queres mover la infraestructura. ([Supabase][3])

---

# Recomendacion operativa final

## Si estuvieras arrancando esta semana

1. **Supabase Auth + Google**
2. `profiles`, `courses`, `posts`, `comments`, `events`
3. RLS solo para ownership y acceso simple
4. adapters para `Auth`, `Posts` y `Comments`
5. `browser client`, `server client` y `middleware` para la sesion SSR
6. nada de NextAuth/Auth.js

## Resultado

Eso te da:

* salida rapida
* baja friccion en auth
* buena integracion con Next.js
* costo mental razonable
* lock-in moderado, no extremo
* margen para migrar mas adelante si hiciera falta

Si mas adelante queres separar backend propio, el detalle de cuando y como hacerlo esta en `docs/architecture/backend-separation.md`.

[1]: https://supabase.com/docs/guides/auth/quickstarts/nextjs?utm_source=chatgpt.com "Use Supabase Auth with Next.js"
[2]: https://supabase.com/docs/guides/auth/social-login/auth-google?utm_source=chatgpt.com "Login with Google | Supabase Docs"
[3]: https://supabase.com/docs/guides/getting-started/architecture?utm_source=chatgpt.com "Architecture | Supabase Docs"
[4]: https://supabase.com/docs?utm_source=chatgpt.com "Supabase Docs"
[5]: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs?utm_source=chatgpt.com "Use Supabase with Next.js"
[6]: https://supabase.com/docs/guides/auth/architecture?utm_source=chatgpt.com "Auth architecture | Supabase Docs"
[7]: https://supabase.com/docs/guides/auth/server-side?utm_source=chatgpt.com "Server-Side Rendering"
[8]: https://nextjs.org/docs/app/guides/data-security "Guides: Data Security | Next.js"
[9]: https://nextjs.org/docs/app/getting-started/route-handlers "Getting Started: Route Handlers | Next.js"
[10]: https://nextjs.org/docs/app/getting-started/updating-data "Getting Started: Updating Data | Next.js"
