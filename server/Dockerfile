# Stage 1: Build TypeScript
FROM node:22-alpine AS builder
WORKDIR /build

COPY server/package*.json ./server/
COPY shared/ ./shared/

WORKDIR /build/server
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

WORKDIR /build
COPY server/ ./server/

WORKDIR /build/server
RUN npm run build && npm prune --omit=dev

# Stage 2: Production runner
FROM node:22-alpine AS runner

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /build/server/dist ./dist
COPY --from=builder /build/server/node_modules ./node_modules

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "dist/server/src/index.js"]
