# postgres

Run one SQL statement. Connection must come from a named environment in `../../connections.json`.

Context model:
- `db-context-template/postgres/` is the committed template.
- `db-context/<env>/postgres/` is the runtime context store (gitignored, auto-seeded by `query.mjs`).

From the bridge root, run `node scripts/diagnose.mjs` once per session for OS-specific invocation hints.

```bash
cd skill-ai-db-investigator/db-engines/postgres
npm install

node query.mjs 'SELECT current_database()'
node query.mjs --env local-dev 'SELECT current_database()'
node query.mjs --file ./my.sql
node query.mjs @./my.sql
Get-Content .\my.sql | node query.mjs
```

Set `DB_INVESTIGATION_TOOL_ENV=local-dev` once per shell session to avoid repeating `--env`. Optional: `DB_INVESTIGATION_TOOL_NO_QUERY_LOG=1` to disable `../../investigations/` writes.

**Investigation sessions:** logs go under `../../investigations/<env>/postgres/<session>/`. Set **`DB_INVESTIGATION_TOOL_LOG_DIR`** or **`--log-dir SESSION`** (same value across several runs to group queries), or use **`DB_INVESTIGATION_TOOL_INVESTIGATION`** / **`--investigation SLUG`** for auto `YYYY-MM-DD_HH-mm-SS_<slug>` folders. Flags must appear **only at the start** of argv (before SQL / `--file` / `@file`), including optional `--env`.
On **Windows PowerShell**, prefer **`--file`**, **`@path.sql`**, or **pipe** when SQL contains double-quoted identifiers (`"MyTable"`). Use **`tmp-*.sql`** for scratch files (gitignored).

Each successful run captures Postgres version and writes it to:
- query log entry in `../../investigations/<env>/postgres/<session>/`
- session report `investigation-report.md`
- runtime context profile `../../db-context/<env>/postgres/database-profile.md`

**Read-only:** only one statement; must be **SELECT / WITH / VALUES / TABLE / SHOW / EXPLAIN** (see bridge [README](../../README.md)). Runs in a **READ ONLY** transaction. No `INSERT` / `UPDATE` / `DELETE` / DDL; ask the user in chat before using another client for writes.

