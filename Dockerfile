# =============================================================================
# Build stage
# =============================================================================

FROM node:18-alpine3.18 AS builder
LABEL authors="asrient"

WORKDIR /build

# Install app dependencies
COPY web ./web
COPY apps ./apps

RUN cd web && npm ci && \
    npm run build

RUN cd apps && npm ci && \
    NODE_ENV=production npm run build

# ============================================================================= \
# Production stage
# =============================================================================
FROM node:18-alpine3.18
LABEL authors="asrient"

WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /build/apps/bin/node ./bin/node
COPY --from=builder /build/web/out ./bin/web
COPY apps/package*.json ./

RUN npm ci --production

EXPOSE 5000

CMD ["node", "bin/node/index.js"]
