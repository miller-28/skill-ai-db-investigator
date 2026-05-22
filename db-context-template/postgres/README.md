# Postgres DB Context Template

This folder is the committed template for Postgres investigation context.

Runtime investigations write to `db-context/<env>/postgres/` (gitignored). The query CLI auto-creates that folder and seeds missing files from this template.

## Files

- `schema.mermaid` - incremental Mermaid ER diagram of discovered entities and FK relations. Starts as a stub; enriched with each investigation session.
- `entity-map.md` - concise AI-facing map of high-signal entities, keys, and critical one-hop relations.
- `database-profile.md` - runtime DB engine/version profile maintained by query executions (latest 50 sessions retained).

## Update policy

1. Before writing investigation SQL, read `db-context/<env>/postgres/entity-map.md` and `schema.mermaid`.
2. Keep investigation-specific remarks in `investigations/<env>/postgres/<session>/investigation-report.md`.
3. After investigation, update `entity-map.md` with non-duplicative, high-signal facts.
4. After investigation, update `schema.mermaid` with any newly discovered tables, columns, or FK relations.
5. Keep wording concise and AI-optimized; avoid long prose.

