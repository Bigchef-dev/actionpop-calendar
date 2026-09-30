# Redis persistence operations

Redis is configured with AOF persistence and `noeviction` in
[redis.conf](redis.conf). The Compose named volume preserves data across a normal
container restart.

Validate the AOF and volume-backed restart:

```bash
docker compose -f infra/compose/docker-compose.yml exec redis redis-cli INFO persistence
docker compose -f infra/compose/docker-compose.yml restart redis
docker compose -f infra/compose/docker-compose.yml exec redis redis-cli BGREWRITEAOF
```

Back up the AOF and configuration to external storage according to the deployment
platform policy. Restoring requires stopping Redis, restoring the backup into the
volume, checking ownership, and starting Redis again. This procedure does not claim
recovery from loss of the host or the named volume itself.