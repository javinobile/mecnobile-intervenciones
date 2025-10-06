#!/bin/bash

# Variables
IMAGE_NAME="taller-app"
VERSION="latest"
REGISTRY_URL="149.50.134.219:5000"
#REGISTRY_URL="52.7.245.4:5000"

echo "🚀 Iniciando proceso de build y push..."

# Asegurarse de que estamos usando yarn 1.22.19
echo "📦 Verificando versión de yarn..."
yarn -v

# Limpiar yarn cache
echo "🧹 Limpiando cache de yarn..."
yarn cache clean

# Instalar dependencias
echo "📥 Instalando dependencias..."
yarn install

# Construir la imagen
echo "🏗️ Construyendo imagen Docker..."
docker buildx build --platform linux/amd64 -t ${REGISTRY_URL}/${IMAGE_NAME}:${VERSION} --load .

# Verificar si el build fue exitoso
if [ $? -eq 0 ]; then
    echo "✅ Build completado exitosamente"
    
    # Push a registry local
    echo "📤 Subiendo imagen al registry..."
    docker push ${REGISTRY_URL}/${IMAGE_NAME}:${VERSION}
    
    if [ $? -eq 0 ]; then
        echo "✅ Push completado exitosamente"
        echo "🎉 Proceso completado!"
    else
        echo "❌ Error durante el push de la imagen"
        exit 1
    fi
else
    echo "❌ Error durante el build de la imagen"
    exit 1
fi
