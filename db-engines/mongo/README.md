# mongo

Inspect MongoDB using a named environment in `../../connections.json`. From the bridge root, run `node scripts/diagnose.mjs` once per session for OS hints (mostly relevant for Postgres; Mongo argv is usually short).

Context model:
- `db-context-template/mongo/` is the committed template.
- `db-context/<env>/mongo/` is the runtime context store (gitignored, auto-seeded by `query.mjs`).

```bash
cd ai-db-investigator/db-engines/mongo
npm install

node query.mjs listDbs
node query.mjs --env local-dev listDbs
node query.mjs collections mydb
node query.mjs find mydb.myCollection '{}'
node query.mjs count mydb.myCollection
node query.mjs aggregate mydb.myCollection '[{"$limit":5}]'
```

Replace `mydb` / `myCollection` with real database and collection names from `listDbs` / `collections`. Set `DB_INVESTIGATION_TOOL_ENV=local-dev` once per shell session to avoid repeating `--env`. Optional: `DB_INVESTIGATION_TOOL_NO_QUERY_LOG=1` to disable `../../investigations/` writes.

Same **session folder** behavior as Postgres: `../../investigations/<env>/mongo/<session>/` via **`DB_INVESTIGATION_TOOL_LOG_DIR`**, **`--log-dir`**, **`DB_INVESTIGATION_TOOL_INVESTIGATION`**, **`--investigation`** (see bridge [README](../../README.md)). Flags only at the **start** of argv, including optional `--env`.

Each successful run captures MongoDB server version and writes it to:
- query log entry in `../../investigations/<env>/mongo/<session>/`
- session report `investigation-report.md`
- runtime context profile `../../db-context/<env>/mongo/database-profile.md`

**Read-only:** **`aggregate`** pipelines must not include **`$out`** or **`$merge`** (including nested under **`$facet`**). For writes, ask the user in chat and use **mongosh** or another approved tool.

