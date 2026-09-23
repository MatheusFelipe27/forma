# syntax=docker/dockerfile:1

# openssl é exigido pelos engines do Prisma na Alpine; sem ele a inicialização
# falha com "Prisma failed to detect the libssl/openssl version".
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production

# node_modules vem inteiro do builder: além do Prisma Client já gerado, o
# entrypoint precisa da CLI do Prisma (migrate deploy) e o seed precisa do tsx —
# ambos devDependencies. Um `npm ci --omit=dev` deixaria a imagem menor e o
# container incapaz de migrar ou semear.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh && chown -R node:node /app

USER node
EXPOSE 3333

ENTRYPOINT ["./docker-entrypoint.sh"]
