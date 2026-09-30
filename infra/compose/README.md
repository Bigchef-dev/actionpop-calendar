# Deployment

Copy `.env.example` to `.env`, replace the registry image names, and provide
deployment secrets through the environment rather than committing them.

```bash
docker compose -f infra/compose/docker-compose.yml up -d
docker compose -f infra/compose/docker-compose.yml ps
```

Build the independent runtime targets from the repository root:

```bash
docker build --target api -t actionpop-api:test -f infra/docker/Dockerfile .
docker build --target worker -t actionpop-worker:test -f infra/docker/Dockerfile .
```

Redis, worker, and internal health endpoints remain on the private network. Public
HTTPS termination belongs at the deployment edge.
