---
name: skill-ai-db-investigator
description: Read-only local DB investigation protocol for Postgres, Mongo, MySQL, MariaDB, SQL Server, SQLite, Redis, Elasticsearch, Cassandra, and Neo4j.
---

# Local database investigation

## Step 0 - Run diagnose first (mandatory)

Before any database command, from this repository root run:

```bash
node scripts/diagnose.mjs
```

(or `npm run diagnose` from the same folder.)

For shell-specific command snippets (bash/zsh/fish/PowerShell/cmd), run:

```bash
npm run shell-help
```

Read the JSON `platform` and `isWindows`, and the `recommendations` array. Use that to choose how you invoke Postgres:

| Situation | Preferred invocation |
|-----------|------------------------|
| Windows + SQL with `"QuotedIdentifier"` | Never rely on one double-quoted CLI string. Use `--file`, `@path.sql`, or pipe (`Get-Content .\q.sql | node query.mjs` from postgres). |
| Windows + short SQL without `"` | Inline with single quotes is OK: `node query.mjs 'SELECT 1'`. |
| Unix | Inline usually fine; still prefer `--file` / `@` for large or fiddly SQL. |
|

Then proceed with the investigation. This step exists specifically to avoid PowerShell quoting traps and to confirm connection configuration exists.

## Step 0.1 - Resolve target environment (mandatory)

Hard rule: never assume or auto-pick an environment when the user request does not explicitly provide one.

Connection priority for each query command:

1. `--env <name>`
2. `DB_INVESTIGATION_TOOL_ENV` (session-level)

`defaultEnv` must not be used for this skill flow. Environment selection must always be explicit.

If the user request already names the environment (or one of its aliases), pass `--env` explicitly on every query command.

If the request does not name the environment:

1. Run `node scripts/diagnose.mjs` and inspect `connectionProfiles.environmentNames`.
2. Run `node scripts/connection-options.mjs` and ask the user to choose with a combo-style options prompt.
3. Do this prompt step even if there is only one configured environment.
4. Present:
   - one option per configured environment name
   - alias options when available (mapped to their target environment)
   - one extra option: Set new connection
5. If the user chooses Set new connection, ask a second free-text prompt (textarea-style) for:
   - environment name
   - aliases (optional list; for example `develop`, `development` for `dev`)
   - connection purpose/description
6. Never ask for secrets in chat prompts (for example DB URLs with passwords, API keys, tokens, or raw credentials).
7. Instruct the user to add engine credentials directly in their local `connections.json` (or copy from `connections.example.json`) outside chat.
8. Continue only after non-secret profile fields are confirmed, then use `--env <new-name>`.

## Credential handling (mandatory)

- Never request or collect secret values through chat prompts or model-generated forms.
- Never echo secret values in responses, logs, or generated artifacts.
- If credentials are required, instruct the user to enter them directly into local files or terminal input without sharing them in chat.

## Step 0.2 - Resolve target engine (mandatory)

Hard rule: never assume or auto-pick a database engine when the user request does not explicitly provide one.

If the request already names the engine, use it.

If the request does not name the engine:

1. Run `node scripts/engine-options.mjs --env <resolved-env>`.
2. Show the returned `engineOptions` as a combo selection prompt.
3. Ask the user to choose one engine.
4. If `engineOptions` is empty, tell the user there are no configured engine credentials under that environment and ask them to update `connections.json`.

## Step 1 - Read the DB entities report first (mandatory)

Before writing new queries/commands, inspect runtime context for the chosen environment and engine:

- `db-context/<env>/<engine>/schema.mermaid` - incremental ER diagram; shows entities, columns, and FK relations discovered so far. Use this to orient yourself visually before composing queries.
- `db-context/<env>/<engine>/entity-map.md`
- `db-context/<env>/<engine>/database-profile.md`

`db-context-template/<engine>/` is the committed template and `db-context/<env>/<engine>/` is runtime data (gitignored). Build investigation queries from runtime context instead of rediscovering structure each time.

## Lens source-of-truth (mandatory)

For Lens (`lens/index.html`), the rendered context is always loaded from runtime env/engine files:

- `db-context/<env>/<engine>/schema.mermaid`
- `db-context/<env>/<engine>/entity-map.md`
- `db-context/<env>/<engine>/database-profile.md`

Hard rules:

1. Never treat `db-context-template/<engine>/` as rendered output; it is seed content only.
2. If Lens shows template placeholders (for example `_fill me_`), update the runtime env/engine file in `db-context/<env>/<engine>/`, not the template file.
3. Before ending work, verify the selected env/engine runtime files are populated with real investigation data (not stubs).

## When this applies

Use this skill whenever the task needs local answers from supported engines:
Postgres, MongoDB, MySQL, MariaDB, SQL Server, SQLite, Redis, Elasticsearch/OpenSearch, Cassandra, and Neo4j.

