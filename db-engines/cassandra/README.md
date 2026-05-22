# cassandra

Read-only Cassandra investigations via `query.mjs`.

Usage:

```bash
cd skill-ai-db-investigator/db-engines/cassandra
npm install
node query.mjs --env local-dev --file ./tmp-audit.cql
```

Connection key in `connections.json`: `cassandra.connectionJson` (JSON string for `cassandra-driver` options).

Each successful query writes dbVersion to query logs, session report, and `db-context/<env>/cassandra/database-profile.md`.


