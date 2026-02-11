# ============================================================================= \
# Build stage
# =============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install all dependencies (including devDependencies for tsc)
COPY package*.json ./
RUN npm ci

# Copy source code and compile TypeScript
COPY . ./
RUN npm run build

# ============================================================================= \
# Production stage
# =============================================================================

FROM node:20-alpine
LABEL authors="asrient"

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from build stage
COPY --from=builder /app/dist ./dist
COPY exposed ./exposed

EXPOSE 4000/tcp
EXPOSE 9669/udp

CMD ["node", "dist/index.js"]