## Read-only contract (mandatory)

These CLIs are read-only by design. Do not attempt `INSERT`, `UPDATE`, `DELETE`, DDL, multi-statement scripts, or Mongo pipelines with `$out` / `$merge` through this bridge.

- If stderr JSON includes `readOnlyViolation: true` or code `READ_ONLY_SQL_VIOLATION`, treat that as a hard stop: tell the user what you wanted to run, ask whether they explicitly approve a mutating operation, and only then propose `psql`, `mongosh`, or another approved workflow.
- Prefer `SELECT` / `WITH` / `EXPLAIN` / `SHOW` (Postgres) and list / find / count / bounded aggregate (Mongo) only.

## Tooling (required)

Use the ai-db-investigator package only. Do not invent new connection scripts.

| Engine | Working directory | Command |
|--------|-------------------|---------|
| Postgres | `db-engines/postgres` | Optional leading `--env NAME`, `--log-dir SESSION`, `--investigation SLUG`, then `node query.mjs @./tmp.sql`, `--file`, pipe, or short inline SQL per Step 0 |
| Mongo | `db-engines/mongo` | Same optional leading flags, then `node query.mjs listDbs`, ... |
| MySQL | `db-engines/mysql` | Same optional leading flags, then `node query.mjs --file ./tmp.sql` or inline read-only SQL |
| MariaDB | `db-engines/mariadb` | Same optional leading flags, then `node query.mjs --file ./tmp.sql` or inline read-only SQL |
| SQL Server | `db-engines/sqlserver` | Same optional leading flags, then `node query.mjs --file ./tmp.sql` or inline read-only SQL |
| SQLite | `db-engines/sqlite` | Same optional leading flags, then `node query.mjs --file ./tmp.sql` or inline read-only SQL |
| Redis | `db-engines/redis` | Same optional leading flags, then read-only command subcommands (`info`, `dbsize`, `get`, etc.) |
| Elasticsearch/OpenSearch | `db-engines/elasticsearch` | Same optional leading flags, then `info`, `catIndices`, `search`, `count` |
| Cassandra | `db-engines/cassandra` | Same optional leading flags, then `node query.mjs --file ./tmp.cql` |
| Neo4j | `db-engines/neo4j` | Same optional leading flags, then `node query.mjs --file ./tmp.cypher` |

Prerequisites: `npm install` once inside each engine folder under `db-engines/`. Configure named environments in `connections.json` (copy from `connections.example.json`).

Postgres scratch files: write `db-engines/postgres/tmp-whatever.sql` (pattern `tmp-*.sql` is gitignored in postgres) so investigation SQL does not need escaping through the shell.
When the investigation is complete, delete every `postgres/tmp-*.sql` file you created.

## Query audit trail (per investigation session)

Logs live under `investigations/<env>/<engine>/<session>/`.

- `<session>` = `DB_INVESTIGATION_TOOL_LOG_DIR` / `--log-dir` (reused when the directory already exists), or auto `YYYY-MM-DD-HHmm_<investigation>` (UTC) when unset.
- `<investigation>` = `DB_INVESTIGATION_TOOL_INVESTIGATION` / `--investigation` / default `ad-hoc`.
- Inner files keep millisecond timestamps so several queries in one session sort cleanly.

Multi-query workflow: set the same `DB_INVESTIGATION_TOOL_LOG_DIR` in the shell for every call, or repeat the same `--log-dir` value at the start of each command. JSON output includes `investigationSession` so you can confirm the folder name.

Session naming format examples:

- `2026-05-21-1045_users-workplaces-projects-documents`
- `2026-05-21-1712_accounts-documents-fk-audit`

Lens ordering requirement:

- Session list must display newest at top and oldest at bottom.
- Sorting should be timestamp-aware for both new format (`YYYY-MM-DD-HHmm_<slug>`) and legacy format (`YYYY-MM-DD_HH-mm-SS_<slug>`).

Each successful query also reports `dbVersion` and writes it into:
- query log entries under the active session
- `investigation-report.md` in the active session
- `db-context/<env>/<engine>/database-profile.md`

Do not log secrets. The files store query text / argv only, not connection URIs.

### Session report artifact (mandatory)

Each session folder includes `investigation-report.md`.

- Postgres: `investigations/<env>/postgres/<session>/investigation-report.md`
- Mongo: `investigations/<env>/mongo/<session>/investigation-report.md`

`query.mjs` auto-creates a report stub if missing. Agents must complete it before ending the investigation.

Minimum report contents:

1. question/scope (engine, env, time window, entities)
2. key findings (including anomalies and counts)
3. logic/consistency assessment
4. open questions or recommended next actions

