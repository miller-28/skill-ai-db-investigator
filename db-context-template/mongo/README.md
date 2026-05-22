# Mongo DB Context Template

This folder is the committed template for Mongo investigation context.

Runtime investigations write to `db-context/<env>/mongo/` (gitignored). The query CLI auto-creates that folder and seeds missing files from this template.

## Files

- `entity-map.md` - concise AI-facing map of high-signal collections, keys, and critical one-hop references.
- `database-profile.md` - runtime DB engine/version profile maintained by query executions (latest 50 sessions retained).

## Update policy

1. Before running Mongo commands, read `db-context/<env>/mongo/entity-map.md`.
2. Keep investigation-specific remarks in `investigations/<env>/mongo/<session>/investigation-report.md`.
3. After investigation, update `entity-map.md` only with non-duplicative, high-signal facts.
4. Keep wording concise and AI-optimized; avoid long prose.

