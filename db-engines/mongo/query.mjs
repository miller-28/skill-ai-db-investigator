#!/usr/bin/env node
/**
 * Read-only helpers against MongoDB via a named environment from `../../connections.json`.
 *
 * Subcommands are inspection-only: listDbs, collections, find, count, aggregate. Aggregate pipelines must not
 * contain `$out` or `$merge` (including nested under `$facet`). If writes are needed, the agent must ask the
 * user in chat and use another client.
 *
 * Optional leading flags (only at the start):
 *   node query.mjs --env local-dev --log-dir 2026-05-12_15-30-00_list-collections --investigation mongo-audit listDbs
 *
 * Investigation logs: ../../investigations/<env>/<engine>/<session>/ -- same rules as db-engines/postgres/query.mjs (see ../../README.md).
 *
 * Usage:
 *   node query.mjs listDbs
 *   node query.mjs collections <databaseName>
 *   node query.mjs find <db.collection> [filterJson] [--limit 50]
 *   node query.mjs count <db.collection> [filterJson]
 *   node query.mjs aggregate <db.collection> '[{"$limit":10}]'
 *
 * Env:
 *   DB_INVESTIGATION_TOOL_ENV -- optional session-level environment name from connections.json.
 *   DB_INVESTIGATION_TOOL_CONNECTIONS_FILE -- optional custom path to connections.json.
 *   DB_INVESTIGATION_TOOL_LOG_DIR / DB_INVESTIGATION_TOOL_INVESTIGATION / DB_INVESTIGATION_TOOL_NO_QUERY_LOG -- same as postgres bridge.
 */
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import {
  recordQueryLog,
  resolveLogSessionSubdir,
  stripLeadingBridgeFlags,
} from '../../lib/investigation-log.mjs';
import { ensureUserContextStore } from '../../lib/context-store.mjs';
import { recordDatabaseContextMetadata } from '../../lib/database-context-metadata.mjs';
import { resolveEngineConnection } from '../../lib/connection-profiles.mjs';
import {
  READ_ONLY_VIOLATION_CODE,
  ReadOnlySqlViolation,
} from '../../lib/postgres-read-only.mjs';
import { assertReadOnlyAggregatePipeline } from '../../lib/mongo-read-only.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = resolve(__dirname, '../..');

function parseNs(ns) {
  const i = ns.indexOf('.');
  if (i === -1) {
    throw new Error(`Expected db.collection namespace, got: ${JSON.stringify(ns)}`);
  }
  return { db: ns.slice(0, i), collection: ns.slice(i + 1) };
}

function parseJsonArg(arg, fallback) {
  if (arg == null || arg === '') return fallback;
  return JSON.parse(arg);
}

function readLimit(argv, def) {
  const idx = argv.indexOf('--limit');
  if (idx === -1 || argv[idx + 1] == null) return def;
  const n = parseInt(argv[idx + 1], 10);
  if (Number.isNaN(n) || n < 1) throw new Error(`Invalid --limit: ${argv[idx + 1]}`);
  return n;
}

function help() {
  console.error(`Usage (optional --env / --log-dir / --investigation at the start):
  node query.mjs --env ENV_NAME --log-dir SESSION --investigation SLUG listDbs
  node query.mjs listDbs
  node query.mjs collections <databaseName>
  node query.mjs find <db.collection> [filterJson] [--limit 50]
  node query.mjs count <db.collection> [filterJson]
  node query.mjs aggregate <db.collection> '<pipelineJsonArray>'  (no $out / $merge)`);
}

const rawArgv = process.argv.slice(2);
if (rawArgv.length === 0 || rawArgv.includes('--help') || rawArgv.includes('-h')) {
  help();
  process.exit(rawArgv.length === 0 ? 1 : 0);
}

const { argv, logDir, investigation, envName } = stripLeadingBridgeFlags(rawArgv);
if (argv.length === 0) {
  console.error('Missing Mongo subcommand after optional --env / --log-dir / --investigation flags.');
  help();
  process.exit(1);
}

