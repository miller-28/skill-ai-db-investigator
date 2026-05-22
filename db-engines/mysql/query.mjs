#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
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

function resolveSqlFilePath(raw) {
  const rel = raw.startsWith('@') ? raw.slice(1) : raw;
  const candidates = [resolve(process.cwd(), rel), resolve(__dirname, rel), resolve(rel)];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`SQL file not found: ${raw} (tried cwd, mysql/, and absolute)`);
}

function readSql(argv) {
  const fi = argv.indexOf('--file');
  if (fi !== -1 && argv[fi + 1]) {
    return readFileSync(resolveSqlFilePath(argv[fi + 1]), 'utf8').trim();
  }
  const rest = argv.filter((a) => a !== '--file');
  if (rest.length === 1 && rest[0].startsWith('@')) {
    return readFileSync(resolveSqlFilePath(rest[0]), 'utf8').trim();
  }
  if (rest.length > 0) return rest.join(' ').trim();
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8').trim();
  throw new Error('No SQL: pass a query string, --file path, @path.sql, or pipe SQL on stdin.');
}

const rawArgv = process.argv.slice(2);
if (rawArgv.includes('--help') || rawArgv.includes('-h')) {
  console.error(`Usage (optional --env / --log-dir / --investigation only at the start):
  node query.mjs --env ENV_NAME --log-dir SESSION_NAME --investigation SLUG @script.sql
  node query.mjs "SELECT ..."  (read-only: SELECT / WITH / VALUES / TABLE / SHOW / EXPLAIN only; one statement)
  node query.mjs --file script.sql
  node query.mjs @script.sql
  Stdin: Get-Content q.sql | node query.mjs`);
  process.exit(0);
}
const { argv, logDir, investigation, envName } = stripLeadingBridgeFlags(rawArgv);
const requestedEnvironmentName = envName ?? process.env.DB_INVESTIGATION_TOOL_ENV ?? 'unresolved-env';
let sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: requestedEnvironmentName,
  engine: 'mysql',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

const sql = readSql(argv);
if (!sql) {
  console.error('Empty SQL.');
  process.exit(1);
}

try {
  assertReadOnlyPostgresSql(sql);
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
          agentHint:
            'This bridge is read-only. If the user explicitly approves a mutating query, do not use this CLI -- use mysql client or another approved client.',
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  throw error;
}

const { value: connectionString, source, envName: resolvedEnvName } = resolveEngineConnection({
  bridgeRoot,
  engine: 'mysql',
  envNameFlag: envName,
});

ensureUserContextStore({ bridgeRoot, envName: resolvedEnvName, engine: 'mysql' });
sessionSubdir = resolveLogSessionSubdir({
  bridgeRoot,
  envName: resolvedEnvName,
  engine: 'mysql',
  logDirFlag: logDir,
  investigationFlag: investigation,
});

let connection;
try {
  connection = await mysql.createConnection(connectionString);
  const [versionRows] = await connection.query('SELECT VERSION() AS version');
  const dbVersion = versionRows?.[0]?.version || 'unknown';

  const logBody = `-- recordedUTC: ${new Date().toISOString()}
-- engine: mysql
-- credentialSource: ${source}
-- connectionEnv: ${resolvedEnvName}
-- dbVersion: ${dbVersion}
-- investigationSession: ${sessionSubdir}

${sql}
`;
  recordQueryLog({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'mysql',
    sessionSubdir,
    extension: 'sql',
    body: logBody,
    dbVersion,
  });

  recordDatabaseContextMetadata({
    bridgeRoot,
    envName: resolvedEnvName,
    engine: 'mysql',
    dbVersion,
    source,
    sessionSubdir,
  });

  const startedAt = Date.now();
  const [rows] = await connection.query(sql);
  const out = {
    source,
    connectionEnv: resolvedEnvName,
    investigationSession: sessionSubdir,
    dbVersion,
    ms: Date.now() - startedAt,
    rowCount: Array.isArray(rows) ? rows.length : 0,
    rows,
  };
  console.log(JSON.stringify(out, null, 2));
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
  if (connection) await connection.end();
}


