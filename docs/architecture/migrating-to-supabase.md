# Arquitectura final recomendada

## Stack

* **Next.js** con App Router
* **Supabase Auth** para login, sesion y Google OAuth
* **Supabase Postgres** para datos principales
* **Drizzle ORM** como capa principal de persistencia SQL
* **`supabase-js`** para Auth, Storage, Realtime y Edge Functions
* **RLS simple** para ownership y acceso por usuario
* **Arquitectura hexagonal pragmatica**

Supabase hoy documenta bien el flujo con Next.js App Router y SSR con sesion en cookies, ademas de Google OAuth y Auth como producto principal. Tambien documenta el uso de Drizzle para conectarte directo a Postgres, y Drizzle documenta sus drivers oficiales para PostgreSQL. ([Supabase][1], [Supabase][7], [Supabase][11], [Drizzle][12])

---

# Decision final

Para este proyecto, la recomendacion final es:

* **Next.js** como app full-stack liviana
* **Supabase Auth** como solucion de autenticacion
* **Google OAuth** a traves de Supabase
* **Supabase Postgres** como base principal
* **Drizzle ORM** como adaptador principal de persistencia SQL
* **`supabase-js`** solo para capacidades de plataforma
* **RLS simple** para permisos basicos
* **Hexagonal pragmatica** con adapters
* **Nada de NextAuth/Auth.js**
* **Nada de sobreingenieria**

La regla operativa es usar ambos, pero con responsabilidades distintas: `Drizzle` para la persistencia del dominio y `supabase-js` para Auth, Storage, Realtime, Edge Functions y algun uso puntual del Data API/PostgREST cuando realmente convenga. No usaria `supabase-js` como ORM principal ni mezclaria Drizzle con `supabase.from(...)` para las mismas responsabilidades de negocio. ([Supabase][3], [Supabase][11], [Supabase][13], [Next.js][8])

En esta etapa, Next.js no queda como frontend puro: App Router, `Route Handlers` y mutaciones server-side cubren bien una capa BFF liviana dentro del mismo proyecto. ([Next.js][9], [Next.js][10])

Tambien dejaria una regla operativa adicional: cuando implementes un cambio que altere la estructura de la base, ese cambio debe salir con una migration SQL versionada en el mismo work item. El dashboard SQL editor puede servir para probar o depurar, pero no reemplaza una migration reproducible.

---

# Drizzle + `supabase-js`: como repartir roles

## `drizzle-orm`

Lo usaria para:

* tablas de negocio
* queries SQL tipadas
* repositorios de dominio
* schema tipado
* relacion entre entidades de negocio

Supabase documenta explicitamente el quickstart de Drizzle para conectarte a su Postgres y aclara que, si vas a usar solo Drizzle en lugar del Data API, incluso puedes apagar PostgREST en la configuracion de la API. ([Supabase][11])

## `@supabase/supabase-js`

Lo usaria para:

* autenticacion
* OAuth
* manejo de sesion
* Storage
* Realtime
* Edge Functions
* llamadas puntuales al Data API/PostgREST

La propia referencia de `supabase-js` la presenta como la libreria isomorfica para interactuar con Postgres, escuchar cambios, invocar Edge Functions, construir login y manejar archivos. ([Supabase][13])

## Regla simple

* **Drizzle** para persistencia del dominio
* **`supabase-js`** para servicios de plataforma
* **SQL migrations versionadas** para cambios reales de base y para RLS

Eso mantiene mejor la separacion hexagonal:

* puertos del dominio y aplicacion para repositorios y servicios
* adapters de infraestructura distintos para persistencia y para capacidades gestionadas de Supabase

## Migrations SQL: regla operativa

Cuando cambie la estructura real de Postgres, haria una migration SQL versionada. Eso incluye:

* tablas nuevas
* columnas nuevas o renombradas
* constraints
* indices
* relaciones
* activacion o cambio de RLS

Ejemplo de migration SQL de estructura:

```sql
-- supabase/migrations/20260325090000_create_posts.sql
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
```

La idea es simple:

* `Drizzle` sigue modelando el schema y los repositorios
* la base queda versionada con SQL reproducible
* el dashboard queda solo para pruebas puntuales o debugging

---

# Que dejaria en Supabase

## Si

* **Autenticacion**
* **Login con Google**
* **Manejo de sesion**
* **Base de datos** como plataforma Postgres
* **Storage**
* **Realtime**
* **Edge Functions**
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

La guia oficial de Supabase para Next.js y SSR separa explicitamente clientes para browser y server, junto con middleware para refrescar sesion por cookies. Esa division encaja bien con una arquitectura modular en Next.js. Si ademas dejas la persistencia SQL detras de Drizzle, los adapters quedan todavia mas nitidos. ([Supabase][1], [Supabase][7], [Supabase][11], [Drizzle][12])