const { value: uri, source, envName: resolvedEnvName } = resolveEngineConnection({
  bridgeRoot,
  engine: 'mongo',
  envNameFlag: envName,
});

ensureUserContextStore({ bridgeRoot, envName: resolvedEnvName, engine: 'mongo' });
const sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: resolvedEnvName,
  engine: 'mongo',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const argvLine = argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');

const client = new MongoClient(uri);

const out = {
  source,
  connectionEnv: resolvedEnvName ?? null,
  investigationSession: sessionSubdir,
  ms: 0,
  result: null,
};
const start = Date.now();
try {
  await client.connect();
  const buildInfo = await client.db('admin').command({ buildInfo: 1 });
  const dbVersion = buildInfo?.version || 'unknown';

  const logBody = `-- recordedUTC: ${new Date().toISOString()}
-- engine: mongo
-- credentialSource: ${source}
-- connectionEnv: ${resolvedEnvName}
-- dbVersion: ${dbVersion}
-- investigationSession: ${sessionSubdir}
-- argv: node query.mjs ${argvLine}
`;
  recordQueryLog({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'mongo',
    sessionSubdir,
    extension: 'mongo.txt',
    body: logBody,
    dbVersion,
  });
  recordDatabaseContextMetadata({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'mongo',
    dbVersion,
    source,
    sessionSubdir,
  });

  const sub = argv[0];

  if (sub === 'listDbs') {
    const admin = client.db().admin();
    const dbs = await admin.listDatabases();
    out.result = dbs;
  } else if (sub === 'collections') {
    const dbName = argv[1];
    if (!dbName) throw new Error('collections requires <databaseName>');
    const cols = await client.db(dbName).listCollections().toArray();
    out.result = cols.map((c) => c.name);
  } else if (sub === 'find') {
    const ns = argv[1];
    if (!ns) throw new Error('find requires <db.collection>');
    const { db, collection } = parseNs(ns);
    const filterArg = argv[2]?.startsWith('{') || argv[2]?.startsWith('[') ? argv[2] : argv[2] === '--limit' ? undefined : argv[2];
    const filter = parseJsonArg(filterArg, {});
    const limit = readLimit(argv, 50);
    const docs = await client.db(db).collection(collection).find(filter).limit(limit).toArray();
    out.result = docs;
  } else if (sub === 'count') {
    const ns = argv[1];
    if (!ns) throw new Error('count requires <db.collection>');
    const { db, collection } = parseNs(ns);
    const filterArg = argv[2]?.startsWith('--') ? undefined : argv[2];
    const filter = parseJsonArg(filterArg, {});
    const n = await client.db(db).collection(collection).countDocuments(filter);
    out.result = { count: n };
  } else if (sub === 'aggregate') {
    const ns = argv[1];
    if (!ns) throw new Error('aggregate requires <db.collection>');
    const { db, collection } = parseNs(ns);
    const pipeRaw = argv[2];
    if (!pipeRaw) throw new Error('aggregate requires pipeline JSON array as third argument');
    const pipeline = JSON.parse(pipeRaw);
    if (!Array.isArray(pipeline)) throw new Error('aggregate pipeline must be a JSON array');
    assertReadOnlyAggregatePipeline(pipeline);
    const docs = await client.db(db).collection(collection).aggregate(pipeline).toArray();
    out.result = docs;
  } else {
    throw new Error(`Unknown command: ${sub}`);
  }

  out.ms = Date.now() - start;
  out.dbVersion = dbVersion;
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.ms = Date.now() - start;
  const ro = e instanceof ReadOnlySqlViolation;
  const payload = {
    source,
    connectionEnv: resolvedEnvName ?? null,
    investigationSession: sessionSubdir,
    error: e.message,
    ms: out.ms,
  };
  if (ro) {
    payload.readOnlyViolation = true;
    payload.code = READ_ONLY_VIOLATION_CODE;
    payload.agentHint =
      'This bridge is read-only. If the user explicitly approves a pipeline with $out/$merge or other writes, use mongosh or another approved client.';
  } else if (e.code != null) {
    payload.code = e.code;
  }
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
} finally {
  await client.close();
}


