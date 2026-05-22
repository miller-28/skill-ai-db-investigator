# sqlite

Read-only SQLite investigations via `query.mjs`.

Usage:

```bash
cd ai-db-investigator/db-engines/sqlite
npm install
node query.mjs --env local-dev --file ./tmp-audit.sql
```

Connection key in `connections.json`: `sqlite.filePath`.

Each successful query writes dbVersion to query logs, session report, and `db-context/<env>/sqlite/database-profile.md`.


