# Serviço de backup: Node + cliente do Postgres 18 (pg_dump mais novo lê
# servidores de versões anteriores).
FROM postgres:18-alpine
RUN apk add --no-cache nodejs npm
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY *.mjs ./
USER postgres
CMD ["node", "backup.mjs"]
