# ai-db-investigator

[![repo](https://img.shields.io/badge/repo-miller--28%2Fskill--ai--db--investigator-0a0a0a)](https://github.com/miller-28/skill-ai-db-investigator)

ai-db-investigator is a read-only database investigation protocol for AI agents and engineers. It helps answer hard data questions quickly, safely, and repeatably across many database engines while building useful investigation memory over time.

## Why this tool exists

Most database investigations fail in similar ways:

- too much time spent rediscovering schema and joins
- ad-hoc queries that are hard to reproduce
- missing evidence trails for decisions
- accidental risk from write-capable commands during debugging

ai-db-investigator solves this with one workflow:

- strict read-only query bridge
- explicit environment and engine resolution
- automatic session-level investigation logs
- persistent context files that improve future investigations

## What problem it solves

When an issue appears in a product or service, teams usually ask:

- What happened?
- Is the data consistent?
- Which entity is the source of truth?
- Is this isolated or systemic?

This tool turns those questions into a repeatable process with guardrails and evidence.

## What makes it strong

- Safety-first by design:
  - Query bridge blocks mutating patterns where supported.
  - Workflow assumes database-level read-only credentials.
- Agent-friendly protocol:
  - Predictable command surface and structured outputs.
  - Works well with AI assistants and human investigators.
- Investigation memory:
  - Entity maps and schema context reduce rediscovery cost.
  - Session reports preserve reasoning and evidence.
- Multi-engine support in one project:
  - A consistent operational model across relational, document, graph, and search stores.
- Practical local UX:
  - Lens viewer for human-friendly review of sessions and context.

## Feature overview

### Read-only engine CLIs

Focused read-only bridges are provided for:

- Postgres
- Mongo
- MySQL
- MariaDB
- SQL Server
- SQLite
- Redis
- Elasticsearch or OpenSearch
- Cassandra
- Neo4j

### Investigation session logging

Every investigation writes structured artifacts under:

- investigations/<env>/<engine>/<session>/

Each session includes:

- query logs
- metadata and DB version info
- investigation-report.md

### Persistent context store

Runtime context is maintained under:

- db-context/<env>/<engine>/

This includes:

- schema.mermaid
- entity-map.md
- database-profile.md

This context becomes durable memory for future investigations.

### Lens viewer

Open lens/index.html in Chrome or Edge to review investigations visually:

- session list sorted newest first
- investigation reports rendered as Markdown
- query files with copy support
- live Mermaid schema rendering
- entity-map and database-profile side panels

No server or build step required.

## Who should use this

- backend engineers debugging data integrity issues
- platform teams investigating production-like incidents in safe environments
- QA and support engineers validating state transitions
- AI agent workflows that need reliable, repeatable database investigation patterns

## Quick start

1. Configure named environments in connections.json.
2. Run diagnostics:

```bash
npm run diagnose
npm run shell-help
```

3. Run investigations through the engine CLI in db-engines/<engine>/.
4. Review context and sessions in lens/index.html.

## Skills integration

This repository is the single public skill source for skills.sh.

Single-repo contract:

- one repository: `miller-28/skill-ai-db-investigator`
- one skill entrypoint: `SKILL.md` at repository root
- no mirror folders
- no sync operations

List skills from this repository:

```bash
npx skills add miller-28/skill-ai-db-investigator --list
```

Install the skill:

```bash
npx skills add miller-28/skill-ai-db-investigator --skill ai-db-investigator
```

Install for specific agents:

```bash
npx skills add miller-28/skill-ai-db-investigator --skill ai-db-investigator --agent github-copilot
npx skills add miller-28/skill-ai-db-investigator --skill ai-db-investigator --agent cursor
```

## Download and install for projects

Clone once on your machine:

```bash
git clone https://github.com/miller-28/skill-ai-db-investigator.git
```

Then install it into each project where you want to use the skill.

For a Cursor project (run inside that project folder):

```bash
npx skills add ../skill-ai-db-investigator --skill ai-db-investigator --agent cursor
```

For a VS Code project (run inside that project folder):

```bash
npx skills add ../skill-ai-db-investigator --skill ai-db-investigator --agent github-copilot
```

If the repository is not adjacent to your project, replace `../skill-ai-db-investigator` with the correct absolute or relative path.

You can also install directly from GitHub without cloning:

```bash
npx skills add miller-28/skill-ai-db-investigator --skill ai-db-investigator --agent cursor
npx skills add miller-28/skill-ai-db-investigator --skill ai-db-investigator --agent github-copilot
```

## Supported connection fields

Environment profile fields can include:

- postgres.databaseUrl
- mongo.mongoDbConnection
- mysql.connectionUrl
- mariadb.connectionUrl
- sqlserver.connectionString
- sqlite.filePath
- redis.url
- elasticsearch.nodeUrl
- cassandra.connectionJson
- neo4j.connectionJson

## Maintainers: publish and release workflow

This section is for repository maintainers.

1. Edit `SKILL.md` in repository root.
2. Validate locally:

```bash
npx skills add . --list
```

3. Validate remote resolution:

```bash
npx skills add miller-28/skill-ai-db-investigator --list
```

4. Commit and push.
5. Keep the repository public so skills.sh can discover and index it.

There is no mirror sync step in this repository.

## Safety note

If a task truly needs write operations, get explicit approval and use an approved write-capable client outside this bridge.

This project is designed for read-only investigation workflows.
