# redis

Read-only Redis investigations via `query.mjs`.

Usage:

```bash
cd skill-ai-db-investigator/db-engines/redis
npm install
node query.mjs --env local-dev info server
```

Allowed commands: `ping`, `info`, `dbsize`, `get`, `hgetall`, `smembers`, `lrange`, `zrange`, `scan`.

Connection key in `connections.json`: `redis.url`.

Each successful query writes dbVersion to query logs, session report, and `db-context/<env>/redis/database-profile.md`.


