#!/bin/sh
set -e

# `migrate deploy`, não `migrate dev`: aplica as migrations existentes sem gerar
# novas nem pedir confirmação — é o comando próprio para ambiente não interativo.
echo "Aplicando migrations..."
npx prisma migrate deploy

echo "Iniciando a API..."
exec node dist/server.js
