# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# O Vite embute as variáveis no bundle em tempo de build, então a URL da API é
# argumento de build, não de runtime. O padrão `/api` é relativo: o nginx desta
# mesma imagem encaminha para o backend, o que dispensa saber em que host ou
# porta a API foi publicada e elimina CORS.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
