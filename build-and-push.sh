#!/bin/bash
set -euo pipefail

# Deploy en un comando: backup (VPS) + migraciones (vía SSH) + build + push.
# Watchtower actualiza el contenedor. No hace falta entrar al VPS a mano.

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# Carga deploy.env si existe; si no, deploy.env.example
if [ -f "$ROOT_DIR/deploy.env" ]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/deploy.env"
  set +a
elif [ -f "$ROOT_DIR/deploy.env.example" ]; then
  echo "⚠  No hay deploy.env — usando deploy.env.example"
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/deploy.env.example"
  set +a
fi

# Defaults (por si falta alguna var)
SSH_HOST="${SSH_HOST:-149.50.134.219}"
SSH_PORT="${SSH_PORT:-5924}"
SSH_USER="${SSH_USER:-root}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-$HOME/.ssh/propflow_actions}"
SSH_TUNNEL_LOCAL_PORT="${SSH_TUNNEL_LOCAL_PORT:-15432}"

REGISTRY_URL="${REGISTRY_URL:-149.50.134.219:5000}"
IMAGE_NAME="${IMAGE_NAME:-taller-app}"
IMAGE_VERSION="${IMAGE_VERSION:-latest}"

DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-Root.1234}"
DB_NAME="${DB_NAME:-mecnobile-db}"

# Expandir ~
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE/#\~/$HOME}"

SSH_CTRL="$ROOT_DIR/.deploy-ssh.sock"
REMOTE_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${SSH_TUNNEL_LOCAL_PORT}/${DB_NAME}?schema=public"

ssh_base() {
  ssh -i "$SSH_IDENTITY_FILE" -p "$SSH_PORT" \
    -o StrictHostKeyChecking=accept-new \
    -o IdentitiesOnly=yes \
    "$@"
}

open_tunnel() {
  echo "🔐 Túnel SSH → ${SSH_USER}@${SSH_HOST}:${SSH_PORT} (local ${SSH_TUNNEL_LOCAL_PORT} → postgres)"
  rm -f "$SSH_CTRL"
  ssh_base -f -N -M -S "$SSH_CTRL" \
    -o ExitOnForwardFailure=yes \
    -L "${SSH_TUNNEL_LOCAL_PORT}:127.0.0.1:5432" \
    "${SSH_USER}@${SSH_HOST}"
}

close_tunnel() {
  if [ -S "$SSH_CTRL" ]; then
    ssh -S "$SSH_CTRL" -O exit "${SSH_USER}@${SSH_HOST}" 2>/dev/null || true
    rm -f "$SSH_CTRL"
  fi
}
trap close_tunnel EXIT

remote() {
  ssh_base "${SSH_USER}@${SSH_HOST}" "$@"
}

echo "🚀 Deploy → ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"
echo "📦 Yarn $(yarn -v)"
yarn cache clean
yarn install

# --- Backup en el VPS (contenedor taller_db) ---
if [ "${SKIP_BACKUP:-0}" = "1" ]; then
  echo "⏭  SKIP_BACKUP=1"
else
  echo "💾 Backup en el VPS..."
  BACKUP_NAME="backup-$(date +%F-%H%M).dump"
  remote "docker exec taller_db pg_dump -U ${DB_USER} -d ${DB_NAME} -Fc" > "$ROOT_DIR/$BACKUP_NAME"
  echo "   Guardado local: $BACKUP_NAME"
fi

# --- Migraciones vía túnel (Prisma corre en tu Mac, datos en el VPS) ---
if [ "${SKIP_PROD_MIGRATE:-0}" = "1" ]; then
  echo "⏭  SKIP_PROD_MIGRATE=1"
else
  open_tunnel
  echo "🗄  Migraciones en producción..."
  DATABASE_URL="$REMOTE_DB_URL" node scripts/fix-migration-checksums.mjs --apply
  DATABASE_URL="$REMOTE_DB_URL" npx prisma migrate deploy
  echo "✅ Base de producción al día"
  close_tunnel
  trap - EXIT
fi

# --- Build + push ---
echo "🏗️  Build ${REGISTRY_URL}/${IMAGE_NAME}:${IMAGE_VERSION}"
docker buildx build --platform linux/amd64 \
  -t "${REGISTRY_URL}/${IMAGE_NAME}:${IMAGE_VERSION}" --load .

# El registry corta la conexión cada tanto (EOF a mitad del push): reintentamos,
# las capas ya subidas se saltean solas.
echo "📤 Push..."
for attempt in 1 2 3; do
  if docker push "${REGISTRY_URL}/${IMAGE_NAME}:${IMAGE_VERSION}"; then
    break
  fi
  if [ "$attempt" = "3" ]; then
    echo "❌ El push falló 3 veces. Reintentá: docker push ${REGISTRY_URL}/${IMAGE_NAME}:${IMAGE_VERSION}"
    exit 1
  fi
  echo "⚠  Push falló (intento ${attempt}/3). Reintentando en 5s..."
  sleep 5
done

echo "🎉 Listo. Watchtower actualiza taller_app solo."
echo "   SSH: ssh -i ${SSH_IDENTITY_FILE} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST}"
