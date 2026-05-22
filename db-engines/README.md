# Database Engines

This folder contains one read-only query bridge per database engine.

## Engines

- `postgres/`
- `mongo/`
- `mysql/`
- `mariadb/`
- `sqlserver/`
- `sqlite/`
- `redis/`
- `elasticsearch/`
- `cassandra/`
- `neo4j/`

## Standard usage pattern

From repository root:

```bash
cd db-engines/postgres
npm install
node query.mjs --env local-dev 'SELECT 1 AS ok'
```

Replace `postgres` with any engine folder above.

## Environment and engine selection

- Environment profiles are defined in root `connections.json`.
- Use `--env <name>` or set `DB_INVESTIGATION_TOOL_ENV`.
- If an engine is not provided in the prompt flow, use `npm run engine-options -- --env <name>` to list configured engines for that environment.

## Context and logs

All engines write to the same global structure:

- Runtime context: `db-context/<env>/<engine>/`
- Query logs: `investigations/<env>/<engine>/<session>/`
- Session report: `investigations/<env>/<engine>/<session>/investigation-report.md`

## Read-only contract

Every engine bridge is read-only by design.

- SQL bridges reject mutating statements.
- Mongo aggregate rejects pipelines containing `$out` or `$merge`.
- Redis allows only safe read commands.
- Neo4j blocks mutating Cypher clauses.
- Elasticsearch/OpenSearch allows read-style operations only.

If a write operation is required, obtain explicit user approval and use an approved native client outside this bridge.
