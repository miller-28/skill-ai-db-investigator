# mysql

Read-only MySQL investigations via `query.mjs`.

Usage:

```bash
cd skill-ai-db-investigator/db-engines/mysql
npm install
node query.mjs --env local-dev --file ./tmp-audit.sql
```

Connection key in `connections.json`: `mysql.connectionUrl`.

Each successful query writes dbVersion to query logs, session report, and `db-context/<env>/mysql/database-profile.md`.


