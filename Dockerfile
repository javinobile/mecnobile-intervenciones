# -----------------------------------------------------------
# BASE: Define la imagen base
# -----------------------------------------------------------
FROM node:20-alpine AS base

# Instala la librería de compatibilidad con libc (esencial para Alpine y Node/Prisma)
RUN apk add --no-cache libc6-compat openssl

# -----------------------------------------------------------
# DEPENDENCIAS: Instala dependencias y prepara el entorno
# -----------------------------------------------------------
FROM base AS deps
WORKDIR /app

# 🚨 PASO 1: Instalar herramientas de compilación
RUN apk add --no-cache build-base python3

# Copia los archivos de bloqueo
COPY package.json yarn.lock ./

# Asegura que Yarn pueda crear su caché si lo necesita
RUN chmod -R 777 /app

# 🚨 PASO 2: Instalar dependencias con --verbose para ver la causa del error
# Ya no usamos la limpieza en este paso para que el error no se oculte.
RUN yarn install --verbose

# 🚨 PASO 3: LIMPIEZA
# Este paso fallará si el anterior falla, pero nos dará el log detallado
RUN apk del build-base python3

# -----------------------------------------------------------
# BUILDER: Copia código, genera Prisma y construye Next.js
# -----------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copia los módulos instalados
COPY --from=deps /app/node_modules ./node_modules

# 🚨 CAMBIO CLAVE: Copiar TODO el código ahora (incluyendo la carpeta prisma/)
COPY . .

# 🚨 Generar el Prisma Client AHORA. El archivo schema.prisma ya existe.
RUN npx prisma generate

# Ejecuta el build de Next.js
RUN yarn build 

# -----------------------------------------------------------
# RUNNER: Imagen de Producción (FINAL, la más pequeña)
# -----------------------------------------------------------
FROM base AS runner
WORKDIR /app

# Configuración de variables de entorno de producción
ENV NODE_ENV=production
# ENV NEXT_TELEMETRY_DISABLED 1

# Crea el grupo y usuario para seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copia el 'standalone' y los 'static' (la magia de la optimización)
# 🚨 IMPORTANTE: Asegúrate de que tu `next.config.js` tenga `output: 'standalone',`
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Asignar permisos sobre el directorio (aunque el standalone ya es eficiente)
RUN chown -R nextjs:nodejs /app

# Ajusta tu DATABASE_URL aquí para que use el nombre del servicio 'db'
# ENV DATABASE_URL postgresql://user:password@db:5432/db_taller?schema=public

USER nextjs

EXPOSE 3000

ENV PORT=3000

# El comando de inicio para la imagen standalone
CMD ["node", "server.js"]