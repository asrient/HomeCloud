FROM node:20-slim

# Install system dependencies for thumbnails and node-pty
RUN apt-get update && apt-get install -y \
    ffmpegthumbnailer \
    imagemagick \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy shared packages (pre-built)
COPY appShared/dist ./appShared/dist
COPY nodeShared/dist ./nodeShared/dist

# Copy server package and install deps
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN npm install --production

# Copy built server code
COPY server/dist ./dist

EXPOSE 7736/tcp
EXPOSE 7736/udp

VOLUME ["/config", "/data"]

ENV HOMECLOUD_CONFIG_DIR=/config
ENV HOMECLOUD_DATA_DIR=/data

CMD ["node", "dist/index.js"]
