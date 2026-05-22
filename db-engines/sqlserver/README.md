# sqlserver

Read-only SQL Server investigations via `query.mjs`.

Usage:

```bash
cd ai-db-investigator/db-engines/sqlserver
npm install
node query.mjs --env local-dev --file ./tmp-audit.sql
```

Connection key in `connections.json`: `sqlserver.connectionString`.

Each successful query writes dbVersion to query logs, session report, and `db-context/<env>/sqlserver/database-profile.md`.


