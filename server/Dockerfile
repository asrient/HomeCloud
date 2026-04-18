# syntax=docker/dockerfile:1
#
# This image installs the published @asrient/homecloud-server package from
# npm — the same artifact `npx @asrient/homecloud-server` consumes. The
# package version MUST be published to npm before this image is built.
#
# The version is supplied via the SERVER_VERSION build-arg (no default — the
# build fails fast if it's missing, preventing accidental "latest" rolls).

FROM node:20-slim

ARG SERVER_VERSION
RUN test -n "$SERVER_VERSION" || (echo "ERROR: --build-arg SERVER_VERSION=<version> is required" >&2 && exit 1)

# System dependencies for thumbnails and node-pty native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpegthumbnailer \
    imagemagick \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install the published server globally — exposes the `homecloud-server` bin.
# Native modules (sqlite3, node-pty) are compiled here against this Node version.
RUN npm install -g "@asrient/homecloud-server@${SERVER_VERSION}"

EXPOSE 7736/tcp

VOLUME ["/data"]

ENV HC_DATA_DIR=/data \
    HC_CACHE_DIR=/tmp/hcServerCache \
    NODE_ENV=production

# PASSPHRASE and CREDS_PATH or CREDS_BASE64 must be provided at runtime
CMD ["homecloud-server"]
