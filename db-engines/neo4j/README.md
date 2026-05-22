# neo4j

Read-only Neo4j investigations via `query.mjs`.

Usage:

```bash
cd skill-ai-db-investigator/db-engines/neo4j
npm install
node query.mjs --env local-dev --file ./tmp-audit.cypher
```

Connection key in `connections.json`: `neo4j.connectionJson` (JSON string with uri/username/password/database).

Each successful query writes dbVersion to query logs, session report, and `db-context/<env>/neo4j/database-profile.md`.


