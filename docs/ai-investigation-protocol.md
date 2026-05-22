# AI investigation protocol

`ai-db-investigator` is more than a script collection. It is a read-only database investigation protocol for AI agents and engineers.

The goal is simple:

> Every investigation should make the next investigation faster.

Instead of asking an agent to rediscover connection setup, shell quoting, safety rules, table relationships, and reporting format on every prompt, the agent works through a constrained workflow:

1. choose an explicit environment
2. choose a database engine
3. read known entity context
4. run read-only queries
5. log evidence
6. update the entity map
7. complete a session report

## Example investigation

User prompt:

```text
Investigate why shipment 91822 appears as delivered in the UI,
but still has open invoice status.
```

Expected agent flow:

1. Run `npm run diagnose`.
2. Resolve the target environment and engine explicitly.
3. Read `db-context/<env>/<engine>/entity-map.md` and `database-profile.md`.
4. Use known relations to inspect only relevant tables first.
5. Run read-only queries through the engine CLI.
6. Keep all queries inside the same `investigations/<env>/<engine>/<session>/` folder.
7. Update `entity-map.md` only with durable structural facts.
8. Complete `investigation-report.md` with evidence, interpretation, and open questions.

Example final report structure:

```md
## Scope

- env: local-dev
- engine: postgres
- question: why shipment 91822 is delivered while invoice status is open

## Evidence

- `shipments.status` is `delivered`.
- latest `shipment_events` row is a delivered event.
- related invoice row still has `status = 'open'`.

## Interpretation

- invoice recalculation likely did not run after the delivery event.

## Not proven

- whether the background worker failed
- whether the event was consumed
- whether the invoice status was manually changed

## Recommended next actions

- inspect worker logs around the delivery event time
- check event consumption offsets for the invoice recalculation consumer
```

## Safety model

Use database-level read-only credentials whenever possible.

The CLIs provide an additional safety layer by rejecting common mutating operations and logging the investigation path, but the strongest boundary is still the database user's permissions.

Recommended setup:

- local or staging databases only by default
- read-only DB user for each configured environment
- no production credentials unless the team has explicitly approved that workflow
- no secrets in reports, entity maps, or query logs

## Support matrix

| Engine | CLI | Guardrail model | Notes |
|--------|-----|-----------------|-------|
| Postgres | `db-engines/postgres/query.mjs` | SQL allowlist, one statement, `BEGIN READ ONLY` | Strongest current guardrail model. |
| Mongo | `db-engines/mongo/query.mjs` | Operation allowlist, blocks `$out` / `$merge` | Designed for read-only inspection flows. |
| MySQL | `db-engines/mysql/query.mjs` | Read-only query bridge | Prefer read-only DB credentials. |
| MariaDB | `db-engines/mariadb/query.mjs` | Read-only query bridge | Prefer read-only DB credentials. |
| SQL Server | `db-engines/sqlserver/query.mjs` | Read-only query bridge | Prefer read-only DB credentials. |
| SQLite | `db-engines/sqlite/query.mjs` | Read-only query bridge | Prefer copied/local DB files for investigations. |
| Redis | `db-engines/redis/query.mjs` | Read-only command surface | Avoid commands that expose secrets. |
| Elasticsearch/OpenSearch | `db-engines/elasticsearch/query.mjs` | Read-only inspection commands | Search/count/cat/info style tasks. |
| Cassandra | `db-engines/cassandra/query.mjs` | Read-only query bridge | Prefer read-only credentials. |
| Neo4j | `db-engines/neo4j/query.mjs` | Read-only query bridge | Prefer read-only credentials. |

## Entity map discipline

The entity map is the reusable memory layer. Keep it compact and structural.

Good entity-map entries:

- primary keys
- important foreign keys
- high-impact join paths
- ownership boundaries
- status/lifecycle columns
- facts that change future query strategy

Avoid:

- long investigation narratives
- duplicate report content
- guesses presented as facts
- one-off bug findings that belong only in the session report

When useful, mark confidence explicitly:

```md
Confidence:
- confirmed by FK
- confirmed by repeated query evidence
- inferred from naming
- suspected only
```

## Report discipline

Separate evidence from interpretation.

Evidence is what the database returned. Interpretation is what the investigator believes it means.

Recommended report sections:

```md
## Scope
## Evidence
## Interpretation
## Not proven
## Recommended next actions
```

This keeps AI-written reports useful, reviewable, and less likely to turn weak inference into fake certainty.

## Lens viewer

`lens/index.html` is a local browser-based viewer for reviewing investigation results without the terminal.

Open it in Chrome or Edge, select the project root, choose an environment and DB engine, and browse:
- All sessions for that env/engine, newest first.
- Each session's `investigation-report.md` rendered as formatted Markdown.
- Each query file with its metadata header, SQL/command body, and a copy button.
- The `schema.mermaid` ER diagram rendered live in the left panel.
- `entity-map.md` and `database-profile.md` as collapsible context panels.

Lens is read-only and needs no build step or server — open `lens/index.html` directly.
