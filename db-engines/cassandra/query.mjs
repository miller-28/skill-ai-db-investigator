#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import cassandra from 'cassandra-driver';
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
  assertReadOnlyPostgresSql,
} from '../../lib/postgres-read-only.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = resolve(__dirname, '../..');

function resolveCqlFilePath(raw) {
  const rel = raw.startsWith('@') ? raw.slice(1) : raw;
  const candidates = [resolve(process.cwd(), rel), resolve(__dirname, rel), resolve(rel)];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error(`CQL file not found: ${raw}`);
}

function readCql(argv) {
  const fileIndex = argv.indexOf('--file');
  if (fileIndex !== -1 && argv[fileIndex + 1]) return readFileSync(resolveCqlFilePath(argv[fileIndex + 1]), 'utf8').trim();
  const filtered = argv.filter((argument) => argument !== '--file');
  if (filtered.length === 1 && filtered[0].startsWith('@')) return readFileSync(resolveCqlFilePath(filtered[0]), 'utf8').trim();
  if (filtered.length > 0) return filtered.join(' ').trim();
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8').trim();
  throw new Error('No CQL provided.');
}

const rawArgv = process.argv.slice(2);
if (rawArgv.includes('--help') || rawArgv.includes('-h')) {
  console.error(`Usage (optional --env / --log-dir / --investigation only at the start):
  node query.mjs --env ENV_NAME --log-dir SESSION_NAME --investigation SLUG @script.cql
  node query.mjs "SELECT ..."  (read-only; one statement)
  node query.mjs --file script.cql
  node query.mjs @script.cql
  Stdin: Get-Content q.cql | node query.mjs`);
  process.exit(0);
}
const { argv, logDir, investigation, envName } = stripLeadingBridgeFlags(rawArgv);
const requestedEnvironmentName = envName ?? process.env.DB_INVESTIGATION_TOOL_ENV ?? 'unresolved-env';
let sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: requestedEnvironmentName,
  engine: 'cassandra',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const cql = readCql(argv);
if (!cql) {
  console.error('Empty CQL.');
  process.exit(1);
}

try {
  assertReadOnlyPostgresSql(cql);
} catch (error) {
  if (error instanceof ReadOnlySqlViolation) {
    console.error(
      JSON.stringify(
        {
          source: 'connection:unresolved',
          connectionEnv: requestedEnvironmentName,
          investigationSession: sessionSubdir,
          readOnlyViolation: true,
          error: error.message,
          code: READ_ONLY_VIOLATION_CODE,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  throw error;
}

const { value: connection, source, envName: resolvedEnvName } = resolveEngineConnection({
  bridgeRoot,
  engine: 'cassandra',
  envNameFlag: envName,
});

ensureUserContextStore({ bridgeRoot, envName: resolvedEnvName, engine: 'cassandra' });
sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: resolvedEnvName,
  engine: 'cassandra',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

let client;
try {
  const config = JSON.parse(connection);
  client = new cassandra.Client(config);
  await client.connect();

  const versionResult = await client.execute('SELECT release_version FROM system.local');
  const dbVersion = versionResult.rows?.[0]?.release_version || 'unknown';

  recordQueryLog({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'cassandra',
    sessionSubdir,
    extension: 'cql',
    dbVersion,
    body: `-- recordedUTC: ${new Date().toISOString()}\n-- engine: cassandra\n-- credentialSource: ${source}\n-- connectionEnv: ${resolvedEnvName}\n-- dbVersion: ${dbVersion}\n-- investigationSession: ${sessionSubdir}\n\n${cql}\n`,
  });

  recordDatabaseContextMetadata({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'cassandra',
    dbVersion,
    source,
    sessionSubdir,
  });

  const startedAt = Date.now();
  const queryResult = await client.execute(cql);
  console.log(
    JSON.stringify(
      {
        source,
        connectionEnv: resolvedEnvName,
        investigationSession: sessionSubdir,
        dbVersion,
        ms: Date.now() - startedAt,
        rowCount: queryResult.rowLength,
        rows: queryResult.rows,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        source,
        connectionEnv: resolvedEnvName,
        investigationSession: sessionSubdir,
        error: error.message,
        code: error.code,
      },
      null,
      2,
    ),
  );
  process.exit(1);
} finally {
  if (client) await client.shutdown();
}


