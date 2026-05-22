# First Use

Quick setup for your first safe local database investigation.

You can run this full flow with AI prompting in Cursor or VS Code: ask the agent to set up `connections.json`, run diagnostics, and execute read-only DB queries through this tool.

## 1) Install dependencies

From repository root:

```bash
cd db-engines/postgres && npm install
cd ../mongo && npm install
cd ../mysql && npm install
cd ../mariadb && npm install
cd ../sqlserver && npm install
cd ../sqlite && npm install
cd ../redis && npm install
cd ../elasticsearch && npm install
cd ../cassandra && npm install
cd ../neo4j && npm install
```

## 2) Add local credentials (mandatory via connections.json)

- copy `connections.example.json` to `connections.json` in repo root
- add one or more environment names with any engines you use:
	- `postgres.databaseUrl`
	- `mongo.mongoDbConnection`
	- `mysql.connectionUrl`
	- `mariadb.connectionUrl`
	- `sqlserver.connectionString`
	- `sqlite.filePath`
	- `redis.url`
	- `elasticsearch.nodeUrl`
	- `cassandra.connectionJson`
	- `neo4j.connectionJson`
- optionally add `aliases` per environment (for example `["develop", "development"]` for `dev`)
- do not rely on `defaultEnv` for investigations; use explicit `--env` on each run

## 3) Run diagnose (mandatory)

From repo root:

```bash
node scripts/diagnose.mjs
```

This confirms `connections.json` is present and prints the recommended command style for your OS.

For shell-specific copy/paste commands (bash/zsh/fish/PowerShell/cmd):

```bash
npm run shell-help
```

## 4) Read context before querying

Context is maintained by environment and engine.

For `local-dev` and your chosen engine:

- `db-context/local-dev/<engine>/schema.mermaid`
- `db-context/local-dev/<engine>/entity-map.md`
- `db-context/local-dev/<engine>/database-profile.md`

When missing, the first query auto-creates these from `db-context-template/<engine>/`.

## 5) Run first query

Postgres:

```bash
cd db-engines/postgres
node query.mjs --env local-dev 'SELECT 1 AS ok'
```

Mongo:

```bash
cd db-engines/mongo
node query.mjs --env local-dev listDbs
```

## 6) Keep knowledge and sessions updated

After each investigation:

- update `db-context/<env>/<engine>/schema.mermaid` for confirmed entities and relations
- update `db-context/<env>/<engine>/entity-map.md` for confirmed mappings
- verify `db-context/<env>/<engine>/database-profile.md` reflects the observed DB version
- finalize `investigations/<env>/<engine>/<session>/investigation-report.md`

