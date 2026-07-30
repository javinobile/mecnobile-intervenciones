# Mecnobile Intervenciones

Sistema de gestión de intervenciones / órdenes de trabajo (Next.js + Prisma + PostgreSQL).

## Requisitos

- Node.js 20+
- Yarn
- PostgreSQL en `localhost:5432` (por ejemplo el servicio `db` de `docker-compose.yml`)

## Setup local

1. Copiá el template de entorno:

```bash
cp env-template .env.local
```

Completá `AUTH_SECRET` y `NEXTAUTH_SECRET` con el mismo valor (podés generar uno con `openssl rand -base64 32`).

El `DATABASE_URL` del template apunta a la DB local:

```env
DATABASE_URL="postgresql://root:Root.1234@localhost:5432/mecnobile-db?schema=public"
NEXTAUTH_URL="http://localhost:3000"
```

2. Si usás el Postgres del compose:

```bash
docker compose up db -d
```

3. Instalá dependencias, generá el client y aplicá migraciones:

```bash
yarn install
yarn db:generate
yarn db:migrate
# opcional, datos de ejemplo:
yarn db:seed
```

4. Arrancá el servidor de desarrollo:

```bash
yarn dev
```

Abrí [http://localhost:3000](http://localhost:3000).

### Scripts de base de datos

| Script | Descripción |
|--------|-------------|
| `yarn db:generate` | Genera el Prisma Client |
| `yarn db:migrate` | Crea y aplica migraciones **solo en desarrollo** |
| `yarn db:migrate:deploy` | Aplica migraciones pendientes sin resetear (producción) |
| `yarn db:migrate:status` | Muestra qué migraciones están aplicadas y qué falta |
| `yarn db:clone` | Clona la base local para ensayar migraciones sin riesgo |
| `yarn db:fix-checksums` | Informa (con `--apply`, corrige) checksums de migraciones editadas |
| `yarn db:check-drift` | Muestra índices, defaults y duplicados de la base |
| `yarn db:seed` | Carga datos de ejemplo |
| `yarn db:studio` | Abre Prisma Studio |

Después de generar el cliente, reiniciá `yarn dev`: el dev server se queda con el Prisma Client viejo en memoria y aparecen errores tipo `Cannot read properties of undefined`.

## Local vs producción

| Entorno | Cómo se configura |
|---------|-------------------|
| **Local** (`yarn dev`) | `.env` / `.env.local` → Postgres en `localhost:5432` |
| **Producción** (Docker) | Variables inyectadas en el host o en `docker-compose.yml` (`DATABASE_URL` con host `db`, `NEXTAUTH_URL` de prod) |

No apuntes el desarrollo local a la base de producción: la app crea, edita y borra registros.

## Deploy

Config del servidor: `deploy.env` (copiá desde `deploy.env.example` si no existe). Ahí van SSH, registry y credenciales de la DB.

Un solo comando desde tu Mac:

```bash
./build-and-push.sh
```

Eso: backup del Postgres en el VPS → migraciones (túnel SSH) → build → push. Watchtower actualiza el contenedor.

```bash
# Solo imagen
SKIP_PROD_MIGRATE=1 SKIP_BACKUP=1 ./build-and-push.sh

# Entrar al VPS a mano (mismos valores que deploy.env)
ssh -i ~/.ssh/propflow_actions -p 5924 root@149.50.134.219
```
