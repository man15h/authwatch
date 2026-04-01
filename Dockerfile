FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine

RUN apk add --no-cache tini

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./
COPY config.example.yml ./

ENV NODE_ENV=production
ENV CONFIG_PATH=/config.yml

USER node

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD test -f /data/authwatch.db || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
