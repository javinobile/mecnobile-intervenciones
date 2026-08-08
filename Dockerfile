# -----------------------------------------------------------
# BASE: Define la imagen base
# -----------------------------------------------------------
FROM node:20-alpine AS base

# libc6-compat/openssl: Node y Prisma en Alpine.
# tzdata: sin este paquete Node ignora TZ y todo queda en UTC (los horarios de
# turnos enviados por WhatsApp saldrían corridos respecto a la hora del taller).
RUN apk add --no-cache libc6-compat openssl tzdata

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

ENV NODE_ENV=production
# Hora del taller: puede sobreescribirse desde el compose/.env
ENV TZ=America/Argentina/Buenos_Aires

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Standalone de Next.js (requiere output: 'standalone' en next.config)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
