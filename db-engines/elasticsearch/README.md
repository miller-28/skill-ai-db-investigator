# elasticsearch

Read-only Elasticsearch/OpenSearch investigations via `query.mjs`.

Usage:

```bash
cd skill-ai-db-investigator/db-engines/elasticsearch
npm install
node query.mjs --env local-dev info
node query.mjs --env local-dev catIndices
node query.mjs --env local-dev search my-index '{"query":{"match_all":{}}}'
```

Connection key in `connections.json`: `elasticsearch.nodeUrl`.

Each successful query writes dbVersion to query logs, session report, and `db-context/<env>/elasticsearch/database-profile.md`.


