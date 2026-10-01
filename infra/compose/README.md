# Deployment

Copy `.env.example` to `.env`, replace the registry image names, and provide
deployment secrets through the environment rather than committing them.

```bash
docker compose -f infra/compose/docker-compose.yml up -d
docker compose -f infra/compose/docker-compose.yml ps
```

From the repository root, Compose can build both application images directly:

```bash
docker compose -f infra/compose/docker-compose.yml up --build
```

For local development, the API is available at `http://localhost:3000`. The port
is bound to loopback only; production traffic should use the HTTPS edge.

Set `API_IMAGE` and `WORKER_IMAGE` when the services should use registry images
instead of the local default tags.

Build the independent runtime targets from the repository root:

```bash
docker build -t actionpop-api:test -f infra/docker/Dockerfile.api .
docker build -t actionpop-worker:test -f infra/docker/Dockerfile.worker .
```

Redis, worker, and internal health endpoints remain on the private network. Public
HTTPS termination belongs at the deployment edge.
