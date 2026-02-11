# Auth Server

Express 5 + WebSocket server. Handles email-based account management, device syncing, OAuth brokering, and connection brokering for remote peer-to-peer connections. Backed by MongoDB and Redis.

```bash
cd authServer
npm install
npm run build      # compile TS
npm run dev        # development with nodemon
npm start          # production
```

**Stack:** Express 5, MongoDB, Redis, WebSocket (`ws`), Azure Communication Services (email), JWT auth, Zod validation.

The auth server does **not** relay user data — it only brokers connections so devices can establish direct peer-to-peer links.

## Docker

The `Dockerfile` inside `authServer/` builds the auth server as a multi-stage image (Node 20 Alpine). It compiles TypeScript in a build stage and produces a lean production image with only compiled JS and production dependencies.

### Building locally

```bash
cd authServer
docker build -t homecloud-auth .
```

### Using the published image

The CI pushes images to Docker Hub on every tagged release as `asrient/homecloud-auth`. Two tags are published:
- `latest` — always the most recent release
- `<version>` — pinned version (e.g., `1.2.0`)

```bash
# Pull the latest
docker pull asrient/homecloud-auth:latest

# Or pin to a specific version
docker pull asrient/homecloud-auth:1.2.0
```

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | — | Set to `production` for production |
| `PORT` | No | `4000` | HTTP + WebSocket port |
| `UDP_PORT` | No | `9669` | UDP relay port |
| `UDP_DOMAIN` | No | — | Public domain/IP for the UDP service; sent to clients as `serverAddress` for NAT traversal. Falls back to server URL if unset. |
| `MONGO_DB_URL` | **Yes** | — | MongoDB connection string |
| `REDIS_URL` | No | — | Redis URL; enables shared state for horizontal scaling |
| `SECRET_KEY` | **Yes (prod)** | `dev_secret_key` | JWT signing key |
| `BASE_URL` | No | `http://0.0.0.0:4000` | Public-facing URL of the server |
| `AZ_CS_CONNECTION_STRING` | **Yes (prod)** | — | Azure Communication Services connection string for email |
| `AZ_CS_SENDER` | **Yes (prod)** | — | Email sender address |
| `DB_NAME` | No | `mcdev`/`mcprod` | MongoDB database name (auto-selected by `NODE_ENV`) |

### Running standalone

Provide your own MongoDB and Redis (e.g., Azure Cosmos DB, MongoDB Atlas, Azure Cache for Redis):

```bash
docker run -d \
  --name homecloud-auth \
  --restart unless-stopped \
  -e NODE_ENV=production \
  -e MONGO_DB_URL=mongodb+srv://user:pass@cluster.mongodb.net \
  -e REDIS_URL=redis://your-redis-host:6379 \
  -e SECRET_KEY=your-secret \
  -e BASE_URL=https://your-domain.com \
  -e AZ_CS_CONNECTION_STRING=... \
  -e AZ_CS_SENDER=... \
  -e UDP_DOMAIN=udp.your-domain.com \
  -p 80:4000 \
  -p 9669:9669/udp \
  asrient/homecloud-auth:latest
```

Or use an env file:
```bash
docker run -d --name homecloud-auth --restart unless-stopped \
  --env-file auth.env \
  -p 80:4000 -p 9669:9669/udp \
  asrient/homecloud-auth:latest
```

### Updating

```bash
docker pull asrient/homecloud-auth:latest
docker stop homecloud-auth && docker rm homecloud-auth
# Re-run the docker run command above
```

## Docker Compose

A `docker-compose.base.yml` is provided in the `authServer/` directory as the base configuration. It defines all shared services but leaves nginx ports and volumes to the environment-specific overrides:

- **`docker-compose.dev.yml`** — Dev/testing: HTTP on port 80, no SSL, no IP restrictions.
- **`docker-compose.prod.yml`** — Production: HTTPS on port 443 with Cloudflare setup.

**What it includes:**
- **auth-api** — the auth server (builds from Dockerfile), scaled to 2 replicas
- **auth-udp** — UDP relay (single instance, exposed on port 9669)
- **nginx** — reverse proxy (config varies by environment)
- **mongo** — MongoDB 7 with a persistent volume (data survives restarts)
- **redis** — Redis Alpine for shared KV and pub/sub

### Setup

1. Clone the repo on your server:
   ```bash
   git clone https://github.com/asrient/HomeCloud.git
   cd HomeCloud/authServer
   ```

2. Create a `.env` file with your secrets:
   ```env
   SECRET_KEY=your-secret
   BASE_URL=https://your-domain.com
   AZ_CS_CONNECTION_STRING=...
   AZ_CS_SENDER=...
   # Optional: set if UDP service is reachable on a different domain than BASE_URL
   # UDP_DOMAIN=udp.your-domain.com
   ```

3. Start everything:
   ```bash
   # Dev (HTTP, port 80)
   docker compose -f docker-compose.dev.yml up -d

   # Production (HTTPS, port 443, Cloudflare-only)
   docker compose -f docker-compose.prod.yml up -d
   ```

4. Check logs:
   ```bash
   docker compose logs -f auth-api
   ```

### Production SSL Setup

Before deploying with `docker-compose.prod.yml`:

1. Create a Cloudflare Origin Certificate (SSL/TLS → Origin Server → Create Certificate)
2. Save the certificate and key:
   ```bash
   mkdir -p ssl
   # Paste the cert into ssl/origin.pem
   # Paste the key into ssl/origin-key.pem
   ```
3. Set Cloudflare SSL/TLS mode to **Full (Strict)**
4. Ensure your DNS record is proxied (orange cloud) through Cloudflare

### Common operations

```bash
# Stop all services
docker compose down

# Update to latest code and rebuild
git pull
docker compose -f docker-compose.dev.yml up -d --build   # or docker-compose.prod.yml

# View status
docker compose ps

# Restart just the API servers
docker compose restart auth-api
```

### Scaling

The API service (`auth-api`) can be scaled horizontally. The UDP service (`auth-udp`) runs as a single instance since it needs direct access to the client's real IP for NAT traversal.

```bash
# Scale API replicas at runtime
docker compose up -d --scale auth-api=5
```

| Replicas | When |
|----------|------|
| **2** | Starting out — gives redundancy so one can restart without downtime |
| **3** | Moderate traffic — a few hundred concurrent WebSocket connections |
| **5+** | High traffic — thousands of concurrent connections |

> **Note:** `docker compose down` preserves MongoDB data. To delete data, use `docker compose down -v`.

### When to use Docker vs Docker Compose

| Scenario | Use |
|----------|-----|
| External managed databases (Atlas, Azure Cosmos DB, Azure Cache) | **Docker standalone** — just the auth container |
| Self-hosted everything on one VM | **Docker Compose** — runs MongoDB + Redis alongside |

## Deploying on a VM

Step-by-step guide for deploying the auth server on a fresh Linux VM (e.g., Azure VM, DigitalOcean, Hetzner, EC2).

### 1. Provision the VM

- **OS:** Ubuntu 22.04+ recommended
- **Size:** 1 vCPU / 1 GB RAM is sufficient to start
- **Ports:** Open TCP `443` (HTTPS + WebSocket) and UDP `9669` in the firewall/security group

### 2. Install Docker

```bash
ssh user@your-vm-ip

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Log out and back in for group change to take effect
exit
ssh user@your-vm-ip

# Verify
docker --version
```

### 3a. Deploy with Docker Compose (self-hosted databases)

```bash
# Clone the repo
git clone https://github.com/asrient/HomeCloud.git
cd HomeCloud/authServer

# Create .env file
cat > .env << 'EOF'
SECRET_KEY=<generate-a-strong-random-key>
BASE_URL=https://your-domain.com
AZ_CS_CONNECTION_STRING=<your-azure-connection-string>
AZ_CS_SENDER=<your-sender@domain.com>
# Optional: set if UDP service is reachable on a different domain than BASE_URL
# UDP_DOMAIN=udp.your-domain.com
EOF

# Set up SSL for production (see Production SSL Setup above)
mkdir -p ssl
# Save your Cloudflare Origin Certificate to ssl/origin.pem and ssl/origin-key.pem

# Start auth server + MongoDB + Redis
docker compose -f docker-compose.prod.yml up -d

# Verify everything is running
docker compose ps
docker compose logs -f auth-api
```

### 3b. Deploy with Docker standalone (external databases)

Use this if you have managed MongoDB (Atlas / Azure Cosmos DB) and Redis (Azure Cache for Redis):

```bash
# Create an env file
cat > auth.env << 'EOF'
NODE_ENV=production
MONGO_DB_URL=mongodb+srv://user:pass@cluster.mongodb.net
REDIS_URL=redis://:password@your-redis-host:6380
SECRET_KEY=<generate-a-strong-random-key>
BASE_URL=https://your-domain.com
# Optional: set if UDP service is reachable on a different domain
# UDP_DOMAIN=udp.your-domain.com
AZ_CS_CONNECTION_STRING=<your-azure-connection-string>
AZ_CS_SENDER=<your-sender@domain.com>
EOF

# Pull and run the published image
docker pull asrient/homecloud-auth:latest
docker run -d \
  --name homecloud-auth \
  --restart unless-stopped \
  --env-file auth.env \
  -p 80:4000 \
  -p 9669:9669/udp \
  asrient/homecloud-auth:latest
```

### 4. Updating

**Docker Compose:**
```bash
cd HomeCloud/authServer
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

**Docker standalone:**
```bash
docker pull asrient/homecloud-auth:latest
docker stop homecloud-auth && docker rm homecloud-auth
docker run -d --name homecloud-auth --restart unless-stopped \
  --env-file auth.env -p 80:4000 -p 9669:9669/udp \
  asrient/homecloud-auth:latest
```

## Releasing a New Version

The auth server uses the `auth-v` tag prefix.

1. **Bump the version and create a tag:**
   ```bash
   cd authServer
   npm run release -- <major|minor|patch|x.y.z>
   # e.g. npm run release -- patch       → 1.0.0 → 1.0.1, tag: auth-v1.0.1
   ```

2. **Push the commit and tag:**
   ```bash
   git push && git push --tags
   ```
   This triggers the **Docker Image CI** workflow, which builds and pushes the image to Docker Hub.

> **Note:** The CI validates that the tag version matches `authServer/package.json`. The build will fail if they're out of sync.