## Ejemplos concretos de adapters

* `DrizzleCommunityRepository`
* `DrizzleMembershipRepository`
* `SupabaseAuthProvider`
* `SupabaseStorageAdapter`
* `SupabaseRealtimeAdapter`

La separacion queda natural:

* `DrizzleCommunityRepository` y `DrizzleMembershipRepository` resuelven tablas, joins y queries tipadas de negocio
* `SupabaseAuthProvider` encapsula login, sesion y OAuth
* `SupabaseStorageAdapter` y `SupabaseRealtimeAdapter` encapsulan capacidades gestionadas de la plataforma

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

## 4. `CommunityRepository`

```ts
interface CommunityRepository {
  create(input: CreateCommunityInput): Promise<Community>
  findById(id: string): Promise<Community | null>
  listByMember(memberId: string): Promise<Community[]>
}
```

## 5. `MembershipRepository`

```ts
interface MembershipRepository {
  add(input: AddMembershipInput): Promise<Membership>
  listByCommunity(communityId: string): Promise<Membership[]>
  changeRole(input: ChangeMembershipRoleInput): Promise<void>
}
```

## 6. `FileStorage`

```ts
interface FileStorage {
  upload(input: UploadFileInput): Promise<StoredFile>
  remove(fileId: string): Promise<void>
}
```

La razon arquitectonica es simple: Drizzle te deja encapsular la persistencia SQL detras de repositorios propios, mientras Supabase sigue resolviendo Auth, APIs gestionadas y RLS alrededor de Postgres. Encapsular ambos como adapters reduce el acople al SDK y deja las reglas importantes en `application` y `domain`. ([Supabase][3], [Supabase][11], [Supabase][13], [Drizzle][12])

## Que no abstraeria de mas

No perderia tiempo en abstraer:

* cada query de lectura menor
* cada helper chico de Drizzle o del SDK
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

## Regla practica

Usaria **RLS simple** para seguridad de acceso a datos, no para meter toda la logica de negocio dentro de SQL.

La regla operativa es esta:

* **RLS va en SQL migrations**
* **no en helpers del ORM**
* **no solo en cambios manuales desde el dashboard**

## Si usaria RLS para

* ownership
* membership
* roles simples
* acceso por usuario o comunidad cuando la regla es clara

## No la usaria para

* workflows complejos
* reglas de negocio cambiantes
* permisos compuestos con muchas excepciones
* logica de producto muy dinamica

RLS es una herramienta fuerte en Postgres, pero cuanto mas metas logica de producto dentro de policies, mas dificil se vuelve mantenerla y migrarla. El detalle de que significa "RLS simple" y donde poner el limite esta en `docs/architecture/rls-simple.md`. ([Supabase][3], [Supabase][4])

Ejemplo de migration SQL para RLS:

```sql
-- supabase/migrations/20260325091000_posts_rls.sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own posts"
ON posts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own posts"
ON posts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_posts_user_id ON posts(user_id);
```

Ese ejemplo deja claro el reparto de responsabilidades:

* `Drizzle` puede seguir definiendo la tabla `posts`
* la policy y la activacion de RLS viven en SQL
* el indice acompana la policy para no castigar performance

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
* repartir consultas de negocio entre Drizzle y `supabase.from(...)`
* mezclar escrituras SQL tipadas con PostgREST sin una frontera clara

## Hace esto

* Supabase detras de adapters
* Drizzle como repositorio principal de negocio
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
3. schema tipado y repositorios con Drizzle
4. migrations SQL versionadas para cambios de estructura
5. RLS solo para ownership y acceso simple, versionada en SQL
6. adapters para `Auth`, `Posts`, `Comments`, `Communities`, `Memberships` y archivos
7. `browser client`, `server client` y `middleware` para la sesion SSR
8. nada de NextAuth/Auth.js

## Resultado

Eso te da:

* salida rapida
* baja friccion en auth
* buena integracion con Next.js
* persistencia mas limpia y tipada
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
[11]: https://supabase.com/docs/guides/database/drizzle "Drizzle | Supabase Docs"
[12]: https://orm.drizzle.team/docs/get-started-postgresql "Drizzle ORM - PostgreSQL"
[13]: https://supabase.com/docs/reference/javascript/introduction "JavaScript: Introduction | Supabase Docs"
[8]: https://nextjs.org/docs/app/guides/data-security "Guides: Data Security | Next.js"
[9]: https://nextjs.org/docs/app/getting-started/route-handlers "Getting Started: Route Handlers | Next.js"
[10]: https://nextjs.org/docs/app/getting-started/updating-data "Getting Started: Updating Data | Next.js"