Use only non-sensitive content. Do not include credentials, tokens, or raw secrets.

## Documentation completion gate (mandatory)

Do not end an investigation response until all three artifacts are updated for the active environment and engine:

1. `db-context/<env>/<engine>/schema.mermaid` - add any newly discovered tables, columns, or FK relations as Mermaid `erDiagram` entries.
2. `db-context/<env>/<engine>/entity-map.md`
3. `investigations/<env>/<engine>/<session>/investigation-report.md`

Global `investigation-notes.md` is deprecated and must not be used or updated. Keep investigation remarks in session reports under `investigations/<env>/<engine>/<session>/`.

Entity map anti-bloat policy (mandatory):

1. Keep entries short and signal-only for AI consumption.
2. Add only revealing facts that change future query strategy (keys, critical join paths, high-impact constraints).
3. Do not duplicate findings already documented in session reports.
4. Prefer compact bullets/tables over prose.
5. For one investigated table, limit relation map to one-hop graph only.

Database profile retention policy (mandatory):

1. `db-context/<env>/<engine>/database-profile.md` keeps only the latest 50 sessions.
2. Do not manually append unlimited history.

For relational investigations (Postgres/MySQL/MariaDB/SQL Server/SQLite/Cassandra), the `entity-map.md` update must include:

1. the investigated table/entity
2. one-level relation mapping from that table:
   - outbound FKs (table -> directly referenced tables)
   - inbound FKs (tables that directly reference the investigated table)
3. only confirmed relations from query evidence (never guessed relations)

If relation mapping was not completed yet, run the FK discovery query first, then document it, then return the final answer.

### Context synchronization gate (mandatory)

When any one of these files is updated for an env/engine:

- `schema.mermaid`
- `entity-map.md`
- `database-profile.md`

perform a quick consistency check on the other two before finishing:

1. No template placeholders remain (`_fill me_`, `<< no entities discovered yet >>`, etc.) when investigation data exists.
2. Session/date stamp references point to the same latest investigation session when applicable.
3. Lens for that env/engine would show real content in all three tabs (Schema, Entity Map, DB Profile).

## Workflow

1. Run Step 0 (`scripts/diagnose.mjs`) and follow `recommendations` for this OS.
2. Resolve the target environment from the request, or run Step 0.1 and ask the user to choose from `connection-options`.
3. Resolve the target engine from the request, or run Step 0.2 and ask the user to choose from `engine-options`.
4. Read Step 1 context files (`db-context/<env>/<engine>/entity-map.md` and notes) before composing queries.
5. `cd` to the correct folder under `db-engines/` and run `node query.mjs ...` via terminal.
6. For several queries in one investigation, set `DB_INVESTIGATION_TOOL_ENV` once (or pass `--env`) and set `DB_INVESTIGATION_TOOL_LOG_DIR` to the same value for every call, or repeat the same `--log-dir`.
7. Interpret JSON stdout; cite `investigations/<env>/<engine>/<session>/` when useful. If the bridge refused a query (`readOnlyViolation`), surface that to the user and ask for permission before any write path.
8. Knowledge accumulation (mandatory): after each investigation, update:
   - `db-context/<env>/<engine>/schema.mermaid` with any newly discovered tables, columns, or FK relations (Mermaid `erDiagram` format).
   - `db-context/<env>/<engine>/entity-map.md` with concise, non-duplicative, high-signal mapping updates.
   - verify `db-context/<env>/<engine>/database-profile.md` reflects the observed DB version (retained to latest 50 sessions).

## schema.mermaid format rules (mandatory)

`schema.mermaid` files must follow these rules to avoid Mermaid 10 parse errors:

1. **ASCII-only in `%%` comments** - never use Unicode, em-dashes (`—`), en-dashes (`–`), box-drawing characters (`─`), or any non-ASCII character inside a `%%` comment line. Mermaid's lexer rejects them and produces errors like `erDiagram%%%%%%`.
2. **No decorative separator comments** - do not write lines like `%% ─────────────────` or `%% ──────────`. Use `%% ---` or omit separators entirely.
3. **One `%%` comment per line** - comments must be on their own line, never trailing after entity or relation syntax.
4. **Keep the header minimal** - a single `%% schema.mermaid - Last updated: YYYY-MM-DD` line is sufficient.
5. **Valid column types** - Mermaid `erDiagram` entity blocks should use short recognized types: `int`, `uuid`, `text`, `bool`, `jsonb`, `timestamptz`, `enum`, `varchar`.

**Correct header:**
```
erDiagram
    %% schema.mermaid - Last updated: 2026-05-21
```

**Wrong (causes parse error):**
```
erDiagram
    %% ─────────────────────────────────────────────────────────────
    %% schema.mermaid — Incremental entity-relationship diagram
```