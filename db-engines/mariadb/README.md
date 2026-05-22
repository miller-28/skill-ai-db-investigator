# mariadb

Read-only MariaDB investigations via `query.mjs`.

Usage:

```bash
cd ai-db-investigator/db-engines/mariadb
npm install
node query.mjs --env local-dev --file ./tmp-audit.sql
```

Connection key in `connections.json`: `mariadb.connectionUrl`.

Each successful query writes dbVersion to query logs, session report, and `db-context/<env>/mariadb/database-profile.md`.


